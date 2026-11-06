/**
 * Time budget for optional enrichment.
 *
 * PURE MODULE — no Nuxt auto-imports, only relative imports, so vitest can
 * execute it directly.
 */

/**
 * Waits at most `ms` for `promise`, then answers `null`.
 *
 * The promise is deliberately NOT aborted when the budget runs out: it is
 * the call that fills the cache behind it, so letting it finish is the whole
 * point — the request that arrived first pays nothing and the next one finds
 * the value warm. Rejections resolve to `null` too, which is also what makes
 * dropping the await safe: nothing can surface later as an unhandled
 * rejection.
 *
 * Consequence for callers: `null` means "no answer in time OR no answer at
 * all". Only use this where those two are the same thing for the reader —
 * enrichment that is absent either way, never a fact the page asserts.
 */
export function withinBudget<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  const settled: Promise<T | null> = promise.catch(() => null)
  let timer: ReturnType<typeof setTimeout> | undefined
  const budget = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms)
  })
  return Promise.race([settled, budget]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

/** What `answerWithinBudget` saw: an answer — null included —, or none in time. */
export type Budgeted<T> = { answered: true; value: T } | { answered: false }

/**
 * `withinBudget` for a caller to whom „no answer in time" and „the answer is
 * null" are NOT the same: the station map, which keeps a chain six hours when
 * its reads answered and ten minutes when one did not (`stationMap.ts`). A
 * Kundmachung RIS has no date for is a stable answer; a date lookup past its
 * budget is a gap, and the chain that lacks it must be asked again soon.
 * The promise runs on and fills its cache, as with `withinBudget`.
 */
export async function answerWithinBudget<T>(promise: Promise<T>, ms: number): Promise<Budgeted<T>> {
  return (await withinBudget(promise.then((value) => ({ answered: true as const, value })), ms)) ?? { answered: false }
}
