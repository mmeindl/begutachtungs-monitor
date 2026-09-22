/**
 * Upstream client for the Parliament API (docs/architecture.md §2/§5).
 *
 * The Nitro server is a caching proxy in front of POST /Filter/api/filter/
 * data/{81,142} and GET /gegenstand/…. Rules: showAll=true WITHOUT pagesize,
 * sortrnr=11&ascDesc=DESC on list 81, sanity check row[0]===gp after every
 * list call (the API silently ignores unknown filter keys),
 * 2 retries on 5xx/network errors.
 *
 * CACHE ARCHITECTURE (three rules, all learned the hard way — see
 * UPSTREAM_TTL_S and lastgood.ts):
 * 1. Caching happens ONLY at the leaves, i.e. at the upstream calls
 *    themselves. Derived aggregates (getDraftDetail) stay uncached.
 * 2. No SWR — `swr: false` must be set explicitly.
 * 3. Stale data is never served as fresh, but it IS served as stale: the
 *    last-good statements aggregation is persisted (lastgood.ts) and
 *    labelled with `staleAsOf` when the live list-142 fetch fails.
 * 4. Two layers by provenance (§5 rule 5, `cacheBase.ts`). Rule 1 says where
 *    to cache; this says in which layer. The upstream answers are cached as
 *    they arrived; everything this module derives from them — the row
 *    mappings, `findGpCode`, the classified statements — takes
 *    `base: DERIVED_CACHE` and never reaches the disk. List 142 has no
 *    cached fetch at all: its rows name private persons.
 */
import type {
  DraftDetail,
  DraftDocument,
  DraftSummary,
  EnactmentInfo,
  RelatedDraft,
  StatementMeta,
  StatementsSummary,
} from '#shared/types'
import { chainCoverageOf } from '#shared/utils/draftChain'
import { GP_RE, gpEndedOn, gpHasEnded, intToRoman, romanToInt } from '#shared/utils/gp'
import { daysUntil } from '#shared/utils/format'
import {
  deriveShortTitle,
  extractBgblLink,
  findHandoff,
  findLastRvLink,
  findRvLinks,
  groupOrganisationStatements,
  isFilingOpen,
  mapDraftRow,
  mapDocuments,
  mapInvitedBy,
  mapStatementRow,
  mapTextEvolution,
  mapVorlageRow,
  RV_STATION,
  parseShortinfo,
  parseStages,
  PARLIAMENT_BASE,
  type RawBgblLink,
  type RawDocumentGroup,
  type RawName,
  type RawShortinfo,
  type RawStage,
  type VorlageRow,
} from './mappers'
import { checkListHeader } from './listHeaders'
import {
  loadLastGoodStatements,
  saveLastGoodStatements,
  type LastGoodStatements,
} from './lastgood'
import { withinBudget } from './budget'
import { findRelatedDrafts } from './related'

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
    /** "1" while the item takes Stellungnahmen, "0" afterwards (`isFilingOpen`). */
    statementsstate?: string | number | null
    /**
     * Predecessors of this item — on a Regierungsvorlage the Ministerialentwurf
     * it came from (`ityp: 'ME'`). **Not a universal field:** 126 d.B. carries
     * no `preconst` key at all, so its absence is not proof that no
     * Begutachtung happened; cross-check against list 81
     * (`docs/begutachtung-uebersprungen.md` §2).
     */
    preconst?: { gp_code?: string | null; ityp?: string | null; inr?: number | string | null }[] | null
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
 *
 * `all: false` OMITS the parameter: the API then answers one default page
 * (20 rows) plus `count`, the total — the cheap way to size a list before
 * fetching it. The parameter's presence is what counts upstream, not its
 * value; `showAll=false` still returns everything (verified 2026-09-15).
 */
