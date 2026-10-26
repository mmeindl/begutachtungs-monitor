/**
 * Kärnten's Textgegenüberstellung, read into §§ (`landTguService`, 23.10.2026).
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * THE FORMAT IS NOT THE BUND'S, though its header pair is. Landscape A4,
 * „Geltende Fassung" | „Vorgeschlagene Fassung" — but the right column does
 * not print the law as the draft would have it. It prints THE NOVELLE: its
 * Artikel („Artikel I", „Änderung des Kärntner Landes-Gleichbehandlungs-
 * gesetzes 2022"), its Promulgationsklausel, and its numbered
 * Novellierungsanordnungen („35. Der bisherige Text des § 50 erhält die
 * Absatzbezeichnung …", „2. § 6 Abs. 3 zweiter Satz lautet: …"), each set
 * beside the place of the left column it amends. The left column prints the
 * law in force — the §§ the Novelle touches with their neighbours, often the
 * whole law with its table of contents, under its title and „StF: LGBl …".
 * Measured over the 120 landscape TGÜs of 2021–2026 (3.158 instructions):
 * 8 % replace, insert or delete a whole § (or a whole Abschnitt), 25 % a
 * whole Absatz, 59 % something finer — a word, a sentence, a Ziffer, a
 * citation. The Bund's reader, which pairs the two columns row by row, made
 * of that pairs of an Absatz against an instruction („removed", „§ 50.
 * Organe Seite 27 von 75 35. Der bisherige Text …").
 *
 * So the reader reads the two columns apart. The left one into §§ of each
 * law. The right one into instructions, each with the text it carries
 * (its payload: what follows „lautet:", „eingefügt:", „angefügt:"). Then a §
 * is produced only where the document itself gives its whole new text:
 *
 *  - „§ 16 lautet:", „Nach § 74 wird folgender § 74a eingefügt:", „Der 1.
 *    Abschnitt … lautet:" — the payload prints the § whole (its own „§ 16"
 *    line, heading and Absätze), and that is the new text.
 *  - „§ 53 entfällt.", „Die §§ 4 und 5 entfallen." — the new text is none.
 *  - (`APPLY_ABSATZ`) „§ 12 Abs. 1 lautet:", „Nach § 11 Abs. 2 wird folgender
 *    Abs. 2a eingefügt:", „§ 15 wird folgender Abs. 7 angefügt:", „§ 73
 *    Abs. 3 entfällt." — the payload prints the whole Absatz, and the rest of
 *    the § is the left column's, Absatz by Absatz: the new text is the old
 *    one with whole Absätze exchanged, nothing composed below an Absatz.
 *
 * A § ANY OTHER INSTRUCTION TOUCHES IS LEFT OUT — a word, a sentence, a
 * Ziffer, a citation: performing those is the consolidation engine's work
 * (`kons/lawApply.ts`), with the gate it needs, not a reader's. So is every
 * § of an Artikel whose numbering skips a number (an instruction the reader
 * did not see may touch any §), and every § of a law the Novelle amends
 * „im ganzen Gesetz" or by an instruction that names no §. A withheld § is
 * a gap the page names; a § with a missing change would be shown wrong.
 * The text in force is checked against RIS downstream (`landTguService`), so
 * a misread left column is withheld there; the new text has no such check,
 * which is why it is only ever the document's own words.
 */
import type { AnnexItem, AnnexPage } from '../annex/annexPdf'
import { joinLines, lawName, type TguParagraph, type TguReading } from './landTgu'

/**
 * Whether whole-Absatz instructions are performed on the left column's §
 * (see the head comment). Off, only §§ the document prints whole are read.
 */
export const APPLY_ABSATZ = true

/** One visual line of one column. */
export interface KtnLine {
  side: 'left' | 'right'
  text: string
  /** Where the line's first run starts and its last ends */
  x0: number
  x1: number
  y: number
  page: number
}

const RUNNING_HEAD_RE = /^Seite\s*\d+\s*von\s*\d+$/

/**
 * The gutter between the two columns, for the whole document: the stretch
 * of x between 330 and 470 that the fewest runs cross. The columns are not
 * where one template puts them — the left one ends at 384 in one document
 * and at 417 in the next, and the header pair is missing in some.
 */
export function gutterOf(pages: readonly AnnexPage[]): number {
  const lo = 330
  const hi = 470
  const cover = new Array<number>(hi - lo).fill(0)
  for (const p of pages) {
    for (const it of p.items) {
      if (!it.text.trim()) continue
      const a = Math.max(lo, Math.floor(it.x))
      const b = Math.min(hi, Math.ceil(it.x + it.width))
      for (let x = a; x < b; x++) cover[x - lo]!++
    }
  }
  const min = Math.min(...cover)
  // The longest run at the minimum, and its middle.
  let best: [number, number] = [0, 0]
  for (let i = 0; i < cover.length;) {
    if (cover[i] !== min) { i++; continue }
    let j = i
    while (j < cover.length && cover[j] === min) j++
    if (j - i > best[1] - best[0]) best = [i, j]
    i = j
  }
  return lo + (best[0] + best[1]) / 2
}

/** Runs on one baseline into a line; a gap between two runs is a space. */
function lineOf(items: readonly AnnexItem[]): { text: string; x0: number; x1: number } {
  const sorted = [...items].sort((a, b) => a.x - b.x)
  let text = ''
  let end = -1
  for (const it of sorted) {
    if (end >= 0 && it.x - end > 1 && !/\s$/.test(text) && !/^\s/.test(it.text)) text += ' '
    text += it.text
    end = Math.max(end, it.x + it.width)
  }
  return { text: text.replace(/\s+/g, ' ').trim(), x0: sorted[0]!.x, x1: end }
}

/**
 * Every line of both columns in reading order: page by page, top to bottom,
 * on one height the left column first. The running head („Seite 2 von 75")
 * is left out.
 */
export function ktnLines(pages: readonly AnnexPage[]): KtnLine[] {
  const gutter = gutterOf(pages)
  const out: KtnLine[] = []
  pages.forEach((p, page) => {
    for (const side of ['left', 'right'] as const) {
      const items = p.items.filter((it) => it.text.trim() && (side === 'left' ? it.x < gutter : it.x >= gutter))
      // One baseline: within 2 pt. The two columns set their lines independently.
      const rows: AnnexItem[][] = []
      for (const it of [...items].sort((a, b) => b.y - a.y)) {
        const row = rows.find((r) => Math.abs(r[0]!.y - it.y) < 2)
        if (row) row.push(it)
        else rows.push([it])
      }
      for (const row of rows) {
        const l = lineOf(row)
        if (!l.text || RUNNING_HEAD_RE.test(l.text)) continue
        out.push({ side, text: l.text, x0: l.x0, x1: l.x1, y: row[0]!.y, page })
      }
    }
  })
  return out.sort((a, b) => a.page - b.page || b.y - a.y || (a.side === b.side ? 0 : a.side === 'left' ? -1 : 1))
}

/**
 * The outermost value at least 3 % of the lines share, rounded to the point:
 * a column's margin is where its leftmost lines start, but not the most
 * common start — in a Novelle of Ziffern most lines stand at the Ziffer's
 * indent (104907/2025: 458 against the margin 424).
 */
function outermost(values: readonly number[], side: 'min' | 'max'): number {
  const n = new Map<number, number>()
  for (const v of values) n.set(Math.round(v), (n.get(Math.round(v)) ?? 0) + 1)
  const common = [...n].filter(([, c]) => c >= Math.max(3, values.length * 0.03)).map(([v]) => v)
  if (!common.length) return Math.round(side === 'min' ? Math.min(...values) : Math.max(...values))
  return side === 'min' ? Math.min(...common) : Math.max(...common)
}

/** A column's frame: its left margin (where body lines start) and its right edge (where justified ones end). */
interface Frame { margin: number; edge: number }
export function frameOf(lines: readonly KtnLine[]): Frame {
  return { margin: outermost(lines.map((l) => l.x0), 'min'), edge: outermost(lines.map((l) => l.x1), 'max') }
}
/** A centred line: a § designation, a heading, a division. Body lines start at the margin or an indent of it. */
const centred = (l: KtnLine, f: Frame) => Math.abs((l.x0 + l.x1) / 2 - (f.margin + f.edge) / 2) < 12 && l.x0 - f.margin > 25
/**
 * An Artikel's „Artikel II" and „Änderung der Kärntner Gemeinderats- und
 * Bürgermeisterwahlordnung": centred, but as wide as nearly the whole column
 * at times (1003/2021: 10 pt in from its margin), so only off both edges.
 */
const heading = (l: KtnLine, f: Frame) => Math.abs((l.x0 + l.x1) / 2 - (f.margin + f.edge) / 2) < 12 && l.x0 - f.margin > 5 && f.edge - l.x1 > 5
/** „(2)", „(4a)" at the Absatz indent, 20 pt in from the margin. */
const ABSATZ_RE = /^\((\d+[a-z]*)\)\s/
const absatzStart = (l: KtnLine, f: Frame) => ABSATZ_RE.test(l.text) && l.x0 - f.margin >= 10 && l.x0 - f.margin <= 32

/**
 * A unit's own line: „§ 5" — and in a Landesverfassung „Artikel 19"
 * (26.10.2026), whose articles were read as no unit at all: 1203/2020's 26
 * instructions to the Kärntner Landesverfassung named nothing on the page.
 */
