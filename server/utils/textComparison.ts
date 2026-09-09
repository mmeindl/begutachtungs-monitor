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
const CELL_RE = /<td\b([^>]*)>([\s\S]*?)<\/td\s*>/g
const GLD_RE = /<(?:gldsym|symbol)\b[^>]*>([\s\S]*?)<\/(?:gldsym|symbol)>/
const COLSPAN_RE = /colspan="(\d+)"/i
const MARK_RE = /background\s*:\s*yellow/i
/** The three-dots convention: "2. bis 26b. …" or a bare "…". */
export const ELIDED_RE = /(?:\.\.\.|…)\s*$/

export const HEADER_CURRENT = 'geltende fassung'
export const HEADER_PROPOSED = 'vorgeschlagene fassung'

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

/**
 * Elements of one kind at the outermost nesting level, as their inner HTML.
 *
 * A non-greedy `<tr>…</tr>` regex stops at the *first* closing tag, so a row
 * containing a nested table was cut off at the inner table's first row and the
 * inner rows were then read as siblings of the outer one. 17 of the 65
 * readable annexes nest tables — 70 tables over 584 rows — and each of them
 * lost around 140 rows that way (measured 2026-09-09).
 */
function outermost(html: string, tag: string): { attrs: string; inner: string }[] {
  const re = new RegExp(`<(/?)${tag}\\b([^>]*)>`, 'gi')
  const out: { attrs: string; inner: string }[] = []
  let depth = 0
  let start = -1
  let attrs = ''
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const closing = m[1] === '/'
    const selfClosing = /\/\s*$/.test(m[2] ?? '')
    if (!closing && selfClosing) continue
    if (closing) {
      depth--
      if (depth === 0 && start >= 0) {
        out.push({ attrs, inner: html.slice(start, m.index) })
        start = -1
      }
      if (depth < 0) depth = 0
      continue
    }
    if (depth === 0) {
      start = m.index + m[0].length
      attrs = m[2] ?? ''
    }
    depth++
  }
  return out
}

/**
 * A cell's own content, with any table it contains lifted out.
 *
 * The nested rows are content in their own right — they carry provisions, not
 * decoration — so they are flattened into the row sequence at the position
 * where they stood, and the cell keeps only the text that is genuinely its own.
 */
function liftTables(cellInner: string): { text: string; tables: string[] } {
  const tables = outermost(cellInner, 'table')
  if (tables.length === 0) return { text: cellInner, tables: [] }
  let text = cellInner
  for (const t of tables) text = text.replace(t.inner, ' ')
  return { text: text.replace(/<\/?table\b[^>]*>/gi, ' '), tables: tables.map((t) => t.inner) }
}

/** Every row of the document in printed order, nested tables flattened in place. */
function rowsInOrder(html: string): { attrs: string; inner: string }[] {
  const out: { attrs: string; inner: string }[] = []
  for (const row of outermost(html, 'tr')) {
    const cells = outermost(row.inner, 'td')
    const nested = cells.flatMap((c) => liftTables(c.inner).tables)
    // The wrapper row itself may hold nothing but the inner table; it then
    // contributes no text and falls out of the parse on its own.
    out.push(row)
    for (const table of nested) out.push(...rowsInOrder(table))
  }
  return out
}

/**
 * Which columns a row's cells occupy, from the mandated header pair.
 *
 * The shipped rule was "the first cell spans more than one column, so this is
 * an Artikel heading". That is only true when each column is one cell wide.
 * Where the annex spans its *columns* — the header reads `colspan="2"` twice —
 * every ordinary pair row looked like a heading: 95/ME turned 157 of its 163
 * rows into headings and rendered a single-law Novelle as 161 groups with six
 * comparisons, and 221 pair rows were swallowed across 7 annexes (2026-09-09).
 */
function columnSpans(rows: readonly { inner: string }[]): { left: number; right: number } {
  for (const row of rows) {
    const cells = [...row.inner.matchAll(CELL_RE)]
    if (cells.length < 2) continue
    const first = cellText(liftTables(cells[0]![2]!).text).toLowerCase()
    const second = cellText(liftTables(cells[1]![2]!).text).toLowerCase()
    if (first === HEADER_CURRENT && second === HEADER_PROPOSED) {
      return { left: Number(COLSPAN_RE.exec(cells[0]![1]!)?.[1] ?? 1), right: Number(COLSPAN_RE.exec(cells[1]![1]!)?.[1] ?? 1) }
    }
  }
  return { left: 1, right: 1 }
}

/** One Textgegenüberstellung XML → its rows, in printed order. */
export function parseTextComparison(xml: string): ComparisonRow[] {
  let body = xml
  for (const re of STRIP) body = body.replace(re, '')

  const rows: ComparisonRow[] = []
  const source = rowsInOrder(body)
  const span = columnSpans(source)

  for (const row of source) {
    const cells = outermost(row.inner, 'td').map((c) => {
      const lifted = liftTables(c.inner)
      return { attrs: c.attrs, html: lifted.text, span: Number(COLSPAN_RE.exec(c.attrs)?.[1] ?? 1) }
    })
    if (cells.length === 0) continue

    // A heading occupies the whole width. Anything narrower is a pair row,
    // however many columns each of its cells happens to span.
    const firstFilled = cells.find((c) => cellText(c.html) !== '') ?? cells[0]!
    if (cells.length === 1 || firstFilled.span >= span.left + span.right) {
      const heading = cellText(firstFilled.html)
      if (heading) rows.push({ kind: 'article', heading, gld: null, current: '', proposed: '', change: 'unchanged', marked: false, elided: false, segments: null, editorial: false })
      continue
    }

    // Cells are assigned to a column by where they start, not by their index:
    // the current side can be several cells wide.
    let at = 0
    const leftHtml: string[] = []
    const rightHtml: string[] = []
    for (const cell of cells) {
      ;(at < span.left ? leftHtml : rightHtml).push(cell.html)
      at += cell.span
    }
    const currentHtml = leftHtml.join(' ')
    const proposedHtml = rightHtml.join(' ')
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

export function classify(current: string, proposed: string): ComparisonChange {
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
