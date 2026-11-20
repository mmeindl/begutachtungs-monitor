import { describe, expect, it } from 'vitest'
import { MIN_TRIES, floorFailed, floorRows } from '../scripts/lib/landGuardReport'

/**
 * The verdicts of the Land harness (`scripts/harness/landGuard.ts`), against
 * invented tallies: a floor, a baseline and an accounting show their edge
 * only on a break somebody puts in.
 */

describe('floorRows (--mindestens)', () => {
  it('holds a class with enough tries at or above the floor', () => {
    const [row] = floorRows([{ key: 'R-neu', tried: 100, caught: 95 }], 95)
    expect(row).toMatchObject({ key: 'R-neu', verdict: 'gehalten', rate: 95 })
    expect(floorFailed(floorRows([{ key: 'R-neu', tried: 100, caught: 95 }], 95))).toBe(false)
  })

  it('fails a class with enough tries below the floor', () => {
    const rows = floorRows([{ key: 'Zahl', tried: 652, caught: 611 }], 95)
    expect(rows[0]!.verdict).toBe('unter dem Boden')
    expect(floorFailed(rows)).toBe(true)
  })

  it('never passes a class with fewer than 20 tries in silence: it is „nicht gehalten", not „gehalten"', () => {
    const rows = floorRows([{ key: 'Satz weg', tried: MIN_TRIES - 1, caught: MIN_TRIES - 1 }], 95)
    expect(rows[0]!.verdict).toBe('nicht gehalten')
    // Not a failure of the run — the floor says nothing there, and says so.
    expect(floorFailed(rows)).toBe(false)
  })

  it('a class never tried is „nicht gehalten" with no rate, not a 0 % failure', () => {
    const [row] = floorRows([{ key: 'Wort', tried: 0, caught: 0 }], 95)
    expect(row).toMatchObject({ verdict: 'nicht gehalten', rate: null })
  })

  it('exactly 20 tries are enough to be held', () => {
    expect(floorRows([{ key: 'R-fremd', tried: MIN_TRIES, caught: 18 }], 95)[0]!.verdict).toBe('unter dem Boden')
  })
})
