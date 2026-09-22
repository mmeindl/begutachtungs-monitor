/**
 * The nested-HTML-table reader: elements at the outermost nesting level, and
 * which of a row's cells belong to which column.
 *
 * PURE MODULE — relative imports only, so vitest runs it directly. Knows
 * nothing about law text; `annex/comparisonRows.ts` decides what a row means.
 */
import { cellText, HEADER_CURRENT_RE, HEADER_PROPOSED_RE } from './tableCells'

export const COLSPAN_RE = /colspan="(\d+)"/i

/**
 * Elements of one kind at the outermost nesting level, as their inner HTML.
 *
 * A non-greedy `<tr>…</tr>` regex stops at the *first* closing tag, so a row
 * containing a nested table was cut off at the inner table's first row and the
 * inner rows were then read as siblings of the outer one. 17 of the 65
 * readable annexes nest tables — 70 tables over 584 rows — and each of them
 * lost around 140 rows that way (measured 2026-09-09).
 */
interface Element {
  attrs: string
  inner: string
  /** Where the inner HTML starts — the document order the rest of the parse sorts on. */
  at: number
  /** Where the opening tag starts and the closing tag ends, for cutting the element out. */
  open: number
  close: number
}

/**
 * One `RegExp` per tag instead of one per call. `outermost` runs three or more
 * times per row of an annex, and the tags it is ever asked for are `tr`, `td`
 * and `table`. `lastIndex` is reset before every use, because a shared global
 * regex carries it from one call into the next.
 */
const TAG_RE = new Map<string, RegExp>()

function tagRe(tag: string): RegExp {
  let re = TAG_RE.get(tag)
  if (!re) {
    re = new RegExp(`<(/?)${tag}\\b([^>]*)>`, 'gi')
    TAG_RE.set(tag, re)
  }
  re.lastIndex = 0
  return re
}

export function outermost(html: string, tag: string): Element[] {
  const re = tagRe(tag)
  const out: Element[] = []
  let depth = 0
  let start = -1
  let open = -1
  let attrs = ''
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const closing = m[1] === '/'
    const selfClosing = /\/\s*$/.test(m[2] ?? '')
    if (!closing && selfClosing) continue
    if (closing) {
      depth--
      if (depth === 0 && start >= 0) {
        out.push({ attrs, inner: html.slice(start, m.index), at: start, open, close: m.index + m[0].length })
        start = -1
      }
      if (depth < 0) depth = 0
      continue
    }
    if (depth === 0) {
      start = m.index + m[0].length
      open = m.index
      attrs = m[2] ?? ''
    }
    depth++
  }
  return out
}

/** Does this table open with the mandated header pair? Then it *is* a comparison. */
function isComparisonTable(inner: string): boolean {
  const first = outermost(inner, 'tr')[0]
  if (!first) return false
  const cells = outermost(first.inner, 'td')
  if (cells.length < 2) return false
  return HEADER_CURRENT_RE.test(cellText(cells[0]!.inner)) && HEADER_PROPOSED_RE.test(cellText(cells[1]!.inner))
}

/** A comparison has two columns. A wider table is one the law itself contains. */
function widerThanAComparison(inner: string): boolean {
  return outermost(inner, 'tr').some((r) => outermost(r.inner, 'td').length > 2)
}

/**
 * A table the *law* contains, rendered as text: cells joined by " | ", rows by
 * a space. Empty cells and empty rows drop out, or the spacer tables some
 * annexes use for vertical rhythm would print "| | |" into the provision.
 *
 * Kept as HTML fragments with literal separators between them rather than as
 * finished text, so `cellText` still decodes each entity exactly once.
 */
function flattenTable(inner: string): string {
  return outermost(inner, 'tr')
    .map((row) =>
      outermost(row.inner, 'td')
        .map((cell) => flattenCell(cell.inner))
        .filter((html) => cellText(html) !== '')
        .join(' | '),
    )
    .filter((row) => row !== '')
    .join(' ')
}

function flattenCell(cellInner: string): string {
  return liftTables(cellInner, false).text
}

