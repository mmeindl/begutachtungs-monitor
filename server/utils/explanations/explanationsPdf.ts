/**
 * A Regierungsvorlage's Erläuterungen from Parliament's PDF, as the blocks its
 * HTML gives, so one walk reads both (`parseExplanationBlocks`) and a heading
 * means the same in either (23.11.2026). For the 41 Vorlagen of GP XXVI to
 * XXVIII that Parliament publishes this way only, budget laws above all.
 *
 * PURE but for the one function that opens a PDF (`explanationPagesOf`), so
 * the measuring script runs the page's own reading.
 *
 * A PDF has no paragraphs. It has a place and a font for every run, and in
 * documents set from Parliament's Word template the two are regular: lines
 * 11 points apart, a paragraph 15, a paragraph's last line short of the
 * margin. A block ends where that rhythm says so.
 *
 * WHAT IS NOT READ IS SAID. A table's cells have no order a line can show, so
 * its rows are counted and left out, and the section says that tables are not
 * printed (`dropped`). Parliament's stamps, a ministry's page numbers and
 * running lines are no text. A footnote stands behind the paragraph that
 * points to it, so under that paragraph's §; Parliament's HTML puts them all
 * at the document's end, under its last §. A document the reader cannot
 * vouch for is refused whole (`isWholeReading`): a reasoning shown under the
 * wrong §, or with a page missing, is worse than the gap.
 */
import type { TextBlock } from '../lawtext/lawUnits'
import { fromMacRoman, isMacRomanMisread, uprightRuns } from '../annex/annexPdfPages'
import { withPdf, type PdfDocument } from '../text/pdfDocument'

export interface ExplanationRun {
  x: number
  y: number
  width: number
  text: string
  size: number
  bold: boolean
}

export interface ExplanationPage {
  width: number
  height: number
  runs: ExplanationRun[]
  /** Runs turned against the page: Parliament's margin stamps, or a figure's labels. */
  offTurn: number
}

const BOLD_FONT_RE = /bold|black|heavy|semibold|demi/i

/* eslint-disable @typescript-eslint/no-explicit-any -- pdf.js's text runs and font objects */
export async function explanationPagesOf(bytes: Uint8Array): Promise<ExplanationPage[]> {
  return withPdf(bytes, readPages, { fontExtraProperties: true, verbosity: 0 })
}

async function readPages(doc: PdfDocument): Promise<ExplanationPage[]> {
  const pages: ExplanationPage[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    await page.getOperatorList()
    const viewport = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    const items = (content.items as any[]).filter((i) => typeof i.str === 'string')
    const upright = uprightRuns(
      items.map((i) => ({ transform: i.transform, width: i.width ?? 0, text: i.str })),
      { transform: viewport.transform, width: viewport.width, height: viewport.height },
    )
    const bold = new Map<string, boolean>()
    const isBold = (font: string): boolean => {
      if (!bold.has(font)) {
        let name = ''
        try {
          name = (page.commonObjs as any).get(font)?.name ?? ''
        } catch {
          // A font pdf.js did not load: not known to be bold.
        }
        bold.set(font, BOLD_FONT_RE.test(name))
      }
      return bold.get(font)!
    }
    // The page's own turn, as `uprightRuns` chose it; a run off it is no line of the text.
    const vp = viewport.transform as number[]
    const turnOf = (t: number[]) => Math.round(Math.atan2(vp[1]! * t[0]! + vp[3]! * t[1]!, vp[0]! * t[0]! + vp[2]! * t[1]!) / (Math.PI / 2))
    const turns = new Map<number, number>()
    for (const item of items) if (item.str.trim()) turns.set(turnOf(item.transform), (turns.get(turnOf(item.transform)) ?? 0) + 1)
    const turn = [...turns].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0
    const runs: ExplanationRun[] = []
    let offTurn = 0
    upright.items.forEach((run, k) => {
      if (!run.text.trim()) return
      if (turnOf(items[k].transform) !== turn) {
        offTurn++
        return
      }
      runs.push({ x: run.x, y: run.y, width: run.width, text: run.text, size: run.size ?? 10, bold: isBold(items[k].fontName) })
    })
    pages.push({ width: viewport.width, height: viewport.height, runs, offTurn })
    page.cleanup()
  }
  const asAnnex = pages.map((p) => ({ width: p.width, items: p.runs, geometry: { runs: p.runs.length, offTurn: 0, skewed: 0 } }))
  if (!isMacRomanMisread(asAnnex)) return pages
  return pages.map((p) => ({ ...p, runs: p.runs.map((r) => ({ ...r, text: fromMacRoman(r.text) })) }))
}

