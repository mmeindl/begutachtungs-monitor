/**
 * List 142 on both sides of the process — the Stellungnahmen on a
 * Ministerialentwurf and on a Regierungsvorlage — with the last-good
 * fallback and the summary the panel renders.
 */
import type { StatementMeta, StatementsSummary } from '#shared/types'
import { findLastRvLink, parseStages, type RvLink } from './detailJson'
import { getDraftsForGp, getGegenstand } from './drafts'
import { mapStatementRow } from './list142'
import { groupOrganisationStatements } from './organisations'
import {
  loadLastGoodStatements,
  saveLastGoodStatements,
  type LastGoodStatements,
} from './lastgood'
import { assertListHeader, assertRowsMatchGp, fetchFilterList } from '../upstream/parliament'
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
    maxAge: UPSTREAM_LIST_TTL_S,
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