/**
 * For each cell of a row: does every *other* cell hold no text? Then this one
 * covers the whole width, and a table inside it is the layout case above.
 *
 * `cellText` on the raw HTML is enough — it strips every tag, so a cell whose
 * only content is a nested table reads as that table's text, which is exactly
 * the question. Flattening first would give the same answer for twice the work.
 */
export function coversTheWidth(cells: readonly Element[]): boolean[] {
  const filled = cells.map((c) => cellText(c.inner) !== '')
  return cells.map((_, i) => filled.every((f, j) => j === i || !f))
}

/**
 * A cell's own content, with any table it contains either lifted out into the
 * row sequence or flattened into the cell's text.
 *
 * Some annexes wrap the whole comparison in an outer table for page layout:
 * one row, one full-width cell, the comparison inside it. Those inner rows are
 * the comparison — 53 rows in one annex, 90 in another — and reading only the
 * outer table lost every one of them, so they are lifted into the sequence at
 * the position where they stood.
 *
 * **But most nested tables are not that.** Where the wrapper row's *other*
 * cell carries text of its own, the row is already a comparison row and the
 * table sits inside one of its two columns: it is a table of the law's own,
 * and its columns are not "geltend" and "vorgeschlagen". Lifting those
 * fabricated changes — the Finanzausgleichsgesetz § 11 reported
 * "Grunderwerbsteuer" turning into "5,702 0,556 93,742", the
 * Fruchtsaftverordnung produced 158 changed rows out of a "Fruchtnektar aus |
 * Mindestgehalt" table, and the Universitätsfinanzierungsverordnung 672 rows
 * out of an ISCED code list (2026-09-10).
 *
 * So `alone` is the test, and it is the same structural question the parse
 * asks of every row: does this cell cover the whole width, or one column? A
 * wrapper cell whose siblings are empty covers the width — the ABGB annex
 * writes exactly that, `<td colspan="2">` with the comparison inside and an
 * empty cell beside it, and a rule keyed on "one cell in the row" lost the
 * new § 1159 Abs. 6 from it. A nested table that prints the header pair
 * itself is a comparison whatever wraps it; one wider than two columns is
 * content whatever wraps it, because a comparison has two columns.
 *
 * **The width test alone is not enough for the header-less half** (measured
 * 2026-09-10 over the 2.000 most recent RIS-Begut records, 403 of them with a
 * readable XML annex). That branch fires on 73 nested tables, and it has to:
 * 6 of them carry §§ of their own — the ABGB's § 1159 among them — and others
 * hold an Artikel line or an Abschnitt that divides the comparison. But 18
 * are two-column tables *of the law*, sitting alone in a cell, and their two
 * columns were read as "geltend" against "vorgeschlagen": "Attribut | Wert"
 * from the Bildungsdokumentation, "Gattung oder Art | Schadorganismen" from
 * the Pflanzgutverordnung, "Module | ECTS-Anrechnungspunkte" from the
 * Hochschul-Curriculaverordnung — whose annex consists of nothing else, so
 * all 19 of its rows were invented changes and it now reports itself
 * unreadable instead.
 *
 * `isTableContent` refuses those, and it asks RIS's own markup rather than
 * guessing at the shape: `<absatz typ="tabtext…">` is how RIS types the text
 * of a table cell, and it is never how it types a provision. Every one of the
 * 18 is caught and none of the 6 comparisons is, so the discriminator has no
 * overlap with the real comparisons in the corpus; 128 rows shown as
 * "geändert" go away with them (9.819 → 9.691 over that window, 3.057 →
 * 3.037 over the 400 most recent records).
 */
export function liftTables(cellInner: string, alone: boolean): { text: string; tables: string[] } {
  const tables = outermost(cellInner, 'table')
  if (tables.length === 0) return { text: cellInner, tables: [] }
  const lifted: string[] = []
  const kept: string[] = []
  let at = 0
  for (const table of tables) {
    kept.push(cellInner.slice(at, table.open))
    const lift = isComparisonTable(table.inner) || (alone && !widerThanAComparison(table.inner) && !isTableContent(table.inner))
    if (lift) lifted.push(table.inner)
    else kept.push(flattenTable(table.inner))
    at = table.close
  }
  kept.push(cellInner.slice(at))
  return { text: kept.join(' '), tables: lifted }
}

