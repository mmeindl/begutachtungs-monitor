/**
 * The Lesefassung by Absatz, not as one wall.
 *
 * `bodyText` separates the Absätze with a line break, but the word diff
 * normalises whitespace and the segments have lost it (measured 19.09.2026:
 * 0 of 3 segments still carried one). A § with eighteen Absätze therefore
 * stood as one block, „(1) … (2) … (3) …" in the middle of running text: the
 * markers were back, the structure was not.
 *
 * The split is therefore at the marker itself, and WITHOUT violating the
 * segment boundaries: a segment is a run of one kind
 * (`equal | inserted | removed`), and an Absatz break inside it cuts the text
 * only, never the kind. An inserted Absatz stays green even when it gets a
 * block of its own.
 *
 * The marker is `(1)`, `(2a)` — digits in parentheses at the start of a word.
 * „(EU) 2018/1808" does not match (letters), „Abs. 1" does not either (no
 * parentheses); those are the two forms standing beside it in the same text.
 */
import type { LawDiffSegment } from '../../shared/types'

const ABS_MARK = /(?=\(\d+[a-z]?\)\s)/

export function absaetze(segments: LawDiffSegment[]): LawDiffSegment[][] {
  const out: LawDiffSegment[][] = []
  let current: LawDiffSegment[] = []
  for (const seg of segments) {
    const pieces = seg.text.split(ABS_MARK)
    for (const [i, text] of pieces.entries()) {
      if (!text) continue
      // A new block starts at every marker but the very first of the
      // Paragraph — otherwise an empty block would stand in front of it.
      const startsAbsatz = i > 0 || /^\(\d+[a-z]?\)\s/.test(text)
      if (startsAbsatz && current.length) {
        out.push(current)
        current = []
      }
      current.push({ ...seg, text })
    }
  }
  if (current.length) out.push(current)
  return out.length ? out : [segments]
}
