/**
 * Parliament's copy of a Textgegenüberstellung, in the spelling RIS uses.
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * RIS publishes an annex as typed XML: `<ueberschrift typ="para">`, `<absatz
 * typ="tabtext">`, a table of two columns. Parliament publishes the same annex
 * as the ressort's Word file, filtered to HTML: `<p class=45UeberschrPara>`,
 * `<p class=61TabText>`, and a table on Word's own grid. The table reader
 * (`annex/comparisonRows.ts`) had learnt one word of this second language, the
 * Gliederungssymbol, and read the rest as if it were the first:
 *
 *  - a § heading was an ordinary row and went to the § above it (ASVG § 786's
 *    under § 785, XXVII 2048 d.B.);
 *  - a table of the law inside one column was read as a comparison of its
 *    own, and the old amounts of the Flugabgabegesetz § 5 came out as the
 *    proposed text (XXVII 287 d.B.);
 *  - an empty left cell passed for a spacer column and was taken off, and the
 *    new Abs. 48 of a § 55 stood on the left, as text the draft removes
 *    (XXVII 353 d.B.).
 *
 * Translated once, at the door, and not taught to each test: the headings are
 * asked about in five places, and the path they then share with RIS is the
 * one the corpus has measured. A document with none of the template's classes
 * passes through untouched, so nothing here can move a RIS annex.
 */
import { cellText, HEADER_CURRENT_RE, HEADER_PROPOSED_RE } from './tableCells'
import { outermost } from './tableElements'