/** Parliament's stamps as whole runs: the item, the page count, its address. */
const STAMP_RE = /^(?:\d+ von \d+|\d+ der Beilagen\b.*\bGP\b.*|www\.parlament\.gv\.at)$/
/** How far from a page's edge a stamp stands. */
const STAMP_BAND_PT = 62

interface Line {
  page: number
  y: number
  x0: number
  x1: number
  size: number
  bold: boolean
  text: string
  /** The line's runs, split where a wide gap stands. */
  cells: { x: number; end: number; text: string }[]
  table: boolean
  /** Numbers set raised in the line: the footnotes it points to. */
  marks: string[]
  /** How far down its page may a footer or a header stand: inside the band, a line that repeats is one. */
  inBand: boolean
}

/** Between two runs, a space from this share of the type size on. */
const SPACE_GAP = 0.12
/** A gap this many type sizes wide is a column's, not a justified line's. */
const CELL_GAP = 2
/** How far the text's right margin stands from the page's edge, at most. */
const RIGHT_MARGIN_PT = 95

function linesOfPage(page: ExplanationPage, n: number): Line[] {
  const runs = page.runs.filter((r) => {
    const inBand = r.y < STAMP_BAND_PT || r.y > page.height - STAMP_BAND_PT || r.x < 45 || r.x > page.width - 45
    return !(inBand && STAMP_RE.test(r.text.trim()))
  })
  const sorted = [...runs].sort((a, b) => b.y - a.y || a.x - b.x)
  const groups: ExplanationRun[][] = []
  for (const run of sorted) {
    const group = groups.at(-1)
    // A raised or lowered run (a footnote mark, an index) stays on its line.
    if (group && Math.abs(group[0]!.y - run.y) <= 0.45 * Math.max(group[0]!.size, run.size)) group.push(run)
    else groups.push([run])
  }
  return groups.map((group) => {
    const line = [...group].sort((a, b) => a.x - b.x)
    const size = Math.max(...line.map((r) => r.size))
    // A justified line spreads its words evenly: wide as they may be, its gaps are no columns'.
    const gaps = line.slice(1).map((run, i) => run.x - (line[i]!.x + line[i]!.width)).filter((g) => g > SPACE_GAP * size)
    const even = gaps.length >= 2 && Math.max(...gaps) <= 1.35 * Math.min(...gaps)
    const reachesMargin = Math.max(...line.map((r) => r.x + r.width)) >= page.width - RIGHT_MARGIN_PT
    const spread = even || (gaps.length === 1 && reachesMargin && gaps[0]! < 6 * size)
    const cells: Line['cells'] = []
    const marks: string[] = []
    let text = ''
    let cell = ''
    let cellX = line[0]!.x
    let end = line[0]!.x
    line.forEach((run, i) => {
      const gap = run.x - end
      if (i > 0 && !spread && gap > CELL_GAP * size) {
        cells.push({ x: cellX, end, text: cell.trim() })
        cell = ''
        cellX = run.x
      }
      // A raised run is a word of its own, as the HTML's `<sup>` reads: „StGB 12", „m 2".
      const up = i > 0 && run.size < 0.85 * size && run.y > line[i - 1]!.y + 0.15 * size
      const raised = up && /[\p{L}\d]$/u.test(text)
      if (up && /^\d{1,3}$/.test(run.text.trim())) marks.push(run.text.trim())
      const spaced = i > 0 && (raised || gap > SPACE_GAP * size) && !/\s$/.test(text) && !/^\s/.test(run.text)
      text += (spaced ? ' ' : '') + run.text
      cell += (spaced ? ' ' : '') + run.text
      end = Math.max(end, run.x + run.width)
    })
    cells.push({ x: cellX, end, text: cell.trim() })
    const y = Math.max(...line.filter((r) => r.size === size).map((r) => r.y))
    return {
      page: n,
      y,
      x0: line[0]!.x,
      x1: end,
      size,
      bold: line.every((r) => r.bold || !/[\p{L}\d]/u.test(r.text)),
      text: text.replace(/\s+/g, ' ').trim(),
      cells,
      table: false,
      marks,
      inBand: y < STAMP_BAND_PT || y > page.height - STAMP_BAND_PT,
    }
  })
}

