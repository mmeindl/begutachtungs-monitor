/**
 * The cached leaves of the Parliament API: the ME list (81), the Vorlagen
 * list (101) and the detail JSON of one Gegenstand.
 *
 * The five cache rules these leaves follow — cache leaves only, `swr: false`
 * explicitly, one fact one source, stale served as stale, two layers by
 * provenance — are in `docs/architecture.md` §5, each with the failure that
 * forced it. `cache/base.ts` says which layer a value belongs in,
 * `cache/ttl.ts` for how long, `lastgood.ts` holds what rule 4 falls back to.
 */
import type { DraftSummary } from '#shared/types'
import { GP_RE, intToRoman, romanToInt } from '#shared/utils/gp'
import { daysUntil } from '#shared/utils/format'
import { foldJointDraft } from './draftList'
import { mapDraftRow } from './list81'
import { mapVorlageRow, type VorlageRow } from './list101'
import {
  assertListHeader,
  assertRowsMatchGp,
  fetchFilterList,
  fetchGegenstand,
  fetchMeListConfig,
  type FilterListResponse,
  type GegenstandResponse,
} from '../upstream/parliament'
import { UPSTREAM_LIST_TTL_S } from '../cache/ttl'

const FALLBACK_GP = 'XXVIII'
/** Oldest GP with Ministerialentwürfe in the Parliament API (XIV, 1979). */
export const OLDEST_GP_WITH_ME = 14

/** Recursive search for definition.params.GP_CODE[0] in the page configuration. */
function findGpCode(node: unknown): string | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findGpCode(item)
      if (found) return found
    }
    return null
  }
  if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>
    const params = (record.definition as Record<string, unknown> | undefined)?.params as
      | Record<string, unknown>
      | undefined
    const gpCodes = params?.GP_CODE
    if (Array.isArray(gpCodes) && typeof gpCodes[0] === 'string' && GP_RE.test(gpCodes[0])) {
      return gpCodes[0]
    }
    for (const value of Object.values(record)) {
      const found = findGpCode(value)
      if (found) return found
    }
  }
  return null
}

/** The ME list's page configuration, as served. Leaf cache. */
const meListConfig = defineCachedFunction(
  (): Promise<unknown> => fetchMeListConfig(),
  { name: 'parliament-me-config', getKey: () => 'config', maxAge: 60 * 60 * 24, swr: false },
)

/**
 * Current GP from that configuration (…definition.params.GP_CODE[0]),
 * fallback 'XXVIII'. Derived: `findGpCode` is our search through a foreign
 * document, so it belongs in the layer that dies with the code
 * (`cache/base.ts`). The configuration underneath it is the cached half.
 */
export const getCurrentGp = defineCachedFunction(
  async (): Promise<string> => {
    try {
      const gp = findGpCode(await meListConfig())
      if (gp) return gp
    } catch {
      // Fallback below
    }
    return FALLBACK_GP
  },
  { name: 'current-gp', base: DERIVED_CACHE, getKey: () => 'current', maxAge: 60 * 60 * 24, swr: false },
)

interface GpDrafts {
  gp: string
  items: DraftSummary[]
}

/**
 * List 81 of one GP, exactly as the API answered. Leaf cache — one entry per
 * distinct upstream call, holding nothing we made.
 *
 * The GP check runs *inside* the cache on purpose. It exists because the API
 * silently ignores unknown filter keys, and a response that ignored the
 * filter is the whole dataset: caching it first and checking afterwards
 * would store that answer and then throw on it for half an hour.
 */
const consultationRows = defineCachedFunction(
  async (gp: string): Promise<FilterListResponse> => {
    const res = await fetchFilterList(81, { GP_CODE: [gp] }, { sortrnr: '11', ascDesc: 'DESC' })
    assertRowsMatchGp(res.rows ?? [], gp, 81)
    assertListHeader(81, res)
    return res
  },
  { name: 'drafts-list', getKey: (gp: string) => gp, maxAge: UPSTREAM_LIST_TTL_S, swr: false },
)

