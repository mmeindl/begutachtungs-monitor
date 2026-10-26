/**
 * Tirol's Textgegenüberstellung, read into §§ (`landTguService`) — 23.10.2026.
 *
 * NOT TWO COLUMNS OF OLD AGAINST NEW. The document looks like the Bund's
 * template — landscape, two columns — but it is Oberösterreich's format
 * (`landTgu.ts`) set like a newspaper: ONE text, the law as it would read
 * with the draft's changes marked in it, flowing down the left column and on
 * at the top of the right one, page by page. What the draft deletes is set
 * in colour and struck through, what it adds in colour and underlined, the
 * rest in black (blue #2e97d3 on 722/2026, red deletions on 723/2026);
 * unchanged stretches are left out with a note („§§ 1 bis 3
 * unverändert."). So a § whose whole text is new stands as the struck old
 * text and, right after it, the underlined new one — on 722/2026 § 4's old
 * Abs. 1 to 3 fill the left column and its new Abs. 1 runs on into the
 * right, which is what made the two columns look like two versions.
 *
 * Read as OÖ's is read: leave out the underlined characters and the text in
 * force remains, leave out the struck ones and the draft's text remains.
 * What is Tirol's own:
 *
 *  - The page is a portrait page turned by /Rotate 90, and its content is
 *    drawn under a scaled CTM (0.24, then 4.17). The rules therefore come out
 *    of the operator list as tall thin boxes in a frame of their own;
 *    `landTguPdf.ts` reads the box raw and finds none. Here every box goes
 *    through the CTM and the viewport, like the text.
 *  - The colour is a second witness. A character that a rule marks must be
 *    coloured, and a coloured one must be marked; where the two disagree the
 *    line is unsure and its § is withheld. Rules alone cannot tell a strike from a
 *    rule that merely passes near a line, the colour alone cannot tell a
 *    deletion from an addition — together they can, or the § is not shown.
 *  - The flow, not a row, is the unit: a § runs from its heading — centred
 *    in its column, „§ 4" — to the next heading, elision note or Artikel,
 *    across columns and pages.
 *
 * WITHHELD, never guessed (the one error this layer must not make is a false
 * „entfällt", „neu" or „geändert"): a § with an unsure line; a § on a
 * page whose two columns cannot be told apart; a § that stands twice under
 * the same law other than as the struck old and the underlined new twin. A §
 * whose heading carries two numbers, „§ 72 74" — 72 struck, 74 underlined —
 * is renumbered, and read as one § under its new number that comes from
 * the old one (`TguParagraph.from`, 26.10.2026; withheld under both until
 * then).
 * Such a § is handed on without text, so that `compareTgu` names it as not
 * shown wherever RIS knows its number. Everything else that comes out is
 * still checked against RIS (`compareTgu`).
 *
 * Measured on the 10 Textgegenüberstellungen the Landtag lists (2026; it
 * files none for earlier years): 0 lines unsure in 6 of them, 15–20 in
 * three (adjacent struck and underlined letters, a struck list of federal
 * laws), one page without a gutter (a table, 274/2026). Every shown „neu"
 * and „entfallen" of the six drafts still in Begutachtung or before the
 * Landtag was checked against the draft's own amending instructions.
 *
 * ONLY PAGES FROM `tirolTguPages` CAN BE READ: the text layer alone
 * (`pagesOf`) knows neither rules nor colour.
 */
import type { AnnexPage } from '../annex/annexPdf'
import { joinLines, tguParagraphKey, type TguParagraph, type TguReading } from './landTgu'

/* ------------------------------------------------------------------ *
 * The page geometry
 * ------------------------------------------------------------------ */

/** One text run, upright, in PDF user space (y upwards), each character with its colour. */
export interface TirolRun {
  s: string
  x: number
  y: number
  w: number
  /** The font size */
  h: number
  /** Per character of `s`: drawn in a colour other than black or grey; null where the run could not be matched to its glyphs */
  coloured: boolean[] | null
  /** Per character of `s`: its advance width in 1/1000 em; null as above */
  widths: number[] | null
}

/** A page as this reader needs it: the runs and the thin rules, both upright. */
export interface TirolTguPage {
  width: number
  runs: TirolRun[]
  /** [x0, y0, x1, y1] of every filled box at most 2.5 pt high, upright */
  rules: [number, number, number, number][]
}

type Matrix = [number, number, number, number, number, number]