/** A list's label in a line's first cell: „1.", „(2)", „a)", „-". */
const LABEL_RE = /^(?:[-–—•·*]|\(?[\divxlc]{1,5}[.)]|\(?[a-z]{1,2}[.)])$/i

/** How far two cell starts may lie apart and still be one column. */
const COLUMN_TOLERANCE_PT = 3

/**
 * Marks the lines of a table, page by page.
 *
 * A row is a line with a second cell that starts where another row's does:
 * a justified line's wide gap never lines up with another's. A cell of more
 * than one line goes on below its row, with nothing in the columns before
 * it, so a line that starts at a column of the row above belongs to it.
 */
function markTables(lines: Line[]): void {
  const byPage = new Map<number, Line[]>()
  for (const line of lines) byPage.set(line.page, [...(byPage.get(line.page) ?? []), line])
  for (const page of byPage.values()) {
    const starts = (line: Line) => {
      const cells = line.cells.length > 1 && LABEL_RE.test(line.cells[0]!.text) ? line.cells.slice(1) : line.cells
      return cells.length > 1 ? cells.slice(1).map((c) => c.x) : []
    }
    const all = page.flatMap(starts)
    const recurs = (x: number) => all.filter((y) => Math.abs(x - y) < COLUMN_TOLERANCE_PT).length >= 2
    const candidate = (line: Line | undefined) => line !== undefined && starts(line).some(recurs)
    // A row has another within a few lines (a cell may run over several): two coincident gaps far apart in the prose are no table.
    const near = [-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6]
    const isRow = (at: number) => candidate(page[at]) && near.some((d) => candidate(page[at + d]))
    const left = Math.min(...page.map((l) => l.x0))
    let columns: number[] | null = null
    for (const [at, line] of page.entries()) {
      if (isRow(at)) {
        line.table = true
        columns = line.cells.map((c) => c.x)
      } else if (columns && line.x0 > left + 8 && columns.some((x) => Math.abs(x - line.x0) < COLUMN_TOLERANCE_PT)) {
        line.table = true
      } else {
        columns = null
      }
    }
    // The table's head stands above its first row and is set in the same columns.
    for (let i = page.length - 2; i >= 0; i--) {
      if (!page[i]!.table && page[i + 1]!.table && (page[i]!.cells.length > 1 || page[i]!.x0 > left + 8)) page[i]!.table = true
    }
  }
}

/**
 * The step between two lines of a paragraph: the smallest step the document
 * sets often. Not the commonest: in a short document of one-line paragraphs
 * that is the step between paragraphs.
 */
function lineStep(lines: readonly Line[]): number {
  const count = new Map<number, number>()
  let steps = 0
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]!.page !== lines[i - 1]!.page) continue
    const step = Math.round((lines[i - 1]!.y - lines[i]!.y) * 2) / 2
    if (step < 0.9 * lines[i]!.size) continue
    count.set(step, (count.get(step) ?? 0) + 1)
    steps++
  }
  const size = bodySize(lines)
  // Over one and a half lines is a paragraph's step, however often a short document sets it.
  const often = [...count].filter(([step, n]) => n >= 2 && n >= 0.15 * steps && step <= 1.6 * size).map(([step]) => step)
  return often.length ? Math.min(...often) : 1.15 * size
}

/** How much of the text's width a line may leave free and still count as full: ragged text ends a few percent short. */
const FULL_LINE_SLACK = 0.1