/** The same list, mapped to our types. Derived — `mapDraftRow` is ours. */
export const getDraftsForGp = defineCachedFunction(
  async (gp: string): Promise<GpDrafts> => {
    const res = await consultationRows(gp)
    return {
      gp,
      items: (res.rows ?? []).map(mapDraftRow),
    }
  },
  { name: 'drafts-gp', base: DERIVED_CACHE, getKey: (gp: string) => gp, maxAge: UPSTREAM_LIST_TTL_S, swr: false },
)

/**
 * Every Regierungsvorlage of one Gesetzgebungsperiode, from list 101 —
 * the candidate pool for "which Vorlagen still take Stellungnahmen".
 *
 * ONE call for the whole period (GP XXVIII: 117 rows, GP XXVII: 365). The
 * `Status` column narrows it to the handful still before the Nationalrat
 * before any detail JSON is fetched; without it this would be one
 * Gegenstand request per Vorlage, which is why the section was not built
 * until the column was found (`docs/api-exploration.md` §101).
 *
 * Derived, because `mapVorlageRow` is ours. The type filter is asserted the
 * way every other list is: rows must belong to the GP, and the header must
 * still name the columns the mapper reads by position.
 */
export const getVorlagenForGp = defineCachedFunction(
  async (gp: string): Promise<VorlageRow[]> => {
    const res = await fetchFilterList(101, { GP_CODE: [gp], ITYP: ['I'], VHG: ['RV'] })
    const rows = res.rows ?? []
    assertRowsMatchGp(rows, gp, 101)
    assertListHeader(101, res)
    return rows.map(mapVorlageRow)
  },
  { name: 'vorlagen-gp', base: DERIVED_CACHE, getKey: (gp: string) => gp, maxAge: UPSTREAM_LIST_TTL_S, swr: false },
)

/**
 * Detail JSON of one item (ME and RV alike). Leaf cache — errors never
 * land in the cache, a 404 propagates fresh on every call.
 */
export const getGegenstand = defineCachedFunction(
  (gp: string, ityp: string, inr: number): Promise<GegenstandResponse> =>
    fetchGegenstand(gp, ityp, inr),
  {
    name: 'gegenstand',
    getKey: (gp: string, ityp: string, inr: number) => `${gp}-${ityp}-${inr}`,
    maxAge: UPSTREAM_LIST_TTL_S,
    swr: false,
  },
)

/**
 * Upstream AKTIV can lag behind an already-passed deadline (computed
 * upstream + 30-min leaf cache): an expired Frist beats the flag. Runs at
 * request time (not in the mapper) so the day boundary is never frozen into
 * the cache. All consumers of `active` (dashboard, status filter, detail
 * CTA) read the same reconciled state this way.
 */
export function reconcileActive(item: DraftSummary): DraftSummary {
  if (!item.active || item.deadline === null) return item
  const days = daysUntil(item.deadline)
  return days !== null && days < 0 ? { ...item, active: false } : item
}

/** GP choices: from `currentGp` descending to the oldest GP with MEs (XIV). */
export function listAvailableGps(currentGp: string): string[] {
  const currentGpNumber = romanToInt(currentGp)
  if (currentGpNumber === null) return [currentGp]
  const gps: string[] = []
  for (let n = currentGpNumber; n >= OLDEST_GP_WITH_ME; n--) {
    gps.push(intToRoman(n))
  }
  return gps
}

/**
 * List-81 row of one item; 404 if it does not exist in that GP.
 *
 * ROWS, plural, and through the same fold the list uses: a jointly issued
 * draft stands in list 81 once per Ressort, and `.find` took whichever of
 * them upstream happened to return first. The list folds
 * (`dedupeDraftList`), so the card and the page it opens could name
 * different ministries for the same 302/ME. One helper, one lead
 * (`foldJointDraft`).
 */
export async function requireDraft(gp: string, inr: number): Promise<DraftSummary> {
  const { items } = await getDraftsForGp(gp)
  const rows = items.filter((item) => item.inr === inr)
  if (!rows.length) {
    throw createError({ statusCode: 404, statusMessage: 'Entwurf nicht gefunden' })
  }
  return reconcileActive(foldJointDraft(rows))
}
