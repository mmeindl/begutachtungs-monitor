import { describe, expect, it } from 'vitest'
import { withinBudget } from '../server/utils/budget'

const later = <T>(value: T, ms: number): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms))

describe('withinBudget', () => {
  it('passes the value through when it arrives in time', async () => {
    await expect(withinBudget(later('ris-map', 5), 200)).resolves.toBe('ris-map')
  })

  it('answers null past the budget instead of waiting', async () => {
    const started = Date.now()
    await expect(withinBudget(later('too late', 5_000), 30)).resolves.toBeNull()
    // The point of the guard: the caller is released, not held for 5 s.
    expect(Date.now() - started).toBeLessThan(1_000)
  })

  /* The reason the timeout does not abort: the dropped call is the one that
   * fills the cache, so the next reader finds it warm. */
  it('lets the slow promise finish after the caller has given up', async () => {
    let settled = false
    const slow = later('corpus', 40).then((v) => {
      settled = true
      return v
    })
    await expect(withinBudget(slow, 10)).resolves.toBeNull()
    expect(settled).toBe(false)
    await expect(slow).resolves.toBe('corpus')
    expect(settled).toBe(true)
  })

  it('turns a rejection into null and leaves nothing unhandled', async () => {
    const failing = Promise.reject(new Error('RIS-API nicht erreichbar'))
    await expect(withinBudget(failing, 200)).resolves.toBeNull()
    // Awaiting the same rejection again must still be handled, not a crash
    // in a later tick — that is what makes dropping the await safe.
    await expect(failing.catch(() => 'handled')).resolves.toBe('handled')
  })
})
