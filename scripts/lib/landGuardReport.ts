/**
 * The verdicts over what `harness/landGuard.ts` measures of a Land's
 * Textgegenüberstellung (20.11.2026) — pure, so `tests/landGuardReport.test.ts`
 * can hold every rule against an invented run, as `annexReport.ts` does for
 * the Bund's annex. The harness fetches, counts and prints; whether a run
 * stands is decided here.
 */

/**
 * Below this many tries a fault class is not held by a floor: one miss is
 * five points there. The Bund's floor (`harness/faultInjection.ts`,
 * `--mindestens`) let such a class pass in silence; here it is named „nicht
 * gehalten", so a class that shrinks below the threshold is read as what it
 * is — unmeasured — and not as one that holds.
 */
export const MIN_TRIES = 20

export interface FaultTally { key: string; tried: number; caught: number }

/**
 * `gehalten`: tried often enough and caught at or above the floor.
 * `unter dem Boden`: tried often enough and caught below it — the run fails.
 * `nicht gehalten`: tried fewer than `MIN_TRIES` times; the floor says
 * nothing about the class, and the record says so.
 */
export type FloorVerdict = 'gehalten' | 'unter dem Boden' | 'nicht gehalten'

export interface FloorRow extends FaultTally {
  /** The share caught in percent; null where nothing was tried. */
  rate: number | null
  verdict: FloorVerdict
}

/** Each fault class against the floor `pct` (`--mindestens=<pct>`). */
export function floorRows(tallies: readonly FaultTally[], pct: number): FloorRow[] {
  return tallies.map((t) => {
    const rate = t.tried ? (100 * t.caught) / t.tried : null
    const verdict: FloorVerdict = t.tried < MIN_TRIES ? 'nicht gehalten' : rate! < pct ? 'unter dem Boden' : 'gehalten'
    return { ...t, rate, verdict }
  })
}

/** Whether the run fails its floor: some class tried often enough is caught below it. */
export function floorFailed(rows: readonly FloorRow[]): boolean {
  return rows.some((r) => r.verdict === 'unter dem Boden')
}