/** The template's heading classes, by the `typ` RIS gives the same line. */
const HEADING_TYP: Readonly<Record<string, string>> = {
  '11Titel': 'titel',
  '41UeberschrG1': 'g1',
  '42UeberschrG1-': 'g1min',
  '43UeberschrG2': 'g2',
  '44UeberschrArt': 'art',
  '45UeberschrPara': 'para',
  '71Anlagenbez': 'anlage',
}
/** „61TabText", „61aTabTextRechtsb", „61bTabTextZentriert". */
const TABLE_TEXT_RE = /^61[a-z]?TabText/
/** Absatz, Ziffer, Litera, Schlussteil: the template opens every provision class with a 5. */
const PROVISION_RE = /^5\d/
/** A paragraph as `lawtext/parliamentHtml.ts` reads it: to `</p>`, or to where HTML ends it without one. */
const PARAGRAPH_RE = /<p\s+class=["']?([\w-]+)["']?[^>]*>([\s\S]*?)(?:<\/p\s*>|(?=<p[\s>]|<\/t[dh]\s*>))/gi
const WORD_CLASS_RE = /<p\s+class=["']?\d/i
const WIDTH_RE = /\bwidth=["']?(\d+)/i
/**
 * The template's class for a schedule's designation is also the ressorts'
 * way of setting a note in a column: „IKT rückwirkend 5.5.2023", „(wird hier
 * nicht abgebildet)", „zu § 40". Typed as a schedule, the note opened one, and
 * what it says left the § it stands in (ASVG § 736, XXVII 2048 d.B.). It is a
 * schedule only where it says so.
 */
const SCHEDULE_LINE_RE = /^(?:Anlage|Anhang)\b/i

/** Where the proposed column starts on a row's own widths, and how wide the two columns are together. */
interface Seam {
  cut: number
  columns: number
}

type Cell = ReturnType<typeof outermost>[number]

const widthOf = (cell: Cell): number | null => {
  const m = WIDTH_RE.exec(cell.attrs)
  return m ? Number(m[1]) : null
}

/** The seam the mandated header pair states, or null where this row does not print it. */
function headerSeam(cells: readonly Cell[]): Seam | null {
  for (let i = 0; i + 1 < cells.length; i++) {
    if (!HEADER_CURRENT_RE.test(cellText(cells[i]!.inner)) || !HEADER_PROPOSED_RE.test(cellText(cells[i + 1]!.inner))) continue
    const widths = cells.slice(0, i + 2).map(widthOf)
    if (widths.some((w) => w === null)) return null
    const before = (widths as number[]).slice(0, i + 1).reduce((sum, w) => sum + w, 0)
    return { cut: before, columns: widths[i]! + widths[i + 1]! }
  }
  return null
}

/** A cell this much of the two columns wide is one line across them, not one column's. */
const ACROSS = 0.9

/**
 * One row on the seam: a cell belongs to the column its middle stands in.
 *
 * Word's grid is no grid of two columns. The ressort's table has as many grid
 * columns as its rows have different cuts, so one annex sets the same pair of
 * cells `2+1+2` and `1+3+1` (XXVII 285 d.B.) and another `4+5+5+1` and `6+5+4`
 * (XXVIII 592 d.B.), and a cell's start in grid columns says nothing about
 * which side it is on: it can open a few pixels left of the header's cut. Its
 * width in pixels does. Over the 8,998 rows of the 61 cached annexes whose
 * header pair states its widths, no row puts two filled cells on one side.
 *
 * Null leaves the row as it is: it states no widths, or is one cell anyway.
 */
function rowOnSeam(cells: readonly Cell[], seam: Seam): string | null {
  if (cells.length < 2) return null
  const widths = cells.map(widthOf)
  if (widths.some((w) => w === null)) return null
  const filled = cells.map((c) => cellText(c.inner) !== '')
  if (filled.filter(Boolean).length === 1) {
    const only = filled.indexOf(true)
    if (widths[only]! >= ACROSS * seam.columns) return `<td colspan="2">${cells[only]!.inner}</td>`
  }
  const sides: [string[], string[]] = [[], []]
  let at = 0
  for (const [i, cell] of cells.entries()) {
    const width = widths[i]!
    if (filled[i]) sides[at + width / 2 < seam.cut ? 0 : 1].push(cell.inner)
    at += width
  }
  return `<td>${sides[0].join(' ')}</td><td>${sides[1].join(' ')}</td>`
}

/** Every outermost table's rows on the seam its header pair states; a table without one keeps the last table's where it is as wide. */
function tablesOnSeam(html: string): string {
  const out: string[] = []
  let seam: Seam | null = null
  let at = 0
  for (const table of outermost(html, 'table')) {
    const rows = outermost(table.inner, 'tr')
    const own = rows.map((r) => headerSeam(outermost(r.inner, 'td'))).find((s) => s !== null) ?? null
    const widest = Math.max(0, ...rows.map((r) => outermost(r.inner, 'td').reduce((sum, c) => sum + (widthOf(c) ?? 0), 0)))
    if (own) seam = own
    else if (seam && Math.abs(widest - seam.columns) > (1 - ACROSS) * seam.columns) seam = null
    out.push(html.slice(at, table.at))
    let inner = ''
    let rowAt = 0
    for (const row of rows) {
      const rewritten: string | null = seam ? rowOnSeam(outermost(row.inner, 'td'), seam) : null
      inner += table.inner.slice(rowAt, row.at) + (rewritten ?? row.inner)
      rowAt = row.at + row.inner.length
    }
    out.push(inner + table.inner.slice(rowAt))
    at = table.at + table.inner.length
  }
  out.push(html.slice(at))
  return out.join('')
}

/** The annex in RIS's spelling. A document that is no Word template comes back as it went in. */
export function wordTemplateAsRis(html: string): string {
  if (!WORD_CLASS_RE.test(html)) return html
  const typed = html.replace(PARAGRAPH_RE, (all, cls: string, inner: string) => {
    const heading = cls === '71Anlagenbez' && !SCHEDULE_LINE_RE.test(cellText(inner)) ? undefined : HEADING_TYP[cls]
    if (cls === '71Anlagenbez' && !heading) return `<absatz typ="abs">${inner}</absatz>`
    if (heading) return `<ueberschrift typ="${heading}">${inner}</ueberschrift>`
    if (TABLE_TEXT_RE.test(cls)) return `<absatz typ="tabtext">${inner}</absatz>`
    if (PROVISION_RE.test(cls)) return `<absatz typ="abs">${inner}</absatz>`
    return all
  })
  return tablesOnSeam(typed)
}