function compose(m: readonly number[], n: readonly number[]): Matrix {
  return [
    m[0]! * n[0]! + m[2]! * n[1]!,
    m[1]! * n[0]! + m[3]! * n[1]!,
    m[0]! * n[2]! + m[2]! * n[3]!,
    m[1]! * n[2]! + m[3]! * n[3]!,
    m[0]! * n[4]! + m[2]! * n[5]! + m[4]!,
    m[1]! * n[4]! + m[3]! * n[5]! + m[5]!,
  ]
}

const apply = (m: readonly number[], x: number, y: number) => ({ x: m[0]! * x + m[2]! * y + m[4]!, y: m[1]! * x + m[3]! * y + m[5]! })

/** A rule is a filled box at most this high (upright), and wider than a speck. */
const RULE_MAX_HEIGHT = 2.5
const RULE_MIN_WIDTH = 1.5

/** Black and the greys: every channel alike. Tirol's markup is #2e97d3. */
function isColoured(fill: string): boolean {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(fill)
  if (!m) return false
  const [r, g, b] = [m[1]!, m[2]!, m[3]!].map((h) => parseInt(h, 16))
  return Math.max(r!, g!, b!) - Math.min(r!, g!, b!) > 40
}

/* eslint-disable @typescript-eslint/no-explicit-any -- pdf.js's operator arguments and text items */
/**
 * The document's bytes → its pages, upright. The text comes from the text
 * layer, the colour and the rules from the operator list, and the two are
 * joined by the glyphs both draw in the same order.
 */
