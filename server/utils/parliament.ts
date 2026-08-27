/**
 * Upstream client for the Parliament API (docs/architecture.md §2/§5).
 *
 * The Nitro server is a caching proxy in front of POST /Filter/api/filter/
 * data/{81,142} and GET /gegenstand/…. Rules: showAll=true WITHOUT pagesize,
 * sortrnr=11&ascDesc=DESC on list 81, sanity check row[0]===gp after every
 * list call (the API silently ignores unknown filter keys),
 * 2 retries on 5xx/network errors.
 *
 * CACHE ARCHITECTURE (two rules, both learned the hard way — see UPSTREAM_TTL_S):
 * 1. Caching happens ONLY at the leaves, i.e. at the upstream calls
 *    themselves. Derived aggregates (getConsultationDetail) stay uncached.
 * 2. No SWR — `swr: false` must be set explicitly.
 */
import type {
  ConsultationDetail,
  ConsultationSummary,
  EnactmentInfo,
  StatementMeta,
  StatementsSummary,
} from '#shared/types'
import { GP_RE } from '#shared/utils/gp'
import { daysUntil } from '#shared/utils/format'
import {
  deriveShortTitle,
  extractBgblLink,
  findLastRvLink,
  intToRoman,
  mapConsultationRow,
  mapDocuments,
  mapInvitedBy,
  mapStatementRow,
  mapTextEvolution,
  markTraceMilestones,
  parseShortinfo,
  parseStages,
  PARLIAMENT_BASE,
  romanToInt,
  type RawBgblLink,
  type RawDocumentGroup,
  type RawName,
  type RawShortinfo,
  type RawStage,
} from './mappers'

/**
 * TTL of all upstream caches. `swr: false` is NOT redundant: Nitro defaults
 * to `swr: true` (nitropack .../internal/cache.mjs, defaultCacheOptions).
 * With SWR an expired entry keeps serving the OLD value and only revalidates
 * in the background — and the storage entry is written without a TTL
 * (`setOpts` exists only for `maxAge && !swr`). In dev mode the cache lives
 * on disk (.nuxt/cache) and survives restarts: the first request after a
 * pause used to get days-old data this way. Price of `swr: false`: one
 * upstream round trip per TTL window lands on a single request's latency.
 */
const UPSTREAM_TTL_S = 60 * 30

const USER_AGENT = 'begutachtungs-monitor/0.1 (ziviltech-prototyp)'
/**
 * Timeout per attempt. Deliberately tight: the risk is not the fast 502 but
 * the hanging upstream — timeout × (1 + MAX_RETRIES) is how long an SSR
 * render blocks in the worst case before the error page appears. At 20 s
 * that was over 60 s. 8 s is ~70× the measured p90 (90–110 ms on list 81),
 * leaving plenty of headroom while capping the worst case at ~25 s.
 */
const TIMEOUT_MS = 8_000
const MAX_RETRIES = 2
const RETRY_BACKOFF_MS = 300
const FALLBACK_GP = 'XXVIII'
/** Oldest GP with Ministerialentwürfe in the Parliament API (XIV, 1979). */
const OLDEST_GP_WITH_ME = 14

export interface FilterListResponse {
  pages?: number
  count?: number
  lastSync?: string | null
  header?: unknown[]
  rows?: unknown[][]
}

