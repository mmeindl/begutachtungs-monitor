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
 * arrive from two modules. (Since 22.10.2026 `tests/statementsFetch.test.ts`
 * does run this file, with Nitro's two names faked; what it tests is the
 * sizing and the cap, which only exist here.)
 */
import type { StatementMeta } from '#shared/types'
import { findLastRvLink, parseStages, type RvLink } from './detailJson'
import { getDraftsForGp, getGegenstand } from './drafts'
import { mapStatementRow, STATEMENTS_CAP, type StatementParentType } from './list142'
import {
  loadLastGoodStatements,
  saveLastGoodStatements,
  type LastGoodStatements,
} from './lastgood'
import {
  assertListHeader,
  assertRowsMatchParent,
  fetchFilterList,
  type FilterListResponse,
} from '../upstream/parliament'
import { UPSTREAM_LIST_TTL_S } from '../cache/ttl'

/** One Ministerialentwurf's list 142, as the page reads it. */
interface MeStatements {
  /** Classified rows, date descending. Above the cap the INSTITUTIONS only. */
  items: StatementMeta[]
  /**
   * Counted upstream and deliberately not fetched — the rest of a list above
   * `STATEMENTS_CAP`. 0 wherever the whole list was read.
   */
  unlisted: number
}

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
 * SIZED BEFORE IT IS READ, since 22.10.2026, the way the Vorlage's list
 * below always was: the first call omits `showAll` and gets one page plus
 * upstream's `count`. Up to `STATEMENTS_CAP` the whole list follows, and it
 * has to arrive whole (`fetchWholeList`); above it the institutions are read
 * by name and the rest is counted (`unlisted`). Until then this read every
 * row it was given — and 164/ME of GP XXVII, 106,183 Stellungnahmen, was
 * given 100,000, which were aggregated as if they were all of them.
 *
 * Inconsistency guard: list 142 sometimes answers EMPTY although list 81
 * still counts statements (observed 2026-08-27: 88/ME had 707 in list 81,
 * 0 rows in list 142 — reproducible with the filter definition embedded in
 * parlament.gv.at's own detail page). A cached empty would freeze that
 * glitch for 30 minutes, so: one retry, then throw — errors are never
 * cached, and callers degrade explicitly instead of lying with a zero. The
 * sizing call is what answers empty now, with a `count` of 0, so it is the
 * one retried.
 */
const getStatementsForMe = defineCachedFunction(
  async (gp: string, inr: number): Promise<MeStatements> => {
    const body = { BEZUG_GP_CODE: [gp], BEZUG_ITYP: ['ME'], BEZUG_INR: [inr] }
    const size = () => fetchFilterList(142, body, {}, { all: false })
    // List 81 alongside, not before: it is a warm leaf on every real draft,
    // so the parallel read costs nothing — and it is the existence check. A
    // number that is no draft throws here, and an error is never cached, so
    // made-up numbers leave no empty list behind.
    const [first, draft] = await Promise.all([
      size(),
      getDraftsForGp(gp).then(({ items }) => items.find((i) => i.inr === inr)),
    ])
    if (!draft) throw createError({ statusCode: 404, statusMessage: 'Entwurf nicht gefunden' })
    let head = first
    let total = countOf(head)
    if (total === 0 && draft.statementCount > 0) {
      head = await size()
      total = countOf(head)
      if (total === 0) {
        throw createError({
          statusCode: 502,
          statusMessage: 'Stellungnahmen-Liste ist auf parlament.gv.at derzeit nicht abrufbar',
        })
      }
    }
    if (total === 0) return { items: [], unlisted: 0 }

    let result: MeStatements
    if (total > STATEMENTS_CAP) {
      const institutions = await fetchInstitutionStatements(body, gp, 'ME', inr)
      /* Unknown, never none (see there) — and unlike the Vorlage's line, this
       * page has a fallback for a list it could not read, so it fails like any
       * other failed read and the last-good record or list 81's count stands
       * in. Never the count alone presented as a list nobody read. */
      if (!institutions) {
        throw createError({
          statusCode: 502,
          statusMessage: 'Organisationen der Stellungnahmen-Liste derzeit nicht abrufbar',
        })
      }
      result = { items: institutions, unlisted: Math.max(0, total - institutions.length) }
    } else {
      const rows = await fetchWholeList(body, head, gp, 'ME', inr)
      result = { items: sortByDateDesc(rows.map(mapStatementRow)), unlisted: 0 }
    }
    await rememberStatements(gp, inr, result)
    return result
  },
  {
    name: 'statements-me',
    base: DERIVED_CACHE,
    getKey: (gp: string, inr: number) => `${gp}-${inr}`,
    maxAge: UPSTREAM_LIST_TTL_S,
    swr: false,
  },
)

/** Date descending; a missing date sorts last. */
function sortByDateDesc(items: StatementMeta[]): StatementMeta[] {
  return items.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
}

/**
 * Upstream's total for a filtered list: `count`, which every answer of the
 * filter API carries, sized or whole. An answer without one cannot be held
 * against anything, and holding the rows against it is the one check these
 * reads may not skip (`fetchWholeList`) — so it is a 502, never a guess from
 * the rows. Guessing is how a list of more than 20 used to pass as its
 * first page wherever the count was missing.
 */
function countOf(res: FilterListResponse): number {
  const { count } = res
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Stellungnahmen-Liste ohne Gesamtzahl geliefert (Liste 142)',
    })
  }
  return count
}

/**
 * The rows of one answer are the whole list it counts — or a 502.
 *
 * Held against the `count` of the SAME answer, not against the sizing call
 * before it: a Stellungnahme filed between the two is a longer list, not a
 * broken one. What this catches is the documented failure of `showAll`: it
 * stops at 100,000 rows with no error, no flag and no marker
 * (`api-exploration.md`, list 142), and a list cut short aggregates exactly
 * as cleanly as a whole one.
 */