const PARA_LINE_RE = /^(?:§\s*(\d+[a-z]*)|Artikel\s+(\d+[a-z]*))\.?$/
/** The unit's number as this reader keys it: „5", „Art. 19". */
const unitNumber = (m: RegExpExecArray) => (m[1] ? m[1] : `Art. ${m[2]!}`)
/** „1. Abschnitt", „II. Teil", „3. Hauptstück", „Abschnitt 2": a division heading, which closes the § above it. */
const DIVISION_RE = /^(?:(?:\d+[a-z]?|[IVXL]+)\.\s*)?(?:Hauptstück|Abschnitt|Teil|Unterabschnitt)(?:\s+(?:\d+|[IVXL]+))?:?(?:\s|$)/
const CLOSE_RE = /^(?:Inhaltsverzeichnis:?|Anlagen?(?:\s+\d+)?(?:\s+zu\b.*)?|Artikel\s+[IVXL]+\b.*|Art\.\s*\d+.*)$/

/** The levels a law is divided in — nested as its headings come (`printedParagraphs`). */
type Level = 'Teil' | 'Hauptstück' | 'Abschnitt' | 'Unterabschnitt'
/** Where a § stands: the designation of each division it is in, „Abschnitt" → „4". */
type DivisionPath = Partial<Record<Level, string>>
/** A division an instruction names: „Der 1. Abschnitt des II. Teils" → Abschnitt 1 in Teil 2. */
export interface DivisionSpec { level: Level; designation: string; parent?: { level: Level; designation: string } }

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50 }
/** „IV" → „4", „12a" → „12a", „VI a" → „6a": a division's designation, compared as a number. */
function designationOf(raw: string): string | null {
  const m = /^([IVXL]+|\d+)\s?([a-z]?)$/.exec(raw.trim())
  if (!m) return null
  if (/^\d/.test(m[1]!)) return `${m[1]}${m[2]}`
  let n = 0
  for (let i = 0; i < m[1]!.length; i++) {
    const v = ROMAN[m[1]![i]!]!
    const next = ROMAN[m[1]![i + 1]!] ?? 0
    n += v < next ? -v : v
  }
  return `${n}${m[2]}`
}

const LEVEL_RE = String.raw`(Hauptstück|Abschnitt|Teils?|Unterabschnitt)`
const DESIGNATION_RE = String.raw`(\d+[a-z]?|[IVXL]+(?:\s?[a-z](?![a-zäöü]))?)`
/**
 * The first division a text names — „4. Abschnitt", „Abschnitt Ia", „III.
 * Teil" — with the one it stands in where the text says so („des II.
 * Teils"). Null where it names none with a designation.
 */
export function divisionOf(text: string): DivisionSpec | null {
  const before = new RegExp(String.raw`${DESIGNATION_RE}\.\s*${LEVEL_RE}\b`).exec(text)
  const after = new RegExp(String.raw`\b${LEVEL_RE}\s+${DESIGNATION_RE}\b`).exec(text)
  const hit = before && (!after || before.index <= after.index)
    ? { at: before.index + before[0].length, level: before[2]!, designation: before[1]! }
    : after ? { at: after.index + after[0].length, level: after[1]!, designation: after[2]! } : null
  const designation = hit ? designationOf(hit.designation) : null
  if (!hit || !designation) return null
  const level = hit.level.replace(/^Teils$/, 'Teil') as Level
  const up = new RegExp(String.raw`^\s*des\s+${DESIGNATION_RE}\.\s*${LEVEL_RE}\b`).exec(text.slice(hit.at))
  const parentDesignation = up ? designationOf(up[1]!) : null
  return up && parentDesignation ? { level, designation, parent: { level: up[2]!.replace(/^Teils$/, 'Teil') as Level, designation: parentDesignation } } : { level, designation }
}

/** Does a § stand in the division? */
const inDivision = (path: DivisionPath, spec: DivisionSpec) =>
  path[spec.level] === spec.designation && (!spec.parent || path[spec.parent.level] === spec.parent.designation)

/** One § as a column prints it: the heading line(s) under „§ 5", then the body, and the divisions it stands in. */
interface PrintedPara {
  number: string
  heading: string[]
  body: KtnLine[]
  div: DivisionPath
}

/**
 * The §§ a run of lines prints: each opened by a centred „§ 5", its heading
 * the centred lines right under it, its body everything after until the next
 * „§", division, table of contents, Anlage or Artikel. What stands outside
 * any § (titles, the table of contents, a division's name) belongs to none.
 */
function printedParagraphs(lines: readonly KtnLine[], f: Frame): PrintedPara[] {
  const out: PrintedPara[] = []
  let open: PrintedPara | null = null
  // The divisions the next § stands in (26.10.2026): a division the Novelle
  // replaces or repeals as a whole is found by them.
  let path: DivisionPath = {}
  // The levels in the order the law nests them: as its headings come, not
  // as a fixed hierarchy — the Objektivierungsgesetz divides its 4. Abschnitt
  // into a 1., 2. and 3. Teil (48376/2024), and a fixed „Teil above
  // Abschnitt" put §§ 21 to 37 in no Abschnitt at all.
  let order: Level[] = []
  lines.forEach((l, i) => {
    const para = PARA_LINE_RE.exec(l.text)
    if (para && centred(l, f)) {
      open = { number: unitNumber(para), heading: [], body: [], div: { ...path } }
      out.push(open)
      return
    }
    if (centred(l, f) && (DIVISION_RE.test(l.text) || CLOSE_RE.test(l.text))) {
      const d = DIVISION_RE.test(l.text) ? divisionOf(l.text) : null
      if (d) {
        const at = order.indexOf(d.level)
        order = at >= 0 ? order.slice(0, at + 1) : [...order, d.level]
        path = { ...Object.fromEntries(order.filter((k) => k !== d.level && path[k]).map((k) => [k, path[k]!])), [d.level]: d.designation }
      }
      open = null
      return
    }
    if (!open) return
    const p: PrintedPara = open
    // A heading's first line can be nearly as wide as the column — „Auswertung der vor
    // den fliegenden Wahlkommissionen abgegebenen" / „Stimmen" (32262/2025) — and is
    // taken for one only where a centred line of the heading follows it; a short
    // first line of the body („Die nachstehenden Begriffe haben …") is off both
    // edges too, but no centred line follows it.
    const next = lines[i + 1]
    const wide = heading(l, f) && !!next && centred(next, f) && !PARA_LINE_RE.test(next.text) && !ABSATZ_RE.test(next.text)
    if (!p.body.length && (centred(l, f) || wide) && !ABSATZ_RE.test(l.text)) p.heading.push(l.text)
    else p.body.push(l)
  })
  return out
}

/** A § with its body cut into Absätze — null where it has none, or text before the first, or they are out of order. */
function absaetzeOf(body: readonly KtnLine[], f: Frame): { label: string; lines: KtnLine[] }[] | null {
  const out: { label: string; lines: KtnLine[] }[] = []
  for (const l of body) {
    if (absatzStart(l, f)) out.push({ label: ABSATZ_RE.exec(l.text)![1]!, lines: [l] })
    else if (out.length) out.at(-1)!.lines.push(l)
    else return null
  }
  for (let i = 1; i < out.length; i++) if (compareLabel(out[i - 1]!.label, out[i]!.label) >= 0) return null
  return out.length ? out : null
}

/** „4" < „4a" < „4b" < „5" — and „Art. 4" < „Art. 5". */
function compareLabel(a: string, b: string): number {
  const article = /^Art\.\s*/
  if (article.test(a) && article.test(b)) return compareLabel(a.replace(article, ''), b.replace(article, ''))
  const pa = /^(\d+)([a-z]*)$/.exec(a)
  const pb = /^(\d+)([a-z]*)$/.exec(b)
  if (!pa || !pb) return a.localeCompare(b)
  return +pa[1]! - +pb[1]! || pa[2]!.localeCompare(pb[2]!)
}

// ——— The right column: the Novelle ———

/** One Novellierungsanordnung, with the lines it carries after its colon. */
interface Instruction {
  number: number
  head: string
  payload: KtnLine[]
  /**
   * The margin lines it swallowed that read like an instruction out of turn,
   * with the line after each: Kärnten prints one instruction twice when it
   * touches two places („28. Im § 40 … sowie im § 42 …", 1530/2021), and
   * once numbered two „8." (2038/2020). Its text is then not only its own.
   */
  swallowed: string[]
  /** An Artikel's one instruction, printed without a number (26.10.2026). */
  unnumbered?: true
}

/** One law's part of the Novelle: its „Änderung des …" heading and its instructions. */
interface Amendment {
  title: string | null
  /**
   * The law its promulgation sentence names, „Das Kärntner
   * Abgabenorganisationsgesetz, K-AOG, LGBl. Nr. 42/2010, … wird wie folgt
   * geändert:" — in the nominative, and there where the „Änderung des …"
   * heading is missing (26.10.2026).
   */
  named: string | null
  /** „Artikel II", where the Novelle has Artikel. */
  artikel: string | null
  instructions: Instruction[]
  /** The numbering skipped a number: an instruction was not seen. */
  gap: boolean
}

/**
 * „35. Der bisherige Text …" — and „6.§ 27 Abs. 1 lautet:", the space lost
 * (1023/2021), and „4. 8 Abs. 3 Z 2 entfällt.", the § sign lost (2314/2021,
 * 26.10.2026: read as no instruction, its law got a gap).
 */
