/**
 * A Land's Textgegenüberstellung, read back into the law in force and the
 * law as the draft would have it (22.10.2026) — „Was ändert der Entwurf?"
 * for a Land's draft, as the Ministerialentwurf's page asks it.
 *
 * PURE MODULE — relative imports only, so vitest runs it directly. The PDF
 * geometry comes from `landTguPdf.ts`, the law in force from `landKons.ts`.
 *
 * Oberösterreich does not print two columns. Its Textgegenüberstellung is
 * the consolidated text in one column, the draft's additions UNDERLINED and
 * its deletions STRUCK THROUGH — both drawn as thin rules, not set in a
 * font, so the text layer alone cannot tell them apart. A rule just below
 * the baseline is an underline, one through the middle of the line a
 * strike. Leave out the underlined characters and the text in force
 * remains; leave out the struck ones and the draft's text remains.
 *
 * Measured over all 73 OÖ Textgegenüberstellungen before it was built
 * (docs/architecture.md §12.45): the text in force read this way stands word
 * for word in RIS's consolidated version at the draft's date for 859 of 923
 * §§ RIS carries, and nearly all the rest is the measurement's own noise; the
 * draft's text contains 3.632 of 3.872 sentences the Begutachtungsentwurf
 * quotes as new wording. What remained were single characters at the edge
 * of a rule — a comma before a struck word with no space between. Placing
 * each character by its glyph's own width rather than by an even share of
 * the run is what moved them (845 → 859).
 */
import type { LawUnit } from '../lawtext/lawUnits'

/** One text run of a page, upright, in PDF user space (y upwards). */
export interface TguItem {
  s: string
  x: number
  y: number
  w: number
  h: number
}

/** A page as the reader needs it: the runs, the thin horizontal rules, and the glyphs drawn, in order. */
export interface TguPage {
  items: TguItem[]
  /** [x0, y0, x1, y1] of every filled rectangle at most 2.5 pt high */
  rules: [number, number, number, number][]
  /** Every glyph the page draws, in drawing order, with its advance width in 1/1000 em */
  glyphs: { u: string; w: number }[]
}

interface Char { c: string; ins: boolean; del: boolean }

export interface TguLine {
  raw: string
  /** The text in force: without the underlined characters */
  old: string
  /** The draft's text: without the struck-through characters */
  neu: string
  marked: boolean
}

/**
 * Where a rule sits relative to the baseline, in font heights. Read off the
 * corpus: underlines lie 0.02–0.45 below it, strikes 0.1–0.65 above.
 */
const UNDERLINE = [-0.45, -0.02] as const
const STRIKE = [0.1, 0.65] as const

/**
 * The x centre of each character of a run.
 *
 * By the glyphs' own widths where the run can be found among the page's
 * glyphs, evenly where not. Even shares put a narrow comma half a letter too
 * far right, and at the edge of a rule that is the other side of it.
 */
function centres(item: TguItem, glyphs: { text: string; widths: number[] }, cursor: { at: number }): number[] {
  const chars = [...item.s]
  const widths: number[] = new Array(chars.length).fill(-1)
  const visible = chars.map((c, k) => [c, k] as const).filter(([c]) => c !== ' ')
  const want = visible.map(([c]) => c).join('')
  if (want) {
    const at = glyphs.text.indexOf(want, cursor.at)
    // Near the cursor only: the same word further down the page is another run.
    if (at >= 0 && at - cursor.at < 400) {
      for (let v = 0; v < visible.length; v++) widths[visible[v]![1]] = glyphs.widths[at + v]!
      cursor.at = at + want.length
    }
  }
  const known = widths.filter((w) => w > 0)
  const average = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 500
  const own = widths.map((w) => (w > 0 ? w : average))
  const total = own.reduce((a, b) => a + b, 0)
  const out: number[] = []
  let acc = 0
  for (const w of own) {
    const share = (w * item.w) / total
    out.push(item.x + acc + share / 2)
    acc += share
  }
  return out
}

/** The lines of one page, top to bottom, each character marked as underlined or struck. */
export function tguLines(page: TguPage): TguLine[] {
  const visible = page.glyphs.filter((g) => g.u.length === 1 && g.u !== ' ')
  const glyphs = { text: visible.map((g) => g.u).join(''), widths: visible.map((g) => g.w) }
  const cursor = { at: 0 }
  // Centres are computed in drawing order — the order the glyphs are in.
  const placed = page.items.filter((it) => it.s.length).map((it) => ({ it, cx: centres(it, glyphs, cursor) }))
  const byLine = new Map<number, typeof placed>()
  for (const p of placed) {
    const key = Math.round(p.it.y / 2) * 2
    byLine.set(key, [...(byLine.get(key) ?? []), p])
  }
  const lines: TguLine[] = []
  for (const [, runs] of [...byLine].sort((a, b) => b[0] - a[0])) {
    runs.sort((a, b) => a.it.x - b.it.x)
    const chars: Char[] = []
    let lastEnd = -1
    for (const { it, cx } of runs) {
      if (lastEnd >= 0 && it.x - lastEnd > 1 && chars.length && chars.at(-1)!.c !== ' ' && !it.s.startsWith(' ')) {
        chars.push({ c: ' ', ins: false, del: false })
      }
      const h = it.h || 10
      const under = (x: number, [lo, hi]: readonly [number, number]) =>
        page.rules.some((r) => r[0] <= x && r[2] >= x && r[1] >= it.y + lo * h && r[1] <= it.y + hi * h)
      ;[...it.s].forEach((c, k) => chars.push({ c, ins: under(cx[k]!, UNDERLINE), del: under(cx[k]!, STRIKE) }))
      lastEnd = it.x + it.w
    }
    const text = (keep: (c: Char) => boolean) => {
      // Where a left-out run held a space, its neighbours stay two words:
      // the document prints an added „der Landes-Personalvertretung" and a
      // struck „des" with nothing between, the change of rule being the gap.
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
      return out.replace(/\s+/g, ' ').trim()
    }
    const raw = text(() => true)
    if (!raw) continue
    lines.push({ raw, old: text((c) => !c.ins), neu: text((c) => !c.del), marked: chars.some((c) => (c.ins || c.del) && c.c.trim() !== '') })
  }
  return lines
}

