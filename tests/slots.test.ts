import { describe, expect, it } from 'vitest'
import { createSlots } from '../server/utils/upstream/slots'

/**
 * The slots each upstream host's requests queue for
 * (`server/utils/upstream/slots.ts`, 22.10.2026). What `upstream/fetch.ts`
 * relies on: never more than the limit, first come first served, and a
 * slot given back exactly once however often its release is called.
 */

/** One turn of the macrotask queue — every pending microtask has run. */
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('createSlots', () => {
  it('hands out up to the limit at once, and no more', async () => {
    const slots = createSlots(2)
    const got: number[] = []
    for (let i = 0; i < 4; i++) void slots.acquire().then(() => got.push(i))
    await flush()
    expect(got).toEqual([0, 1])
    expect(slots.active).toBe(2)
    expect(slots.waiting).toBe(2)
  })

  it('gives a freed slot to the longest waiter, not to a newcomer', async () => {
    const slots = createSlots(1)
    const order: string[] = []
    const first = await slots.acquire()
    void slots.acquire().then((release) => {
      order.push('waited')
      release()
    })
    first()
    // Asked for in the same tick the slot came free — and still second.
    void slots.acquire().then((release) => {
      order.push('newcomer')
      release()
    })
    await flush()
    expect(order).toEqual(['waited', 'newcomer'])
    expect(slots.active).toBe(0)
  })

  it('serves every waiter in the order it came', async () => {
    const slots = createSlots(2)
    const order: number[] = []
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        slots.acquire().then(async (release) => {
          order.push(i)
          await flush()
          release()
        }),
      ),
    )
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(slots.active).toBe(0)
  })

  it('gives back one slot for a release called twice', async () => {
    const slots = createSlots(1)
    const release = await slots.acquire()
    let second = false
    let third = false
    void slots.acquire().then(() => (second = true))
    void slots.acquire().then(() => (third = true))
    release()
    release()
    await flush()
    expect([second, third]).toEqual([true, false])
    expect(slots.active).toBe(1)
  })
})