const INSTRUCTION_RE = /^(\d+)[a-z]?\.\s*(?=[^\d\s]|\d+[a-z]*\s+Abs\.)(\S.*)$/
/**
 * The sentence that opens an Artikel: „Das Kärntner … wird wie folgt
 * geändert:" — or, where the Artikel amends another Novelle's article,
 * „Art. II des Gesetzes LGBl. Nr. 93/2019 wird wie folgt geändert:"
 * (227/2022).
 */
const PROMULGATION_START_RE = /^(?:(?:Das|Die|Der)\s+\S|Art(?:ikel|\.)\s*[IVXL\d]+[a-z]?\s+des\s+Gesetzes\b)/
/**
 * „Änderung des Art. II des Gesetzes LGBl. Nr. 1/2013", „… des Art. II des
 * Gesetzes, mit dem das Kärntner Schulbaufondsgesetz geändert wird",
 * „Änderung des Landesgesetzes LGBl. Nr. 117/2022": an Artikel that amends
 * another Novelle, not a law the left column prints (1037/2021, 227/2022,
 * 842/2022) — and may open with its one instruction (698/2021).
 */
const OF_NOVELLE_RE = /^(?:Art(?:ikels?|\.)\s*[IVXL\d]+[a-z]?\s+des\s+(?:Landes)?[Gg]esetzes\b|(?:Landes)?[Gg]esetzes\s+(?:vom\s+[^,]*?\s+)?LGBl\b)/
/** How an Artikel's one unnumbered instruction begins: „§ 2 lit. b lautet:", „In § 4 Abs. 1 entfällt …". */
const UNNUMBERED_HEAD_RE = /^(?:§|Art\.|In\s|Im\s|Nach\s|Vor\s|Dem\s|Der\s|Die\s|Das\s|Anstelle\s)/

/**
 * The law a promulgation sentence names, without its abbreviation and
 * Fundstelle: „Das Kärntner Abgabenorganisationsgesetz, K-AOG, LGBl. Nr.
 * 42/2010, …" → „Kärntner Abgabenorganisationsgesetz"; „Die Kärntner
 * Bauordnung 1996 – K-BO 1996, LGBl. …" → „Kärntner Bauordnung 1996".
 */
export function promulgatedName(text: string): string | null {
  const m = /(?:^|\s)(?:Das|Die|Der)\s+([^:]+?)(?:,\s+[\p{Lu}][\p{L}\d.-]*)?,\s+LGBl\b/u.exec(text.replace(/\s+/g, ' '))
  return m ? lawName(m[1]!.trim()) || null : null
}
/** What every Novellierungsanordnung says somewhere in its first lines. */
const VERB_RE = /\b(?:lautet|lauten|eingefügt|angefügt|entfällt|entfallen|ersetzt|aufgehoben|erhält|erhalten|geändert|wird|werden|tritt|treten)\b/
const ARTIKEL_RE = /^Artikel\s+[IVXL]+$/
const AMENDS_RE = /^Änderung\s+de[sr]\s+(.+)$/

/**
 * The right column into the laws it amends and their instructions. An
 * instruction starts at the column's margin with its number — the next one
 * of its Artikel, or a few further on (then the Artikel has a gap) — and a
 * verb in its first lines; everything else is the open instruction's: its
 * head up to the line that ends in a colon, its payload after.
 */
export function amendmentsOf(lines: readonly KtnLine[], f: Frame): Amendment[] {
  const out: Amendment[] = []
  let current: Amendment | null = null
  let open: Instruction | null = null
  let headOpen = false
  /** The open Artikel's promulgation sentence, while it runs. */
  let promulgation: string | null = null
  /** It ended and no instruction came yet: an Artikel's one instruction may stand unnumbered. */
  let awaitFirst = false
  // A new Artikel closes every head of the last one (26.10.2026): one left
  // open let „Änderung des Kärntner Familienförderungsgesetzes" pass as text
  // (2314/2021), and the Artikel was read as no law at all.
  const start = (artikel: string | null = null) => {
    current = { title: null, named: null, artikel, instructions: [], gap: false }
    out.push(current)
    open = null
    headOpen = false
    promulgation = null
    awaitFirst = false
  }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!
    if (ARTIKEL_RE.test(l.text) && heading(l, f)) {
      start(l.text)
      continue
    }
    const amends = AMENDS_RE.exec(l.text)
    if (amends && heading(l, f) && !(open as Instruction | null)?.payload.length && !headOpen) {
      // „Änderung der Kärntner Gemeinderats- und Bürgermeisterwahlordnung" / „2002"
      let title = amends[1]!
      while (i + 1 < lines.length && heading(lines[i + 1]!, f) && !ARTIKEL_RE.test(lines[i + 1]!.text) && title.length < 160) title += ` ${lines[++i]!.text}`
      // A heading without an Artikel above it opens a law of its own (one-law drafts print none).
      if (!current || (current as Amendment).title !== null || (current as Amendment).instructions.length) start()
      current!.title = title
      if (OF_NOVELLE_RE.test(title)) awaitFirst = true
      continue
    }
    const m = INSTRUCTION_RE.exec(l.text)
    const a = current as Amendment | null
    // An unnumbered instruction followed by „1." was an introduction, not the Artikel's one.
    if (m && +m[1]! === 1 && a?.instructions.length === 1 && a.instructions[0]!.unnumbered) a.instructions[0]!.number = 0
    const expected = a ? (a.instructions.at(-1)?.number ?? 0) + 1 : 1
    // At the margin, give or take 8 pt — the margin is an estimate (`outermost`), and a
    // Ziffer or Absatz of a payload stands 19 pt or more further in.
    const atMargin = Math.abs(l.x0 - f.margin) <= 8
    if (m && atMargin) {
      const n = +m[1]!
      const firstLines = [m[2]!, ...lines.slice(i + 1, i + 3).map((x) => x.text)].join(' ')
      if (n >= expected && n <= expected + 4 && VERB_RE.test(firstLines)) {
        if (!a) start()
        const cur = current as unknown as Amendment
        if (n !== expected) cur.gap = true
        open = { number: n, head: m[2]!, payload: [], swallowed: [] }
        cur.instructions.push(open)
        headOpen = !/:$/.test(m[2]!)
        promulgation = null
        awaitFirst = false
        continue
      }
      // A margin line with a number out of turn that reads like an instruction:
      // one we cannot place, so the text around it is not the open one's alone.
      // (Kärnten's appendix pages repeat an Artikel's last instruction there.)
      // Its own head only: up to the line that ends it, never into the next instruction.
      let own = m[2]!
      for (let j = i + 1; j < Math.min(lines.length, i + 4) && !/[.:]$/.test(own) && !INSTRUCTION_RE.test(lines[j]!.text); j++) own += ` ${lines[j]!.text}`
      if (open && VERB_RE.test(own) && (/§/.test(own) || /^(?:Im|In|Nach|Vor|Dem|Der|Die|Das|Am|Auf)\s/.test(m[2]!))) (open as Instruction).swallowed.push(own)
    }
    // Before an Artikel's first instruction: its promulgation sentence, which
    // names the law where no „Änderung des …" heading does, and after it an
    // instruction that may stand without a number — Kärnten numbers none
    // where an Artikel has one (26.10.2026; seven of 11829/2023's thirteen
    // Artikel were read as empty, their changes gone from the page).
    if (!open && (!a || !a.instructions.length)) {
      // „Der § 5 lautet:" right after the sentence is an instruction, not another
      // sentence — but „Das Landesgesetz LGBl. Nr. 117/2022 … wird wie folgt
      // geändert:" after a heading is the sentence itself.
      const opening = [l.text, ...lines.slice(i + 1, i + 3).map((x) => x.text)].join(' ')
      if (awaitFirst && atMargin && !m && UNNUMBERED_HEAD_RE.test(l.text) && VERB_RE.test(opening) &&
        !(PROMULGATION_START_RE.test(l.text) && /\bwie\s+folgt\s+geändert:/.test(opening))) {
        const cur = current as unknown as Amendment
        open = { number: 1, head: l.text, payload: [], swallowed: [], unnumbered: true }
        cur.instructions.push(open)
        headOpen = !/:$/.test(l.text)
        awaitFirst = false
        continue
      }
      if (promulgation !== null || PROMULGATION_START_RE.test(l.text)) {
        promulgation = `${promulgation ?? ''} ${l.text}`.trim()
        if (/:$/.test(l.text)) {
          if (/geändert:$/.test(promulgation)) {
            // Taken before `start`, which clears it: a one-law draft opens with the sentence.
            const sentence = promulgation
            if (!a) start()
            const cur = current as unknown as Amendment
            cur.named ??= promulgatedName(sentence)
            awaitFirst = true
          }
          promulgation = null
        }
        continue
      }
    }
    if (!open) continue
    const o = open as Instruction
    if (headOpen) {
      o.head += ` ${l.text}`
      // A head ends in a colon (a payload follows) or where the next instruction begins.
      if (/:$/.test(l.text)) headOpen = false
    } else {
      o.payload.push(l)
    }
  }
  return out
}

