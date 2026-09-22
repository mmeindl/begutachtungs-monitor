/**
 * Running a few hundred requests without running a few hundred at once.
 *
 * `sleep` is the server's, not a fourth copy of `new Promise(setTimeout)`.
 */
export { sleep } from '../../server/utils/upstream/fetch'

/**
 * `run` over every item, `concurrency` at a time, results in INPUT order.
 *
 * Input order rather than completion order, although two of the three copies
 * this replaces pushed as they finished: a measurement that prints its rows
 * in whatever sequence four workers happened to return them is a measurement
 * whose output changes between runs over the same input.
 *
 * `onProgress` is called after each finished item and counts the finished
 * ones — the scripts that report progress write it to stderr, so it never
 * reaches the result.
 */
export async function pool<T, R>(
  items: readonly T[],
  concurrency: number,
  run: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  let done = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      for (let i = next++; i < items.length; i = next++) {
        out[i] = await run(items[i]!, i)
        onProgress?.(++done, items.length)
      }
    }),
  )
  return out
}
