/**
 * List 142 on both sides of the process — the Stellungnahmen on a
 * Ministerialentwurf and on a Regierungsvorlage — with the last-good
 * fallback.
 *
 * `buildStatementsSummary` moved out on 23.09.2026 to
 * `statementsSummary.ts`: it is pure, and everything in this file is Nitro
 * (`defineCachedFunction`, `createError`), which is exactly why no test
 * could reach it here. Not re-exported from here — under `server/utils`
 * both files are auto-imported, and a re-export would make the same name
 * arrive from two modules.
 */
import type { StatementMeta } from '#shared/types'
import { findLastRvLink, parseStages, type RvLink } from './detailJson'
import { getDraftsForGp, getGegenstand } from './drafts'
import { mapStatementRow } from './list142'
import {
  loadLastGoodStatements,
  saveLastGoodStatements,
  type LastGoodStatements,
} from './lastgood'
import { assertListHeader, assertRowsMatchParent, fetchFilterList } from '../upstream/parliament'
import { UPSTREAM_LIST_TTL_S } from '../cache/ttl'

/**
 * List 142 of one ME, GDPR-filtered and mapped, date descending. Derived —
 * and the one upstream call with **no cached fetch underneath it**, for two
 * independent reasons (`cache/base.ts`).
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
const getStatementsForMe = defineCachedFunction(
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
    assertRowsMatchParent(rows, gp, 'ME', inr)
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
    maxAge: UPSTREAM_LIST_TTL_S,
    swr: false,
  },
)

/**
 * Above this many Stellungnahmen on one Regierungsvorlage the full list is
 * not fetched. The COVID-era Vorlagen carry tens of thousands (1289 d.B. of
 * GP XXVII: 41,376 — ten megabytes of names for one fact line); everything
 * else measured in GP XXVII/XXVIII stays far below.
 *
 * It is a cap on the ROWS, not on what the page may say: since 26.09.2026 a
 * Vorlage above it still gets its organisations by name
 * (`fetchInstitutionStatements`).
 */
export const RV_STATEMENTS_CAP = 5_000

/**
 * The Regierungsvorlage a draft became — from the draft's own stage list,
 * the way the outcome finds it, so a Vorlage in a later
 * Gesetzgebungsperiode resolves too. `null` while the draft has none.
 */
export async function findRvForDraft(gp: string, inr: number): Promise<RvLink | null> {
  const detail = await getGegenstand(gp, 'ME', inr)
  return findLastRvLink(parseStages(detail.content?.stages))
}

export interface RvStatements {
  /** Upstream's total, known above the cap too. */
  total: number
  /**
   * Classified rows, date descending. Above the cap these are the
   * INSTITUTIONS only (see `unlisted`); null when not even those could be
   * read.
   */
  items: StatementMeta[] | null
  /**
   * Counted upstream and deliberately not fetched — the person half of a
   * mass campaign. 0 wherever every row was read, which is every Vorlage
   * below the cap.
   */
  unlisted: number
}

/**
 * The organisations of a Vorlage that is too large to read whole — and the
 * reason the cap no longer costs the named half (`api-exploration.md`,
 * list 142).
 *
 * List 142's hidden column 19 (`TYP`) is a filter dimension, not only a
 * column: `TYP: ['I']` narrows the list to the submitters who registered as
 * an institution. Measured live on 26.09.2026 against the worst case the
 * cap was written for — 1289 d.B. of GP XXVII answers **17** rows against
 * its 41,376, and `TYP: ['P']` the other 41,359, so the two partition the
 * list exactly. The mass half of a mass campaign is the private persons,
 * whom this site never names anyway; what the cap used to throw away with
 * them was seventeen chambers, law firms and associations that can be named.
 *
 * The narrowing is ASSERTED, not trusted. The filter API ignores keys it
 * does not know and answers the unfiltered list (`upstream/parliament.ts`) —
 * here that would be 41,376 rows of private persons' names presented as
 * organisations. Two independent guards catch it: the sizing call below
 * refuses anything above the cap — and a list that did not narrow is the
 * whole list, which is above it by definition, or we would not be here —
 * and every row must carry the flag (`assertInstitutionRows`), on the
 * column the header check has just identified by its `feld_name`. Behind
 * both, `mapStatementRow` classifies each row the ordinary way, so the flag
 * opens no GDPR door it does not open on the uncapped path either — it can
 * suppress a name, never publish one (`privacy.ts`).
 *
 * Null is „unknown", never „none": this runs where the whole list could not
 * be read, so a zero here would print „keine Organisation" about a Vorlage
 * nobody looked at. The caller keeps the total and says nothing else.
 */
async function fetchInstitutionStatements(
  body: Record<string, unknown>,
  gp: string,
  inr: number,
): Promise<StatementMeta[] | null> {
  const typBody = { ...body, TYP: ['I'] }
  const head = await fetchFilterList(142, typBody, {}, { all: false })
  const headRows = head.rows ?? []
  const count = typeof head.count === 'number' ? head.count : headRows.length
  if (count === 0) return []
  /* Both guards against an ignored `TYP`: a list that did not narrow is the
   * whole list, which is by definition above the cap that sent us here. */
  if (count > RV_STATEMENTS_CAP) return null

  const res = headRows.length >= count ? head : await fetchFilterList(142, typBody)
  const rows = res.rows ?? []
  /* The index glitch (a count with no rows) — unknown, not empty. */
  if (rows.length === 0) return null
  assertRowsMatchParent(rows, gp, 'I', inr)
  assertListHeader(142, res)
  assertInstitutionRows(rows)
  const items = rows.map(mapStatementRow)
  /* Same order as the uncapped path, so one list renders both. */
  items.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  return items
}

/**
 * Every row of a `TYP: ['I']` fetch must carry that flag in column 19 — the
 * column the header check has just vouched for by its `feld_name`. An
 * ignored filter key is the documented failure mode of this API, and on
 * this path it would hand the page a list of private persons under the
 * heading „Organisationen".
 */
function assertInstitutionRows(rows: unknown[][]): void {
  for (const row of rows) {
    if (!Array.isArray(row) || row[19] !== 'I') {
      throw createError({
        statusCode: 502,
        statusMessage: 'Upstream-Filter TYP hat nicht gegriffen (Liste 142)',
      })
    }
  }
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
 * nothing more. Derived cache, like the ME list: the raw rows name private
 * persons and are never stored.
 *
 * ABOVE THE CAP the organisations are fetched on their own since
 * 26.09.2026 (`fetchInstitutionStatements`) and `unlisted` carries the
 * rest. Until then the page had the count and nothing else, which on
 * 1289 d.B. meant dropping seventeen nameable organisations to avoid
 * 41,359 names nobody may republish anyway.
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
    if (total === 0) return { total: 0, items: [], unlisted: 0 }
    if (total > RV_STATEMENTS_CAP) {
      const institutions = await fetchInstitutionStatements(body, gp, inr)
      return { total, items: institutions, unlisted: total - (institutions?.length ?? 0) }
    }

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
    assertRowsMatchParent(rows, gp, 'I', inr)
    assertListHeader(142, res)
    const items = rows.map(mapStatementRow)
    items.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    return { total, items, unlisted: 0 }
  },
  {
    name: 'statements-rv',
    base: DERIVED_CACHE,
    getKey: (gp: string, inr: number) => `${gp}-${inr}`,
    maxAge: UPSTREAM_LIST_TTL_S,
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

interface StatementsResult {
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