/** RIS's own type for the text of a table cell; a provision never carries it. */
const TABTEXT_RE = /<absatz\b[^>]*\btyp="tabtext/i
/** What a provision carries instead: a designation, a heading, or a typed Absatz. */
const PROVISION_MARKUP_RE = /<gldsym\b|<ueberschrift\b|<absatz\b[^>]*\btyp="(?!tabtext)/i

/**
 * Is this table content of the law rather than a comparison?
 *
 * Only asked of a table that does *not* print the mandated header pair, so
 * the question is genuinely open: without the header, nothing but the markup
 * says whether the two columns are the law's own or the annex's. Every
 * non-empty cell has to be typed as table text and none of them as a
 * provision — one Absatz, one heading or one Gliederungssymbol anywhere in it
 * is enough to leave the table alone, because the cost of refusing a real
 * comparison (its §§ vanish from the page) is worse than the cost of
 * flattening a data table (its cells read as "Zelle | Zelle" in both columns,
 * where the word diff still compares them).
 */
function isTableContent(inner: string): boolean {
  let cells = 0
  for (const row of outermost(inner, 'tr')) {
    for (const cell of outermost(row.inner, 'td')) {
      if (cellText(cell.inner) === '') continue
      if (PROVISION_MARKUP_RE.test(cell.inner) || !TABTEXT_RE.test(cell.inner)) return false
      cells++
    }
  }
  return cells > 0
}

/**
 * Every row of the document in printed order, nested tables flattened in place.
 *
 * `at` is the position of the *outermost* row a nested one sits in, so that
 * document-level headings can be merged into the sequence without disturbing
 * the order of rows that came out of one table together.
 */
function rowsInOrder(html: string, at?: number): Element[] {
  const out: Element[] = []
  for (const row of outermost(html, 'tr')) {
    const pos = at ?? row.at
    const cells = outermost(row.inner, 'td')
    const wide = coversTheWidth(cells)
    const nested = cells.flatMap((c, i) => liftTables(c.inner, wide[i]!).tables)
    // The wrapper row itself may hold nothing but the inner table; it then
    // contributes no text and falls out of the parse on its own.
    out.push({ ...row, at: pos })
    for (const table of nested) out.push(...rowsInOrder(table, pos))
  }
  return out
}

/** The annex's own title, printed once over the whole document. Chrome. */
const ANNEX_TITLE_RE = /^textgeg(?:en)?b?ü?berstellung$/i

/**
 * Headings and rows in printed order, including headings that stand outside
 * every table.
 *
 * A `<ueberschrift>` at document level divides the annex exactly as one inside
 * a table does — two annexes print *both* their Artikel that way, and reading
 * only table rows lost both boundaries (2026-09-09).
 */
export type ComparisonItem = { kind: 'heading'; text: string; at: number; html: string } | { kind: 'row'; inner: string; at: number }

export function itemsInOrder(body: string): ComparisonItem[] {
  const tables = outermost(body, 'table').map((t) => [t.at, t.at + t.inner.length] as const)
  const inTable = (at: number): boolean => tables.some(([from, to]) => at >= from && at < to)
  const headings: ComparisonItem[] = [...body.matchAll(/<ueberschrift\b[^>]*>([\s\S]*?)<\/ueberschrift\s*>/g)]
    .filter((m) => !inTable(m.index))
    // The opening tag is kept: `typ="anlage"` is how RIS says that a schedule
    // starts, and the § sequence ends there (`opensAnlage`).
    .map((m) => ({ kind: 'heading' as const, text: cellText(m[1]!), at: m.index, html: m[0] }))
    .filter((h) => h.text !== '' && !ANNEX_TITLE_RE.test(h.text.replace(/\s+/g, '')))
  const rows: ComparisonItem[] = rowsInOrder(body).map((r) => ({ kind: 'row' as const, inner: r.inner, at: r.at }))
  // A stable sort keeps the rows of one table in their own order while the
  // document-level headings fall into place between the tables.
  return [...headings, ...rows].sort((a, b) => a.at - b.at)
}

