/**
 * A paged upstream read whose first page states the total — page 1 alone,
 * then the rest together.
 *
 * WHY (12.11.2026). Every paged RIS read here asked for page N+1 only once
 * page N had arrived, although page 1 already says how many there are
 * (`Hits`). 95/ME's Gegenüberstellung waited on fifteen such pages one
 * after another, ~0,45 s each — the law's §§ on the draft's day, then the
 * law's version history — 6,7 s cold of which 0,5 s were CPU.
 *
 * WHAT IT KEEPS. The caller walks the pages exactly as it walked its loop
 * before — the same `Hits` check on every page, the same break on a short or
 * empty page, the same ceiling — only the pages are already there when it
 * asks. Where the count on page 1 did not reach far enough (it grew between
 * pages), `get` fetches the next page then, one by one, as the loop always
 * did. So a count that disagrees with the rows fails or ends the read as it
 * did, and a count that changes between pages is read from each page as
 * before.
 *
 * ERRORS. One failed page fails the read: `mapWithConcurrency` rejects with
 * the first failure and pulls nothing more, and nothing reaches a cache,
 * because the read throws before anything is returned. One edge moves: a
 * page past one that came back EMPTY was never fetched before and is now, so
 * its failure fails a read that used to end early with what it had. That
 * needs RIS to state more hits than it serves, and failing there is the safe
 * side.
 *
 * Pure module, no Nitro globals: the harnesses and vitest run it as it is.
 */
import { mapWithConcurrency } from '../pool'

/**
 * How many further pages of ONE read are in flight at once.
 *
 * Four, against the 24 slots a RIS host has per process (`fetch.ts`,
 * `DEFAULT_HOST_CONCURRENCY`). A cold draft page asks five or six sections
 * at once, and two or three of them page a law each while the annex check,
 * the Lesefassung and the § names fetch § documents four at a time
 * (`annex/verdict.ts`, `kons/consolidate.ts`, `diff/paraTitleService.ts`):
 * three paged reads at four plus three § fan-outs at four is 24. More per
 * read would only queue behind the slots — or take them from the § fetches
 * the reader is waiting on as well. Measured on 12.11.2026, cold on the
 * built server: 95/ME's Gegenüberstellung — three pages of the
 * Ärztegesetz's §§, twelve of its history — 8,5 s one page after another,
 * 3,7 s four at a time.
 */
export const PAGE_CONCURRENCY = 4

/** The pages of one read, in page order. */
export interface Pages<T> {
  /** Page `page` (from 1): fetched already where page 1's count reached it, otherwise now. */
  get(page: number): Promise<T>
  /** How many pages were fetched up front — page 1 and those its count named. */
  readonly prefetched: number
}

/**
 * Page 1, then pages 2 to `pageCount(page 1)` — at most `maxPages` — with
 * `limit` in flight at a time. `pageCount` reads the total off the first
 * answer; anything below 1 counts as 1, so an empty or implausible first
 * page costs no further request.
 */
export async function readPages<T>(
  fetchPage: (page: number) => Promise<T>,
  pageCount: (first: T) => number,
  maxPages: number,
  limit: number = PAGE_CONCURRENCY,
): Promise<Pages<T>> {
  const first = await fetchPage(1)
  const counted = Math.floor(pageCount(first))
  const count = Number.isFinite(counted) ? Math.max(1, Math.min(maxPages, counted)) : 1
  const rest = await mapWithConcurrency(
    Array.from({ length: count - 1 }, (_, i) => i + 2),
    limit,
    (page) => fetchPage(page),
  )
  const got = [first, ...rest]
  return {
    get: (page) => (page >= 1 && page <= got.length ? Promise.resolve(got[page - 1]!) : fetchPage(page)),
    prefetched: got.length,
  }
}

/** The page count of a RIS answer of `perPage` documents a page, from its `Hits`. */
export function risPageCount(hits: number, perPage = 100): number {
  return Math.ceil(hits / perPage)
}
