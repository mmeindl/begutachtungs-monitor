/**
 * The ministry's own Textgegenüberstellung (docs/api-exploration.md §2c).
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * A Ministerialentwurf routinely carries an annex that already does what the
 * amendment engine tries to compute: the standing law and the proposed law
 * side by side, written and marked by the ressort itself. It is regulated by
 * a BKA Rundschreiben of 27.03.2002 — two columns headed "Geltende Fassung"
 * and "Vorgeschlagene Fassung", unchanged stretches abbreviated as a
 * designation plus three dots.
 *
 * Where it exists, it is a better source than anything derived: official,
 * paragraph-paired, and incapable of inventing law text. RIS publishes it as
 * XML; Parliament only as PDF, so this reads RIS.
 *
 * Roughly 39 % of drafts have a readable one — of the 60 % that carry the
 * annex at all, 40 % are scanned images with no text (measured over the 200
 * drafts of the last twelve months, 2026-09-08). `parseTextComparison`
 * returns an empty list for those, which the caller must treat as "not
 * available", never as "nothing changed".
 */
import { diffTokens, isEditorialChange } from './lawDiff'
import { normalizeText } from './lawText'
import { decodeEntities } from './mappers'
import type { LawDiffSegment } from '../../shared/types'

/** How one row of the comparison differs. */
export type ComparisonChange = 'unchanged' | 'changed' | 'inserted' | 'removed'

export interface ComparisonRow {
  /** An Artikel heading spanning both columns, or a paired row of law text */
  kind: 'article' | 'pair'
  /** Text of an article row */
  heading: string | null
  /** "§ 5." when the row opens a paragraph */
  gld: string | null
  current: string
  proposed: string
  change: ComparisonChange
  /** The ressort's own yellow marking on the proposed side */
  marked: boolean
  /**
   * "2. bis 26b. …" — unchanged text the annex deliberately leaves out, per
   * the Rundschreiben. Not a gap in the parse, and not something to diff.
   */
  elided: boolean
  /** Word-level diff for a changed row; null when unchanged, one-sided or too long */
  segments: LawDiffSegment[] | null
  /**
   * Changed, but only in citations, numbers, dates or punctuation — the same
   * filter the ME→RV comparison uses, so both sections mean the same thing by
   * "geändert".
   */
  editorial: boolean
}

const STRIP = [/<kzinhalt[\s\S]*?<\/kzinhalt>/g, /<fzinhalt[\s\S]*?<\/fzinhalt>/g, /<layoutdaten[\s\S]*?<\/layoutdaten>/g]
const ROW_RE = /<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/g
const CELL_RE = /<td\b([^>]*)>([\s\S]*?)<\/td\s*>/g
const GLD_RE = /<(?:gldsym|symbol)\b[^>]*>([\s\S]*?)<\/(?:gldsym|symbol)>/
const COLSPAN_RE = /colspan="(\d+)"/i
const MARK_RE = /background\s*:\s*yellow/i
/** The three-dots convention: "2. bis 26b. …" or a bare "…". */
const ELIDED_RE = /(?:\.\.\.|…)\s*$/

const HEADER_CURRENT = 'geltende fassung'
const HEADER_PROPOSED = 'vorgeschlagene fassung'

function cellText(html: string): string {
  return normalizeText(
    decodeEntities(
      html
        .replace(/<nbsp\s*\/>/g, ' ')
        .replace(/<gdash\s*\/>/g, '-')
        .replace(/<br\s*\/?>/gi, ' ')
        // A marker sits flush against its text ("1.Altersprädikat"); the
        // space has to come back or the number fuses into the first word.
        .replace(/<\/(?:gldsym|symbol)>/g, '$& ')
        .replace(/<[^>]*>/g, ' '),
    ),
  )
}

/**
 * Is this document a real table, or a scan? 40 % of the annexes are pages of
 * GIFs wrapped in XML, and telling them apart matters: an empty result must
 * read as "no comparison available", never as "nothing changed".
 */
export function isScanned(xml: string): boolean {
  return !/<tr\b/.test(xml) && /<binary\b/.test(xml)
}

/** One Textgegenüberstellung XML → its rows, in printed order. */
export function parseTextComparison(xml: string): ComparisonRow[] {
  let body = xml
  for (const re of STRIP) body = body.replace(re, '')

  const rows: ComparisonRow[] = []
  for (const rowMatch of body.matchAll(ROW_RE)) {
    const inner = rowMatch[1]!
    const cells = [...inner.matchAll(CELL_RE)]
    if (cells.length === 0) continue

    const first = cells[0]!
    const spans = Number(COLSPAN_RE.exec(first[1]!)?.[1] ?? 1) > 1
    if (spans || cells.length === 1) {
      const heading = cellText(first[2]!)
      if (heading) rows.push({ kind: 'article', heading, gld: null, current: '', proposed: '', change: 'unchanged', marked: false, elided: false, segments: null, editorial: false })
      continue
    }

    const currentHtml = first[2]!
    const proposedHtml = cells[1]![2]!
    const current = cellText(currentHtml)
    const proposed = cellText(proposedHtml)
    // The mandated column headings repeat on every page; they are chrome.
    if (current.toLowerCase() === HEADER_CURRENT && proposed.toLowerCase() === HEADER_PROPOSED) continue
    if (!current && !proposed) continue

    const gldMatch = GLD_RE.exec(currentHtml) ?? GLD_RE.exec(proposedHtml)
    const elided = ELIDED_RE.test(current) && ELIDED_RE.test(proposed)
    const change = classify(current, proposed)
    // The ressort's yellow marking is reliable where present but incomplete:
    // of 8.430 row pairs, 1.395 differ in text without being marked, while
    // only 3 are marked without differing (measured 2026-09-08). So the word
    // diff decides what is shown, and the marking is recorded, not relied on.
    const segments = change === 'changed' && !elided ? diffTokens(current, proposed).segments : null
    rows.push({
      kind: 'pair',
      heading: null,
      gld: gldMatch ? normalizeText(cellText(gldMatch[1]!)) : null,
      current,
      proposed,
      change,
      marked: MARK_RE.test(proposedHtml) || MARK_RE.test(currentHtml),
      elided,
      segments,
      editorial: isEditorialChange(segments),
    })
  }
  return rows
}

function classify(current: string, proposed: string): ComparisonChange {
  if (!current && proposed) return 'inserted'
  if (current && !proposed) return 'removed'
  return current === proposed ? 'unchanged' : 'changed'
}

export interface ComparisonStats {
  total: number
  changed: number
  editorial: number
  inserted: number
  removed: number
  unchanged: number
}

export function summarizeComparison(rows: readonly ComparisonRow[]): ComparisonStats {
  const pairs = rows.filter((r) => r.kind === 'pair')
  const count = (change: ComparisonChange) => pairs.filter((r) => r.change === change).length
  return {
    total: pairs.length,
    changed: count('changed'),
    editorial: pairs.filter((r) => r.editorial).length,
    inserted: count('inserted'),
    removed: count('removed'),
    unchanged: count('unchanged'),
  }
}
