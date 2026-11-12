/**
 * Parliament's own Textgegenüberstellung of an Antrag (12.11.2026): the
 * „Textgegenüberstellung (Arbeitsdokument ParlDion)" an Initiativantrag
 * carries as HTML, in Parliament's three-column template — the law in
 * force („Geltende Fassung lt. BKA/RIS"), the Antrag's instructions
 * („Änderungen laut Antrag") and the law as the Antrag would make it
 * („Eingearbeiteter Antrag", insertions and deletions marked as Word
 * revisions: `<span class=msoIns><ins>…`, `<span class=msoDel><del>…`).
 *
 * Read by turning it into the two-column table the ressorts' annexes are
 * (`parseTextComparison`): the first column stays, the instructions go,
 * and the third column loses what it marks as deleted — what is left is
 * the proposed wording. Everything after that is the draft's path: the same
 * parser, the same check of the column in force against RIS
 * (`readAndCheck`), the same refusals.
 *
 * PURE.
 */

const HEADER_RE = /Geltende Fassung lt\. BKA\/RIS/i

/** Whether this HTML is one of Parliament's three-column working annexes. */
export function isParlDionAnnex(html: string): boolean {
  return HEADER_RE.test(html.replace(/\s+/g, ' ')) && /Eingearbeiteter Antrag/i.test(html)
}

/* A cell: `<td …>…</td>`, not nested (the template has no inner tables). */
const CELL_RE = /<td\b[^>]*>[\s\S]*?<\/td>/gi
const ROW_RE = /<tr\b[^>]*>[\s\S]*?<\/tr>/gi

/** What a revision marks as deleted, gone; what it inserts, kept as text. */
function proposedOf(cell: string): string {
  return cell
    .replace(/<span\s+class=["']?msoDel["']?[^>]*>[\s\S]*?<\/span>/gi, '')
    .replace(/<del\b[^>]*>[\s\S]*?<\/del>/gi, '')
    .replace(/<\/?ins\b[^>]*>/gi, '')
}

const textOf = (cell: string) => cell.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&sect;/g, '§').replace(/\s+/g, ' ').trim()

/* Parliament's notes in the column in force, which are no law text. */
const NOTE_RE = /^(?:Hinweis der ParlDion|Link zur tagesaktuellen RIS-Fassung)/

/**
 * The § an instruction („1. In § 34 Abs. 2 wird …", „2. Dem § 56a wird
 * folgender Abs. 5 angefügt:") is about: the §§ it names before the quoted
 * text, if they are exactly one. `undefined` for a line that is no
 * instruction, `null` for one that names none or several — a row under it
 * cannot be placed.
 */
export function instructionParagraph(text: string): string | null | undefined {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!/^\d+[a-z]?\.\s/.test(t)) return undefined
  const head = t.split('„')[0]!
  const paras = new Set([...head.matchAll(/§\s*(\d+[a-z]*)/g)].map((m) => m[1]!))
  return paras.size === 1 ? [...paras][0]! : null
}

/**
 * The working annex as a two-column table — `null` where a row does not have
 * the template's three cells, or an instruction cannot be placed on one §,
 * so a document in another shape is refused rather than misread.
 *
 * The template prints the § only in the instructions column; the two text
 * columns carry the Absätze bare. So each instruction's § is carried into
 * the first text row under it as the Word template's Gliederungssymbol
 * (`991GldSymbol`), which is how the ressorts' annexes print it and what the
 * parser opens a § with. Artikel lines of the instructions column stay, as
 * headings across both columns: they divide a package by law. The header
 * row becomes the mandated headings, which the parser takes for chrome.
 */
export function parlDionTwoColumns(html: string): string | null {
  if (!isParlDionAnnex(html)) return null
  let headerDone = false
  let bad = false
  let pending: string | null = null
  const out = html.replace(ROW_RE, (row) => {
    const cells = row.match(CELL_RE) ?? []
    if (cells.length !== 3) {
      bad = true
      return row
    }
    if (!headerDone && HEADER_RE.test(row.replace(/\s+/g, ' '))) {
      headerDone = true
      return '<tr><td><p>Geltende Fassung</p></td><td><p>Vorgeschlagene Fassung</p></td></tr>'
    }
    const [left, middle, right] = [textOf(cells[0]!), textOf(cells[1]!), textOf(proposedOf(cells[2]!))]
    if (NOTE_RE.test(left)) return ''
    if (!left && !right) {
      // An Artikel line of a package: a heading across both columns.
      if (/^Artikel\s+[\dIVX]+\b/.test(middle) || /^Änderung de[rs]\s/.test(middle)) return `<tr><td colspan=2><p>${middle}</p></td></tr>`
      const para = instructionParagraph(middle)
      if (para === null) bad = true
      if (para) pending = para
      return ''
    }
    const gld = pending ? `<span class=991GldSymbol>§ ${pending}.</span> ` : ''
    pending = null
    const lead = (cell: string) => (gld ? cell.replace(/(<p\b[^>]*>)/i, `$1${gld}`) : cell)
    return `<tr>${left ? lead(cells[0]!) : cells[0]}${right ? lead(proposedOf(cells[2]!)) : proposedOf(cells[2]!)}</tr>`
  })
  return bad || !headerDone ? null : out
}
