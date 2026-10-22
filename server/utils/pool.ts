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
   * Rethrow the first rejection only once every worker has come to rest.
   * Without it — the default — the first rejection rejects the whole call
   * at once. Either way no worker pulls another item after a rejection; the
   * ones in flight run their current item out.
   *
   * The default used to keep pulling: the call had rejected, but the other
   * workers worked through the rest of the list in the background — the
   * hand-written pools this replaced did exactly that, and this comment
   * claimed otherwise. Found on 22.10.2026, when a probe saw the call reject
   * after 22 ms and all 40 items started 500 ms later. Whatever those items
   * cost was spent for an answer already thrown away, and against an
   * upstream that had just failed: a § fetch that gave up on RIS left three
   * workers fetching the rest of up to 500 §§ (`kons/konsService.ts`).
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
      try {
        out[i] = await fn(items[i]!, i)
      } catch (err) {
        // Recorded in both modes, because it is what stops the others
        // pulling: the loop condition reads it.
        failures.push(err)
        if (options.failFast) return
        throw err
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  if (failures.length > 0) throw failures[0]
  return out
}