/** A heading's address at the start of a line. */
const ADDRESS_START_RE = /^Zu\s+(?:den\s+)?(?:§|Z\s*\d|Art\b|Art\.|Artikel\b|Abs\b|Anlage\b)/i
/** Words a line-end hyphen stands before and keeps, with a space: „Bundes- und Landesrecht". */
const KEEPS_SPACE_RE = /^(?:und|oder|bzw|sowie|bis|als|wie)\b/

/** Closing marks that stand right behind the line before: „(Herstellungs-)Kosten". */
const CLOSING_RE = /^[)\]},.;:!?“”"']/

/** An address broken over a line stays one word. */
const URL_END_RE = /(?:https?:\/\/|www\.)\S*$/i
const URL_GOES_ON_RE = /^[\w%#&=+~/.-]*[/%#&=_-][\w%#&=+~/.-]*(?=[\s).,;]|$)/

/** Every word of the document, lower-cased: whether a word broken at a line's end is one the document also prints whole. */
function vocabularyOf(lines: readonly Line[]): Set<string> {
  const words = new Set<string>()
  for (const line of lines) for (const w of line.text.toLowerCase().split(/[^\p{L}\d-]+/u)) if (w) words.add(w)
  return words
}

/**
 * Whether Word hyphenated this document: the share of its lines that end in
 * a word's hyphen is either under 1 % or over 15 % (60 documents with both
 * formats, 23.11.2026: at most 0.6 % in 55, at least 16.4 % in the other 5).
 */
const HYPHENATED_SHARE = 0.05

function isHyphenated(lines: readonly Line[]): boolean {
  let ends = 0
  for (let i = 0; i + 1 < lines.length; i++) {
    if (/[\p{L}\d]-$/u.test(lines[i]!.text) && /^\p{Ll}/u.test(lines[i + 1]!.text) && !KEEPS_SPACE_RE.test(lines[i + 1]!.text)) ends++
  }
  return ends >= 2 && ends / Math.max(1, lines.length) >= HYPHENATED_SHARE
}

/**
 * The next line's words onto the block's.
 *
 * A hyphen at a line's end is the line's in a document Word hyphenated, and
 * the word's own in any other: „risk-based" read as „riskbased" is a word
 * nobody wrote, and „Vo-raussetzungen" one nobody meant. Either way, the
 * document's own spelling of the word elsewhere decides first.
 */
function joined(text: string, next: string, vocabulary: ReadonlySet<string>, hyphenated: boolean): string {
  if (URL_END_RE.test(text) && URL_GOES_ON_RE.test(next)) return text + next
  if (!text.endsWith('-')) return CLOSING_RE.test(next) && /[)\]]/.test(next[0]!) ? text + next : `${text} ${next}`
  if (CLOSING_RE.test(next)) return text + next
  if (KEEPS_SPACE_RE.test(next)) return `${text} ${next}`
  const head = /([\p{L}\d]+)-$/u.exec(text)?.[1]?.toLowerCase()
  const tail = /^[\p{L}\d]+/u.exec(next)?.[0]?.toLowerCase()
  if (!head || !tail || !/^\p{Ll}/u.test(next)) return text + next
  if (vocabulary.has(`${head}-${tail}`)) return text + next
  return hyphenated || vocabulary.has(head + tail) ? text.slice(0, -1) + next : text + next
}

/** The commonest words of German prose: on a page of real text they are a fifth of the words. */
const COMMON_WORD_RE = /^(?:der|die|das|und|in|zu|den|von|mit|für|auf|des|im|ist|sich|dem|nicht|ein|eine|als|auch|es|an|werden|aus|hat|dass|sie|nach|wird|bei|einer|um|am|sind|noch|wie|einem|über|einen|so|zum|haben|nur|oder|aber|vor|zur|bis|soll|sollen)$/i
/** A page needs this many words before their share says anything. */
const GARBLE_MIN_WORDS = 30
const GARBLE_MAX_SHARE = 0.04

/** Share of common words among a text's words, or null for too short a text. */
function commonShare(text: string): number | null {
  const words = text.split(/\s+/).filter((w) => /\p{L}/u.test(w))
  if (words.length < GARBLE_MIN_WORDS) return null
  return words.filter((w) => COMMON_WORD_RE.test(w.replace(/^\P{L}+|\P{L}+$/gu, ''))).length / words.length
}