/** One § of the Textgegenüberstellung. */
export interface TguParagraph {
  /** The law's short title, „Oö. Gemeindeordnung 1990"; null where the document named none we could read */
  law: string | null
  /** „5", „12a" */
  number: string
  old: string[]
  neu: string[]
  changed: boolean
  /**
   * The document changes this § and the reader does not read how (24.10.2026,
   * Kärnten: an instruction below a whole Absatz). No text: it is withheld,
   * as `reason: 'unread'` — or `because` — so the page names it.
   */
  unread?: true
  /**
   * Why, where the reader knows more (25.10.2026): `wording`, Kärnten's
   * instructions below a whole Absatz; `unsure`, a § whose text or marks the
   * reader could not read with certainty (Tirol); `division`, a § of a
   * division the Novelle replaces, inserts or repeals as a whole; `gap`, a
   * law whose instructions the reader did not all find; `annex`, an Anlage
   * or Anhang (26.10.2026).
   */
  because?: 'wording' | 'unsure' | 'division' | 'gap' | 'annex'
}

/**
 * A unit's id as the page names it: „§5" for a §, the label itself for an
 * article or an annex — „Art. 46a", „Anlage 2" (26.10.2026). `number` is
 * the § number, or such a label.
 */
export function paraId(number: string): string {
  return /^\d/.test(number) ? `§${number}` : number
}

/**
 * What a Land's reader returns beside the §§ (26.10.2026): instructions
 * that reach §§ they do not name — „Im V. Abschnitt wird jeweils …", „Im
 * ganzen Gesetz …" — said per law, and pages it could not read, said as the
 * Bund's annex says them (`annexDroppedPagesNote`).
 */
export interface TguReading {
  paragraphs: TguParagraph[]
  reaches?: { law: string | null; instruction: string }[]
  droppedPages?: number
}

/**
 * „§ 5" on a line of its own — also with the opening quote a new § is
 * printed with where the document copies it from the draft: „„§ 65"
 * (Oberösterreich 2025-16106), whose §§ were lost whole until 26.10.2026.
 */