/**
 * Which columns a row's cells occupy, from the mandated header pair — or null
 * when the document is not a two-column comparison at all.
 *
 * The shipped rule was "the first cell spans more than one column, so this is
 * an Artikel heading". That is only true when each column is one cell wide.
 * Where the annex spans its *columns* — the header reads `colspan="2"` twice —
 * every ordinary pair row looked like a heading: 95/ME turned 157 of its 163
 * rows into headings and rendered a single-law Novelle as 161 groups with six
 * comparisons, and 221 pair rows were swallowed across 7 annexes (2026-09-09).
 */
export function columnSpans(rows: readonly { inner: string }[]): { left: number; right: number } | null {
  const spanOf = (cell: Element): number => Number(COLSPAN_RE.exec(cell.attrs)?.[1] ?? 1)
  /** How often each row shape occurs, for the annexes that print no header. */
  const shapes = new Map<string, number>()
  for (const row of rows) {
    const cells = outermost(row.inner, 'td')
    if (cells.length < 2) continue
    const first = cellText(liftTables(cells[0]!.inner, false).text)
    const second = cellText(liftTables(cells[1]!.inner, false).text)
    if (HEADER_CURRENT_RE.test(first) && HEADER_PROPOSED_RE.test(second)) {
      return { left: spanOf(cells[0]!), right: spanOf(cells[1]!) }
    }
    const shape = cells.map(spanOf).join('+')
    shapes.set(shape, (shapes.get(shape) ?? 0) + 1)
  }
  // No header pair — 1 of the 126 readable GP-XXVIII annexes, and it *is* a
  // two-column comparison, it just omits the mandated heading (2026-09-10).
  // The shipped fallback assumed {1, 1} for it and happened to be right; that
  // is not a reason to keep assuming. The rows themselves say how wide the
  // columns are, and a document whose rows are not two cells wide is not a
  // comparison at all — pairing its cells would invent a Gegenüberstellung
  // out of an ordinary table, so it yields nothing instead.
  const dominant = [...shapes].sort((a, b) => b[1] - a[1])[0]
  const spans = dominant?.[0].split('+').map(Number) ?? []
  if (spans.length !== 2) return null
  return { left: spans[0]!, right: spans[1]! }
}

/**
 * A row's cells, split into the current and the proposed column.
 *
 * Cells are assigned by where they *start*, not by their index: the current
 * side can be several cells wide.
 *
 * **A row need not use the header's split.** The Verbraucherkreditrechts-
 * Änderungsgesetz heads its table `colspan="5"` against `colspan="1"` and then
 * typesets its Anhang `4` against `3`: the second cell starts at 4, which is
 * still inside the header's left column, so both cells landed under "Geltende
 * Fassung" and the proposed column came out empty. Eleven rows of that annex
 * read "Anhang Anhang" and were reported as **entfällt** — text the annex
 * prints unchanged in both columns, shown as deleted, and none of them carries
 * a § designation, so the RIS check never sees them (2026-09-10).
 *
 * A pair row has two sides by definition, so a split that leaves one empty is
 * wrong whatever the header said; the row's own widths are then the better
 * evidence, and the split that balances them best is taken. Measured over GP
 * XXVIII this fires on those 11 rows and nothing else — where the header's
 * split works, it is kept.
 */
export function columnsOf(cells: readonly { html: string; span: number }[], span: { left: number; right: number }): { currentHtml: string; proposedHtml: string } {
  const sides: string[][] = [[], []]
  let at = 0
  for (const cell of cells) {
    sides[at < span.left ? 0 : 1]!.push(cell.html)
    at += cell.span
  }
  if (sides[1]!.length === 0 && cells.length >= 2) {
    const total = cells.reduce((sum, c) => sum + c.span, 0)
    let cut = 1
    let closest = Number.POSITIVE_INFINITY
    let left = 0
    for (let k = 1; k < cells.length; k++) {
      left += cells[k - 1]!.span
      const gap = Math.abs(left - (total - left))
      if (gap < closest) {
        closest = gap
        cut = k
      }
    }
    sides[0] = cells.slice(0, cut).map((c) => c.html)
    sides[1] = cells.slice(cut).map((c) => c.html)
  }
  return { currentHtml: sides[0]!.join(' '), proposedHtml: sides[1]!.join(' ') }
}