/** The type size most of the document's characters are set in. */
function bodySize(lines: readonly Line[]): number {
  const count = new Map<number, number>()
  for (const line of lines) count.set(line.size, (count.get(line.size) ?? 0) + line.text.length)
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 10
}

/** A footnote's opening: its number, then its text. */
const FOOTNOTE_OPENS_RE = /^\(?(\d{1,3})\)?\s*(\S.*)$/

/**
 * Takes the footnotes off the foot of each page: the lines below the text set
 * smaller than it, the first of them opening with a number. Read as text
 * they would stand inside a sentence that runs on to the next page.
 */
function takeFootnotes(lines: Line[], join: (text: string, next: string) => string): { body: Line[]; notes: Map<string, string> } {
  const size = bodySize(lines)
  const notes = new Map<string, string>()
  const foot = new Set<Line>()
  const byPage = new Map<number, Line[]>()
  for (const line of lines) byPage.set(line.page, [...(byPage.get(line.page) ?? []), line])
  for (const page of byPage.values()) {
    let from = page.length
    while (from > 0 && !page[from - 1]!.table && page[from - 1]!.size <= 0.92 * size) from--
    // The first small line must open a note, and text must stand above it.
    while (from < page.length && !FOOTNOTE_OPENS_RE.test(page[from]!.text)) from++
    if (from === 0 || from === page.length) continue
    let number: string | null = null
    for (const line of page.slice(from)) {
      foot.add(line)
      const opens = FOOTNOTE_OPENS_RE.exec(line.text)
      if (opens && (number === null || Number(opens[1]) === Number(number) + 1)) {
        number = opens[1]!
        notes.set(number, opens[2]!)
      } else if (number !== null) {
        notes.set(number, join(notes.get(number)!, line.text))
      }
    }
  }
  return { body: lines.filter((l) => !foot.has(l)), notes }
}

/** A line in a page's margin band that stands on several pages is a running header or footer. */
function withoutRunningLines(lines: Line[]): Line[] {
  const pagesOf = new Map<string, Set<number>>()
  for (const line of lines) if (line.inBand) pagesOf.set(line.text, (pagesOf.get(line.text) ?? new Set()).add(line.page))
  return lines.filter((l) => !(l.inBand && (PAGE_NUMBER_RE.test(l.text) || (pagesOf.get(l.text)?.size ?? 0) >= 2)))
}

/** The ministry's own page number, alone in the margin band: „(2)", „- 2 -", „2". */
const PAGE_NUMBER_RE = /^(?:\(\d{1,3}\)|[-–]\s*\d{1,3}\s*[-–]|\d{1,3})$/

/** A Textgegenüberstellung bound into the same document opens here: its title, or the head of its two columns. */
const ANNEX_OPENS_RE = /^Textgegenüberstellung$|^Geltende Fassung\s+(?:Vorgeschlagene|Neue) Fassung$/i

export interface ExplanationBlocks {
  blocks: TextBlock[]
  /** Lines left out as a table's. */
  tableLines: number
  /** Runs turned against their page. */
  offTurn: number
  /** Footnotes on a page whose text carries no mark for them: not placed at any passage. */
  unplacedNotes: number
  /** Pages whose words are no German: a font without a map to its letters. */
  garbledPages: number
  /** Pages with no text, between the first and the last that has some. */
  textlessPages: number
}

/**
 * Whether what was read can stand for the document. Not where nothing was
 * read, where a page's words are no German (a font without a map to its
 * letters reads „GHU" for „der", 1947 d.B. XXVII), or where a page between
 * others holds no text: a scanned page may be the middle of a §'s reasoning.
 */
export function isWholeReading(read: ExplanationBlocks): boolean {
  return read.blocks.length > 0 && read.garbledPages === 0 && read.textlessPages === 0
}

