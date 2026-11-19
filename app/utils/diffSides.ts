/**
 * The two sides of a comparison shown side by side, and what they say where
 * there is no word diff to project onto them.
 *
 * `segments` is null where the word diff stopped at its ceiling — for the §
 * comparison past `MAX_LINEAR_CELLS`, for the annex rows and the Begründung
 * past `MAX_DP_CELLS` (`server/utils/diff/wordDiff.ts`). Each version then
 * stands whole in the SAME two columns as a diffed row, **unmarked, under a
 * sentence that says why** (`NO_WORD_DIFF_DE`, 19.11.2026). Until then both
 * were marked as wholly differing, every word struck or inserted, with no
 * sentence: 80/ME XXVIII Z 13 read as a rewrite where four words changed,
 * and the page claimed changes nobody had found.
 *
 * Where there are segments both sides are the same runs, and `DiffText`'s
 * `side` drops what a column does not show: `inserted` on the left, `removed`
 * on the right. Nothing is recomputed, the same data is read twice.
 */
import type { LawDiffSegment } from '#shared/types'
import { gapDe } from '#shared/utils/gaps'

/**
 * Said where a changed text has no word diff: the ceiling is ours and holds
 * for every text of that length, so the lead word is the monitor's own. The
 * pill still says „geändert" — that the texts differ is decided apart from
 * the word diff, by their comparison key.
 */
export const NO_WORD_DIFF_DE = gapDe('outOfScope', 'Texte dieser Länge vergleicht der Monitor nicht Wort für Wort. Beide Fassungen stehen hier im Ganzen, ohne Markierung.')

export function splitSegments(
  segments: LawDiffSegment[] | null,
  fromText: string | null,
  toText: string | null,
): { from: LawDiffSegment[]; to: LawDiffSegment[] } {
  if (segments) return { from: segments, to: segments }
  return {
    from: fromText ? [{ type: 'equal', text: fromText }] : [],
    to: toText ? [{ type: 'equal', text: toText }] : [],
  }
}

/**
 * Whether a change reads better as two columns than as one sentence — decided
 * per unit since 02.10.2026, where a global „Fließtext / Nebeneinander" switch
 * made the reader pick one view for every change at once.
 *
 * Inline is right for a few swapped words and for a pure addition (one green
 * block). It is wrong where BOTH sides changed a lot: old and new then
 * alternate fragment by fragment, and the reader has to assemble two
 * versions in their head. So the measure is the REPLACED share — the smaller
 * of removed and inserted text against what stays — not the share kept: a
 * § that gains a whole Absatz keeps little of its new side and still reads
 * fine inline.
 *
 * Measured over GP XXVIII on 02.10.2026 (87 drafts with a § comparison,
 * 2.053 changed units; 115 with a Textgegenüberstellung, 3.232 changed rows),
 * reading samples on both sides of the line: from 0,4 interleaved fragments
 * dominate (SchUG § 49, MedKF-TG § 19), between 0,3 and 0,4 most still read
 * as one sentence. The 60-character floor keeps a swapped date or name inline
 * however high its share. Side by side at this line: 1,5 % of the § units,
 * 6,8 % of the annex rows — the ressorts recast whole Absätze, the
 * Regierungsvorlage rarely does.
 *
 * No segments (the word diff stopped at its ceiling) is handled by
 * `splitSegments` and shown in columns anyway, unmarked.
 */
export const SIDE_BY_SIDE_SHARE = 0.4
export const SIDE_BY_SIDE_MIN_CHARS = 60

export function readsSideBySide(segments: readonly LawDiffSegment[] | null): boolean {
  if (!segments) return true
  let equal = 0
  let removed = 0
  let inserted = 0
  for (const s of segments) {
    const n = s.text.replace(/\s+/g, ' ').length
    if (s.type === 'equal') equal += n
    else if (s.type === 'removed') removed += n
    else inserted += n
  }
  const replaced = Math.min(removed, inserted)
  return replaced >= SIDE_BY_SIDE_MIN_CHARS && replaced / (equal + replaced) >= SIDE_BY_SIDE_SHARE
}