function assertWholeList(res: FilterListResponse, rows: unknown[][]): void {
  const count = countOf(res)
  if (rows.length !== count) {
    throw createError({
      statusCode: 502,
      statusMessage: `Stellungnahmen-Liste unvollständig geliefert (${rows.length} von ${count} Zeilen)`,
    })
  }
}

/**
 * Every row of one parent's list 142, below the cap — read whole, and proven
 * whole before anything is aggregated or remembered.
 *
 * The sizing answer is reused where its one page already holds the list
 * (up to 20 rows), so small lists cost one request. A count with no rows
 * behind it is the index glitch both lists show: one retry, then a 502.
 */
async function fetchWholeList(
  body: Record<string, unknown>,
  head: FilterListResponse,
  gp: string,
  ityp: StatementParentType,
  inr: number,
): Promise<unknown[][]> {
  let res = (head.rows ?? []).length >= countOf(head) ? head : await fetchFilterList(142, body)
  let rows = res.rows ?? []
  if (rows.length === 0) {
    res = await fetchFilterList(142, body)
    rows = res.rows ?? []
    if (rows.length === 0) {
      throw createError({
        statusCode: 502,
        statusMessage: 'Stellungnahmen-Liste ist auf parlament.gv.at derzeit nicht abrufbar',
      })
    }
  }
  assertWholeList(res, rows)
  assertRowsMatchParent(rows, gp, ityp, inr)
  assertListHeader(142, res)
  return rows
}

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
 * The organisations of an item whose list is too large to read whole — and
 * the reason the cap no longer costs the named half (`api-exploration.md`,
 * list 142). Both sides take this path since 22.10.2026: the Vorlage since
 * 26.09.2026, the Ministerialentwurf since it has a cap at all.
 *
 * List 142's hidden column 19 (`TYP`) is a filter dimension, not only a
 * column: `TYP: ['I']` narrows the list to the submitters who registered as
 * an institution. Measured live on 26.09.2026 against the worst case the
 * cap was written for — 1289 d.B. of GP XXVII answers **17** rows against
 * its 41,376, and `TYP: ['P']` the other 41,359, so the two partition the
 * list exactly. The mass half of a mass campaign is the private persons,
 * whom this site never names anyway; what the cap used to throw away with
 * them was seventeen chambers, law firms and associations that can be named.
 * The worst Ministerialentwurf, 164/ME of GP XXVII, answers 117 against its
 * 106,183 (measured live 22.10.2026).
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
 * be read, so a zero here would print „keine Organisation" about an item
 * nobody looked at. The caller keeps the total and says nothing else.
 */
async function fetchInstitutionStatements(
  body: Record<string, unknown>,
  gp: string,
  ityp: StatementParentType,
  inr: number,
): Promise<StatementMeta[] | null> {
  const typBody = { ...body, TYP: ['I'] }
  const head = await fetchFilterList(142, typBody, {}, { all: false })
  const count = countOf(head)
  if (count === 0) return []
  /* Both guards against an ignored `TYP`: a list that did not narrow is the
   * whole list, which is by definition above the cap that sent us here. */
  if (count > STATEMENTS_CAP) return null

  const res = (head.rows ?? []).length >= count ? head : await fetchFilterList(142, typBody)
  const rows = res.rows ?? []
  /* The index glitch (a count with no rows) — unknown, not empty. */
  if (rows.length === 0) return null
  assertWholeList(res, rows)
  assertRowsMatchParent(rows, gp, ityp, inr)
  assertListHeader(142, res)
  assertInstitutionRows(rows)
  /* Same order as the uncapped path, so one list renders both. */
  return sortByDateDesc(rows.map(mapStatementRow))
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
 * persons and are never stored. Below the cap the rows are held against
 * upstream's count (`fetchWholeList`, since 22.10.2026), and `total` is then
 * the rows read, which is that count.
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
    const total = countOf(head)
    if (total === 0) return { total: 0, items: [], unlisted: 0 }
    if (total > STATEMENTS_CAP) {
      const institutions = await fetchInstitutionStatements(body, gp, 'I', inr)
      return { total, items: institutions, unlisted: Math.max(0, total - (institutions?.length ?? 0)) }
    }

    const rows = await fetchWholeList(body, head, gp, 'I', inr)
    const items = sortByDateDesc(rows.map(mapStatementRow))
    return { total: items.length, items, unlisted: 0 }
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
  { items, unlisted }: MeStatements,
): Promise<void> {
  // An empty list is never worth remembering, and must never overwrite a
  // real one: "0 rows" is the shape the list-142 outage takes, and a stale
  // zero would render as "Noch keine Stellungnahmen" — the one degraded
  // state that carries no staleness note at all (the UI shows it only for
  // total > 0). Above the cap `items` are the institutions, and `unlisted`
  // travels with them: without it a recalled record would present them as
  // the whole list.
  if (items.length === 0) return
  const record: LastGoodStatements = { items, unlisted, fetchedAt: new Date().toISOString() }
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
  const record = { items: stored.items, unlisted: stored.unlisted, fetchedAt: stored.fetchedAt }
  lastGoodStatements.set(key, record)
  return record
}

interface StatementsResult extends MeStatements {
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
    const { items, unlisted } = await getStatementsForMe(gp, inr)
    return { items, unlisted, staleAsOf: null }
  } catch (err) {
    const lastGood = await recallStatements(gp, inr)
    if (!lastGood) throw err
    return { items: lastGood.items, unlisted: lastGood.unlisted, staleAsOf: lastGood.fetchedAt }
  }
}