export async function tirolTguPages(bytes: Uint8Array): Promise<TirolTguPage[]> {
  const { getDocumentProxy, getResolvedPDFJS } = await import('unpdf')
  const { OPS } = (await getResolvedPDFJS()) as any
  const showText = new Set([OPS.showText, OPS.showSpacedText, OPS.nextLineShowText, OPS.nextLineSetSpacingShowText])
  const doc = await getDocumentProxy(bytes)
  const pages: TirolTguPage[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const viewport = page.getViewport({ scale: 1 })
    const ops = await page.getOperatorList()
    const rawRules: { m: Matrix; box: [number, number, number, number] }[] = []
    const glyphs: { u: string; w: number; coloured: boolean }[] = []
    let ctm: Matrix = [1, 0, 0, 1, 0, 0]
    let fill = '#000000'
    const stack: { ctm: Matrix; fill: string }[] = []
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i]
      const args = ops.argsArray[i] as any[]
      if (fn === OPS.save) stack.push({ ctm, fill })
      else if (fn === OPS.restore) ({ ctm, fill } = stack.pop() ?? { ctm, fill })
      else if (fn === OPS.transform) ctm = compose(ctm, args)
      else if (fn === OPS.paintFormXObjectBegin) {
        stack.push({ ctm, fill })
        if (Array.isArray(args[0]) || ArrayBuffer.isView(args[0])) ctm = compose(ctm, Array.from(args[0] as ArrayLike<number>))
      } else if (fn === OPS.paintFormXObjectEnd) ({ ctm, fill } = stack.pop() ?? { ctm, fill })
      else if (fn === OPS.setFillRGBColor) fill = typeof args[0] === 'string' ? args[0] : `#${Array.from(args as number[]).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
      else if (fn === OPS.setFillGray) fill = '#000000'
      else if (fn === OPS.constructPath) {
        const box = args.at(-1)
        if (box && box.length === 4) rawRules.push({ m: ctm, box: Array.from(box as ArrayLike<number>) as [number, number, number, number] })
      } else if (showText.has(fn)) {
        const coloured = isColoured(fill)
        for (const g of (args.at(-1) as any[]) ?? []) {
          if (g && typeof g === 'object' && typeof g.unicode === 'string') glyphs.push({ u: g.unicode, w: g.width ?? 0, coloured })
        }
      }
    }
    const content = await page.getTextContent()
    const items = (content.items as any[]).filter((it) => typeof it.str === 'string' && it.str.length)
    pages.push(upright(viewport, items, glyphs, rawRules))
    page.cleanup()
  }
  // Ended, not only cleaned up — nothing returned holds a pdf.js object — as
  // unpdf ends every document it opens itself (`withDocument`). The proxy
  // has no `destroy()` of its own in this pdf.js.
  await doc.loadingTask.destroy()
  return pages
}

/**
 * The visible glyphs as characters, each with the glyph it came from: the
 * text layer normalises („ﬁ" → „fi"), the glyph keeps the ligature.
 */
function glyphChars(glyphs: readonly { u: string }[]): { text: string; of: number[] } {
  let text = ''
  const of: number[] = []
  glyphs.forEach((g, k) => {
    for (const c of g.u.normalize('NFKC')) {
      if (/\s/.test(c)) continue
      text += c
      of.push(k)
    }
  })
  return { text, of }
}

function upright(
  viewport: { transform: number[]; width: number; height: number },
  items: any[],
  glyphs: { u: string; w: number; coloured: boolean }[],
  rawRules: { m: Matrix; box: [number, number, number, number] }[],
): TirolTguPage {
  const vp = viewport.transform
  // The quarter turn the text runs in, as `uprightRuns` decides it (annexPdfPages.ts).
  const turns = new Map<number, number>()
  const placed = items.map((it) => ({ it, m: compose(vp, it.transform) }))
  for (const p of placed) {
    if (!p.it.str.trim()) continue
    const q = ((Math.round(Math.atan2(p.m[1], p.m[0]) / (Math.PI / 2)) % 4) + 4) % 4
    turns.set(q, (turns.get(q) ?? 0) + 1)
  }
  const quarter = [...turns].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0
  const cos = Math.round(Math.cos((quarter * Math.PI) / 2))
  const sin = Math.round(Math.sin((quarter * Math.PI) / 2))
  const place = (x: number, y: number) => ({ x: x * cos + y * sin, y: x * sin - y * cos })
  const corners = [place(0, 0), place(viewport.width, 0), place(viewport.width, viewport.height), place(0, viewport.height)]
  const minX = Math.min(...corners.map((c) => c.x))
  const minY = Math.min(...corners.map((c) => c.y))
  const width = Math.max(...corners.map((c) => c.x)) - minX

  const g = glyphChars(glyphs)
  let cursor = 0
  const runs: TirolRun[] = placed.map(({ it, m }) => {
    const at = place(m[4], m[5])
    const chars = [...(it.str as string)]
    // Both sides through NFKC: the text layer keeps „²" and „…" that the
    // glyph's own string may spell „2" and „..." — or the other way round.
    const visible: { k: number; at: number }[] = []
    let want = ''
    chars.forEach((c, k) => {
      if (/\s/.test(c)) return
      visible.push({ k, at: want.length })
      want += c.normalize('NFKC').replace(/\s/g, '')
    })
    let coloured: boolean[] | null = null
    let widths: number[] | null = null
    if (want) {
      const found = g.text.indexOf(want, cursor)
      // Near the cursor only: the same word further down is another run.
      if (found >= 0 && found - cursor < 400) {
        coloured = chars.map(() => false)
        widths = chars.map(() => -1)
        for (const { k, at } of visible) {
          const glyph = glyphs[g.of[found + at]!]!
          coloured[k] = glyph.coloured
          widths[k] = glyph.w
        }
        cursor = found + want.length
      }
    }
    return {
      s: it.str,
      x: at.x - minX,
      y: at.y - minY,
      w: it.width ?? 0,
      h: it.height || Math.hypot(m[2], m[3]) || 10,
      coloured,
      widths,
    }
  })

  const rules: TirolTguPage['rules'] = []
  for (const { m, box } of rawRules) {
    const full = compose(vp, m)
    const pts = [apply(full, box[0], box[1]), apply(full, box[2], box[1]), apply(full, box[2], box[3]), apply(full, box[0], box[3])].map((p) => place(p.x, p.y))
    const xs = pts.map((p) => p.x - minX)
    const ys = pts.map((p) => p.y - minY)
    const r: [number, number, number, number] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
    if (r[3] - r[1] < RULE_MAX_HEIGHT && r[2] - r[0] > RULE_MIN_WIDTH) rules.push(r)
  }
  return { width, runs, rules }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ------------------------------------------------------------------ *
 * Lines
 * ------------------------------------------------------------------ */

export interface TirolLine {
  raw: string
  /** The text in force: without the underlined characters */
  old: string
  /** The draft's text: without the struck-through characters */
  neu: string
  marked: boolean
  /** Rule and colour disagree somewhere on the line, or a run's colour is unknown */
  unsure: boolean
  /** Where the line starts and ends, against its column */
  x0: number
  x1: number
  page: number
}

/**
 * Where a rule sits relative to the baseline, in font heights. Measured on
 * the corpus (23.10.2026): underlines lie 0.11 below the baseline, strikes
 * 0.23 above it — the windows are OÖ's, which hold both with room.
 */
const UNDERLINE = [-0.45, -0.02] as const
const STRIKE = [0.1, 0.65] as const

interface Char { c: string; ins: boolean; del: boolean; unsure: boolean }

/**
 * Each character's [start, end] along x. A glyph takes its own advance at
 * the run's font size; what the run is wider than its glyphs is the word
 * spacing of a justified line, and goes to its spaces. Spread over every
 * character instead, it put a struck comma two points right of its rule
 * (722/2026).
 */
function spans(run: TirolRun): [number, number][] {
  const chars = [...run.s]
  const known = (run.widths ?? []).filter((w) => w > 0)
  const average = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 500
  const own = chars.map((c, k) => (/\s/.test(c) ? 0 : run.widths && run.widths[k]! > 0 ? run.widths[k]! : average) * run.h / 1000)
  const spaces = chars.filter((c) => /\s/.test(c)).length
  const rest = run.w - own.reduce((a, b) => a + b, 0)
  let scale = 1
  if (spaces && rest >= 0) chars.forEach((c, k) => { if (/\s/.test(c)) own[k] = rest / spaces })
  else scale = run.w / (own.reduce((a, b) => a + b, 0) || 1)
  const out: [number, number][] = []
  let acc = run.x
  for (const w of own) {
    out.push([acc, acc + w * scale])
    acc += w * scale
  }
  return out
}

/**
 * How a character is marked. The COLOUR decides whether it is marked at
 * all — it comes with the glyph and is exact — and the rule beside it which
 * way: the rule's ends are where our estimate of the characters' widths can
 * be half a letter off (722/2026: a struck comma, the „H" an underline began
 * at). So a coloured character takes the kind of rule that overlaps more of
 * it; with none, or a tie, it is unsure. A black one under a rule is unsure
 * only where the rule covers most of it — at its edge, that is the estimate.
 */
function markOf(span: [number, number], coloured: boolean, under: number, strike: number): { ins: boolean; del: boolean; unsure: boolean } {
  const w = Math.max(span[1] - span[0], 0.5)
  if (!coloured) return { ins: false, del: false, unsure: Math.max(under, strike) > 0.7 * w }
  if (under > strike && under > 0.2 * w) return { ins: true, del: false, unsure: false }
  if (strike > under && strike > 0.2 * w) return { ins: false, del: true, unsure: false }
  return { ins: false, del: false, unsure: true }
}

/** One column's lines, top to bottom. */
function columnLines(runs: readonly TirolRun[], rules: TirolTguPage['rules'], page: number): TirolLine[] {
  const byLine: { y: number; h: number; runs: TirolRun[] }[] = []
  const body = Math.max(...runs.map((r) => r.h))
  // The text's own size first, then the small runs — a superscript „²" sits
  // 3 pt above its line and would be a line of its own, „m" on one and „2"
  // on the next (133/2026).
  const small = (r: TirolRun) => r.h < 0.8 * body
  for (const r of [...runs].filter((r) => !small(r)).sort((a, b) => b.y - a.y)) {
    const line = byLine.find((l) => Math.abs(l.y - r.y) <= 2)
    if (line) line.runs.push(r)
    else byLine.push({ y: r.y, h: r.h, runs: [r] })
  }
  for (const r of runs.filter(small)) {
    const line = byLine.filter((l) => Math.abs(l.y - r.y) <= 0.6 * l.h).sort((a, b) => Math.abs(a.y - r.y) - Math.abs(b.y - r.y))[0]
    if (line) line.runs.push(r)
    else byLine.push({ y: r.y, h: r.h, runs: [r] })
  }
  byLine.sort((a, b) => b.y - a.y)
  const lines: TirolLine[] = []
  for (const { runs: lineRuns, y: baseline, h: size } of byLine) {
    lineRuns.sort((a, b) => a.x - b.x)
    const chars: Char[] = []
    let lastEnd = -1
    for (const r of lineRuns) {
      if (lastEnd >= 0 && r.x - lastEnd > 1 && chars.length && chars.at(-1)!.c !== ' ' && !r.s.startsWith(' ')) {
        chars.push({ c: ' ', ins: false, del: false, unsure: false })
      }
      const xs = spans(r)
      /** How much of [a, b] the rules in the window cover */
      const cover = ([a, b]: [number, number], [lo, hi]: readonly [number, number]) => rules.reduce((sum, q) => {
        // Against the line's baseline: a superscript's rule is its line's.
        const mid = (q[1] + q[3]) / 2
        if (mid < baseline + lo * size || mid > baseline + hi * size) return sum
        return sum + Math.max(0, Math.min(b, q[2]) - Math.max(a, q[0]))
      }, 0)
      ;[...r.s].forEach((c, k) => {
        if (/\s/.test(c)) return chars.push({ c, ins: false, del: false, unsure: false })
        if (!r.coloured) return chars.push({ c, ins: false, del: false, unsure: true })
        chars.push({ c, ...markOf(xs[k]!, r.coloured[k]!, cover(xs[k]!, UNDERLINE), cover(xs[k]!, STRIKE)) })
      })
      lastEnd = r.x + r.w
    }
    const text = (keep: (c: Char) => boolean) => {
      // Where a left-out run held a space, its neighbours stay two words (`tguLines`).
      let out = ''
      let gap = false
      for (const c of chars) {
        if (!keep(c)) {
          gap ||= /\s/.test(c.c)
          continue
        }
        if (gap && out && !/\s$/.test(out) && !/\s/.test(c.c)) out += ' '
        gap = false
        out += c.c
      }
      // A word left out between a space and a punctuation mark leaves the
      // space: „Personen sowie Lehrlinge." without the underlined words reads
      // „Personen ." (730/2026), „228/2021 BGBl. I Nr. 98/2025," without the
      // underlined number „228/2021 ," (575/2026).
      return out.replace(/\s+/g, ' ').replace(/ (?=[.,;:)])/g, '').trim()
    }
    const raw = text(() => true)
    if (!raw) continue
    const ink = chars.filter((c) => c.c.trim() !== '')
    const unsure = ink.some((c) => c.unsure)
    const last = lineRuns.at(-1)!
    lines.push({
      raw,
      old: text((c) => !c.ins),
      neu: text((c) => !c.del),
      marked: ink.some((c) => c.ins || c.del),
      unsure,
      x0: lineRuns[0]!.x,
      x1: last.x + last.w,
      page,
    })
  }
  return lines
}

/** The page head, „1 von 12". */
const PAGE_HEAD_RE = /^\d+ von \d+$/
/** The columns' gutter must lie between these x on a landscape page (842 wide): measured 403 → 439. */
const GUTTER_RANGE = [0.38, 0.62] as const
const MIN_GUTTER = 12

/**
 * A page → its two columns' lines, left then right; null where no clear
 * gutter parts them — a run across the middle, or text on one side only of
 * a page that has neither (the reading order would be ours).
 */
export function pageLines(page: TirolTguPage, n: number): { left: TirolLine[]; right: TirolLine[] } | null {
  const runs = page.runs.filter((r) => r.s.trim() && !PAGE_HEAD_RE.test(r.s.trim()))
  if (!runs.length) return { left: [], right: [] }
  const lo = page.width * GUTTER_RANGE[0]
  const hi = page.width * GUTTER_RANGE[1]
  // The widest x interval in [lo, hi] that no run covers.
  const covered = runs.map((r) => [r.x, r.x + r.w] as const).filter(([a, b]) => b > lo && a < hi).sort((a, b) => a[0] - b[0])
  let best: [number, number] | null = null
  let at = lo
  for (const [a, b] of covered) {
    if (a - at > (best ? best[1] - best[0] : 0)) best = [at, a]
    at = Math.max(at, b)
  }
  if (hi - at > (best ? best[1] - best[0] : 0)) best = [at, hi]
  if (!best || best[1] - best[0] < MIN_GUTTER) return null
  const split = (best[0] + best[1]) / 2
  const rulesOf = (left: boolean) => page.rules.filter((q) => ((q[0] + q[2]) / 2 < split) === left)
  return {
    left: columnLines(runs.filter((r) => r.x < split), rulesOf(true), n),
    right: columnLines(runs.filter((r) => r.x >= split), rulesOf(false), n),
  }
}

/* ------------------------------------------------------------------ *
 * §§
 * ------------------------------------------------------------------ */

const PARA_RE = /^§\s*(\d+[a-z]*)\.?$/
/** „§§ 1 bis 3 unverändert.", „§ 6 unverändert.", „Art. II unverändert." — what the document leaves out. */
const ELIDED_RE = /^(?:§§?|Art(?:ikel|\.)?)\s[^.]{0,60}?\bunverändert\.?$/
/** „4. Abschnitt", „II. Teil": a division's heading, which closes the § above it. */
const DIVISION_RE = /^(?:\d+[a-z]?|[IVXL]+)\.\s+(?:Hauptstück|Abschnitt|Teil|Unterabschnitt)$/
const ARTICLE_RE = /^Artikel\s+(?:[IVXL]+|\d+)$/
/** „Anlage 1 (§§ 39 Abs. 1 und 41)": an annex after the last §, which it would otherwise run on into (730/2026). */
const ANNEX_RE = /^Anlage(?:\s+\d+[a-z]?)?(?:\s+\(.*\))?$/
/** A heading stands centred: further in from the column's left edge than any indented first line (+20) or list item (+45). */
const CENTRED_INDENT = 60

interface Open {
  law: string | null
  number: string
  /** The number a renumbered § has in force („§ 72 74" → number „74", from „72"); null where it keeps its own */
  from: string | null
  /** Whether the heading itself was struck („old") or underlined („neu") whole */
  side: 'both' | 'old' | 'neu'
  old: string[]
  neu: string[]
  marked: boolean
  /** Withhold: an unsure line, a renumbered heading, a page without its gutter */
  bad: boolean
  /** How many of `old` and `neu` are the §'s own heading: its centred lines right under „§ 4" */
  titled: { old: number; neu: number; done: boolean }
  /** The heading of a division the draft changes, over this § (`TguParagraph.division`) */
  division?: { old?: string; neu?: string }
}

/**
 * The law an Artikel's title names: „Änderung des Tiroler
 * Raumordnungsgesetzes 2022" → „Tiroler Raumordnungsgesetz 2022". One of
 * the laws the draft's title lists where it is one of them; else the name
 * itself — a draft „über weitere Anpassungen der Tiroler
 * Landesrechtsordnung" (728/2026) lists none. A name RIS does not know
 * costs nothing: `compareTgu` then finds the § by its words.
 */
export function lawOfArticle(title: string, laws: readonly string[]): string | null {
  const m = /^Änderung (?:des|der) (.+)$/.exec(title.replace(/\s+/g, ' ').trim())
  if (!m) return null
  // The genitive back to the name: „-gesetzes" → „-gesetz"; a title that
  // already prints the nominative (723/2026, Art. III) stays as it is.
  const name = m[1]!.replace(/(gesetz|Gesetz|statut|Statut)es\b/g, '$1')
  const fold = (x: string) => x.replace(/\s+/g, ' ').toLowerCase()
  return laws.find((l) => fold(l) === fold(name)) ?? laws.find((l) => fold(name).startsWith(fold(l))) ?? name
}

/**
 * The §§ of the flow. Each § from its centred heading to the next heading,
 * elision note, division or Artikel; filed under the one law the draft
 * amends, or in a package under the law its Artikel names (null where it
 * names none we know — RIS decides then, `compareTgu`).
 */
export function tirolParagraphs(pages: readonly TirolTguPage[], laws: readonly string[]): TguParagraph[] {
  return tirolReading(pages, laws).paragraphs
}

/** `tirolParagraphs`, and how many pages had no gutter and so were not read (26.10.2026). */
function tirolReading(pages: readonly TirolTguPage[], laws: readonly string[]): TguReading {
  const done: Open[] = []
  let law: string | null = laws.length === 1 ? laws[0]! : null
  let open: Open | null = null
  /** After „Artikel II": its title lines, until the first § */
  let articleTitle: string[] | null = null
  /**
   * The division headings since the last § of each side, and whether the
   * draft marks any of them: a changed one goes to the § below it on its
   * side, as Oberösterreich's (`tguParagraphs`, 26.10.2026) — 728/2026
   * renames its 2. to 4. Abschnitt, 723/2026 repeals its 7a. Abschnitt, and
   * neither stood on the page.
   */
  let division: { old: string[]; neu: string[]; marked: boolean } | null = null
  const close = () => {
    if (open) done.push(open)
    open = null
  }
  let dropped = 0
  pages.forEach((page, n) => {
    const cols = pageLines(page, n + 1)
    // No gutter: the page's reading order would be ours. The § running into
    // it, and every § on it, is withheld — and named (26.10.2026): a § that
    // began on such a page was opened nowhere and vanished. Its heading is
    // a run of its own, „§ 4", wherever it stands; what follows on the next
    // page is the last one's, withheld with it.
    if (!cols) {
      dropped++
      if (open) open.bad = true
      const headings = page.runs.filter((r) => PARA_RE.test(r.s.trim())).sort((a, b) => b.y - a.y || a.x - b.x)
      for (const r of headings) {
        close()
        open = { law, number: PARA_RE.exec(r.s.trim())![1]!, from: null, side: 'both', old: [], neu: [], marked: false, bad: true, titled: { old: 0, neu: 0, done: true } }
      }
      return
    }
    for (const lines of [cols.left, cols.right]) {
      const left = Math.min(...lines.map((l) => l.x0))
      for (const line of lines) {
        const centred = line.x0 - left > CENTRED_INDENT
        const raw = line.raw
        // An Artikel's title: its lines up to the first §, division or
        // elision, three at most. Not held to the centre: a long title is
        // wider than its column's indent (728/2026, x 132 in a column from 85).
        if (articleTitle && articleTitle.length < 3 && !PARA_RE.test(raw) && !ELIDED_RE.test(raw) && !DIVISION_RE.test(raw)) {
          articleTitle.push(raw)
          continue
        }
        if (articleTitle) {
          law = lawOfArticle(articleTitle.join(' '), laws)
          articleTitle = null
        }
        // A renumbered heading reads „§ 72 74" whole — 72 struck, 74
        // underlined (723/2026) — so the two readings are asked as well.
        const para = centred ? PARA_RE.exec(raw) ?? (line.marked ? PARA_RE.exec(line.old) ?? PARA_RE.exec(line.neu) : null) : null
        if (para) {
          close()
          let number = para[1]!
          let side: Open['side'] = 'both'
          let bad = line.unsure
          let from: string | null = null
          if (line.marked) {
            const o = PARA_RE.exec(line.old)?.[1]
            const nu = PARA_RE.exec(line.neu)?.[1]
            if (o && nu && o !== nu) {
              // „§ 72 74": the § in force as § 72 is § 74 now
              number = nu
              from = o
            } else if (o && nu) {
              number = o
            } else if (o) {
              number = o
              side = 'old'
            } else if (nu) {
              number = nu
              side = 'neu'
            } else {
              bad = true
            }
          }
          const opened: Open = { law, number, from, side, old: [], neu: [], marked: line.marked, bad, titled: { old: 0, neu: 0, done: false } }
          if (division) {
            for (const s of ['old', 'neu'] as const) {
              if ((side !== 'both' && side !== s) || !division[s].length) continue
              if (division.marked) opened.division = { ...opened.division, [s]: joinLines(division[s]) }
              division[s] = []
            }
            if (!division.old.length && !division.neu.length) division = null
          }
          open = opened
          continue
        }
        const sideDivision = line.marked && (DIVISION_RE.test(line.old.trim()) || DIVISION_RE.test(line.neu.trim()))
        if (centred && (DIVISION_RE.test(raw) || sideDivision)) {
          close()
          division = { old: [...(division?.old ?? []), ...(line.old ? [line.old] : [])], neu: [...(division?.neu ?? []), ...(line.neu ? [line.neu] : [])], marked: !!division?.marked || line.marked }
          continue
        }
        if (ELIDED_RE.test(raw) || (centred && ANNEX_RE.test(raw))) {
          close()
          division = null
          continue
        }
        if (centred && ARTICLE_RE.test(raw)) {
          close()
          division = null
          law = null
          articleTitle = []
          continue
        }
        if (!open) {
          // A division's name, under its designation — wider than the centre's indent where it is long (728/2026).
          if (division && division.old.length + division.neu.length < 12) {
            division = { old: [...division.old, ...(line.old ? [line.old] : [])], neu: [...division.neu, ...(line.neu ? [line.neu] : [])], marked: division.marked || line.marked }
          } else division = null
          continue
        }
        const o: Open = open
        const title = !o.titled.done && centred
        if (!title) o.titled.done = true
        if (line.old) { o.old.push(line.old); if (title) o.titled.old++ }
        if (line.neu) { o.neu.push(line.neu); if (title) o.titled.neu++ }
        o.marked ||= line.marked
        o.bad ||= line.unsure
      }
    }
  })
  close()
  return { paragraphs: pairTwins(done), ...(dropped ? { droppedPages: dropped } : {}) }
}

/**
 * One entry per § and law. A § the draft rewrites whole may stand twice —
 * its struck heading and text, then its underlined heading and text (722/2026
 * § 26) — and is one provision. Any other second entry under the same
 * number is a reading we cannot vouch for: both are withheld.
 */
function pairTwins(entries: readonly Open[]): TguParagraph[] {
  const byKey = new Map<string, Open[]>()
  // A renumbered § is a group of its own: the new § that takes its old
  // number (723/2026: § 72 new, the old § 72 now § 74) is another provision.
  const keyOf = (e: Open) => tguParagraphKey({ law: e.law, number: e.number, from: e.from ?? undefined })
  for (const e of entries) byKey.set(keyOf(e), [...(byKey.get(keyOf(e)) ?? []), e])
  const out: TguParagraph[] = []
  for (const group of byKey.values()) {
    let p: Open | null = group[0]!
    if (group.length === 2) {
      const [a, b] = group as [Open, Open]
      p = a.side === 'old' && !a.neu.length && b.side === 'neu' && !b.old.length
        ? { ...a, side: 'both', neu: b.neu, bad: a.bad || b.bad, marked: true, ...(a.division || b.division ? { division: { ...b.division, ...a.division } } : {}) }
        : null
    } else if (group.length > 2) p = null
    // Withheld, and named as unsure (25.10.2026). Handed on without text
    // and without a reason, it was taken for a new § — shown, with nothing
    // to show, where RIS lacks its number, and where RIS has it refused as
    // „nicht wortgleich", which is not why (728/2026, §§ 73 and 32).
    const moved = group[0]!.from
    const withheld: TguParagraph = { law: group[0]!.law, number: group[0]!.number, ...(moved ? { from: moved } : {}), old: [], neu: [], changed: true, unread: true, because: 'unsure' }
    if (!p || p.bad) {
      out.push(withheld)
      continue
    }
    // A heading struck whole whose text is not, or the other way round: not a reading.
    if ((p.side === 'old' && p.neu.length) || (p.side === 'neu' && p.old.length)) {
      out.push(withheld)
      continue
    }
    out.push({ law: p.law, number: p.number, ...(p.from ? { from: p.from } : {}), ...retitled(p), changed: p.marked || !!p.division, ...(p.division ? { division: p.division } : {}) })
  }
  // A placeholder under a number a § read in full also carries is dropped:
  // the page would name „§ 72" as withheld beside „§ 72" shown.
  const shown = new Set(out.filter((p) => p.old.length || p.neu.length).map(tguParagraphKey))
  return out.filter((p) => p.old.length || p.neu.length || !shown.has(tguParagraphKey(p)))
}

/**
 * A § whose heading the draft changes, adds or drops. The comparison sets
 * the heading aside and compares the text below it (`tguUnits`), so „§ 52
 * Herstellung des gesetzmäßigen Zustandes" → „… nach Abbruch" (723/2026)
 * and a heading added over § 8 (575/2026) came out „unverändert". Where the
 * two headings differ, each goes into the §'s first line of text instead:
 * the change is then in the text compared, at the cost of the printed
 * heading above it.
 */
function retitled(p: Open): { old: string[]; neu: string[] } {
  const glue = (lines: string[], n: number) => (n && lines.length > n ? [lines.slice(0, n + 1).join(' '), ...lines.slice(n + 1)] : lines)
  const same = p.old.slice(0, p.titled.old).join(' ') === p.neu.slice(0, p.titled.neu).join(' ')
  if (same || !p.old.length || !p.neu.length) return { old: p.old, neu: p.neu }
  return { old: glue(p.old, p.titled.old), neu: glue(p.neu, p.titled.neu) }
}

const isTirolPage = (p: AnnexPage | TirolTguPage): p is TirolTguPage => 'runs' in p && 'rules' in p

/**
 * The §§ of the document. Only pages from `tirolTguPages` can be read: the
 * text layer alone (`pagesOf`) has neither the rules nor the colour, and
 * without them a struck and an underlined word read alike — so it yields
 * nothing rather than a guess.
 */
export function tirolTguParagraphs(pages: readonly (AnnexPage | TirolTguPage)[], laws: readonly string[]): TguParagraph[] {
  return tirolTguReading(pages, laws).paragraphs
}

/** `tirolTguParagraphs`, with the pages it did not read (`TguReading`). */
export function tirolTguReading(pages: readonly (AnnexPage | TirolTguPage)[], laws: readonly string[]): TguReading {
  if (!pages.length || !pages.every(isTirolPage)) return { paragraphs: [] }
  return tirolReading(pages, laws)
}
