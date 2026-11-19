/**
 * Does every line of a PDF annex reach a row? (19.11.2026, audit A5)
 *
 * Every other number of `harness/annexPdf.ts` measures the rows the parser
 * emitted; none asked what it did NOT emit. A § a column printed twice lost
 * its second print, text of the right column the reader took for front
 * matter vanished, and every harness stayed green (FPRG 2021 § 3's Abs. 12,
 * the Versorgungssicherungsgesetz's Art. I). So each column line of the PDF,
 * as `linesFromPage` cuts it, is held against the text of its column's rows
 * and their headings: a line whose inner word pairs (first and last word
 * left out, which a hyphen or a join may alter) are less than half found
 * there reaches no row.
 *
 * Front matter, tables of contents and chrome are among those lines by
 * design — the parse drops them, counted — so this is a list to read, not a
 * count to hold at zero. What matters is a lost line that differs from the
 * other column's line beside it: there a change could hide that the page
 * never shows. A part set otherwise than the first is read on its own
 * (`parseAnnexParts`), and its lines are counted apart: the
 * Methodenverordnung Wasser's single-column Anlagen yield no rows at all.
 *
 * Kept out of the harness so it can be tested: a harness number that passes
 * judgement is tested like production code (docs/decisions.md, „Measuring").
 */
import { columnBoundary, linesFromPage, sameTypesetting, type AnnexPage } from '../../server/utils/annex/annexPdf'
import type { ComparisonRow } from '../../server/utils/annex/comparisonRows'

export interface LostLine {
  page: number
  side: 'L' | 'R'
  text: string
}

export interface LineAccount {
  /** Column lines of the parts read together that reach no row of their column. */
  lost: number
  /** …of those, the ones that differ from the other column's line beside them. */
  differing: LostLine[]
  /** Column lines of parts read on their own (`sameTypesetting`), which reach no row. */
  apart: number
}

const words = (text: string): string[] => text.toLowerCase().replace(/\u00ad/g, '').replace(/(\w)-\s+(\w)/g, '$1$2').match(/[a-zäöüß0-9]+/g) ?? []
const pairs = (t: readonly string[]): Set<string> => new Set(t.slice(1).map((w, i) => `${t[i]} ${w}`))

export function lineAccounting(parts: readonly (readonly AnnexPage[])[], rows: readonly ComparisonRow[]): LineAccount {
  const column = (pick: (r: ComparisonRow) => string) => pairs(words(rows.map((r) => `${pick(r)} ${r.heading ?? ''}`).join(' ')))
  const left = column((r) => r.current)
  const right = column((r) => r.proposed)
  const first = parts[0]
  const out: LineAccount = { lost: 0, differing: [], apart: 0 }
  if (!first) return out
  const together = parts.filter((p) => sameTypesetting(first, p))
  const boundary = columnBoundary(together.flat())
  let pageNo = 0
  for (const part of parts) {
    const joined = together.includes(part)
    for (const page of part) {
      pageNo++
      for (const line of linesFromPage(page, joined ? boundary : undefined)) {
        // A part read on its own need not be two columns at all: its whole
        // line, against either column.
        if (!joined) {
          const inner = pairs(words([line.left, line.right, line.spanning ?? ''].join(' ')).slice(1, -1))
          if (inner.size >= 2 && [...inner].filter((p) => left.has(p) || right.has(p)).length / inner.size < 0.5) out.apart++
          continue
        }
        for (const [side, text, own, other] of [['L', line.left, left, line.right], ['R', line.right, right, line.left]] as const) {
          const inner = pairs(words(text).slice(1, -1))
          if (inner.size < 2) continue
          if ([...inner].filter((p) => own.has(p)).length / inner.size >= 0.5) continue
          out.lost++
          if (text !== other) out.differing.push({ page: pageNo, side, text })
        }
      }
    }
  }
  return out
}
