import { describe, expect, it } from 'vitest'
import { mapWithConcurrency } from '../server/utils/pool'

/**
 * The one bounded worker pool (`server/utils/pool.ts`) — six fan-outs
 * against Parliament and RIS run through it, and it had no test.
 *
 * What the call sites actually rely on is the sentence in its header:
 * `out[i]` belongs to `items[i]`, however the callbacks interleave. The
 * station map builds a `Record` by zipping the pool's answer back onto the
 * drafts it sent in, so a result array that followed COMPLETION order would
 * not fail anywhere — it would put every draft's chain under a different
 * draft's key, on a page whose whole claim is that it traces one document.
 *
 * The tests below drive that with deferred promises instead of timers:
 * every callback hangs until the test releases it, so the interleaving is
 * chosen rather than hoped for, and the file costs no wall time.
 */

/** A promise the test resolves by hand, so completion order is the test's decision. */
function deferred<T = void>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

/** One turn of the macrotask queue — enough for every pending microtask to run. */
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('mapWithConcurrency', () => {
  it('returns results in INPUT order when they complete in reverse', async () => {
    const items = ['a', 'b', 'c', 'd']
    const gates = items.map(() => deferred<string>())
    const completed: string[] = []

    const run = mapWithConcurrency(items, 4, async (item, i) => {
      const value = await gates[i]!.promise
      completed.push(item)
      return value
    })

    for (const i of [3, 1, 0, 2]) gates[i]!.resolve(`${items[i]}!`)
    const out = await run

    // The callbacks really did finish out of order — otherwise this test
    // would prove nothing about ordering at all.
    expect(completed).toEqual(['d', 'b', 'a', 'c'])
    expect(out).toEqual(['a!', 'b!', 'c!', 'd!'])
  })

  it('passes each item its own index', async () => {
    expect(await mapWithConcurrency(['x', 'y', 'z'], 2, async (item, i) => `${i}:${item}`))
      .toEqual(['0:x', '1:y', '2:z'])
  })

  it('never runs more than `limit` callbacks at once, and does run that many', async () => {
    const items = [1, 2, 3, 4, 5, 6]
    const gates = items.map(() => deferred())
    let inFlight = 0
    let peak = 0

    const run = mapWithConcurrency(items, 2, async (item, i) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await gates[i]!.promise
      inFlight--
      return item * 10
    })

    // One at a time, so the pool refills six times over — a limit that held
    // only for the first batch would show up here.
    for (const gate of gates) {
      gate.resolve()
      await flush()
    }

    expect(await run).toEqual([10, 20, 30, 40, 50, 60])
    expect(peak).toBe(2)
    expect(inFlight).toBe(0)
  })

  it('starts one worker per item when the limit is higher than the list', async () => {
    const items = [1, 2]
    const gates = items.map(() => deferred())
    let inFlight = 0
    let peak = 0

    const run = mapWithConcurrency(items, 12, async (item, i) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await gates[i]!.promise
      inFlight--
      return item
    })
    for (const gate of gates) gate.resolve()

    expect(await run).toEqual([1, 2])
    // `Math.min(limit, items.length)` — twelve workers over two items would
    // be ten idle promises per call site.
    expect(peak).toBe(2)
  })

  it('answers an empty list without calling anything', async () => {
    let calls = 0
    expect(await mapWithConcurrency([], 4, async () => {
      calls++
      return 1
    })).toEqual([])
    expect(calls).toBe(0)
  })

  /**
   * The default: the call rejects at once, and the workers that are already
   * running do NOT stop — they finish the list in the background. Frozen
   * because it is the rule four of the call sites were written under, and
   * because it is the opposite of what the name `mapWithConcurrency`
   * suggests on its own.
   */
  it('rejects with the first error and keeps the other workers going', async () => {
    const seen: number[] = []
    const run = mapWithConcurrency([1, 2, 3, 4], 2, async (item) => {
      seen.push(item)
      if (item === 2) throw new Error('upstream 502')
      return item
    })

    await expect(run).rejects.toThrow('upstream 502')
    await flush()
    expect(seen).toEqual([1, 2, 3, 4])
  })

  /**
   * `failFast` is the other rule: no more work is pulled, the workers still
   * in flight run their current item out, and the recorded error is rethrown
   * once everything has come to rest.
   */
  it('stops pulling work under failFast and rethrows the recorded error', async () => {
    const seen: number[] = []
    const run = mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (item) => {
      seen.push(item)
      if (item === 1) throw new Error('abbruch')
      return item
    }, { failFast: true })

    await expect(run).rejects.toThrow('abbruch')
    // The second worker's current item, and nothing after it.
    expect(seen).toEqual([1, 2])
  })

  it('reports the FIRST failure when two workers fail', async () => {
    const gates = [deferred(), deferred()]
    const run = mapWithConcurrency([0, 1], 2, async (item, i) => {
      await gates[i]!.promise
      throw new Error(`fehler ${item}`)
    }, { failFast: true })

    // The second worker fails first in time; the first one is still the one
    // whose error is recorded first, because `failures` keeps arrival order.
    gates[1]!.resolve()
    await flush()
    gates[0]!.resolve()

    await expect(run).rejects.toThrow('fehler 1')
  })

  /**
   * A limit of 0 starts no worker at all and hands back an array of holes —
   * `Math.min(0, n)`. Nothing passes 0 today (the six limits are 4 to 12),
   * and this is here so that a future „0 means unbounded" reads as a change
   * of behaviour rather than as a fix.
   */
  it('does nothing at all with a limit of 0', async () => {
    let calls = 0
    const out = await mapWithConcurrency([1, 2], 0, async () => {
      calls++
      return 1
    })
    expect(calls).toBe(0)
    expect(out).toHaveLength(2)
    expect(out[0]).toBeUndefined()
  })
})