export function fetchFilterList(
  listId: number,
  body: Record<string, unknown>,
  query: Record<string, string> = {},
  options: { all?: boolean } = {},
): Promise<FilterListResponse> {
  const params = new URLSearchParams({
    js: 'eval',
    ...(options.all === false ? {} : { showAll: 'true' }),
    ...query,
  })
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

/**
 * The header names the columns the mappers read by position
 * (`listHeaders.ts`). Checked wherever rows are trusted, i.e. next to the GP
 * check and, like it, before anything is cached — a reordered column would
 * otherwise degrade silently into "every submitter is a Privatperson".
 * Only when there are rows: an empty list has no columns to misread.
 */
function assertListHeader(listId: number, res: FilterListResponse): void {
  if (!(res.rows ?? []).length) return
  const mismatch = checkListHeader(listId, res.header)
  if (mismatch) {
    throw createError({
      statusCode: 502,
      statusMessage: `Spaltenlayout der Parlaments-API hat sich geändert – ${mismatch}`,
    })
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

/** The ME list's page configuration, as served. Leaf cache. */
const meListConfig = defineCachedFunction(
  (): Promise<unknown> =>
    upstreamJson<unknown>(`${PARLIAMENT_BASE}/recherchieren/gegenstaende/ministerialentwuerfe?json=True`),
  { name: 'parliament-me-config', getKey: () => 'config', maxAge: 60 * 60 * 24, swr: false },
)

/**
 * Current GP from that configuration (…definition.params.GP_CODE[0]),
 * fallback 'XXVIII'. Derived: `findGpCode` is our search through a foreign
 * document, so it belongs in the layer that dies with the code
 * (`cacheBase.ts`). The configuration underneath it is the cached half.
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

export interface GpDrafts {
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
  { name: 'drafts-list', getKey: (gp: string) => gp, maxAge: UPSTREAM_TTL_S, swr: false },
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
  { name: 'drafts-gp', base: DERIVED_CACHE, getKey: (gp: string) => gp, maxAge: UPSTREAM_TTL_S, swr: false },
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
  { name: 'vorlagen-gp', base: DERIVED_CACHE, getKey: (gp: string) => gp, maxAge: UPSTREAM_TTL_S, swr: false },
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

/** List-81 row of one item; 404 if it does not exist in that GP. */
export async function requireDraft(gp: string, inr: number): Promise<DraftSummary> {
  const { items } = await getDraftsForGp(gp)
  const summary = items.find((item) => item.inr === inr)
  if (!summary) {
    throw createError({ statusCode: 404, statusMessage: 'Entwurf nicht gefunden' })
  }
  return reconcileActive(summary)
}

/**
 * List 142 of one ME, GDPR-filtered and mapped, date descending. Derived —
 * and the one upstream call with **no cached fetch underneath it**, for two
 * independent reasons (`cacheBase.ts`).
 *
 * The raw rows name private persons. `mapStatementRow` drops those names
 * before anything is stored, so what may be kept is the classified result,
 * never the response it came from — and the persistent layer is a directory
 * on disk. The second reason is the guard below: a cached raw response would
 * hand the retry the same empty answer it is retrying.
 *
 * The classified rows are cached, but derived, so they die with the code
 * that classified them — a change to `classifySubmitter` shows on the next
 * request instead of in half an hour.
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
      const { items } = await getDraftsForGp(gp)
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
    assertListHeader(142, res)
    const items = rows.map(mapStatementRow)
    items.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    await rememberStatements(gp, inr, items)
    return items
  },
  {
    name: 'statements-me',
    base: DERIVED_CACHE,
    getKey: (gp: string, inr: number) => `${gp}-${inr}`,
    maxAge: UPSTREAM_TTL_S,
    swr: false,
  },
)

/**
 * Above this many Stellungnahmen on one Regierungsvorlage only the count is
 * fetched. The COVID-era Vorlagen carry tens of thousands (1289 d.B. of GP
 * XXVII: 41,376 — ten megabytes of names for one fact line); everything
 * else measured in GP XXVII/XXVIII stays far below.
 */
export const RV_STATEMENTS_CAP = 5_000

export interface RvStatements {
  /** Upstream's total, known above the cap too. */
  total: number
  /** Classified rows, date descending; null above the cap. */
  items: StatementMeta[] | null
}

/**
 * The Stellungnahmen on a Regierungsvorlage — the second window for input,
 * on parliament's side, which the monitor did not show until a user pointed
 * at 2238 d.B. (2026-09-15). Same list 142 with `BEZUG_ITYP: I`, item type
 * SN instead of SNME; the same mapper and the same GDPR path. GP XXVIII:
 * 555 such Stellungnahmen on 68 Vorlagen.
 *
 * Sized before it is fetched: the first call omits `showAll` and gets one
 * page plus the total. Small lists arrive complete in that page and cost
 * nothing more; above the cap only the total travels, and the page says the
 * breakdown is missing instead of showing a subset. Derived cache, like the
 * ME list: the raw rows name private persons and are never stored.
 *
 * No last-good fallback here — this enriches a station the page already
 * draws, so a failed fetch costs one line, not the page.
 */
export const getStatementsForRv = defineCachedFunction(
  async (gp: string, inr: number): Promise<RvStatements> => {
    const body = { BEZUG_GP_CODE: [gp], BEZUG_ITYP: ['I'], BEZUG_INR: [inr] }
    const head = await fetchFilterList(142, body, {}, { all: false })
    const headRows = head.rows ?? []
    const total = typeof head.count === 'number' ? head.count : headRows.length
    if (total === 0) return { total: 0, items: [] }
    if (total > RV_STATEMENTS_CAP) return { total, items: null }

    let res = headRows.length >= total ? head : await fetchFilterList(142, body)
    let rows = res.rows ?? []
    if (rows.length === 0) {
      // The same index glitch the ME list has: a count with no rows behind it.
      res = await fetchFilterList(142, body)
      rows = res.rows ?? []
      if (rows.length === 0) {
        throw createError({
          statusCode: 502,
          statusMessage: 'Stellungnahmen-Liste ist auf parlament.gv.at derzeit nicht abrufbar',
        })
      }
    }
    assertRowsMatchGp(rows, gp, 142)
    assertListHeader(142, res)
    const items = rows.map(mapStatementRow)
    items.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    return { total, items }
  },
  {
    name: 'statements-rv',
    base: DERIVED_CACHE,
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
 * the live list-142 fetch fails — an upstream outage must not delete the
 * flagship aggregation (88/ME, the showcase, degraded exactly this way in
 * practice). Deliberately NOT Nitro staleMaxAge: that is the stale-served-
 * as-fresh SWR behavior this codebase banned after being burned. Staleness
 * stays visible instead — `staleAsOf` travels to the UI.
 *
 * Two layers over ONE record: this map is the hot path, `lastgood.ts`
 * persists it. The map alone died on every restart and every deploy, so a
 * page that had lost its live data lost its fallback with the next release
 * — and list 142 drops whole MEs for days, not minutes (see lastgood.ts).
 */
const lastGoodStatements = new Map<string, LastGoodStatements>()

/**
 * Success path, called from inside the leaf cache — i.e. once per real
 * upstream fetch, not once per request, which also makes `fetchedAt` the
 * time the data actually came from upstream.
 */
async function rememberStatements(
  gp: string,
  inr: number,
  items: StatementMeta[],
): Promise<void> {
  // An empty list is never worth remembering, and must never overwrite a
  // real one: "0 rows" is the shape the list-142 outage takes, and a stale
  // zero would render as "Noch keine Stellungnahmen" — the one degraded
  // state that carries no staleness note at all (the UI shows it only for
  // total > 0).
  if (items.length === 0) return
  const record: LastGoodStatements = { items, fetchedAt: new Date().toISOString() }
  lastGoodStatements.set(`${gp}-${inr}`, record)
  await saveLastGoodStatements(gp, inr, record)
}

/** Failure path: memory first, then disk — a disk hit warms the memory. */
async function recallStatements(
  gp: string,
  inr: number,
): Promise<LastGoodStatements | null> {
  const key = `${gp}-${inr}`
  const cached = lastGoodStatements.get(key)
  if (cached) return cached
  const stored = await loadLastGoodStatements(gp, inr)
  if (!stored) return null
  const record = { items: stored.items, fetchedAt: stored.fetchedAt }
  lastGoodStatements.set(key, record)
  return record
}

export interface StatementsResult {
  items: StatementMeta[]
  /** Set only when `items` is a last-good fallback, never for live data. */
  staleAsOf: string | null
}

/**
 * List 142 with the last-good fallback — THE one place that decides what a
 * failed statements fetch degrades to, so the detail page and the list
 * endpoint cannot answer that question differently (they did: the summary
 * fell back to the last-good aggregation while the list below it showed an
 * error box).
 *
 * Rethrows when there is no record to fall back to: the original error
 * carries the accurate reason (list-142 inconsistency vs. timeout vs.
 * upstream 5xx), which a null return would flatten. Callers that prefer a
 * degraded answer over an error catch it — `getDraftDetail` does.
 */
export async function getStatementsWithFallback(
  gp: string,
  inr: number,
): Promise<StatementsResult> {
  try {
    return { items: await getStatementsForMe(gp, inr), staleAsOf: null }
  } catch (err) {
    const lastGood = await recallStatements(gp, inr)
    if (!lastGood) throw err
    return { items: lastGood.items, staleAsOf: lastGood.fetchedAt }
  }
}

/**
 * Headroom, not curation: the detail page ships EVERY organisation, so that an
 * organisation can find itself on the page — the point of the feedback layer —
 * and so the names sit in the SSR HTML for find-in-page and crawlers.
 *
 * Org populations don't scale with Stellungnahmen (88/ME: 707 statements, 23
 * organisations — the mass is private persons), but they do vary: measured in
 * GP XXVIII, 32/ME carries 100, 62/ME 43, 8/ME 35. The cap is a guard against
 * a pathological Verfahren, not a display limit, hence set above all of those.
 * 150 rows ≈ 20 KB worst case on one page, and the summary has exactly one
 * consumer (the detail page), so this multiplies with nothing. When it does
 * bind, `organisations` is still the true statement count — the UI says how
 * many it dropped instead of silently showing a subset.
 *
 * Counts GROUPED organisations (one row = one organisation, however often it
 * filed), which is what the page renders — so the cap binds even later than
 * the measured populations suggest.
 */
const ORG_LIST_CAP = 150

export function buildStatementsSummary(items: StatementMeta[]): StatementsSummary {
  const organisations: StatementMeta[] = []
  let privatePersons = 0
  let nonPublic = 0
  for (const s of items) {
    if (s.submitterKind === 'organisation') organisations.push(s)
    else if (s.submitterKind === 'person') privatePersons++
    else nonPublic++
  }
  return {
    total: items.length,
    /* Statements, not distinct organisations: this number is one part of the
     * partition of `total` that the panel renders as a legend and a mix bar,
     * and it has to keep adding up. The entry count of organisationList is
     * the distinct-organisation number, and the panel says so where it
     * differs. */
    organisations: organisations.length,
    privatePersons,
    nonPublic,
    organisationList: groupOrganisationStatements(organisations).slice(0, ORG_LIST_CAP),
  }
}

/**
 * How long a page waits for the RIS join before rendering without it.
 *
 * The join is enrichment: matched, unmatched and "we could not ask" all end
 * up as a block that either shows RIS links or isn't there. The cold cost is
 * not: the corpus is ~46 paged RIS requests, and on 2026-09-07 the first
 * detail-page hit after a deploy took **61 s** in production while the
 * prewarm unit was still running (it starts with --no-block after the
 * restart, so a visitor can arrive first — and the 20 h corpus TTL expires
 * during the day too, where swr:false makes the next request pay).
 *
 * Past the budget the reader gets the page and the fetch keeps running, so
 * the cache still fills — whoever pays the cold cost, it is never a visitor.
 * The unbounded call stays where it belongs: /api/ris-map, which is what the
 * prewarm timer hits.
 */
const RIS_JOIN_BUDGET_MS = 2_000

/**
 * Same bargain for the period's station map, which the detail page needs for
 * one question only: may this page say „bisher keine Regierungsvorlage" at
 * all (§12.27)? Per draft the question is undecidable — an archive gap and a
 * shelved draft leave the identical two-entry stage record — so the answer
 * has to come from the period.
 *
 * Enrichment, never a precondition: past the budget the answer is `unknown`,
 * which silences the claim rather than risking a false one. Cold this costs
 * the same hundreds of fetches as on the list, and the same background fill
 * pays for the next visitor. Warm it is 8 ms, and the current GP is prewarmed
 * anyway, so the branch that matters most is the one that is never cold.
 */
const STATION_MAP_BUDGET_MS = 2_000

/**
 * Chain state of one consultation (RV citation + BGBl number) WITHOUT the
 * statements fetch — the dashboard's recently-closed section needs only
 * the outcome, and getDraftDetail would drag list 142 along for
 * every pool item. Pure composition over the Gegenstand leaf caches,
 * deliberately uncached (same reasoning as getDraftDetail below).
 */
export async function getDraftOutcome(
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
export async function getDraftDetail(
  gp: string,
  inr: number,
): Promise<DraftDetail> {
  // All three leaf calls are independent → parallel. For an unknown INR the
  // first failing 404 wins (list 81 or Gegenstand) — equivalent for the
  // client. List 142 then just returns zero rows.
  const [summary, detail, statementsResult, risMap, stationMap, currentGp] = await Promise.all([
    requireDraft(gp, inr),
    getGegenstand(gp, 'ME', inr),
    // Statements must not take the whole page down: on failure (including
    // the list-142 inconsistency guard) the last-good aggregation is
    // served with visible staleness, and only without one does the page
    // degrade to the list-81 count.
    getStatementsWithFallback(gp, inr).catch(() => null),
    // RIS is a second upstream; neither its outage nor its latency must
    // cost the page. (Nitro auto-import from ./ris — an explicit import
    // would be a cycle.)
    withinBudget(getRisMapForGp(gp), RIS_JOIN_BUDGET_MS),
    // Whether the period links its drafts to Vorlagen at all — the gate on
    // every "no Regierungsvorlage" sentence below (§12.27). Auto-imported
    // from ./stationMap for the same reason as the RIS map above: an
    // explicit import would be a cycle.
    withinBudget(getStationMapForGp(gp), STATION_MAP_BUDGET_MS),
    // Whether this draft's GP is over is decided against the running one
    // (24 h leaf cache; the fallback value can only err towards "läuft").
    getCurrentGp(),
  ])
  const content = detail.content ?? {}

  const trace = parseStages(content.stages)

  let enactment: EnactmentInfo | null = null
  const rvLinks = findRvLinks(trace)
  const rvLink = rvLinks.at(-1) ?? null
  if (rvLink) {
    enactment = {
      rvCitation: rvLink.label,
      rvUrl: rvLink.url,
      // Filled below, once the text versions are mapped.
      rvTextUrl: null,
      rvDate: rvLink.date,
      // Everything before the latest one — the 1:n split, which used to be
      // visible only in the raw stage list.
      furtherRv: rvLinks.slice(0, -1).map((rv) => ({ label: rv.label, url: rv.url })),
      bgblNumber: null,
      bgblRisUrl: null,
      filingOpen: false,
    }
    try {
      const rv = await getGegenstand(rvLink.gp, 'I', rvLink.inr)
      const bgbl = extractBgblLink(rv.content?.status?.bgbllinks)
      if (bgbl) {
        enactment.bgblNumber = bgbl.number
        enactment.bgblRisUrl = bgbl.url
      }
      // The second window for input, from the same payload as the BGBl
      // link — no request of its own. Only while the GP runs: a Vorlage
      // that lapsed with its GP takes nothing, whatever a stale flag says.
      enactment.filingOpen = isFilingOpen(rv.content) && !gpHasEnded(gp, currentGp)
    } catch {
      // RV enrichment is optional: bgblNumber/bgblRisUrl stay null, filingOpen false.
    }
  }

  // Same-title drafts before and after this one — after the outcome is
  // known, because a successor is only offered while no RV exists.
  const related = await findRelated(summary, currentGp, enactment !== null)

  // The list-81 counter (row[13]) is dropped here: the detail response
  // carries exactly ONE statements number — from list 142, the same source
  // as the breakdown below it. Sole exception: when list 142 is down, the
  // list-81 count is the only truth left and travels flagged as `degraded`.
  const { statementCount: listCount, ...base } = summary

  const documents = mapDocuments(content.documents)
  // The draft's own document URLs are what upstream repeats while no RV
  // exists — excluded, so only what really came after the ME survives.
  const versions = mapTextEvolution(
    content.statements?.documents,
    new Set(documents.flatMap((doc) => doc.formats.map((f) => f.url))),
  )
  if (enactment) {
    enactment.rvTextUrl =
      versions.find((v) => v.station === RV_STATION && v.url.endsWith('.pdf'))?.url ??
      versions.find((v) => v.station === RV_STATION)?.url ??
      null
  }

  return {
    ...base,
    shortTitle: deriveShortTitle(summary.title),
    description: parseShortinfo(content.shortinfo),
    invitedBy: mapInvitedBy(content.names),
    documents,
    handoff: findHandoff(trace),
    // Later stations only: the RV's own text is enactment.rvTextUrl, where
    // the comparison offers it — listing it here too put the same link
    // under two headings.
    textEvolution: groupVersionsByStation(versions.filter((v) => v.station !== RV_STATION)),
    risDraft: risMap?.rows.find((r) => r.inr === inr) ?? null,
    gpEnded: gpHasEnded(gp, currentGp),
    gpEndedOn: gpEndedOn(gp),
    chainCoverage: chainCoverageOf(
      stationMap ? Object.values(stationMap) : null,
      gpHasEnded(gp, currentGp),
    ),
    predecessor: related.predecessor,
    successor: related.successor,
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
          organisationList: [],
          degraded: true,
        },
    enactment,
  }
}

/**
 * Same-title drafts in this, the previous and — once this GP is over — the
 * next Gesetzgebungsperiode (docs/architecture.md §12.10). Pure composition
 * over the list-81 leaf caches: the extra lists cost one upstream call per
 * GP per TTL, the adjacent GPs are where re-submissions happen (310/ME
 * XXVII → 32/ME XXVIII after the change of government), and further back
 * a same title is a routine repeat amendment, not a relation.
 *
 * Enrichment, never a dependency: a failing list or Gegenstand claims no
 * relation. A predecessor is kept only when it produced NO
 * Regierungsvorlage — that is the "second attempt" fact; a predecessor
 * that passed is a different amendment cycle and stays silent.
 */
async function findRelated(
  summary: DraftSummary,
  currentGp: string,
  hasRv: boolean,
): Promise<{ predecessor: RelatedDraft | null; successor: RelatedDraft | null }> {
  const n = romanToInt(summary.gp)
  const gps = [summary.gp]
  if (n !== null && n - 1 >= OLDEST_GP_WITH_ME) gps.push(intToRoman(n - 1))
  if (n !== null && gpHasEnded(summary.gp, currentGp)) gps.push(intToRoman(n + 1))
  const lists = await Promise.all(
    gps.map((g) =>
      getDraftsForGp(g)
        .then((r) => r.items)
        .catch(() => [] as DraftSummary[]),
    ),
  )
  const { predecessor, successor } = findRelatedDrafts(summary, lists.flat())

  let checkedPredecessor: RelatedDraft | null = null
  if (predecessor) {
    try {
      const prev = await getGegenstand(predecessor.gp, 'ME', predecessor.inr)
      const prevHasRv = findLastRvLink(parseStages(prev.content?.stages)) !== null
      if (!prevHasRv) checkedPredecessor = { ...predecessor, hasRv: false }
    } catch {
      // Unknown outcome → no claim.
    }
  }
  return { predecessor: checkedPredecessor, successor: hasRv ? null : successor }
}

/** One DocumentList row per station ("Geändert im Plenum") with its PDF/HTML formats. */
function groupVersionsByStation(versions: readonly { station: string; url: string }[]): DraftDocument[] {
  const out: DraftDocument[] = []
  for (const v of versions) {
    let doc = out.find((d) => d.title === v.station)
    if (!doc) {
      doc = { title: v.station, formats: [] }
      out.push(doc)
    }
    doc.formats.push({ type: v.url.toLowerCase().endsWith('.html') ? 'html' : 'pdf', url: v.url })
  }
  return out
}