const PARA_RE = /^[„"“]?\s*§\s*(\d+[a-z]*)\.?$/
/**
 * „Artikel 46a": a unit of a law organised in Artikel, the Oö. L-VG
 * (2025-16094), which RIS files as „Art. 46a". Arabic numbers only: a
 * Roman „Artikel II" is a draft's own division of a package.
 */
const ARTICLE_RE = /^[„"“]?\s*Artikel\s+(\d+[a-z]*)\.?$/
/**
 * „§ 10§ 14": a § the draft renumbers, the new number underlined, the old
 * struck — 2026-16120 renumbers §§ 13 to 17 to §§ 9 to 13, 2021-16019
 * §§ 57a to 57l to §§ 58 to 69. Until 26.10.2026 no such line opened a §,
 * and every renumbered § ran into the one above it.
 */
const RENUMBERED_RE = /^§\s*(\d+[a-z]*)\.?\s*§\s*(\d+[a-z]*)\.?$/
/**
 * „Anlage 1" on a line of its own: an annex, which closes the § above it —
 * the reader had run 2026-16111's struck Anlage 1 into its § 88. A contents
 * entry carries its title in brackets on the same line, „Anlage 1
 * (CE-Konformitätskennzeichnung)", and opens nothing.
 */
const ANNEX_RE = /^[„"“]?\s*((?:Anlage|Anhang)\s+(?:\d+|[IVXL]+)[a-z]?)$/
/** A line that ends mid-sentence: in a word that wants the next one, or a comma. */
const RUNS_ON_RE = /(?:^|\s)(?:bis|und|oder|sowie|bzw\.|des|der|dem|den|die|das|im|in|zum|zur|vom|von|für|mit|nach|gemäß|laut|siehe|über|auf|aus|bei|an|gegen|ohne)$|,$/
/**
 * „2. Hauptstück", „III. Teil", „7b. Abschnitt": the next division's
 * heading, which closes the § above it. Only where the word ends there, at a
 * space or a colon: „19. Teil-Aktionsplan: Plan zur …" is the 19th
 * definition of a § (2026-16124), and „IV. Teil, 4. Hauptstück, …" a
 * reference in one (2021-16018); each closed its § mid-text and lost the
 * rest of it until 26.10.2026.
 */
const DIVISION_RE = /^(?:\d+[a-z]?|[IVXL]+)\.\s+(?:Hauptstück|Abschnitt|Teil|Unterabschnitt)(?=$|[\s:])/i
/** The law's long title, which the short title in brackets follows within a few lines. */
const LONG_TITLE_RE = /^(?:Landes)?(?:[Gg]esetz|Verordnung)\b/
/** „(Oö. Bautechnikgesetz 2013 - Oö. BauTG 2013)": the short title, and the abbreviation after the dash. */
const SHORT_TITLE_RE = /\(([^()]*?)(?:\s+-\s+[^()]*)?\)\s*$/
/** „Oö. Gemeindeordnung 1990 (Oö. GemO 1990)": the short title standing alone, its abbreviation in brackets. */
const BARE_TITLE_RE = /^((?:Oö\.\s|Statut\s)[^()]*?)\s+\(([^()]{2,30})\)$/
const NOISE_RE = /^(?:Seite \d+(?: von \d+)?|\d+|(?:Sub)?[Bb]eilage zu\b.*)$/

/**
 * The units a line opens, or null: a §, an Artikel, an annex — or, for a
 * renumbered §, two. A renumbered § is read § by number, as the comparison
 * reads every §: what stood under the old number is its text in force, and
 * what will stand under the new one its new text. So 16120's § 9 compares
 * the struck § 9 with the § 13 that takes its number, and § 13 the § 13 in
 * force with the § 17 that becomes it (`mergeParagraphs` joins the halves).
 * Where the marks do not say which number is which, both are named as read
 * with uncertainty (`because: 'unsure'`).
 */
function opened(line: TguLine, law: string | null, prev: string): { old: TguParagraph; neu: TguParagraph } | null {
  // A quoted heading after a line that ends in a colon is a § the text
  // quotes, not one of its own: „… mit der Maßgabe aufrecht, dass 1. § 16
  // lautet: „§ 16 Geheimhaltung …"" in § 5 of the Oö.
  // Gemeindesanitätsdienstgesetz 2006 (2025-16094).
  if (/^[„"“]/.test(line.raw) && /:$/.test(prev)) return null
  const unit = (number: string, extra: Partial<TguParagraph> = {}): TguParagraph => ({ law, number, old: [], neu: [], changed: false, ...extra })
  const para = PARA_RE.exec(line.raw)
  if (para) {
    const p = unit(para[1]!)
    return { old: p, neu: p }
  }
  // An article or an annex opens only where the line before does not run
  // on into it: „… ergibt sich aus der" / „Anlage 1" is a sentence the
  // column wrapped, „… von Kleinfeuerstätten" / „Anlage 2" the title of the
  // annex above (2025-16103).
  const ended = !RUNS_ON_RE.test(prev)
  const article = ended ? ARTICLE_RE.exec(line.raw) : null
  if (article) {
    const p = unit(`Art. ${article[1]!}`)
    return { old: p, neu: p }
  }
  const annex = ended ? ANNEX_RE.exec(line.raw) : null
  if (annex) {
    const p = unit(annex[1]!.replace(/\s+/g, ' '), { unread: true, because: 'annex' })
    return { old: p, neu: p }
  }
  const two = RENUMBERED_RE.exec(line.raw)
  if (!two) return null
  const [a, b] = [two[1]!, two[2]!]
  if (a === b && !line.marked) {
    const p = unit(a)
    return { old: p, neu: p }
  }
  const was = PARA_RE.exec(line.old)?.[1]
  const will = PARA_RE.exec(line.neu)?.[1]
  // The number the old text keeps and the one the new text shows; where only
  // one side reads as a single number, the other number on the line is the
  // other side's.
  const from = was ?? (will === a ? b : will === b ? a : undefined)
  const to = will ?? (was === a ? b : was === b ? a : undefined)
  if (!from || !to || from === to) {
    const p = unit(a, { changed: true, unread: true, because: 'unsure' })
    const q = unit(b, { changed: true, unread: true, because: 'unsure' })
    return { old: p, neu: q }
  }
  return { old: unit(from, { changed: true }), neu: unit(to, { changed: true }) }
}

/**
 * The §§ of the document, each under the law whose title came last.
 *
 * A package amends several laws in one document, and § 5 of the second is a
 * different provision from § 5 of the first — the title is what tells them
 * apart, and what the law in force is looked up by.
 */
export function tguParagraphs(lines: readonly TguLine[]): TguParagraph[] {
  const out: TguParagraph[] = []
  let law: string | null = null
  let titleAt = -10
  /** Where the open unit's text in force goes and where its new text goes: one §, but two for a renumbered one (`opened`). */
  let open: { old: TguParagraph; neu: TguParagraph } | null = null
  /** The line each of the open unit's texts came from, to take a law's title back out of it */
  let openAt: { old: number[]; neu: number[] } = { old: [], neu: [] }
  /** Units printed with an opening quote, whose closing quote is the draft's and not the text's */
  const quoted = new Set<TguParagraph>()
  let prev = ''
  const retractFrom = (at: number) => {
    if (!open) return
    while (openAt.old.length && openAt.old.at(-1)! >= at) { openAt.old.pop(); open.old.old.pop() }
    while (openAt.neu.length && openAt.neu.at(-1)! >= at) { openAt.neu.pop(); open.neu.neu.pop() }
  }
  lines.forEach((line, i) => {
    const raw = line.raw
    if (NOISE_RE.test(raw)) return
    const unit = opened(line, law, prev)
    if (unit) {
      open = unit
      openAt = { old: [], neu: [] }
      out.push(unit.old)
      if (unit.neu !== unit.old) out.push(unit.neu)
      if (line.marked) { unit.old.changed = true; unit.neu.changed = true }
      if (/^[„"“]/.test(raw)) quoted.add(unit.neu)
      prev = raw
      return
    }
    if (LONG_TITLE_RE.test(raw)) titleAt = i
    const joined = /\([^()]*$/.test(prev) ? `${prev} ${raw}` : raw
    const bare = BARE_TITLE_RE.exec(raw)
    const short = SHORT_TITLE_RE.exec(joined)
    if (bare && /gesetz|ordnung|Statut/i.test(bare[1]!)) {
      law = bare[1]!.replace(/\s+/g, ' ').trim()
      open = null
    } else if (short && i - titleAt <= 3 && /gesetz|ordnung/i.test(short[1]!)) {
      law = short[1]!.replace(/\s+/g, ' ').trim()
      // The long title above it was read as the end of the last § of the law before.
      retractFrom(titleAt)
      open = null
    } else if (DIVISION_RE.test(raw) || /^Inhaltsverzeichnis$/i.test(raw)) {
      open = null
    } else if (open) {
      const { old, neu }: { old: TguParagraph; neu: TguParagraph } = open
      if (line.old) { old.old.push(line.old); openAt.old.push(i) }
      if (line.neu) { neu.neu.push(line.neu); openAt.neu.push(i) }
      if (line.marked) { old.changed = true; neu.changed = true }
    }
    prev = raw
  })
  for (const p of quoted) {
    const last = p.neu.length - 1
    if (last >= 0) p.neu[last] = p.neu[last]!.replace(/\s*[“"]\s*$/, '')
  }
  // An annex the document prints and does not change is not one it changes.
  return out.filter((p) => p.because !== 'annex' || p.changed)
}

/**
 * One entry per § of each law. A § the draft rewrites whole stands twice in
 * the document — the text in force struck through, then the new text
 * underlined, both under „§ 2" — and is one provision: 101 of the 107
 * wholly underlined §§ whose number RIS already knows have such a twin
 * (Oö. Leichenbestattungsgesetz 1985, 2023-16043).
 */
export function mergeParagraphs(paragraphs: readonly TguParagraph[]): TguParagraph[] {
  const byKey = new Map<string, TguParagraph>()
  for (const p of paragraphs) {
    const key = `${p.law ?? ''}|${p.number}`
    const seen = byKey.get(key)
    if (!seen) byKey.set(key, { ...p, old: [...p.old], neu: [...p.neu] })
    else {
      seen.old.push(...p.old)
      seen.neu.push(...p.neu)
      seen.changed ||= p.changed
    }
  }
  return [...byKey.values()]
}

/**
 * Lines into running text. A line ending in a hyphen continues the word on
 * the next — „Gemeinde-" „Bezügegesetzes" — unless the next one starts a word
 * of its own: „Kinder-" „und Jugendhilfe".
 */
export function joinLines(lines: readonly string[]): string {
  let out = ''
  for (const line of lines) {
    if (!out) out = line
    else if (/\p{L}-$/u.test(out) && !/^(?:und|oder|bzw\.|sowie)\b/.test(line)) out += line
    else out += ` ${line}`
  }
  return out.trim()
}

/** „Urkunden" above „(1) Urkunden über …": a § heading is short and ends without a full stop. */
function splitHeading(text: string[]): { heading: string | null; body: string[] } {
  const first = text[0]
  if (first && first.length <= 120 && !/^\(\d/.test(first) && !/[.:;,]$/.test(first) && text.length > 1) {
    return { heading: first, body: text.slice(1) }
  }
  return { heading: null, body: text }
}

function unitOf(p: TguParagraph, lines: string[], keepHeading = false): LawUnit | null {
  if (!lines.length) return null
  const { heading, body } = keepHeading ? { heading: null, body: lines } : splitHeading(lines)
  const text = joinLines(body.length ? body : lines)
  return {
    article: p.law,
    articleNumber: null,
    id: paraId(p.number),
    heading,
    quotedHeadings: [],
    text,
    blocks: [{ kind: 'abs', cls: 'abs', text, gld: /^\d/.test(p.number) ? `§ ${p.number}.` : p.number }],
    stammnorm: null,
  }
}

/** The heading every unit of one § carries into `diffLawUnits`, so that its first rule pairs them (`tguUnits`). */
const SAME_PARA = '\u0000tgu-para '

/**
 * The two texts as units for `diffLawUnits`: the law in force, and the law
 * as the draft would have it. The engine pairs a § by heading, then by id
 * only where the two look alike — a guard against renumbering. Here the
 * document itself says both sides are one §, so each side carries the same
 * marker heading and the engine's first rule pairs them however little
 * they share („(1) bis (6) …" against „… (7) Neu"); `withHeadings` puts the
 * printed headings back.
 */
export function tguUnits(paragraphs: readonly TguParagraph[]): { from: LawUnit[]; to: LawUnit[] } {
  const from: LawUnit[] = []
  const to: LawUnit[] = []
  for (const p of paragraphs) {
    // A heading the draft changes is a change (24.10.2026): set aside on
    // both sides, „§ 52 Herstellung des gesetzmäßigen Zustandes" → „… nach
    // Abbruch" (Tirol 723/2026) read as „unverändert". Where the two printed
    // headings differ, they stay in the text that is compared.
    const retitled = p.old.length > 0 && p.neu.length > 0 && splitHeading(p.old).heading !== splitHeading(p.neu).heading
    const a = unitOf(p, p.old, retitled)
    const b = unitOf(p, p.neu, retitled)
    const mark = `${SAME_PARA}${p.law ?? ''} ${p.number}`
    if (a) from.push({ ...a, heading: mark })
    if (b) to.push({ ...b, heading: mark })
  }
  return { from, to }
}

/** The printed heading of each §, back on the compared units (`tguUnits`). */
export function withHeadings<U extends { heading: string | null; article: string | null; id: string }>(units: readonly U[], paragraphs: readonly TguParagraph[]): U[] {
  const printed = new Map<string, string | null>(paragraphs.map((p) => {
    const lines = p.neu.length ? p.neu : p.old
    return [`${p.law ?? ''}|${paraId(p.number)}`, unitOf(p, lines)?.heading ?? null] as const
  }))
  return units.map((u) => (u.heading?.startsWith(SAME_PARA) ? { ...u, heading: printed.get(`${u.article ?? ''}|${u.id}`) ?? null } : u))
}

/** Words, compared as RIS and the PDF both print them: no markup, no quotes, no hyphens, no § designations, no notes of RIS's own. */
export function comparableWords(text: string): string[] {
  return text
    .replace(/<[^>]+>/g, ' ')
    // The § designation is where the two print differently — RIS between
    // heading and „(1)", the document on a line of its own — and the § is
    // already fixed by looking it up by number.
    .replace(/§\s*\d+[a-z]*\.?/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/[„“”"»«‚‘]/g, '')
    .toLowerCase()
    .replace(/\(anm\.?:[^)]*\)/g, ' ')
    .replace(/-\s*/g, '')
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * How much of a § as the Textgegenüberstellung prints it stands, in order,
 * in RIS's text of the same § — the share of its words in the longest common
 * sequence, 0 to 1.
 *
 * Anchored at the § heading's first words, so RIS's document header does not
 * count, and cut where RIS's own trailer begins („Im RIS seit", „Zuletzt
 * aktualisiert am").
 */
export function shareInRis(text: string, risText: string): number {
  // An article's own designation stands where a §'s does, between heading
  // and text — „Landtag Art. 19 (1) …" (26.10.2026) — and is taken out, on
  // both sides, only where the heading is not found with it: „nach Art 5 und
  // 8" in a §'s text stays as each prints it (Salzburg 20708, § 13, which RIS
  // writes „Art. 5").
  const ARTICLE = /\bArt(?:ikel|\.)\s*\d+[a-z]*\.?/g
  return lcsShare(text, risText) ?? lcsShare(text.replace(ARTICLE, ' '), risText.replace(ARTICLE, ' ')) ?? 0
}

/** `shareInRis` on the words as they stand; null where RIS's text has no place the §'s first words stand at. */
function lcsShare(text: string, risText: string): number | null {
  const a = comparableWords(text)
  if (!a.length) return 0
  let b = comparableWords(risText)
  const trailer = b.findIndex((w, i) => (w === 'im' && b[i + 1] === 'ris' && b[i + 2] === 'seit') || (w === 'zuletzt' && b[i + 1] === 'aktualisiert'))
  if (trailer > 0) b = b.slice(0, trailer)
  const head = a.slice(0, 4).join(' ')
  const at = b.findIndex((_, i) => b.slice(i, i + 4).join(' ') === head)
  if (at < 0) return null
  b = b.slice(at, at + Math.round(a.length * 1.15) + 4)
  // One row at a time: a long § is thousands of words on each side.
  let prevRow = new Uint16Array(b.length + 1)
  let row = new Uint16Array(b.length + 1)
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      row[j] = a[i - 1] === b[j - 1] ? prevRow[j - 1]! + 1 : Math.max(prevRow[j]!, row[j - 1]!)
    }
    ;[prevRow, row] = [row, prevRow]
  }
  return prevRow[b.length]! / a.length
}

/** At or above this share a § counts as the law in force (§12.45: the corpus parts at 0.98). */
export const STANDS_IN_RIS = 0.98

/**
 * „(1) bis (7) …", „2. …": what a two-column Textgegenüberstellung leaves
 * out on purpose. The text between two such marks is the ressort's copy of
 * the law in force; the marks themselves are not.
 */
const ELISION_RE = /(?:\(?[\p{L}\p{N}]+[.)]?\s+bis\s+)?\(?[\p{L}\p{N}]+[.)]?\s*(?:…|\.\.\.)/gu

/** A stretch shorter than this proves nothing either way. */
const MIN_STRETCH_WORDS = 6

/**
 * Does the text in force, as the document prints it, stand in RIS? Every
 * stretch between two elisions must (`shareInRis` ≥ `STANDS_IN_RIS`), and at
 * least one stretch must be long enough to say so. Without elisions — the
 * Oberösterreich format — this is `shareInRis` on the whole.
 */
/**
 * A phrase to find a § by in RIS's full text: the first eight consecutive
 * plain words of the longest stretch between elisions, past its first two
 * (the heading) — no numbers, § marks or line-break hyphens, which the two
 * print differently. Null where no such run exists.
 */
export function searchPhrase(text: string): string | null {
  const stretch = text.split(ELISION_RE).map((s) => s.trim()).sort((a, b) => b.length - a.length)[0] ?? ''
  const tokens = stretch.split(/\s+/)
  const plain = (t: string) => /^[„“"]?\p{L}[\p{L}-]*[,.;:“”"]?$/u.test(t) && !/-$/.test(t)
  for (let i = 2; i + 8 <= tokens.length; i++) {
    const window = tokens.slice(i, i + 8)
    if (window.every(plain)) return window.map((t) => t.replace(/[„“”",.;:]/g, '')).join(' ')
  }
  return null
}

/** Is the text in force, as printed, nothing but elisions — „(1) bis (4) …"? Then there is no wording to check. */
export function onlyElided(text: string): boolean {
  return /…|\.\.\./.test(text) && !text.split(ELISION_RE).some((s) => s.trim().split(/\s+/).length >= MIN_STRETCH_WORDS)
}

export function standsInRis(text: string, risText: string): boolean {
  if (!/…|\.\.\./.test(text)) return shareInRis(text, risText) >= STANDS_IN_RIS
  const stretches = text.split(ELISION_RE).map((s) => s.trim()).filter((s) => s.split(/\s+/).length >= MIN_STRETCH_WORDS)
  return stretches.length > 0 && stretches.every((s) => shareInRis(s, risText) >= STANDS_IN_RIS)
}

/** One paired row of a two-column Textgegenüberstellung, as the federal reader returns it (`annex/annexPdf.ts`). */
export interface ColumnRow {
  kind: 'article' | 'pair'
  law: string | null
  /** The row's heading, where the reader found one — in Salzburg's packages also the law's name. */
  heading?: string | null
  para: string | null
  current: string
  proposed: string
  changed: boolean
}

/**
 * A division heading the reader left at the end of the § before it —
 * „… darzulegen. 6. Teil Raumordnungs-Aufsicht" (Salzburg 33616, § 16a,
 * 23.10.2026): the next part's name, not the §'s text. Only after a
 * sentence's end and with no sentence after it, so a reference „… nach dem
 * 6. Teil." stays.
 */
const TRAILING_DIVISION_RE = /(?<=[.;:])\s+(?:\d+|[IVXL]+)\.\s+(?:Teil|Abschnitt|Hauptstück|Unterabschnitt)\s+\p{Lu}[^.;:]*$/u

/** A division's designation inside a heading line: „6. Teil", „5. Abschnitt". */
const DIVISION_MARK_RE = /(?:^|\s)(?:\d+[a-z]?|[IVXL]+)\.\s*(?:Teil|Abschnitt|Hauptstück|Unterabschnitt)\b/gu

/**
 * A § from the last division heading above it on.
 *
 * Since the federal reader hands a division heading to the § below it whole
 * (`divisionStart` in `annex/annexPdf.ts`, 25.10.2026), a § whose predecessors
 * the document leaves out gets the headings of every division in between:
 * „6. Teil Raumordnungs-Aufsicht 5. Abschnitt Schlussbestimmungen
 * Umsetzungshinweis" over § 80 (Salzburg 33616). RIS prints over a § only the
 * divisions that open there, and the head of the old text is what
 * `shareInRis` anchors on, so the earlier ones would cost the § its law.
 */
function fromLastDivision(text: string): string {
  const designation = /§\s*\d+[a-z]*\./.exec(text)?.index ?? -1
  if (designation <= 0) return text
  const marks = [...text.slice(0, designation).matchAll(DIVISION_MARK_RE)]
  return marks.length > 1 ? text.slice(marks.at(-1)!.index).trim() : text
}

/** „Anlage 2", „Anhang I", „Artikel 16", „Art. 5": a row the federal reader opened on something other than a §. */
const OTHER_PARA_RE = /^(?:(?:Anlage|Anhang)\s+[\dIVXL]+[a-z]?|Art(?:ikel|\.)\s*(\d+[a-z]*))\.?$/
/**
 * What follows a designation the reader took for a unit of its own where
 * the document cites it mid-sentence: „Anhang I Teil 2 und 3 der
 * Verordnung (EG) …", „Artikel 16 Absatz 1 der Richtlinie …" (Salzburg
 * 18121), „… ergeben sich aus der Anlage 2. Die Beurteilung …" (34574).
 * The row then holds the rest of the § above it, cut off.
 */
const CITED_TAIL_RE = /^\s*(?:Abs(?:\.|atz)|Satz|Unterabsatz|Z\s|Ziffer|lit\.|Teil\s+\d+\s+(?:und|bis|der|des)\b|[,;)]|\.\s+\p{Lu}|(?!zu\b)[a-zäöüß])/u

/**
 * One column of such a row: cited — a cut-off piece of a § — or the unit
 * itself, from its designation on: what the reader carried in front of it
 * („(1) bis (6) Anlage 2") is the end of the unit above, not the annex's.
 */
function otherSide(text: string, designation: string): { cited: boolean; text: string } | null {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return null
  // „Anlage 1", not the start of „Anlage 10"
  const at = new RegExp(`${designation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\da-z])`).exec(t)?.index ?? -1
  if (at < 0 || CITED_TAIL_RE.test(t.slice(at + designation.length))) return { cited: true, text: t }
  return { cited: false, text: t.slice(at) }
}

/**
 * The rows of a two-column Textgegenüberstellung as §§ (Wien, 22.10.2026):
 * the rows of one § joined, each column with the § heading on a line of its
 * own — „Reinhaltung öffentlicher Flächen § 2. (1) bis (7) …" becomes the
 * heading and „(1) bis (7) …".
 *
 * A row the reader opened on an annex or an article (26.10.2026) was
 * skipped until then — Salzburg 23522's new salary table among them, 12
 * changed rows in 9 drafts. Now an annex whose two columns differ is named
 * (`because: 'annex'`); an article is read as a unit, „Art. 5"; and a row
 * that is a cut-off piece of the § above it names that § as read with
 * uncertainty, since its text in either column may lack the piece.
 */
export function columnParagraphs(rows: readonly ColumnRow[], laws: readonly string[]): TguParagraph[] {
  const out = new Map<string, TguParagraph>()
  // One law: every § is its. Several: a row whose heading begins with one of
  // their names opens it (Salzburg prints the law's name above its first §),
  // and where no row says, the RIS check decides (`landTguService`).
  let current: string | null = laws.length === 1 ? laws[0]! : null
  /** The § the row before was part of — the right column's previous unit, in whose order the reader returns its rows */
  let previous: TguParagraph | null = null
  for (const r of rows) {
    if (r.kind !== 'pair' || !r.para) {
      previous = null
      continue
    }
    const named = laws.find((l) => r.heading?.startsWith(l) || r.heading?.startsWith(l.replace(/^Salzburger /, '')))
    if (named) current = named
    const law = r.law ?? current
    const number = /§\s*(\d+[a-z]*)/.exec(r.para)?.[1]
    if (!number) {
      const other = OTHER_PARA_RE.exec(r.para.trim())
      if (other) {
        const designation = r.para.trim().replace(/\.$/, '')
        const sides = [otherSide(r.current, designation), otherSide(r.proposed, designation)]
        if (sides.some((s) => s?.cited) && previous) {
          previous.unread = true
          previous.because = 'unsure'
        }
        const [was, will] = sides.map((s) => (s && !s.cited ? s.text : ''))
        if (was !== will) {
          const article = other[1]
          const id = article ? `Art. ${article}` : designation.replace(/\s+/g, ' ')
          const key = `${law ?? ''}|${id}`
          const p = out.get(key) ?? { law, number: id, old: [], neu: [], changed: false, ...(article ? {} : { unread: true as const, because: 'annex' as const }) }
          const body = (text: string) => text.slice(designation.length).trim()
          if (was && body(was)) p.old.push(body(was))
          if (will && body(will)) p.neu.push(body(will))
          p.changed = true
          out.set(key, p)
        }
      }
      previous = null
      continue
    }
    const key = `${law ?? ''}|${number}`
    const p = out.get(key) ?? { law, number, old: [], neu: [], changed: false }
    const lines = (text: string) => {
      const m = /^(.{1,120}?)\s*§\s*\d+[a-z]*\.\s*/.exec(text)
      if (m) return [m[1]!.trim(), text.slice(m[0].length)].filter(Boolean)
      return [text.replace(/^§\s*\d+[a-z]*\.\s*/, '')].filter(Boolean)
    }
    const inForce = fromLastDivision(r.current.trim().replace(TRAILING_DIVISION_RE, ''))
    const proposed = fromLastDivision(r.proposed.trim().replace(TRAILING_DIVISION_RE, ''))
    if (inForce) p.old.push(...lines(inForce))
    if (proposed) p.neu.push(...lines(proposed))
    p.changed ||= r.changed
    out.set(key, p)
    previous = p
  }
  return [...out.values()]
}

/** „Salzburger Schulorganisations-Ausführungsgesetz 1995 – SchuOG 1995" → the name without its abbreviation. */
export function lawName(name: string): string {
  return name.replace(/\s+[–-]\s+[\p{L}.\s-]*\d*\s*$/u, '').replace(/\s*\([^)]*\)\s*$/, '').trim()
}

/**
 * „ - K-JG", „-K-FG", „ – K-LGlBG 2022", „, K-LPG": an abbreviation after a
 * dash or a comma, two capitals at least. The comma is Kärnten's too —
 * „Kärntner Landes-Pflanzenschutzmittelgesetz, K-LPG" (25.10.2026).
 */
const ABBREVIATION_RE = /\s*[,–-]\s*([\p{Lu}][\p{L}.\d-]{0,15})(?:\s+\d{4})?$/u

function withoutAbbreviation(name: string): string {
  const abbreviation = ABBREVIATION_RE.exec(name)
  return abbreviation && (abbreviation[1]!.match(/\p{Lu}/gu) ?? []).length >= 2 ? name.slice(0, abbreviation.index).trim() : name
}

/**
 * A short title as a key for telling whether RIS and a draft name ONE law
 * (`lawInForce`): without RIS's abbreviation — „Kärntner Jagdgesetz 2000 -
 * K-JG" is the „Kärntner Jagdgesetz 2000" — and in the drafts' word order —
 * „Bauordnung 2022, Tiroler". Nothing more: unlike `bareLawName`, a title
 * that goes on after its dash in words stays another law, „Kärntner
 * Jagdgesetz 2000 - Durchführungsverordnung".
 */
export function shortTitleKey(name: string): string {
  return withoutAbbreviation(name.replace(/\s+/g, ' ').trim())
    .replace(/^(.+),\s*(Tiroler|Kärntner|Salzburger|Wiener|Oö\.)$/u, '$2 $1')
    .toLowerCase()
}

/**
 * A law's name as a key, the forms RIS and the drafts use folded into one
 * (lower case):
 *  - without its abbreviation — „Kärntner Fischereigesetz-K-FG", „… 2000 -
 *    K-JG", „Kärntner Bauvorschriften- K-BV";
 *  - in the drafts' word order where RIS turns it round — „Bauordnung 2022,
 *    Tiroler" (Tirol, 24.10.2026), „Gemeinde-Investitionsfonds, Gesetz über
 *    den";
 *  - without „Gesetz über …" in front — „Gesetz über die Geschäftsordnung
 *    des Kärntner Landtages" is the „Geschäftsordnung des Kärntner Landtages"
 *    RIS names.
 */
export function bareLawName(name: string): string {
  let n = withoutAbbreviation(lawName(name).replace(/\s+/g, ' ').trim())
  n = n.replace(/^(.+),\s*(Tiroler|Kärntner|Salzburger|Wiener|Oö\.)$/u, '$2 $1')
  n = n.replace(/^(.+),\s*Gesetz(?:\s+(?:über|zur|zum)(?:\s+(?:den|die|das|dem))?)?$/u, '$1')
  n = n.replace(/^Gesetz\s+(?:über|zur|zum)(?:\s+(?:den|die|das|dem))?\s+/u, '')
  return n.toLowerCase()
}

/**
 * The laws a draft amends, from its title: „Gesetz, mit dem das Wiener
 * Reinhaltegesetz geändert wird" → one; „…, mit dem das Landesbeamten-
 * Pensionsgesetz, das Salzburger Objektivierungsgesetz 2017 und das …
 * geändert werden" → each.
 */
export function amendedLawsOf(title: string): string[] {
  const m = /mit de[rm] ((?:das|die|der) .+?) geändert (?:wird|werden)/.exec(title)
  if (!m) return []
  return m[1]!.split(/,\s*(?=(?:das|die|der)\s)|\s+und\s+(?=(?:das|die|der)\s)/).map((x) => lawName(x.replace(/^(?:das|die|der)\s+/, ''))).filter(Boolean)
}

/** The one law a draft amends; null for a package. */
export function amendedLawOf(title: string): string | null {
  const laws = amendedLawsOf(title)
  return laws.length === 1 ? laws[0]! : null
}

/**
 * Does the draft itself delete this §? A two-column reading that finds the
 * right column empty is shown as „entfallen" only when the draft says so —
 * an empty column may as well be one the reader did not see.
 */
export function draftDeletes(draftText: string, number: string): boolean {
  const t = draftText.replace(/\s+/g, ' ')
  // An article, „Art. 37" (26.10.2026): its own designation, not a §'s.
  const article = /^Art\.\s*(.+)$/.exec(number)
  const n = (article ? article[1]! : number).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const one = article ? 'Art(?:ikel|\\.)\\s*' : '§\\s*'
  const several = article ? 'Art(?:ikel|\\.)' : '§§'
  return new RegExp(`${one}${n}(?![a-z0-9])[^.;:„"]{0,160}?(?:entf[äa]ll|aufgehoben)`).test(t) ||
    new RegExp(`${several}[^.;:„"]{0,120}?\\b${n}(?![a-z0-9])[^.;:„"]{0,120}?(?:entfallen|aufgehoben)`).test(t)
}
