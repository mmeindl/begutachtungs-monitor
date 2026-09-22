/**
 * The one bounded worker pool.
 *
 * Six fan-outs against Parliament and RIS had written the same twelve lines
 * — a shared cursor, N workers, `Promise.all` — with limits between 4 and
 * 12 and two different failure rules. The limits are measured per call site
 * and stay there; what is shared is the mechanics.
 *
 * Order is guaranteed for the RESULT, never for the work: `out[i]` belongs
 * to `items[i]`, but the callbacks run interleaved. A caller that writes
 * into a Map or an array from inside the callback still gets completion
 * order, which is what the call sites that do so relied on before.
 */

export interface PoolOptions {
  /**
   * Stop pulling work at the first rejection and rethrow it once every
   * worker has come to rest. Without it — the default — a rejection rejects
   * the whole call at once while the other workers run their current item
   * out, which is what four of the five call sites always did.
   */
  failFast?: boolean
}

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  options: PoolOptions = {},
): Promise<R[]> {
  const out = new Array<R>(items.length)
  // A list and not a flag: TypeScript narrows a `let` that only a closure
  // writes to, and the length of an array it does not narrow.
  const failures: unknown[] = []
  let next = 0

  const worker = async (): Promise<void> => {
    while (failures.length === 0) {
      const i = next++
      if (i >= items.length) return
      if (!options.failFast) {
        out[i] = await fn(items[i]!, i)
        continue
      }
      try {
        out[i] = await fn(items[i]!, i)
      } catch (err) {
        failures.push(err)
        return
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  if (failures.length > 0) throw failures[0]
  return out
}
