/**
 * The two sides of a comparison shown side by side, for the case where there
 * is no word diff to project onto them.
 *
 * `segments` is null when the word diff hit its cell ceiling (`MAX_DP_CELLS`,
 * roughly 1.500 words a side). Both comparison sections then show each version
 * whole, marked as wholly differing, in the SAME two columns as a diffed row —
 * so a technical limit stops looking like a different kind of change.
 *
 * Where there are segments both sides are the same runs, and `DiffText`'s
 * `side` drops what a column does not show: `inserted` on the left, `removed`
 * on the right. Nothing is recomputed, the same data is read twice.
 */
import type { LawDiffSegment } from '../../shared/types'

export function splitSegments(
  segments: LawDiffSegment[] | null,
  fromText: string | null,
  toText: string | null,
): { from: LawDiffSegment[]; to: LawDiffSegment[] } {
  if (segments) return { from: segments, to: segments }
  return {
    from: fromText ? [{ type: 'removed', text: fromText }] : [],
    to: toText ? [{ type: 'inserted', text: toText }] : [],
  }
}