/** The pages as blocks of text, in reading order, up to a Textgegenüberstellung bound into the same document. */
export function explanationBlocks(pages: readonly ExplanationPage[]): ExplanationBlocks {
  const all = withoutRunningLines(pages.flatMap((p, n) => linesOfPage(p, n)))
  // Before the tables are looked for: the annex's own two columns would hide its title among them.
  const annexAt = all.findIndex((l) => ANNEX_OPENS_RE.test(l.text))
  const read = annexAt < 0 ? all : all.slice(0, annexAt)
  markTables(read)
  const vocabulary = vocabularyOf(read)
  const hyphenated = isHyphenated(read.filter((l) => !l.table))
  const { body: lines, notes } = takeFootnotes(read, (text, next) => joined(text, next, vocabulary, hyphenated))
  const prose = lines.filter((l) => !l.table)
  const step = lineStep(prose)
  const right = Math.max(...prose.map((l) => l.x1), 0)
  const left = Math.min(...prose.map((l) => l.x0), right)
  const blocks: TextBlock[] = []
  const placed = new Set<string>()
  let current: { text: string; bold: boolean; marks: string[] } | null = null
  let before: Line | null = null
  let tableLines = 0
  let afterTable = false
  const close = () => {
    const open = current as { text: string; bold: boolean; marks: string[] } | null
    if (open?.text) {
      blocks.push({ kind: 'other', cls: open.bold ? 'UeberschrPdf' : 'PdfAbs', text: open.text, gld: null })
      // A footnote stands behind the paragraph that points to it, so under that paragraph's §.
      for (const mark of open.marks) {
        const note = notes.get(mark)
        if (note === undefined || placed.has(mark)) continue
        placed.add(mark)
        blocks.push({ kind: 'other', cls: 'PdfFootnote', text: `[${mark}] ${note}`, gld: null })
      }
    }
    current = null
  }
  for (const line of lines) {
    if (line.table) {
      tableLines++
      close()
      before = null
      afterTable = true
      continue
    }
    // A cell's line left behind by a table: „zu Art. 57 § 1 CIM …" is no heading (2. BRBG, 192 d.B. XXVI).
    if (afterTable && /^zu\s/.test(line.text)) {
      tableLines++
      continue
    }
    afterTable = false
    const samePage = before !== null && before.page === line.page
    const gap = samePage ? before!.y - line.y : 0
    const opensAddress = ADDRESS_START_RE.test(line.text)
    const beforeFull = before !== null && before.x1 >= right - FULL_LINE_SLACK * (right - left)
    let opens = current === null || before === null
    if (!opens && samePage) opens = gap > step * 1.22 || gap < 0
    // A line that stops short of the margin ended its paragraph or list item; a heading's two lines stay one.
    if (!opens && samePage && !beforeFull && !(before!.bold && line.bold)) opens = true
    if (!opens && !samePage) opens = !beforeFull || /[.:;!?]$/.test(before!.text)
    if (!opens && before!.bold !== line.bold) opens = true
    if (!opens && opensAddress && !beforeFull) opens = true
    // A heading opens with a capital; „zu Art. 57 …" at a line's start goes on from the line before.
    if (opens && current !== null && /^zu\s/.test(line.text)) opens = false
    if (opens) close()
    if (current === null) current = { text: line.text, bold: line.bold, marks: [...line.marks] }
    else {
      const open: { text: string; bold: boolean; marks: string[] } = current
      open.text = joined(open.text, line.text, vocabulary, hyphenated)
      open.marks.push(...line.marks)
    }
    before = line
  }
  close()
  const textOfPage = pages.map((_, n) => prose.filter((l) => l.page === n).map((l) => l.text).join(' '))
  const garbledPages = textOfPage.filter((t) => {
    const share = commonShare(t)
    return share !== null && share < GARBLE_MAX_SHARE
  }).length
  const has = pages.map((_, n) => read.some((l) => l.page === n))
  const first = has.indexOf(true)
  const textlessPages = first < 0 ? 0 : has.slice(first, has.lastIndexOf(true)).filter((h) => !h).length
  return { blocks, tableLines, offTurn: pages.reduce((n, p) => n + p.offTurn, 0), unplacedNotes: notes.size - placed.size, garbledPages, textlessPages }
}
