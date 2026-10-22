/**
 * A counted number of slots with a first-come queue — what
 * `upstream/fetch.ts` takes one of per request attempt, per upstream host.
 *
 * Pure module: no timers, no Nitro, so vitest can execute it directly.
 *
 * FIFO, and strictly so: a freed slot is handed to the longest waiter
 * before anyone else can take it, so a steady stream of new requests cannot
 * starve one that has been queued since before them. The count never drops
 * on a hand-over, which is what keeps a newcomer from slipping in between.
 */

export interface Slots {
  /**
   * Resolves once a slot is free — at once while one is — with the function
   * that gives it back. Calling that function twice gives back one slot.
   */
  acquire(): Promise<() => void>
  /** Slots taken now. */
  readonly active: number
  /** Callers queued for one. */
  readonly waiting: number
}

export function createSlots(limit: number): Slots {
  let active = 0
  const queue: Array<(release: () => void) => void> = []

  function handOver(): void {
    const next = queue.shift()
    if (next) next(releaser())
    else active--
  }

  function releaser(): () => void {
    let released = false
    return () => {
      if (released) return
      released = true
      handOver()
    }
  }

  return {
    acquire() {
      if (active < limit) {
        active++
        return Promise.resolve(releaser())
      }
      return new Promise((resolve) => queue.push(resolve))
    },
    get active() {
      return active
    },
    get waiting() {
      return queue.length
    },
  }
}