/** A „§ 5", „§§ 5 und 6", „§§ 5 bis 7", „§§ 37c, 37d und 37e" in an instruction's head, outside its quotes. */
const QUOTED_RE = /[„"][^“”"]*[“”"]/g
function paragraphRefs(head: string): { list: string[]; ranges: [string, string][] } {
  const t = head.replace(QUOTED_RE, ' ')
  const list: string[] = []
  const ranges: [string, string][] = []
  for (const m of t.matchAll(/§§\s*((?:\d+[a-z]*(?:\s*(?:,|und|bis|sowie)\s*(?:§\s*)?)?)+)/g)) {
    const body = m[1]!
    for (const r of body.matchAll(/(\d+[a-z]*)\s*bis\s*(\d+[a-z]*)/g)) ranges.push([r[1]!, r[2]!])
    list.push(...(body.match(/\d+[a-z]*/g) ?? []))
  }
  // „In den §§ 61 Abs. 1, 62 Abs. 1, 63 Abs. 1 und 65 Abs. 1 wird …" (842/2022): each item a § with its subdivision.
  for (const m of t.matchAll(/§§\s*((?:\d+[a-z]*\s+(?:Abs\.|Z|lit\.)\s*\d+[a-z]*\s*(?:,|und|sowie)?\s*)+)/g)) {
    for (const r of m[1]!.matchAll(/(\d+[a-z]*)\s+(?:Abs\.|Z|lit\.)/g)) list.push(r[1]!)
  }
  for (const m of t.replace(/§§\s*(?:\d+[a-z]*(?:\s*(?:,|und|bis|sowie)\s*(?:§\s*)?)?)+/g, ' ').matchAll(/§\s*(\d+[a-z]*)/g)) list.push(m[1]!)
  // „In 75 Abs. 1a wird …" (1003/2021, the § sign left out): still § 75.
  const bare = /^(?:(?:Im|In)\s+)?(\d+[a-z]*)\s+Abs\./.exec(t)
  if (bare) list.push(bare[1]!)
  return { list: [...new Set(list)], ranges }
}

/**
 * Instructions that change no § text, where they name no §: the table of
 * contents, the title, an Anlage („Die bisherige Anlage 17 erhält die
 * Bezeichnung …", „In Anlage 10 Z 1 lautet …").
 */
const NOT_A_PARAGRAPH_RE = /Inhaltsverzeichnis|\bEintr(?:ag|äge)\b|^(?:Der |Die |Im |In (?:der |dem )?)?(?:Titel|Langtitel|Kurztitel|Abkürzung)\b|\b(?:Anlagen?|Anhang|Beilage)\b/
/**
 * A division's name or heading, where no § is named: „Abschnitt V erhält
 * folgende Bezeichnung:", „Die Überschrift „3. Teil Tagesbetreuung" wird
 * durch …", „Nach dem 5. Abschnitt wird folgende Abschnittsbezeichnung
 * eingefügt:" — but not a division that goes („Der 1. Abschnitt … entfällt").
 */
const DIVISION_NAME_RE = /(?=.*(?:Abschnitt|Teil|Hauptstück))(?=.*(?:[Bb]ezeichnung|[Üü]berschrift))(?!.*\b(?:entfällt|entfallen|aufgehoben)\b)/

/**
 * An instruction that changes no § text: it names no § and is about the
 * contents, the title, an Anlage or a division's name. The division may be
 * named inside the quotes — „Die Überschrift „3. Teil Tagesbetreuung" wird
 * durch …" — so that test reads them; read without, the instruction counted
 * as one reaching every §, and 15193/2025 showed none of its 21 (25.10.2026).
 */
function changesNoParagraph(head: string): boolean {
  const whole = head.replace(/\s+/g, ' ')
  const t = whole.replace(QUOTED_RE, ' ')
  return !/§/.test(t) && !WHOLE_LAW_RE.test(t) && (NOT_A_PARAGRAPH_RE.test(t) || DIVISION_NAME_RE.test(whole))
}

/**
 * An instruction about the table of contents, which names §§ only as its
 * entries: „Im Inhaltsverzeichnis entfällt der Eintrag zu § 93.", „Im
 * Inhaltsverzeichnis wird nach dem Eintrag zu § 55a folgender Eintrag
 * eingefügt:", „Vor § 1 wird folgendes Inhaltsverzeichnis eingefügt:". It
 * changes no § — read as touching one, it named § 93 of 83484/2024 as
 * changed in words, and kept § 95 of 38532/2024 from being shown
 * (25.10.2026; 31 such instructions in the 123 Textgegenüberstellungen).
 * Not where it also addresses a § itself („… und in § 5 Abs. 2 …").
 */
const CONTENTS_RE = /^(?:(?:Im|Das|Dem)\s+Inhaltsverzeichnis\b|Die\s+Einträge\s+im\s+Inhaltsverzeichnis\b|(?:Vor|Nach)\s+(?:dem\s+)?§\s*\d+[a-z]*\s+wird\s+folgendes\s+Inhaltsverzeichnis\s+eingefügt:$)/
function aboutContentsOnly(head: string): boolean {
  const t = head.replace(/\s+/g, ' ').trim()
  const m = CONTENTS_RE.exec(t)
  return !!m && !/\b(?:im|in|dem)\s+§/i.test(t.slice(m[0].length).replace(QUOTED_RE, ' '))
}
/**
 * What reaches every § of the law, or of a division: „im gesamten Gesetz",
 * „in allen Bestimmungen". („jeweils" does only where no § is named: „In
 * § 9 Abs. 1 und 3 wird jeweils …" stays in § 9.)
 */
const WHOLE_LAW_RE = /\b(?:gesamten|ganzen|sämtlichen|allen)\b|\b(?:im|in diesem) Gesetz\b(?!\s+LGBl)/
/** „Der 1. Abschnitt des II. Teils „Tourismusverbände" lautet:", „Der 4. Abschnitt lautet:": a whole division, printed whole. */
const DIVISION_REPLACE_RE = /^(?:Der|Das|Die)\s+(?:\d+[a-z]?\.\s*|[IVXL]+\.\s*)(?:Hauptstück|Abschnitt|Teil|Unterabschnitt)\b[^:]*\b(?:lautet|lauten):$/
/** „Nach dem 12. Abschnitt wird folgender 12a. Abschnitt eingefügt:": new §§, printed whole. */
const DIVISION_INSERT_RE = /^(?:Nach|Vor)\s+(?:dem|der)\s+(?:\d+[a-z]?\.\s*|[IVXL]+\.\s*)(?:Hauptstück|Abschnitt|Teil|Unterabschnitt)\b[^:]*\bfolgende[rns]?\s+(?:\d+[a-z]?\.\s*|[IVXL]+[a-z]?\.\s*)(?:Hauptstück|Abschnitt|Teil|Unterabschnitt)\b[^:]*\b(?:eingefügt|angefügt):$/
/** The headings that say only where the Absätze apply: „§ 12 Abs. 1 lautet:" and its kin. */
const ABS_LIST = String.raw`(?:Abs\.|Absatz|Absätze)\s*(\d+[a-z]*(?:\s*(?:,|und|bis)\s*(?:Abs\.\s*)?\d+[a-z]*)*)`

type Op =
  | { kind: 'paragraphs'; replaces: boolean; payload: KtnLine[]; numbers: string[] | null; division?: DivisionSpec | null; listed?: string[] }
  | { kind: 'delete'; numbers: string[]; ranges: [string, string][] }
  | { kind: 'absReplace'; para: string; labels: string[]; range: boolean; payload: KtnLine[] }
  | { kind: 'absInsert'; para: string; after: string | null; labels: string[]; range: boolean; payload: KtnLine[] }
  | { kind: 'absDelete'; para: string; labels: string[]; range: boolean }
  | { kind: 'divisionDelete'; division: DivisionSpec; listed: string[] }
  | { kind: 'divisionWording'; division: DivisionSpec; quoted: string | null }

/**
 * What an instruction does and names (`readInstruction`). `quoted`: the
 * expression a „jeweils"/„im ganzen Gesetz" instruction looks for; `annex`:
 * the Anlagen and Anhänge it changes (26.10.2026).
 */
export interface InstructionReading {
  op: Op | null
  touches: string[]
  ranges: [string, string][]
  all: boolean
  quoted?: string | null
  annex?: string[]
}

/** „Anlage 10", „Anhang II": what an instruction changes beside §§ (26.10.2026). */
const ANNEX_REF_RE = /\b(Anlage|Anhang|Beilage)\s+((?:\d+|[IVXL]+)[a-z]?)\b/g
const annexRefs = (head: string) => [...new Set([...head.replace(QUOTED_RE, ' ').matchAll(ANNEX_REF_RE)].map((m) => `${m[1]} ${m[2]}`))]
/** The first expression an instruction quotes: what „wird jeweils … ersetzt" looks for. */
const firstQuoted = (head: string) => /[„"]([^“”"]{2,})[“”"]/.exec(head)?.[1] ?? null
/** „Nach § 51 wird folgender …": the § after which something new stands — not one the instruction changes. */
const ANCHOR_RE = /^(?:Nach|Vor)\s+(?:dem\s+)?§\s*(\d+[a-z]*)\s+(?:wird|werden)\s/
/** „Der 1. Abschnitt des Gesetzes („…") entfällt.": a division repealed whole. */
const DIVISION_DELETE_RE = /^(?:Der|Das|Die)\s+(?:\d+[a-z]?\.\s*|[IVXL]+\.\s*)(?:Hauptstück|Abschnitt|Teil|Unterabschnitt)\b[^:]*?\b(?:entfällt|entfallen|wird aufgehoben|werden aufgehoben)\.?$/
/** „Im V. Abschnitt wird jeweils …": words changed throughout one division. */
const DIVISION_WORDING_RE = /^Im\s+(?:\d+[a-z]?\.\s*|[IVXL]+\.\s*)(?:Hauptstück|Abschnitt|Teil|Unterabschnitt)\b.*\bjeweils\b/
/** „Nach § 10b wird folgender Abschnitt Ia eingefügt:", „Nach § 51 wird folgender 3. Abschnitt mit den §§ 51a bis 51d eingefügt:": new §§ after a §. */
const DIVISION_AFTER_RE = /^(?:Nach|Vor)\s+(?:dem\s+)?§\s*\d+[a-z]*\s+(?:wird|werden)\s+folgende[rns]?\s+(?:(?:\d+[a-z]?|[IVXL]+[a-z]?)\.\s*)?(?:Hauptstück|Abschnitt|Teil|Unterabschnitt)\b[^:]*\b(?:eingefügt|angefügt):$/
/** „Die Überschrift des 35 lautet:" — the § sign lost (1530/2021): read as reaching every §, it kept 28 §§ of its law from the page. */
const BARE_HEADING_RE = /^Die Überschrift (?:des|zu)\s+(?:§\s*)?(\d+[a-z]*)\s+lautet:$/

/** „1 und 2", „2 bis 4", „5, 6 und 7" → the labels, and whether it was a range. */
function labelList(s: string): { labels: string[]; range: boolean } {
  return { labels: s.match(/\d+[a-z]*/g) ?? [], range: /\bbis\b/.test(s) }
}

/**
 * What an instruction does, where it is one of the kinds this reader
 * performs; null for every other — whose §§ are then left out. `touches` is
 * every § it names, whatever it does; `all` an instruction that may touch
 * any § of the law.
 */
export function readInstruction(ins: Instruction): InstructionReading {
  const raw = ins.head.replace(/\s+/g, ' ').trim()
  // A Landesverfassung counts in articles (26.10.2026): „Art. 19 Abs. 3a
  // lautet:" is read as a §'s instruction, its numbers handed back as „Art. 19".
  const outside = raw.replace(QUOTED_RE, ' ')
  const articles = /\bArt\.\s*\d/.test(outside) && !/§/.test(outside)
  const r = readHead(articles ? raw.replace(/\bArt\.\s*(?=\d)/g, '§ ') : raw, ins)
  return articles ? asArticles(r) : r
}

function asArticles(r: InstructionReading): InstructionReading {
  const a = (n: string) => `Art. ${n}`
  const op = r.op
  const mapped: Op | null = !op
    ? null
    : op.kind === 'paragraphs'
      ? { ...op, numbers: op.numbers?.map(a) ?? null }
      : op.kind === 'delete'
        ? { ...op, numbers: op.numbers.map(a), ranges: op.ranges.map(([x, y]) => [a(x), a(y)] as [string, string]) }
        : op.kind === 'absReplace' || op.kind === 'absInsert' || op.kind === 'absDelete'
          ? { ...op, para: a(op.para) }
          : op
  return { ...r, op: mapped, touches: r.touches.map(a), ranges: r.ranges.map(([x, y]) => [a(x), a(y)] as [string, string]) }
}

function readHead(h: string, ins: Instruction): InstructionReading {
  let refs = paragraphRefs(h)
  const outside = h.replace(QUOTED_RE, ' ')
  const annex = annexRefs(h)
  const withAnnex = (r: InstructionReading): InstructionReading => (annex.length ? { ...r, annex } : r)
  if (ins.swallowed.length) {
    // Out, and with it every § the swallowed instructions name — or every §, where they name none.
    const more = ins.swallowed.map((t) => paragraphRefs(t.replace(/\s+/g, ' ')))
    return withAnnex({
      op: null,
      touches: [...refs.list, ...more.flatMap((r) => r.list)],
      ranges: [...refs.ranges, ...more.flatMap((r) => r.ranges)],
      all: more.some((r, k) => !r.list.length && !changesNoParagraph(ins.swallowed[k]!)),
    })
  }
  if (aboutContentsOnly(h)) return { op: null, touches: [], ranges: [], all: false }
  // The anchor of an insertion is not changed by it (26.10.2026): „Nach § 51
  // wird folgender 3. Abschnitt … eingefügt" named § 51 as changed (15193/2025).
  const anchor = ANCHOR_RE.exec(h)?.[1]
  if (anchor) {
    const at = refs.list.indexOf(anchor)
    if (at >= 0) refs = { ...refs, list: refs.list.filter((_, k) => k !== at) }
  }
  const none = { op: null, touches: refs.list, ranges: refs.ranges, all: false }
  // The §§ a division's instruction lists as its own: „Das 2. Hauptstück mit den §§ 2, 3 und 4 entfällt." (44393/2023)
  const listed = [...new Set([...refs.list, ...refs.ranges.flatMap(rangeNumbers)])]
  if (DIVISION_REPLACE_RE.test(h)) return { op: { kind: 'paragraphs', replaces: true, payload: ins.payload, numbers: null, division: divisionOf(h), listed }, touches: [], ranges: [], all: false }
  if (DIVISION_INSERT_RE.test(h) || DIVISION_AFTER_RE.test(h)) {
    // The §§ it names it creates („mit den §§ 51a bis 51d"): named where the payload cannot be read.
    return { op: { kind: 'paragraphs', replaces: false, payload: ins.payload, numbers: null }, touches: [...new Set([...refs.list, ...refs.ranges.flatMap(rangeNumbers)])], ranges: [], all: false }
  }
  if (DIVISION_DELETE_RE.test(h)) {
    const division = divisionOf(h)
    if (division) return { op: { kind: 'divisionDelete', division, listed }, touches: [], ranges: [], all: false }
  }
  if (changesNoParagraph(h)) return withAnnex(none)
  // Its anchor gone, what it changes is a heading or the contents: „Nach § 87 wird folgende Überschrift eingefügt:".
  if (anchor && !refs.list.length && /Überschrift|[Bb]ezeichnung|Inhaltsverzeichnis/.test(outside)) return withAnnex({ op: null, touches: [], ranges: [], all: false })
  const bareHeading = BARE_HEADING_RE.exec(h)
  if (bareHeading && !refs.list.length) return { op: null, touches: [bareHeading[1]!], ranges: [], all: false }
  if (DIVISION_WORDING_RE.test(h) && !refs.list.length) {
    const division = divisionOf(h)
    if (division) return { op: { kind: 'divisionWording', division, quoted: firstQuoted(h) }, touches: [], ranges: [], all: false }
  }
  const everywhere = WHOLE_LAW_RE.test(outside)
  // „Im ganzen Gesetz wird …": any § may be meant — unless it names nothing but an Anlage.
  if (!refs.list.length || everywhere) return withAnnex({ ...none, all: everywhere || !annex.length, quoted: firstQuoted(h) })
  const P = String.raw`§\s*(\d+[a-z]*)`
  let m: RegExpExecArray | null
  // „§ 16 lautet:", „Der § 4c samt Überschrift lautet:", „§§ 4 und 5 lauten:"
  if ((m = new RegExp(String.raw`^(?:Der |Die )?${P}(?: samt Überschrift)? lautet:$`).exec(h))) {
    return { op: { kind: 'paragraphs', replaces: true, payload: ins.payload, numbers: [m[1]!] }, touches: [m[1]!], ranges: [], all: false }
  }
  if (/^(?:Die )?§§ [\d\sa-z,]+(?:und|sowie) [\d\sa-z]+ lauten:$/.test(h)) {
    return { op: { kind: 'paragraphs', replaces: true, payload: ins.payload, numbers: refs.list }, touches: refs.list, ranges: [], all: false }
  }
  // „Nach § 74 wird folgender § 74a eingefügt:", „Nach § 90 werden folgende § 90a und § 90b angefügt:",
  // „Nach § 11 werden folgende §§ 11a bis 11d eingefügt:" (113253/2025)
  if ((m = /folgende[rn]?\s+(§§?\s*\d+[a-z]*(?:\s*(?:,|und|bis)\s*(?:§\s*)?\d+[a-z]*)*)(?:\s+samt\s+Überschriften?)?\s+(?:eingefügt|angefügt):$/.exec(h)) &&
    /^(?:Nach|Vor) (?:§|de[mr] )/.test(h)) {
    const listed = m[1]!.match(/\d+[a-z]*/g) ?? []
    const range = /\bbis\b/.test(m[1]!) && listed.length === 2 ? rangeNumbers([listed[0]!, listed[1]!]) : []
    const created = range.length ? range : listed
    // The anchor („Nach § 74") is not touched; what it creates is.
    return { op: { kind: 'paragraphs', replaces: false, payload: ins.payload, numbers: created }, touches: created, ranges: [], all: false }
  }
  // „§ 53 entfällt.", „Die §§ 4 und 5 entfallen.", „§ 79 samt Überschrift entfällt."
  if (new RegExp(String.raw`^(?:Der |Die )?(?:${P}|§§ [\d\sa-z,]+?)(?: samt Überschriften?)? (?:entfällt|entfallen|wird aufgehoben|werden aufgehoben)\.$`).test(h)) {
    return { op: { kind: 'delete', numbers: refs.list, ranges: refs.ranges }, touches: refs.list, ranges: refs.ranges, all: false }
  }
  if (refs.list.length !== 1) return withAnnex(none)
  const para = refs.list[0]!
  // „§ 12 Abs. 1 lautet:", „§ 19 Abs. 2 bis 4 lauten:"
  if ((m = new RegExp(String.raw`^(?:Im |In )?${P} ${ABS_LIST} (?:lautet|lauten):$`).exec(h))) {
    return { op: { kind: 'absReplace', para, ...labelList(m[2]!), payload: ins.payload }, touches: [para], ranges: [], all: false }
  }
  // „Nach § 11 Abs. 2 wird folgender Abs. 2a eingefügt:", „In § 5 wird nach Abs. 2 folgender Abs. 2a eingefügt:"
  if ((m = new RegExp(String.raw`^Nach ${P} Abs\.\s*(\d+[a-z]*) (?:wird|werden) folgende[rn]? ${ABS_LIST} eingefügt:$`).exec(h)) ||
    (m = new RegExp(String.raw`^(?:Im |In )${P} (?:wird|werden) nach Abs\.\s*(\d+[a-z]*) folgende[rn]? ${ABS_LIST} eingefügt:$`).exec(h))) {
    return { op: { kind: 'absInsert', para, after: m[2]!, ...labelList(m[3]!), payload: ins.payload }, touches: [para], ranges: [], all: false }
  }
  // „§ 15 wird folgender Abs. 7 angefügt:", „Dem § 56a werden folgende Abs. 5 und 6 angefügt:"
  if ((m = new RegExp(String.raw`^(?:Dem )?${P} (?:wird|werden) folgende[rn]? ${ABS_LIST} angefügt:$`).exec(h))) {
    return { op: { kind: 'absInsert', para, after: null, ...labelList(m[2]!), payload: ins.payload }, touches: [para], ranges: [], all: false }
  }
  // „§ 73 Abs. 3 entfällt.", „§ 61 Abs. 3 und 4 entfallen."
  if ((m = new RegExp(String.raw`^(?:Im |In )?${P} ${ABS_LIST} (?:entfällt|entfallen)\.$`).exec(h))) {
    return { op: { kind: 'absDelete', para, ...labelList(m[2]!) }, touches: [para], ranges: [], all: false }
  }
  return withAnnex(none)
}

// ——— Putting the two together ———

/** A line that is nothing but an elision, perhaps after a label: „…", „(3) bis (5) …", „….." — not the table's leader dots. */
const ELIDED_RE = /^(?:\(?[\p{L}\p{N}]{1,4}[.)]?\s+(?:bis\s+\(?[\p{L}\p{N}]{1,4}[.)]?\s+)?)?(?:…|\.\.\.)[….]*$/u

/** One law as the left column prints it, under its „StF:" line. */
interface LeftLaw {
  title: string
  paragraphs: PrintedPara[]
}

/**
 * The left column into its laws: each starts at its title, above „StF: LGBl
 * Nr 59/1994 (WV)" — every law the document prints carries that line.
 */
export function leftLawsOf(lines: readonly KtnLine[], f: Frame): LeftLaw[] {
  const starts = lines.map((l, i) => (/^StF:/.test(l.text) ? i : -1)).filter((i) => i >= 0)
  if (!starts.length) return [{ title: '', paragraphs: printedParagraphs(lines, f) }]
  // Each law's title: up to five lines above its „StF:", from the topmost
  // that begins like one („Gesetz vom 23. September 2021 über …",
  // „Kärntner Tourismusabgabegesetz - K-TAG"); else the one line above.
  // It stands after the last § of the law before and is cut out of it.
  const titleAt = starts.map((at) => {
    for (let from = Math.max(0, at - 5); from < at; from++) {
      if (/^(?:Gesetz\b|Landesgesetz\b|Verordnung\b|Kärntner\s|Allgemeine\s|Geschäftsordnung\b|K-)/.test(lines[from]!.text)) return from
    }
    return Math.max(0, at - 1)
  })
  return starts.map((at, k) => ({
    title: lines.slice(titleAt[k]!, at).map((l) => l.text).join(' '),
    paragraphs: printedParagraphs(lines.slice(at + 1, titleAt[k + 1] ?? lines.length), f),
  }))
}

/**
 * Does `text` carry the law's name? Word by word, a genitive („…gesetzes",
 * „Stadtrechtes") standing for its nominative either way round.
 */
function nameMatches(law: string, text: string): boolean {
  // A name the column wrapped at its hyphen, „Kärntner Gemeinde- Personalvertretungsgesetz" (1037/2021), is one word.
  const joined = (s: string) => s.replace(/(\p{L})-\s+(?!und\b|oder\b|bzw\.|sowie\b)(\p{L})/gu, '$1-$2')
  const words = joined(text).toLowerCase().replace(/[(),.;:]/g, ' ').split(/[\s–]+/)
  const want = joined(law).toLowerCase().replace(/[(),.;:]/g, ' ').split(/[\s–]+/).filter((w) => w.length > 2 || /\d/.test(w))
  const same = (a: string, b: string) => a === b || (a.length > 3 && b.length > 3 && (a.startsWith(b) || b.startsWith(a)) && Math.abs(a.length - b.length) <= 2)
  return want.length > 0 && want.every((w) => words.some((x) => same(x, w)))
}

/**
 * The short title a left column's long title carries in brackets:
 * „(Kärntner Landes-Gleichbehandlungsgesetz 2022 – K-LGlBG 2022)" — or that
 * it begins with, also a Stadtrecht's and the Landesverfassung's
 * („Klagenfurter Stadtrecht 1998 - K-KStR 1998", 61525/2024: its §§ were
 * filed under no law, and the page put them under a neighbour's).
 */
function titleOfLeft(title: string): string | null {
  const bracket = /\(([^()]*(?:gesetz|ordnung|statut|recht|verfassung)[^()]*)\)/i.exec(title)
  const raw = bracket?.[1] ?? (/^((?:Kärntner|Klagenfurter|Villacher)\s.*?(?:gesetz|ordnung|statut|recht|verfassung)(?:\s+\d{4})?)\b/i.exec(title)?.[1] ?? null)
  // „Kärntner Gemeinde- Personalvertretungsgesetz" stays as printed: RIS writes it so, and finds it only so (33450/2026).
  return raw ? lawName(raw.replace(/\s+/g, ' ')) : null
}

/** Lines into the strings `TguParagraph` carries: the heading on one line, the body as printed. */
const textOf = (heading: readonly string[], body: readonly KtnLine[]) => [...(heading.length ? [joinLines(heading)] : []), ...body.map((l) => l.text)]

/**
 * A payload without the quotes around it: „…" both, or — as Kärnten prints
 * it at times — only the closing one („… vertreten zu lassen.“", 37427/2025
 * § 61), which is the instruction's and not the law's.
 */
function unquoted(payload: readonly KtnLine[]): KtnLine[] {
  if (!payload.length) return []
  const all = payload.map((l) => l.text).join(' ')
  const opens = (all.match(/„/g) ?? []).length
  const closes = (all.match(/[“”]/g) ?? []).length
  const out = payload.map((l) => ({ ...l }))
  const first = out[0]!
  const last = out.at(-1)!
  const leading = /^„/.test(first.text)
  const trailing = /[“”]$/.test(last.text)
  if (leading && trailing && opens === closes) {
    first.text = first.text.slice(1)
    last.text = last.text.slice(0, -1)
  } else if (trailing && closes === opens + 1) {
    last.text = last.text.slice(0, -1)
  } else if (leading && opens === closes + 1) {
    first.text = first.text.slice(1)
  }
  return out
}

/**
 * An instruction that changes something below a whole Absatz — a word, a
 * sentence, a Ziffer, a litera, a citation: what the page says as „Die
 * Novelle ändert dort einzelne Wörter, Sätze oder Ziffern" (`because:
 * 'wording'`). Until 25.10.2026 the page said it of every § the reader did
 * not compose — of § 93 of 83484/2024, whose only instruction was its entry
 * in the contents, and of § 95 of 38532/2024, which gains whole Absätze.
 */
const FINER_RE = /\b(?:Satz|Sätzen?|Wort|Worte[ns]?|Wörter[n]?|Wortfolgen?|Wortgruppen?|Ausdr(?:uck|ücke)|Zeichen(?:folge)?|Satzzeichen|Beistrich|Strichpunkt|Klammerausdruck|Ziffer[n]?|Z|Zahl|Fundstellen?|Zitat|Zitierung|Verweis(?:ung)?|Betrag)\b|\b(?:sub)?lit\./

/** Is `n` within one of the ranges, „§§ 5 bis 7" covering 5a and 6? */
const inRange = (n: string, ranges: readonly [string, string][]) => ranges.some(([a, b]) => compareLabel(a, n) <= 0 && compareLabel(n, b) <= 0)

/**
 * The §§ a range names that need not stand in the left column — the ones it
 * creates: „§§ 51a bis 51d" → 51a, 51b, 51c, 51d; „§§ 5 bis 7" → 5, 6, 7.
 * Taken only from the left column, a § the range inserts was named nowhere
 * (15193/2025, § 51b; 25.10.2026). Nothing for a range that mixes the two
 * forms or runs past 60 numbers.
 */
export function rangeNumbers([a, b]: readonly [string, string]): string[] {
  const article = /^Art\.\s*/
  if (article.test(a) && article.test(b)) return rangeNumbers([a.replace(article, ''), b.replace(article, '')]).map((n) => `Art. ${n}`)
  const pa = /^(\d+)([a-z]?)$/.exec(a)
  const pb = /^(\d+)([a-z]?)$/.exec(b)
  if (!pa || !pb) return []
  if (pa[1] === pb[1] && pa[2] && pb[2]) {
    const out: string[] = []
    for (let c = pa[2].charCodeAt(0); c <= pb[2].charCodeAt(0); c++) out.push(`${pa[1]}${String.fromCharCode(c)}`)
    return out
  }
  if (pa[2] || pb[2] || +pb[1]! - +pa[1]! > 60) return []
  return Array.from({ length: Math.max(0, +pb[1]! - +pa[1]! + 1) }, (_, k) => String(+pa[1]! + k))
}

/**
 * One law: its §§ in force (left) and its instructions (right) → the §§
 * whose new text the document gives whole, every other § an instruction
 * reaches named with why, and the instructions that reach §§ they do not
 * name (`reaches`, said per law).
 */
function lawParagraphs(law: string | null, left: readonly PrintedPara[], amendment: Amendment, lf: Frame, rf: Frame): { paragraphs: TguParagraph[]; reaches: string[] } {
  const read = amendment.instructions.map(readInstruction)
  const heads = amendment.instructions.map((ins) => ins.head.replace(/\s+/g, ' ').trim())
  /**
   * §§ named for a cause of their own (26.10.2026), beside those an
   * instruction names: the §§ of a division the Novelle replaces, inserts
   * or repeals whole; those a „jeweils" or „im ganzen Gesetz" instruction
   * reaches by the words it quotes; Anlagen.
   */
  const extra = new Map<string, NonNullable<TguParagraph['because']>>()
  const reaches: string[] = []
  const contains = (p: PrintedPara, quoted: string) => joinLines(textOf(p.heading, p.body)).replace(/\s+/g, ' ').includes(quoted.replace(/\s+/g, ' '))
  for (const r of read) for (const label of r.annex ?? []) extra.set(label, 'annex')
  /* What the law's instructions name and this reader does not show goes
   * out as `unread`, never silently (24.10.2026): the page names it beside
   * the §§ it shows, so they are not read as all the draft changes. Where an
   * instruction it does not perform changes words, sentences or Ziffern of
   * it, the page may say so (`FINER_RE`); else only that it is not composed. */
  const finer = (n: string) => read.some((r, k) => {
    const ins = amendment.instructions[k]!
    return !r.op && !ins.swallowed.length && (r.touches.includes(n) || inRange(n, r.ranges)) && FINER_RE.test(ins.head.replace(/\s+/g, ' ').replace(QUOTED_RE, ' '))
  })
  const unread = (n: string, because?: TguParagraph['because']): TguParagraph => ({ law, number: n, old: [], neu: [], changed: true, unread: true, ...(because ? { because } : {}) })
  /** The §§ an instruction other than the k-th addresses by number. */
  const addressedBesides = (k: number) => new Set(read.flatMap((r, j) => {
    if (j === k) return []
    const op = r.op
    const own = !op ? [] : 'para' in op ? [op.para] : 'numbers' in op && op.numbers ? op.numbers : []
    return [...r.touches, ...r.ranges.flatMap(rangeNumbers), ...own]
  }))
  /**
   * The §§ in force of a division an instruction replaces or repeals whole:
   * those it lists, where it lists them; else those the left column prints
   * under the division's heading that no other instruction addresses. The
   * column prints only what the Novelle touches and leaves out the headings
   * of the divisions between, so „under the last heading" alone filed
   * 44393/2023's § 15 and § 32 in the repealed 2. Hauptstück, and 44/2021's
   * §§ 19d, 19j and 27 in the replaced 4. Abschnitt (26.10.2026).
   */
  const membersOf = (division: DivisionSpec, listed: readonly string[] | undefined, k: number) => {
    if (listed?.length) return left.filter((p) => listed.includes(p.number))
    const besides = addressedBesides(k)
    return left.filter((p) => inDivision(p.div, division) && !besides.has(p.number))
  }
  const named = () => {
    const numbers = new Set(read.flatMap((r) => [...r.touches, ...r.ranges.flatMap(rangeNumbers)]))
    for (const p of left) if (read.some((r) => inRange(p.number, r.ranges))) numbers.add(p.number)
    for (const n of extra.keys()) numbers.add(n)
    return [...numbers]
  }
  // Why each named § is not shown: its own cause, or a numbering gap, or words changed, or only that it is not composed.
  const becauseOf = (n: string) => extra.get(n) ?? (amendment.gap ? 'gap' : finer(n) ? 'wording' : undefined)
  if (amendment.gap || read.some((r) => r.all)) {
    // Every § may be meant: those the quoted words stand in are named too, and the instruction is said for its law.
    read.forEach((r, k) => {
      if (!r.all) return
      reaches.push(heads[k]!)
      if (r.quoted) for (const p of left) if (contains(p, r.quoted)) extra.set(p.number, extra.get(p.number) ?? 'wording')
    })
    return { paragraphs: named().map((n) => unread(n, becauseOf(n))), reaches }
  }
  const inForce = new Map<string, PrintedPara | null>()
  // A number the left column prints twice is not one § we can name; one it
  // prints as „§ 148 …" (1037/2021) or without a body, it does not print.
  for (const p of left) inForce.set(p.number, inForce.has(p.number) || !p.body.length || p.body.some((l) => ELIDED_RE.test(l.text)) ? null : p)

  // Every § named by an instruction this reader does not perform is out.
  const tainted = (n: string) => read.some((r) => !r.op && (r.touches.includes(n) || inRange(n, r.ranges)))
  const out = new Map<string, TguParagraph | null>()
  const put = (number: string, p: TguParagraph | null) => out.set(number, out.has(number) ? null : p)
  /**
   * The §§ in force of a division replaced or repealed whole that its own new
   * text does not print. Named once every instruction is read, and only
   * where none prints them: a Novelle that rewrites several divisions moves
   * §§ from one into another (20258/2025 prints § 11 of the old 1. Abschnitt
   * in the new 2. Abschnitt), and § 11 is then compared by its number, as
   * every § is.
   */
  const unprinted = new Set<string>()

  // Whole §§: replaced, inserted, deleted — and whole divisions.
  read.forEach((r, k) => {
    const op = r.op
    if (!op) return
    if (op.kind === 'paragraphs') {
      const payload = unquoted(op.payload)
      const printed = printedParagraphs(payload, rf)
      // The §§ in force of a division the Novelle prints anew (26.10.2026).
      const members = op.division ? membersOf(op.division, op.listed, k) : []
      // The payload must print exactly the §§ the instruction names, and from its first line —
      // a division's new text after its heading and title, which may run nearly the column's
      // width („Objektivierung in der Landeskrankenanstalten-Betriebsgesellschaft –", 48376/2024):
      // only no text of a § before its first §.
      const firstAt = payload.findIndex((l) => centred(l, rf) && PARA_LINE_RE.test(l.text))
      const first = op.division
        ? (firstAt >= 0 && payload.slice(0, firstAt).every((l) => !ABSATZ_RE.test(l.text) && !/[.;]$/.test(l.text)) ? payload[firstAt] : undefined)
        : payload.find((l) => !(centred(l, rf) && (DIVISION_RE.test(l.text) || !PARA_LINE_RE.test(l.text))))
      if (!printed.length || !first || !PARA_LINE_RE.test(first.text)) {
        for (const n of op.numbers ?? []) put(n, null)
        if (op.numbers === null) {
          // A division printed anew that the reader cannot read: its §§ in
          // force, and those its new text prints, are named, not lost
          // (48376/2024's 4. Abschnitt, §§ 21–37). Where neither can be
          // told, the instruction is said for the law.
          const printedUnits = payload.flatMap((l) => {
            const u = PARA_LINE_RE.exec(l.text)
            return u && centred(l, rf) ? [unitNumber(u)] : []
          })
          for (const n of [...members.map((p) => p.number), ...printedUnits, ...r.touches]) extra.set(n, 'division')
          if (!members.length && !printedUnits.length && !r.touches.length) reaches.push(heads[k]!)
        }
        return
      }
      if (op.numbers && printed.map((p) => p.number).join(' ') !== op.numbers.join(' ')) {
        for (const n of op.numbers) put(n, null)
        return
      }
      for (const p of printed) {
        const old = inForce.get(p.number)
        // Replacing a § the left column does not print, or inserting one it does, is not the document's pair.
        if (old === null || (op.replaces && op.numbers && !old) || (!op.replaces && inForce.has(p.number))) { put(p.number, null); continue }
        put(p.number, { law, number: p.number, old: old ? textOf(old.heading, old.body) : [], neu: textOf(p.heading, p.body), changed: true })
      }
      // The §§ of a replaced division its new text no longer prints: gone or moved — named, not shown as „entfallen".
      for (const p of members) if (!printed.some((q) => q.number === p.number)) unprinted.add(p.number)
    } else if (op.kind === 'divisionDelete') {
      // A division repealed whole (61525/2024): its §§ in force named, or the instruction said where the left column prints none.
      const members = membersOf(op.division, op.listed, k)
      for (const p of members) unprinted.add(p.number)
      // Listed but not printed on the left: named all the same.
      for (const n of op.listed) unprinted.add(n)
      if (!members.length && !op.listed.length) reaches.push(heads[k]!)
    } else if (op.kind === 'divisionWording') {
      // „Im V. Abschnitt wird jeweils …" (1037/2021): the §§ of the division that carry the quoted words, and the instruction said for the law.
      for (const p of left) if (inDivision(p.div, op.division) && (!op.quoted || contains(p, op.quoted))) extra.set(p.number, 'wording')
      reaches.push(heads[k]!)
    } else if (op.kind === 'delete') {
      const numbers = [...new Set([...op.numbers, ...left.map((p) => p.number).filter((n) => inRange(n, op.ranges))])]
      for (const n of numbers) {
        const old = inForce.get(n)
        put(n, old ? { law, number: n, old: textOf(old.heading, old.body), neu: [], changed: true } : null)
      }
    }
  })

  for (const n of unprinted) if (!out.get(n)) extra.set(n, extra.get(n) ?? 'division')

  // Whole Absätze, on the left column's §.
  const absOps = new Map<string, Op[]>()
  for (const r of read) if (r.op && r.op.kind.startsWith('abs')) absOps.set((r.op as { para: string }).para, [...(absOps.get((r.op as { para: string }).para) ?? []), r.op])
  for (const [n, ops] of absOps) {
    const old = inForce.get(n)
    if (!APPLY_ABSATZ || !old || out.has(n)) { put(n, null); continue }
    const neu = applyAbsaetze(old, ops, lf, rf)
    put(n, neu ? { law, number: n, old: textOf(old.heading, old.body), neu: textOf(old.heading, neu), changed: true } : null)
  }

  const shown = [...out].flatMap(([n, p]) => (p && !tainted(n) && !extra.has(n) ? [p] : []))
  const shownNumbers = new Set(shown.map((p) => p.number))
  return { paragraphs: [...shown, ...named().filter((n) => !shownNumbers.has(n)).map((n) => unread(n, becauseOf(n)))], reaches }
}

/**
 * The § with whole Absätze exchanged, inserted or taken out, in the
 * instructions' order; null where any of them does not fit what the left
 * column prints — an Absatz it names is not there, one it inserts is, the
 * payload does not begin with the Absatz it announces.
 */
function applyAbsaetze(old: PrintedPara, ops: readonly Op[], lf: Frame, rf: Frame): KtnLine[] | null {
  let abs = absaetzeOf(old.body, lf)
  if (!abs) return null
  const at = (label: string) => abs!.findIndex((a) => a.label === label)
  for (const op of ops) {
    if (op.kind === 'absDelete' || op.kind === 'absReplace') {
      let from = at(op.labels[0]!)
      let to = op.range ? at(op.labels.at(-1)!) : from
      if (from < 0 || to < from) return null
      // „Abs. 1 und 3": only adjacent ones, so the replacement has one place.
      if (!op.range) {
        const idx = op.labels.map(at)
        if (idx.some((i, k) => i < 0 || i !== from + k)) return null
        to = idx.at(-1)!
      }
      const replacement = op.kind === 'absReplace' ? absaetzeOf(unquoted(op.payload), rf) : []
      if (!replacement) return null
      if (op.kind === 'absReplace' && (replacement[0]!.label !== op.labels[0] || (!op.range && replacement.map((r) => r.label).join(' ') !== op.labels.join(' ')))) return null
      abs = [...abs.slice(0, from), ...replacement, ...abs.slice(to + 1)]
      from = 0
    } else if (op.kind === 'absInsert') {
      const inserted = absaetzeOf(unquoted(op.payload), rf)
      // „Abs. 3 bis 5": the payload's first and last Absatz, every one between in order (checked below).
      // Read as the list „3, 5" it never fit (38532/2024, § 95; 11 such instructions, 25.10.2026).
      const labels = inserted?.map((r) => r.label) ?? []
      if (!inserted || (op.range ? labels[0] !== op.labels[0] || labels.at(-1) !== op.labels.at(-1) : labels.join(' ') !== op.labels.join(' '))) return null
      if (inserted.some((r) => at(r.label) >= 0)) return null
      const after: number = op.after === null ? abs.length - 1 : at(op.after)
      if (after < 0) return null
      abs = [...abs.slice(0, after + 1), ...inserted, ...abs.slice(after + 1)]
    } else return null
  }
  for (let i = 1; i < abs.length; i++) if (compareLabel(abs[i - 1]!.label, abs[i]!.label) >= 0) return null
  return abs.flatMap((a) => a.lines)
}

/** „Kärntner Familienförderungsgesetzes" → „Kärntner Familienförderungsgesetz": an „Änderung des …" heading's law, as a name. */
const nominative = (title: string) => title.replace(/(gesetz|Gesetz|statut|Statut|recht|Recht)e?s\b/g, '$1')
/**
 * What an Artikel that amends another Novelle amends, named as its group:
 * „Artikels II des Gesetzes LGBl. Nr. 93/2019" → „Art. II des Gesetzes LGBl.
 * Nr. 93/2019", „Landesgesetzes LGBl. Nr. 117/2022" → „Landesgesetz LGBl.
 * Nr. 117/2022".
 */
const novelleLabel = (title: string) => (/^Art/.test(title) ? title.replace(/^Art(?:ikels?|\.)\s*/, 'Art. ') : nominative(title))

/**
 * The §§ of a Kärnten Textgegenüberstellung whose old and new text the
 * document gives (see the head comment), each under its law: the one the
 * draft amends, or in a package the one of `laws` its Artikel names.
 */
export function ktnTguParagraphs(pages: readonly AnnexPage[], laws: readonly string[]): TguParagraph[] {
  return ktnTguReading(pages, laws).paragraphs
}

/** `ktnTguParagraphs`, with the instructions that reach §§ they do not name, per law (26.10.2026). */
export function ktnTguReading(pages: readonly AnnexPage[], laws: readonly string[]): TguReading {
  // Portrait pages are not this template — once the „TGÜ" link led to the Erläuterungen (57687/2026).
  if (!pages.length || pages[0]!.width < 700) return { paragraphs: [] }
  const lines = ktnLines(pages)
  const leftLines = lines.filter((l) => l.side === 'left')
  const rightLines = lines.filter((l) => l.side === 'right')
  if (!leftLines.length || !rightLines.length) return { paragraphs: [] }
  const lf = frameOf(leftLines)
  const rf = frameOf(rightLines)
  const lefts = leftLawsOf(leftLines, lf)
  const amendments = amendmentsOf(rightLines, rf).filter((a) => a.instructions.length)
  // An Artikel that amends another Novelle's article amends no law of the left column (227/2022).
  const ofNovelle = (a: Amendment) => a.title !== null && OF_NOVELLE_RE.test(a.title)
  const ofLaws = amendments.filter((a) => !ofNovelle(a))

  const nameOf = (text: string | null) => (text ? laws.find((l) => nameMatches(l, text)) ?? null : null)
  const out: TguParagraph[] = []
  const reaches: { law: string | null; instruction: string }[] = []
  amendments.forEach((a) => {
    if (ofNovelle(a)) {
      const law = novelleLabel(a.title!)
      const r = lawParagraphs(law, [], a, lf, rf)
      out.push(...r.paragraphs.map((p) => (p.unread ? p : { law, number: p.number, old: [], neu: [], changed: true, unread: true as const })))
      reaches.push(...r.reaches.map((instruction) => ({ law, instruction })))
      return
    }
    const k = ofLaws.indexOf(a)
    // Which law: by name where both sides carry one — the „Änderung des …"
    // heading's, or the promulgation sentence's — by order where the two
    // columns print as many laws.
    const named = nameOf(a.title) ?? nameOf(a.named)
    let left = named ? lefts.find((l) => nameOf(l.title) === named) : undefined
    // Where the draft's title does not list it: the Artikel's own name against the left column's titles, if exactly one fits.
    for (const name of [a.title, a.named]) {
      if (left || !name) continue
      const own = name.replace(/\s+[–-]\s+.*$/, '').replace(/,.*$/, '')
      const fits = lefts.filter((l) => nameMatches(own, l.title))
      if (fits.length === 1) left = fits[0]
    }
    if (!left && lefts.length === ofLaws.length) left = lefts[k]
    if (!left && lefts.length === 1 && ofLaws.length === 1) left = lefts[0]
    // No left column to hold the instructions against: what they name is
    // named all the same, as not composed. Dropped, 18 Textgegenüberstellungen
    // lost 259 §§ this way — 2314/2021 the 68 its two Artikel name, and the
    // page said it found none (25.10.2026). A § they insert whole goes to the
    // RIS check only under a law we know: without one, the check would file
    // it under its neighbour's, which may be another Artikel's.
    if (!left) {
      const known = named ?? (laws.length === 1 ? laws[0]! : null)
      // Named under the law the Artikel itself names, or its designation:
      // filed under no law, two such Artikel ran into one (2314/2021, 26.10.2026).
      const law = known ?? (a.named ? lawName(a.named) : a.title ? nominative(a.title) : a.artikel)
      const r = lawParagraphs(law, [], a, lf, rf)
      out.push(...r.paragraphs.map((p) => (known || p.unread ? p : { law, number: p.number, old: [], neu: [], changed: true, unread: true as const })))
      reaches.push(...r.reaches.map((instruction) => ({ law, instruction })))
      return
    }
    // Where neither the draft's title nor the left column says, the Artikel's own name (61525/2024).
    const law = named ?? nameOf(left.title) ?? (laws.length === 1 ? laws[0]! : titleOfLeft(left.title)) ?? (a.named ? lawName(a.named) : a.title ? nominative(a.title) : null)
    const r = lawParagraphs(law, left.paragraphs, a, lf, rf)
    out.push(...r.paragraphs)
    reaches.push(...r.reaches.map((instruction) => ({ law, instruction })))
  })
  return { paragraphs: out, reaches }
}