export interface GegenstandResponse {
  content?: {
    stages?: RawStage[] | null
    documents?: RawDocumentGroup[] | null
    names?: RawName[] | null
    shortinfo?: RawShortinfo | null
    statements?: { documents?: RawDocumentGroup[] | null } | null
    status?: { bgbllinks?: RawBgblLink[] | null } | null
  } | null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * GET/POST with 8-s timeout and 2 retries on 5xx/network errors
 * (300 ms backoff). 4xx is not retried.
 */
async function upstreamJson<T>(
  url: string,
  init: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(RETRY_BACKOFF_MS)

    let res: Response
    try {
      res = await fetch(url, {
        method: init.method ?? 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
          ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (err) {
      // Network error / timeout → retry
      lastError = err
      continue
    }

    if (res.status >= 500) {
      lastError = new Error(`Upstream ${res.status} für ${url}`)
      continue
    }
    if (res.status === 404) {
      throw createError({ statusCode: 404, statusMessage: 'Gegenstand nicht gefunden' })
    }
    if (!res.ok) {
      throw createError({
        statusCode: 502,
        statusMessage: `Parlament-API antwortete mit Status ${res.status}`,
      })
    }
    try {
      return (await res.json()) as T
    } catch (err) {
      lastError = err
      continue
    }
  }
  throw createError({
    statusCode: 502,
    statusMessage: 'Parlament-API nicht erreichbar',
    cause: lastError,
  })
}

/**
 * POST to a filter list. `showAll=true` returns all matches —
 * this only works WITHOUT pagesize (an explicit pagesize wins otherwise).
 */
export function fetchFilterList(
  listId: number,
  body: Record<string, unknown>,
  query: Record<string, string> = {},
): Promise<FilterListResponse> {
  const params = new URLSearchParams({ js: 'eval', showAll: 'true', ...query })
  const url = `${PARLIAMENT_BASE}/Filter/api/filter/data/${listId}?${params.toString()}`
  return upstreamJson<FilterListResponse>(url, { method: 'POST', body })
}

/** GET /gegenstand/{gp}/{ityp}/{inr}?json=True */
export function fetchGegenstand(gp: string, ityp: string, inr: number): Promise<GegenstandResponse> {
  const url = `${PARLIAMENT_BASE}/gegenstand/${gp}/${ityp}/${inr}?json=True`
  return upstreamJson<GegenstandResponse>(url)
}

/**
 * The API silently ignores unknown filter keys — a typo once returned the
 * unfiltered full dataset. Therefore: every row must belong to the requested
 * GP, otherwise abort.
 */
function assertRowsMatchGp(rows: unknown[][], gp: string, listId: number): void {
  for (const row of rows) {
    if (!Array.isArray(row) || row[0] !== gp) {
      throw createError({
        statusCode: 502,
        statusMessage: `Upstream-Filter hat nicht gegriffen (Liste ${listId}, GP ${gp})`,
      })
    }
  }
}

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

/**
 * Current GP from the page configuration of the ME list
 * (…definition.params.GP_CODE[0]), cached for 24 h, fallback 'XXVIII'.
 */
export const getCurrentGp = defineCachedFunction(
  async (): Promise<string> => {
    try {
      const config = await upstreamJson<unknown>(
        `${PARLIAMENT_BASE}/recherchieren/gegenstaende/ministerialentwuerfe?json=True`,
      )
      const gp = findGpCode(config)
      if (gp) return gp
    } catch {
      // Fallback below
    }
    return FALLBACK_GP
  },
  { name: 'current-gp', getKey: () => 'current', maxAge: 60 * 60 * 24, swr: false },
)

export interface GpConsultations {
  gp: string
  lastSync: string | null
  items: ConsultationSummary[]
}

/** Upstream lastSync (format not contractual) → ISO-8601, else null. */
function toIsoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** List 81 of one GP, mapped and sanity-checked. Leaf cache. */
export const getConsultationsForGp = defineCachedFunction(
  async (gp: string): Promise<GpConsultations> => {
    const res = await fetchFilterList(81, { GP_CODE: [gp] }, { sortrnr: '11', ascDesc: 'DESC' })
    const rows = res.rows ?? []
    assertRowsMatchGp(rows, gp, 81)
    return {
      gp,
      lastSync: toIsoTimestamp(res.lastSync),
      items: rows.map(mapConsultationRow),
    }
  },
  { name: 'consultations-gp', getKey: (gp: string) => gp, maxAge: UPSTREAM_TTL_S, swr: false },
)

/**
 * Upstream AKTIV can lag behind an already-passed deadline (computed
 * upstream + 30-min leaf cache): an expired Frist beats the flag. Runs at
 * request time (not in the mapper) so the day boundary is never frozen into
 * the cache. All consumers of `active` (dashboard, status filter, detail
 * CTA) read the same reconciled state this way.
 */
export function reconcileActive(item: ConsultationSummary): ConsultationSummary {
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

/** List-81 row of one item; 404 if it does not exist in that GP. */
export async function requireConsultation(gp: string, inr: number): Promise<ConsultationSummary> {
  const { items } = await getConsultationsForGp(gp)
  const summary = items.find((item) => item.inr === inr)
  if (!summary) {
    throw createError({ statusCode: 404, statusMessage: 'Begutachtung nicht gefunden' })
  }
  return reconcileActive(summary)
}

/**
 * List 142 of one ME, GDPR-filtered and mapped, date descending. Leaf cache.
 *
 * Inconsistency guard: list 142 sometimes answers EMPTY although list 81
 * still counts statements (observed 2026-08-27: 88/ME had 707 in list 81,
 * 0 rows in list 142 — reproducible with the filter definition embedded in
 * parlament.gv.at's own detail page). A cached empty would freeze that
 * glitch for 30 minutes, so: one retry, then throw — errors are never
 * cached, and callers degrade explicitly instead of lying with a zero.
 */
export const getStatementsForMe = defineCachedFunction(
  async (gp: string, inr: number): Promise<StatementMeta[]> => {
    const query = () =>
      fetchFilterList(142, {
        BEZUG_GP_CODE: [gp],
        BEZUG_ITYP: ['ME'],
        BEZUG_INR: [inr],
      })
    let res = await query()
    let rows = res.rows ?? []
    if (rows.length === 0) {
      const { items } = await getConsultationsForGp(gp)
      const claimed = items.find((i) => i.inr === inr)?.statementCount ?? 0
      if (claimed > 0) {
        res = await query()
        rows = res.rows ?? []
        if (rows.length === 0) {
          throw createError({
            statusCode: 502,
            statusMessage:
              'Stellungnahmen-Liste ist auf parlament.gv.at derzeit nicht abrufbar',
          })
        }
      }
    }
    assertRowsMatchGp(rows, gp, 142)
    const items = rows.map(mapStatementRow)
    items.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    return items
  },
  {
    name: 'statements-me',
    getKey: (gp: string, inr: number) => `${gp}-${inr}`,
    maxAge: UPSTREAM_TTL_S,
    swr: false,
  },
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
    maxAge: UPSTREAM_TTL_S,
    swr: false,
  },
)

/**
 * Last-good statements aggregations, consulted ONLY in the catch path when
 * the live list-142 fetch fails — an upstream hiccup must not delete the
 * flagship aggregation for a whole cache window (88/ME, the showcase,
 * degraded exactly this way in practice). In-memory, dies on restart —
 * acceptable, because staleness is always visible (staleAsOf travels to
 * the UI). Deliberately NOT Nitro staleMaxAge: that is the stale-served-
 * as-fresh SWR behavior this codebase banned after being burned.
 */
const lastGoodStatements = new Map<
  string,
  { items: StatementMeta[]; fetchedAt: string }
>()

function buildStatementsSummary(items: StatementMeta[]): StatementsSummary {
  const organisations: StatementMeta[] = []
  let privatePersons = 0
  let nonPublic = 0
  for (const s of items) {
    if (s.submitterKind === 'organisation') organisations.push(s)
    else if (s.submitterKind === 'person') privatePersons++
    else nonPublic++
  }
  organisations.sort((a, b) => b.endorsements - a.endorsements)
  return {
    total: items.length,
    organisations: organisations.length,
    privatePersons,
    nonPublic,
    topOrganisations: organisations.slice(0, 8).map((s) => ({
      name: s.submitterName ?? '',
      endorsements: s.endorsements,
      parliamentUrl: s.parliamentUrl,
    })),
  }
}

/**
 * Chain state of one consultation (RV citation + BGBl number) WITHOUT the
 * statements fetch — the dashboard's recently-closed section needs only
 * the outcome, and getConsultationDetail would drag list 142 along for
 * every pool item. Pure composition over the Gegenstand leaf caches,
 * deliberately uncached (same reasoning as getConsultationDetail below).
 */
export async function getConsultationOutcome(
  gp: string,
  inr: number,
): Promise<{ rvCitation: string | null; bgblNumber: string | null }> {
  const detail = await getGegenstand(gp, 'ME', inr)
  const rvLink = findLastRvLink(parseStages(detail.content?.stages))
  if (!rvLink) return { rvCitation: null, bgblNumber: null }
  let bgblNumber: string | null = null
  try {
    const rv = await getGegenstand(rvLink.gp, 'I', rvLink.inr)
    bgblNumber = extractBgblLink(rv.content?.status?.bgbllinks)?.number ?? null
  } catch {
    // RV enrichment is optional: the RV citation alone is still an answer.
  }
  return { rvCitation: rvLink.label, bgblNumber }
}

/**
 * Detail assembly (docs/architecture.md §5):
 * list-81 row (404 if absent) + detail JSON + statements summary +
 * RV enrichment (latest RV; BGBl via Abfrage=BgblAuth; RV errors → nulls).
 *
 * DELIBERATELY UNCACHED. A cache on top of a derived aggregate freezes a
 * snapshot of its inputs and stamps it as fresh — exactly how a days-old
 * statements count was once passed on as a current result here. The function
 * is pure composition over the leaf caches and costs nothing without a
 * cache of its own.
 */
export async function getConsultationDetail(
  gp: string,
  inr: number,
): Promise<ConsultationDetail> {
  // All three leaf calls are independent → parallel. For an unknown INR the
  // first failing 404 wins (list 81 or Gegenstand) — equivalent for the
  // client. List 142 then just returns zero rows.
  const statementsKey = `${gp}-${inr}`
  const [summary, detail, statementsResult] = await Promise.all([
    requireConsultation(gp, inr),
    getGegenstand(gp, 'ME', inr),
    // Statements must not take the whole page down: on failure (including
    // the list-142 inconsistency guard) the last-good aggregation is
    // served with visible staleness, and only without one does the page
    // degrade to the list-81 count.
    getStatementsForMe(gp, inr)
      .then((items) => {
        lastGoodStatements.set(statementsKey, {
          items,
          fetchedAt: new Date().toISOString(),
        })
        return { items, staleAsOf: null as string | null }
      })
      .catch(() => {
        const lastGood = lastGoodStatements.get(statementsKey)
        return lastGood
          ? { items: lastGood.items, staleAsOf: lastGood.fetchedAt }
          : null
      }),
  ])
  const content = detail.content ?? {}

  const trace = parseStages(content.stages)

  let enactment: EnactmentInfo | null = null
  const rvLink = findLastRvLink(trace)
  if (rvLink) {
    enactment = {
      rvCitation: rvLink.label,
      rvUrl: rvLink.url,
      bgblNumber: null,
      bgblRisUrl: null,
    }
    try {
      const rv = await getGegenstand(rvLink.gp, 'I', rvLink.inr)
      const bgbl = extractBgblLink(rv.content?.status?.bgbllinks)
      if (bgbl) {
        enactment.bgblNumber = bgbl.number
        enactment.bgblRisUrl = bgbl.url
      }
    } catch {
      // RV enrichment is optional: bgblNumber/bgblRisUrl stay null.
    }
  }

  // The list-81 counter (row[13]) is dropped here: the detail response
  // carries exactly ONE statements number — from list 142, the same source
  // as the breakdown below it. Sole exception: when list 142 is down, the
  // list-81 count is the only truth left and travels flagged as `degraded`.
  const { statementCount: listCount, ...base } = summary

  return {
    ...base,
    shortTitle: deriveShortTitle(summary.title),
    description: parseShortinfo(content.shortinfo),
    invitedBy: mapInvitedBy(content.names),
    documents: mapDocuments(content.documents),
    trace: markTraceMilestones(trace, rvLink?.url ?? null),
    textEvolution: mapTextEvolution(content.statements?.documents),
    statements: statementsResult
      ? {
          ...buildStatementsSummary(statementsResult.items),
          overviewTotal: listCount,
          staleAsOf: statementsResult.staleAsOf,
        }
      : {
          total: listCount,
          organisations: 0,
          privatePersons: 0,
          nonPublic: 0,
          topOrganisations: [],
          degraded: true,
        },
    enactment,
  }
}
