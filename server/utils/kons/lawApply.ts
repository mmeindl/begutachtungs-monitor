/**
 * Applies Novellierungsanordnungen to the standing law (docs/architecture.md §12.12).
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * `kons/novao.ts` reads an instruction, `lawtext/konsTree.ts` holds the law
 * it acts on, and this module performs the act. It never improvises:
 *
 * 1. **A phrase operation must match exactly once** in its addressed scope.
 *    Zero matches means the address or the quoted text is wrong; several
 *    means the instruction is ambiguous without a human. Both are refused.
 * 2. **A target must exist.** Appending to a missing § silently invents law.
 * 3. **A created id must not exist yet**, or an insert would shadow a real
 *    paragraph.
 *
 * Every refusal comes back with a reason, and a paragraph that carries even
 * one refused operation must be shown as instructions, not as text — the
 * caller enforces that, `unresolved` reports it.
 */
import { childById, lawTextNodes, makeNode, plainText, uniqueChild, type LawNode, type NodeLevel } from '../lawtext/konsTree'
import type { LawUnit } from '../lawtext/lawUnits'
import { normalizeText } from '../lawtext/normalize'
import { continuesToc, expandRange, isTocInstruction, namedParagraphs, opAddress, parseInstruction, tocSequence, type NovaoAddress, type NovaoOp } from './novao'
import { bareParaId, isDivision, isSchedule } from '../text/designation'
import { byParagraphOrder } from './konsGate'

export interface StandingLaw {
  /** Paragraphs in printed order; insert and append change this list */
  paragraphs: LawNode[]
}

/** An instruction together with the text it installs, if any. */
export interface Instruction {
  op: NovaoOp
  /** The quoted new text of the draft, already split into blocks */
  payload: LawNode[]
  /** For the report: the instruction line as printed */
  line: string
}

export interface ApplyResult {
  line: string
  kind: NovaoOp['kind']
  applied: boolean
  reason: string | null
  /** The paragraph the instruction touched, e.g. "§ 5" */
  para: string | null
}

/** One unit that changed its designation: "§ 8" became "§ 15". */
export interface Renaming {
  level: NodeLevel
  /** The § the unit sits in; equals `to` for a § itself */
  para: string
  from: string
  to: string
}

export interface ApplyReport {
  law: StandingLaw
  results: ApplyResult[]
  /** Paragraphs with at least one refused instruction — never publishable as text */
  unresolved: Set<string>
  /**
   * Every renumbering carried out, in order. A caller that pairs the result
   * with the standing law by id needs this: after "die §§ 8 bis 13 erhalten
   * die Paragraphenbezeichnungen § 15 bis § 20", the § 15 of the result is
   * the old § 8, and comparing it with the old § 15 scores a correct run as
   * a divergence (IVS-Gesetz, 2026-09-09).
   */
  renamed: Renaming[]
}

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

const PARA_LINE = /^§\s*(\d+[a-z]*)\.\s*/
const ABS_LINE = /^\((\d+[a-z]*)\)\s*/
const Z_LINE = /^(\d+[a-z]*)\.\s+/
const LIT_LINE = /^([a-z]{1,2})\)\s+/

/**
 * One printed line of the quoted new text. A heading line is marked as such
 * by the block it came from (`ueberschrift typ="para"`), because it cannot
 * be told from text by looking at it: "§ 15. Dauer der Verleihung." is a
 * heading with an inline § marker, "§ 30. Mit der Vollziehung …" is text.
 */
export type PayloadLine = string | { text: string; heading: boolean }

function lineText(l: PayloadLine): string {
  return typeof l === 'string' ? l : l.text
}

/**
 * The quoted text of an instruction, as printed lines → nodes. The draft
 * prints its new text with the same markers the law uses, which is what
 * makes an inserted Absatz addressable the moment it lands.
 */
export function parsePayload(lines: readonly PayloadLine[]): LawNode[] {
  const out: LawNode[] = []
  let para: LawNode | null = null
  let abs: LawNode | null = null
  let z: LawNode | null = null
  /** "§ 5 lautet samt Überschrift:" prints the new heading on its own line, above the §. */
  let pendingHeading: string | null = null

  /**
   * A heading followed by "(1) …" without a § line of its own — the § symbol
   * sits inside the heading ("§ 15. Dauer der Verleihung.") or nowhere. The
   * heading used to be dropped at the end because `out` was not empty, so
   * "§ 15 lautet:" kept the old heading while RIS installed the new one
   * (Privatschulgesetz §§ 1, 15, 27b, 2026-09-09). The heading opens an
   * implicit § instead, and the content hangs off it.
   */
  const host = (): LawNode[] => {
    if (para) return para.children
    if (pendingHeading !== null) {
      para = makeNode('para', '', '', '', pendingHeading)
      pendingHeading = null
      out.push(para)
      return para.children
    }
    return out
  }

  for (const raw of lines) {
    const line = normalizeText(lineText(raw))
    if (!line) continue
    const isHeading = typeof raw !== 'string' && raw.heading
    const pm = PARA_LINE.exec(line)
    if (pm && isHeading) {
      // "„§ 27b. Übergangsbestimmungen …“" — marker and heading in one line.
      // The heading keeps the marker as printed, because RIS BrKons prints
      // it the same way in laws of this style and the texts must compare.
      para = makeNode('para', pm[1]!, `§ ${pm[1]}.`, '', line)
      pendingHeading = null
      out.push(para)
      abs = null
      z = null
      continue
    }
    if (isHeading) {
      pendingHeading = line
      continue
    }
    if (pm) {
      para = makeNode('para', pm[1]!, `§ ${pm[1]}.`, '', pendingHeading)
      pendingHeading = null
      out.push(para)
      z = null
      const rest = line.slice(pm[0].length)
      const am = ABS_LINE.exec(rest)
      abs = makeNode('abs', am ? am[1]! : '', am ? `(${am[1]})` : '', am ? rest.slice(am[0].length) : rest)
      para.children.push(abs)
      continue
    }
    const am = ABS_LINE.exec(line)
    if (am) {
      abs = makeNode('abs', am[1]!, `(${am[1]})`, line.slice(am[0].length))
      z = null
      host().push(abs)
      // "(1) 1. …": an Absatz whose first Ziffer shares its line.
      const nested = Z_LINE.exec(abs.text)
      if (nested) {
        z = makeNode('z', nested[1]!, `${nested[1]}.`, abs.text.slice(nested[0].length))
        abs.text = ''
        abs.children.push(z)
        splitLit(z)
      }
      continue
    }
    const lm = LIT_LINE.exec(line)
    if (lm) {
      const lit = makeNode('lit', lm[1]!, `${lm[1]})`, line.slice(lm[0].length))
      if (z) z.children.push(lit)
      else if (abs) abs.children.push(lit)
      else host().push(lit)
      continue
    }
    const zm = Z_LINE.exec(line)
    if (zm) {
      // "Dem § 3 wird folgende Z 15 angefügt:" installs a Ziffer with no
      // Absatz above it. Falling through left the marker inside the text,
      // and the harness scored the leaked number as invented law.
      z = makeNode('z', zm[1]!, `${zm[1]}.`, line.slice(zm[0].length))
      if (abs) abs.children.push(z)
      else host().push(z)
      // RIS prints a Ziffer and its first Litera as one symbol, "1. a)", so
      // the "a)" leaked into the text (Luftfahrtgesetz § 44, 2026-09-09).
      splitLit(z)
      continue
    }
    if (abs) {
      // An unmarked line after list items is a Schlussteil — it closes the
      // enumeration and belongs *behind* it ("… insbesondere a) … e) … der
      // Schulbehörde unverzüglich anzuzeigen"). Folding it into the Absatz's
      // own text put that closing sentence in front of the list and left the
      // §  looking amended-but-wrong. `lawtext/konsTree.ts` builds the standing
      // law the same way, so the two sides now render in the same order.
      if (abs.children.length) abs.children.push(makeNode('schluss', 'schluss', '', line))
      else abs.text = `${abs.text} ${line}`.trim()
    } else if (pendingHeading === null && !para && out.length === 0) {
      // The first bare line of a payload: a heading when a marked line
      // follows, the text itself when the payload is one sentence (a § or an
      // Absatz without inner numbering).
      pendingHeading = line
    } else {
      abs = makeNode('abs', '', '', line)
      host().push(abs)
    }
  }
  // A lone bare line is the payload of "Die Überschrift … lautet:" or of a
  // sentence-level instruction; a heading-only node carries it either way.
  if (pendingHeading !== null && out.length === 0) out.push(makeNode('para', '', '', '', pendingHeading))
  return out
}

/** "1. a) text" → the Ziffer's text starts with its first Litera. */
function splitLit(z: LawNode): void {
  const lm = LIT_LINE.exec(z.text)
  if (!lm) return
  z.children.push(makeNode('lit', lm[1]!, `${lm[1]})`, z.text.slice(lm[0].length)))
  z.text = ''
}

/**
 * The quotation marks around a payload belong to the *instruction*, not to
 * the law text it installs — "In § 60 wird folgender Abs. 44 angefügt:
 * \u0022(44) …\u0022". Leaving them in put a stray quote into the consolidated
 * text and made an otherwise perfect § 60 fail the harness (2026-09-08).
 */
export function stripPayloadQuotes(lines: readonly PayloadLine[]): PayloadLine[] {
  const out = lines.map((l) => (typeof l === 'string' ? normalizeText(l) : { ...l, text: normalizeText(l.text) })).filter((l) => lineText(l))
  if (out.length === 0) return out
  const edit = (i: number, f: (t: string) => string): void => {
    const l = out[i]!
    out[i] = typeof l === 'string' ? f(l) : { ...l, text: f(l.text) }
  }
  // The opening quote does not always come first. RIS keeps the paragraph
  // symbol in its own `gldsym`, so a replacement prints as `§ 69.` + `" (1)
  // Im Antrag …` and `payloadLine` joins them with the quote in the middle,
  // where an anchored strip cannot see it. Three §§ of the Luftfahrtgesetz
  // carried a stray `" (1)` into the consolidated text that way (2026-09-09).
  //
  // **Not on a heading line.** `segmentUnits` has already taken the
  // instruction's marks off a quoted § heading (`stripQuotes`), so a mark
  // left at its end is the heading's own: „Die Überschrift zu § 59 lautet:
  // ‚… der ‚Aufenthaltsberechtigung besonderer Schutz''" lost its inner
  // closing mark here, the second strip after the first (AsylG 2005,
  // BGBl. I Nr. 39/2026, 27.09.2026).
  const heading = (i: number): boolean => {
    const l = out[i]
    return typeof l === 'object' && l.heading
  }
  if (!heading(0)) edit(0, (t) => t.replace(/^((?:§+\s*\d+[a-z]*\.\s*)?)["\u00ab\u2039]\s*/, '$1'))
  // A closing quote is sometimes followed by the instruction's own full stop
  // ("… zu verlangen."."), which left `verlangen".` in the text.
  if (!heading(out.length - 1)) edit(out.length - 1, (t) => t.replace(/\s*["\u00bb\u203a]\s*\.?$/, ''))
  return out
}

/**
 * One payload block as a printed line.
 *
 * A § symbol arrives separately in `gld`, but a Ziffer or Litera marker is
 * part of the block text and RIS prints it without a space ("1.Altersprädikat").
 * `parsePayload` then fails to see a marker and the number leaks into the law
 * text — which the harness scored as the engine inventing a token. The space
 * is restored here rather than in the parser, because the ME↔RV comparison
 * reads the same blocks from two sources that print markers differently, and
 * changing what counts as compared text there stops units from pairing.
 */
function payloadLine(b: { kind: string; text: string; gld: string | null }): PayloadLine {
  if (b.kind === 'para_head') return { text: b.text, heading: true }
  if (b.gld) return `${b.gld} ${b.text}`
  if (b.kind !== 'ziff') return b.text
  return b.text.replace(/^(\d+[a-z]*\.|[a-z]\))(?=\S)/, '$1 ')
}

/**
 * The instructions of a parsed Novelle, each with the text it installs.
 *
 * A unit can hold more than one instruction: "§ 20 wird wie folgt geändert:"
 * is a container whose a) and b) sub-instructions follow in the same unit,
 * and they inherit its address. Treating them as payload swallowed them
 * silently — which is why the split lives here and not in a script.
 */
export function instructionsFromUnits(units: readonly LawUnit[]): { instructions: Instruction[]; refused: { line: string; reason: string }[] } {
  const instructions: Instruction[] = []
  const refused: { line: string; reason: string }[] = []
  // „17. Der Eintrag nach der § 29 betreffenden Zeile lautet:" goes on with
  // the table of contents of the instruction before it; read alone it was
  // refused and locked § 29 (`tocSequence`).
  const toc = tocSequence(units.map((u) => ({ line: u.blocks.find((b) => b.kind === 'novao')?.text ?? null, law: u.article })))
  for (const [ui, unit] of units.entries()) {
    const groups: { line: string; payload: PayloadLine[] }[] = []
    const tables = new Set<number>()
    for (const b of unit.blocks) {
      if (b.kind === 'novao') groups.push({ line: b.text, payload: [] })
      else if (groups.length) {
        groups[groups.length - 1]!.payload.push(payloadLine(b))
        if (b.cls.startsWith('table:')) tables.add(groups.length - 1)
      }
    }
    let container: NovaoAddress | null = null
    for (const [gi, group] of groups.entries()) {
      // A table in the new text has no place in the tree — its cells would
      // become Absätze in whatever order the parser met them. Seven §§ of the
      // NEHG diverged that way (BGBl. I Nr. 60/2024, 2026-09-09). Refused.
      if (tables.has(gi)) {
        refused.push({ line: group.line, reason: 'Tabelle im neuen Text — nicht als Gesetzestext abbildbar' })
        continue
      }
      // The table of contents follows from the headings and is never applied;
      // a line that names it is the grammar's `toc` already.
      //
      // Under „Das Inhaltsverzeichnis wird wie folgt geändert:" the lettered
      // lines („a) nach dem Eintrag zu § 20 wird folgender Eintrag
      // eingefügt:") go on with the table their unit opened, as the annex
      // reads them (`draftUnits`). Read on their own they were refused and
      // locked § 20. Only a line that speaks of the table's entries and of
      // nothing else (`continuesToc`): skipped, a line on a § would be a
      // change carried out nowhere.
      const onToc = toc[ui] && (gi === 0 ? !isTocInstruction(group.line) : continuesToc(group.line))
      if (onToc) {
        instructions.push({ op: { kind: 'toc' }, payload: [], line: group.line })
        continue
      }
      const parsed = parseInstruction(group.line, container)
      // A compound line with one half unread is refused whole. Applying the
      // half that parsed — "am Ende des zweiten Satzes der Punkt durch einen
      // Beistrich ersetzt und es wird folgende Wendung angefügt" turned a
      // full stop into a comma and stopped — publishes a sentence that ends
      // in mid-air and reports success (Privatschulgesetz § 23, 2026-09-09).
      if (parsed.ops.length === 0 || parsed.reason !== null) {
        refused.push({ line: group.line, reason: parsed.reason ?? 'nicht gelesen' })
        continue
      }
      for (const op of parsed.ops) {
        if (op.kind === 'container') {
          container = op.target
          continue
        }
        instructions.push({ op, payload: parsePayload(stripPayloadQuotes(group.payload)), line: group.line })
      }
    }
  }
  return { instructions, refused }
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * The unit an address names — and **never one of another kind**.
 *
 * A law may carry a § 1 and an Anl. 1, and the id is the bare number for
 * both, so a lookup by number alone could hand „§ 1" the schedule's text or
 * the other way round. The kind is read off the RIS Gliederungssymbol the
 * node keeps in `marker` („Anl. 1"), which is the only place it survives: the
 * id is a number, and the display keys by that number.
 *
 * The collision was unreachable until 26.09.2026 only because `konsTree`
 * failed to read „Anl. 1" at all and every schedule arrived with the id „?".
 */
function findParagraph(law: StandingLaw, a: NovaoAddress, overrideId?: string): LawNode | null {
  const wantsSchedule = isSchedule(a.para)
  const pool = law.paragraphs.filter((p) => isSchedule(p.marker) === wantsSchedule)
  const id = overrideId ?? bareParaId(a.para)
  // „Z 1 lit. n des Anhangs" names no number, because the law has exactly
  // one schedule. Where it has several the instruction has to say which, and
  // an address that does not is refused rather than guessed at.
  if (id === null) return wantsSchedule && pool.length === 1 ? pool[0]! : null
  return pool.find((p) => p.id === id) ?? null
}

/**
 * A § whose text is not split into numbered Absätze still gets one node, with
 * an empty id — a definition paragraph ("§ 2. Im Sinne dieses Bundesgesetzes
 * bedeuten:") hangs its Ziffern there. An address like "§ 2 Z 3" names no
 * Absatz, so the descent has to pass through that unnumbered node instead of
 * failing. Found by the harness on the Energieausweis-Vorlage-Gesetz.
 */
function childThrough(node: LawNode, level: NodeLevel, id: string): LawNode | null {
  const direct = uniqueChild(node, level, id)
  if (direct) return direct
  for (const child of node.children) {
    if (child.id === '' && child.level !== level) {
      const nested = uniqueChild(child, level, id)
      if (nested) return nested
    }
  }
  return null
}

/**
 * The body of a § without Absatz numbering: its one unnumbered Absatz.
 *
 * `lawtext/konsTree.ts` files such a § as a single Absatz with an empty
 * designation, and that Absatz — not the § — carries its text, its list and
 * its Schlussteil. An address that names the § and means what is in it
 * („Dem § 3 werden folgende Z 16 bis 20 angefügt") has to be answered there.
 * Every other node is its own body.
 */
function bodyOf(node: LawNode): LawNode {
  const only = node.level === 'para' && node.children.length === 1 ? node.children[0]! : null
  return only && only.level === 'abs' && only.id === '' ? only : node
}

/**
 * The node an address points at, descending Abs → Z → lit. Returns null as
 * soon as a level is missing: a partially resolved address is not a target.
 */
export function resolveTarget(law: StandingLaw, a: NovaoAddress, overrideDeepest?: string): LawNode | null {
  const para = findParagraph(law, a)
  if (!para) return null
  const levels: (readonly [NodeLevel, string | null])[] = [
    ['abs', a.abs],
    ['z', a.z],
    ['lit', a.lit],
  ]
  let node: LawNode = para
  let deepestIndex = -1
  levels.forEach(([, id], i) => {
    if (id !== null) deepestIndex = i
  })
  for (const [i, [level, id]] of levels.entries()) {
    if (id === null) continue
    const wanted = overrideDeepest !== undefined && i === deepestIndex ? overrideDeepest : id
    const child = childThrough(node, level, wanted)
    if (!child) return null
    node = child
  }
  return node
}

// ---------------------------------------------------------------------------
// Text operations
// ---------------------------------------------------------------------------

/**
 * A letter or a digit, in the German alphabet — JavaScript's `\w` is ASCII,
 * so „ö" in „Behörde" would count as a boundary and the guard would be no
 * guard at all.
 */
const WORD_CHAR = /[\p{L}\p{N}]/u

/**
 * Does the match at `at` stand on its own, rather than inside a longer word?
 *
 * Only the ends that are letters are checked: an operand like „(1)" or „, "
 * begins and ends in punctuation, and demanding a boundary there would refuse
 * matches that are perfectly sound.
 */
function atWordBoundary(haystack: string, needle: string, at: number, len = needle.length): boolean {
  const before = at > 0 ? haystack[at - 1]! : ''
  const after = haystack[at + len] ?? ''
  if (WORD_CHAR.test(needle[0]!) && before && WORD_CHAR.test(before)) return false
  if (WORD_CHAR.test(needle[needle.length - 1]!) && after && WORD_CHAR.test(after)) return false
  return true
}

/** Where a match sits and how long the STANDING text writes it. */
interface Span {
  at: number
  len: number
}

/**
 * The dashes that are one dash: hyphen, non-breaking hyphen, figure dash, en
 * and em dash. A ressort writes „BBU - Errichtungsgesetz", the consolidated
 * text carries „BBU-Errichtungsgesetz", and both mean the same law.
 */
const DASH = '[-\u2010\u2011\u2012\u2013\u2014]'
const DASH_RE = /[-\u2010\u2011\u2012\u2013\u2014]/

/**
 * The same text as the other document would write it — spacing and dash
 * tolerated, nothing else.
 *
 * The operand of an amendment is a **quotation of the standing law**, and the
 * two documents do not always spell a citation identically: „(§ 1 Abs. 1 BBU
 * - Errichtungsgesetz, BGBl. I Nr. 53/2019)" in the Novelle against
 * „BBU-Errichtungsgesetz" in the consolidated text. The instruction is not in
 * doubt — it is the same name — and refusing it withheld §§ over a space.
 *
 * Exactly two liberties, both invisible in print: a run of whitespace matches
 * any run of whitespace, and a dash matches any dash with any spacing around
 * it. Not tolerated: a missing full stop in „Abs 1", a different number, a
 * different word — those are differences a reader would see, and they are the
 * ressort quoting something else than what stands in the law.
 *
 * Returns null where the needle carries neither space nor dash, so the common
 * case costs nothing.
 */
function tolerantPattern(needle: string): RegExp | null {
  if (!/\s/.test(needle) && !DASH_RE.test(needle)) return null
  const tight = needle.replace(/\s*([-\u2010\u2011\u2012\u2013\u2014])\s*/g, '$1')
  const src = tight
    .split(/(\s+|[-\u2010\u2011\u2012\u2013\u2014])/)
    .filter((part) => part !== '')
    .map((part) => {
      if (/^\s+$/.test(part)) return '\\s+'
      if (DASH_RE.test(part) && part.length === 1) return `\\s*${DASH}\\s*`
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('')
  return new RegExp(src, 'g')
}

/**
 * The new text in the spelling the standing document uses for its dashes.
 *
 * Only where the tolerance above was needed — that is, where the two
 * documents already disagree about the spacing of one dash, and the ressort
 * writes the disputed name the same way on BOTH sides of its instruction:
 * "der Ausdruck „… (GVG - B 2005), BGBl. I Nr. 100/2005," wird durch den
 * Ausdruck „GVG - B 2005" ersetzt". Finding the old text and then writing the
 * ressort's spacing produced a § that differs from the promulgated one in
 * exactly that space — the Bundeskanzleramt sets it tight when it typesets.
 * Three §§ of BGBl. I Nr. 39/2026 measured so on 26.09.2026, and they are the
 * whole reason this function exists.
 *
 * Two readings, and the corpus needed both:
 *
 * - **The document already writes this name.** „GVG - B 2005" stands in the
 *   § as „GVG-B 2005", so that is how it goes back in. Only where the § is of
 *   one mind about it: a name spelled two ways in the same § says nothing.
 * - **Otherwise the found place decides.** Where the standing text set every
 *   dash of the place tight and the instruction set one loose, the new text
 *   follows suit — that covers the name the § does not carry yet („BBU -
 *   Errichtungsgesetzes" in a text that knows only „BBU-Errichtungsgesetz").
 *
 * Never the other way round: a document that itself writes the dash loose
 * leaves the draft's text exactly as the draft wrote it.
 */
function likeStanding(text: string, needle: string, found: string, standing: string): string {
  if (found === needle) return text
  const re = tolerantPattern(text)
  if (re) {
    const spellings = new Set<string>()
    for (let m = re.exec(standing); m; m = re.exec(standing)) {
      spellings.add(m[0])
      if (re.lastIndex === m.index) re.lastIndex++
    }
    if (spellings.size === 1) return [...spellings][0]!
  }
  const loose = (s: string): boolean => new RegExp(`\\s${DASH}|${DASH}\\s`).test(s)
  if (!loose(needle) || loose(found)) return text
  return text.replace(new RegExp(`\\s*(${DASH})\\s*`, 'g'), '$1')
}

/** Every place the text stands, spelled exactly — the offsets and their length. */
function exactSpans(haystack: string, needle: string, wordBound: boolean): Span[] {
  const out: Span[] = []
  for (let at = phraseIndex(haystack, needle, wordBound); at >= 0; at = phraseIndex(haystack, needle, wordBound, at + needle.length)) out.push({ at, len: needle.length })
  return out
}

/** Every place it stands in the other document's spelling. */
function tolerantSpans(haystack: string, needle: string, wordBound: boolean): Span[] {
  const re = tolerantPattern(needle)
  if (!re) return []
  const out: Span[] = []
  for (let m = re.exec(haystack); m; m = re.exec(haystack)) {
    if (!wordBound || atWordBoundary(haystack, needle, m.index, m[0].length)) out.push({ at: m.index, len: m[0].length })
    if (re.lastIndex === m.index) re.lastIndex++
  }
  return out
}

/**
 * The next occurrence of `needle` at or after `from` — the next *standalone*
 * one when the instruction announced its operand as a „Wort" (`wordBound`,
 * `kons/novao.ts`). Without that, „das Wort ‚Amt' durch das Wort ‚Behörde'"
 * turned „Die Amtsstelle entscheidet." into „Die Behördesstelle entscheidet."
 * (23.09.2026).
 */
function phraseIndex(haystack: string, needle: string, wordBound: boolean, from = 0): number {
  let i = haystack.indexOf(needle, from)
  while (i >= 0 && ((wordBound && !atWordBoundary(haystack, needle, i)) || insideNumber(haystack, needle, i))) i = haystack.indexOf(needle, i + 1)
  return i
}

/**
 * „die Beträge ‚50' jeweils durch die Beträge ‚70'" — a number is never a
 * piece of a longer one: „150" does not contain the amount 50 (28.09.2026).
 */
function insideNumber(haystack: string, needle: string, at: number): boolean {
  return (/^\d/.test(needle) && /\d/.test(haystack[at - 1] ?? '')) || (/\d$/.test(needle) && /\d/.test(haystack[at + needle.length] ?? ''))
}

/**
 * One piece of writable text a phrase operation can act on.
 *
 * A phrase operation does not always address a node's body. "In der
 * Überschrift zu § 120d entfällt die Wortfolge …" addresses the heading,
 * which is not part of `text` at all, and "§ 169 Abs. 5 dritter Satz"
 * addresses one sentence inside it. Searching the node's whole text for both
 * meant the heading case never found its phrase and the sentence case found
 * it twice and refused as ambiguous — five instructions of the Luftfahrt-
 * gesetz between them (2026-09-09).
 */
interface Slot {
  read: () => string
  write: (value: string) => void
}

const textSlot = (node: LawNode): Slot => ({ read: () => node.text, write: (v) => { node.text = v } })
const headingSlot = (node: LawNode): Slot => ({ read: () => node.heading ?? '', write: (v) => { node.heading = v } })

/**
 * Tokens a full stop does not end a sentence after. Legistic German is dense
 * with them, and the earlier splitter (`[^.!?]+[.!?]+`) cut "§ 5 Abs. 2" into
 * two sentences — so "erster Satz lautet" replaced a fragment and kept the
 * rest, in 11 of 33 divergences of the 261-paragraph corpus (2026-09-09).
 */
const ABBREVIATIONS = new Set(
  'abs nr z lit art bgbl bzw vgl gem dr mag usw ua iVm idf idgf zb hrsg bd ff dh etc mio mrd inkl exkl ca max min anm abl abk geb ggf sog isd isv ivm insb ivz jän jan feb mär apr jun jul aug sep sept okt nov dez st sp lgbl rgbl stgbl jgs celex unterabs ubs ziff'
    .toLowerCase()
    .split(' '),
)
/**
 * After "1." these are ordinals, not sentence ends: "am 1. Jänner", "im 2.
 * Abschnitt" — and in the genitive, "des 2. Teiles 1. Hauptstückes", which
 * the bare nouns missed and which refused every sentence of InvFG 2011
 * § 164 Abs. 1 (26.09.2026).
 */
const ORDINAL_FOLLOWERS = /^(?:J[äa]nner|Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|Satz|Halbsatz|Abschnitt|Hauptstück|Teil|Unterabschnitt|Kapitel|Stufe|Instanz|Klasse|Kategorie|Quartal|Halbjahr|Jahr|Lebensjahr|Schuljahr|Kalenderjahr|Semester|Absatz|Ziffer|Fall|Alternative|Variante|Tatbestand|Spiegelstrich|Anstrich|Untergliederung|Rate|Tranche|Runde|Wahlgang|Lesung|Auflage|Ausfertigung|Stock|Ebene)(?:e?s)?\b/

/**
 * The words a designation number stands behind, by depth: „§ 8 Abs. 1 Z 6".
 * Behind one of them a number is the unit's number and never an ordinal, so
 * „gemäß § 8 Abs. 1 Z 6. Die Ziffern …" ends a sentence where „am 3. Tag"
 * does not have to (Transparenzdatenbankgesetz 2012 § 25 Abs. 2).
 */
const DESIGNATOR_DEPTH: Record<string, number> = { '§': 0, '§§': 0, art: 0, artikel: 0, anl: 0, anlage: 0, anhang: 0, abs: 1, absatz: 1, z: 2, ziffer: 2, lit: 3, litera: 3 }
/** An address that goes on one level down: „Abs. 1. Z 1 lit. b", a stray full stop inside a citation. */
const DEEPER_DESIGNATION = /^(Abs\.|Absatz|Z|Ziffer|lit\.|litera)\s*(?:\(?\d|[a-z]\b)|^\(\d/

/**
 * Is the full stop behind a number at `at` the end of a sentence because the
 * number is a designation? Null where the word before the number is no
 * designator; false where the text goes on down the address, which is a
 * citation with a stray full stop rather than a new sentence.
 */
function endsDesignation(before: string, rest: string): boolean | null {
  const word = /(\S+)\s+\S+$/.exec(before)?.[1]?.replace(/\.$/, '').toLowerCase()
  const depth = word === undefined ? undefined : DESIGNATOR_DEPTH[word]
  if (depth === undefined) return null
  const next = DEEPER_DESIGNATION.exec(rest)
  if (!next) return true
  const nextWord = (next[1] ?? 'abs').replace(/\.$/, '').toLowerCase()
  return (DESIGNATOR_DEPTH[nextWord] ?? 1) <= depth
}

/**
 * Sentences of a node's text, or null when a boundary is not decidable.
 *
 * A period ends a sentence when the word before it is neither an
 * abbreviation nor a bare number or single letter, and the text goes on with
 * a capital, a quote or a §. A period after a number followed by a capital
 * — "gemäß Z 3. Der Bundesminister" against "am 1. Jänner" — is decided by
 * the following word where it is a month or an ordinal noun, by the word in
 * front of the number where that makes it a designation („Z 3", `endsDesignation`),
 * and refused otherwise. Quotes are tracked so a full stop inside a quoted warning text
 * ("… abhängig macht. Es wird …") does not count.
 */
export function splitSentences(text: string): string[] | null {
  const t = text.trim()
  if (!t) return null
  const out: string[] = []
  let start = 0
  let quoteDepth = 0
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]!
    if (ch === '"') quoteDepth ^= 1
    if (ch !== '.' && ch !== '!' && ch !== '?') continue
    // Consume closing quotes and brackets that belong to the sentence.
    let j = i + 1
    let depthAfter = quoteDepth
    while (j < t.length && /["')\]]/.test(t[j]!)) {
      if (t[j] === '"') depthAfter ^= 1
      j++
    }
    if (j < t.length && !/\s/.test(t[j]!)) continue
    if (depthAfter === 1) continue
    let k = j
    while (k < t.length && /\s/.test(t[k]!)) k++
    const rest = t.slice(k)
    const wordBefore = /(\S+)$/.exec(t.slice(start, i))?.[1] ?? ''
    const lower = wordBefore.replace(/^[("„'§]+/, '').toLowerCase()
    if (ch === '.' && rest) {
      if (ABBREVIATIONS.has(lower)) continue
      // „z. B.", „d. h.", „u. a.": a letter and its full stop behind another
      // one is a spaced abbreviation, not a Litera ending a sentence — the
      // splitter refused Bäderhygieneverordnung § 57 Abs. 6 over it (28.09.2026).
      if (/^[a-z]$/.test(lower) && /(?:^|[\s(])[a-zA-Z]\.\s?[a-zA-Z]$/.test(t.slice(start, i))) continue
      if (/^\d+$/.test(lower) || /^[a-z]$/.test(lower) || /^[ivx]+$/.test(lower)) {
        if (!/^[A-ZÄÖÜ"„§(]/.test(rest)) continue
        if (ORDINAL_FOLLOWERS.test(rest)) continue
        if (endsDesignation(t.slice(start, i), rest) !== true) return null
      }
      if (/^[a-zäöüß]/.test(rest)) continue
    }
    out.push(t.slice(start, j).trim())
    start = k
    i = k - 1
    quoteDepth = depthAfter
  }
  const tail = t.slice(start).trim()
  if (tail) out.push(tail)
  return out.length ? out : null
}

/**
 * The sentences an address names, as one slot that writes back into the
 * node. "einleitung" is the node's own text in front of its list and needs
 * that list to exist; "schluss" is the Schlussteil behind it. `count` widens
 * an ordinal to a run ("die ersten beiden Sätze").
 */
function sentenceSlot(unit: LawNode, satz: string, count = 1): Slot | null {
  const found = sentenceSlots(unit, satz, count)
  // The sentence that runs through a list is open to phrase operations only
  // (`listSentences`): a replacement or deletion of it would have to take the
  // list along, and writing only its first piece is the Ärztegesetz failure.
  return found && !found.throughList ? found.slots[0]! : null
}

/**
 * The slots of the sentence(s) an address names, and whether they are the
 * one sentence that runs through a list — which is several pieces of text in
 * several nodes, and only a phrase can be looked for across them.
 */
function sentenceSlots(unit: LawNode, satz: string, count = 1): { slots: Slot[]; throughList: boolean } | null {
  // „In § 8 erster Satz", „Im Schlussteil des § 11": a § without Absatz
  // numbering has its sentences in its one unnumbered Absatz, and the § node
  // itself only carries that Absatz — so it counted as a unit with a list and
  // every sentence of it was refused (4 of the 21 lines filed under „eine
  // frühere Anweisung", 26.09.2026).
  const node = bodyOf(unit)
  const one = (slot: Slot | null) => (slot ? { slots: [slot], throughList: false } : null)
  if (satz === 'einleitung') return one(node.children.length ? textSlot(node) : null)
  if (satz === 'schluss') {
    // `id === 'schluss'`: a table of the standing text is filed as a
    // `schluss` node too (`lawtext/konsTree.ts`), and it is not the
    // Schlussteil an instruction means.
    const schluss = [...node.children].reverse().find((c) => c.level === 'schluss' && c.id === 'schluss')
    return one(schluss ? textSlot(schluss) : null)
  }
  if (node.children.length) return listSentences(node, satz, count)
  const parts = splitSentences(node.text)
  if (!parts) return null
  const n = Math.max(1, count)
  const first = satz === 'letzter' ? parts.length - n : satz === 'vorletzter' ? parts.length - 2 : (ORDINALS[satz] ?? -1)
  if (first < 0 || first + n > parts.length) return null
  return one(partsSlot(node, parts, first, n))
}

/** Sentences `first` to `first + n` of `parts`, written back into `node.text`. */
function partsSlot(node: LawNode, parts: readonly string[], first: number, n: number): Slot {
  return {
    read: () => parts.slice(first, first + n).join(' '),
    write: (v) => {
      const next = [...parts.slice(0, first), ...(v.trim() ? [v.trim()] : []), ...parts.slice(first + n)]
      node.text = next.join(' ').replace(/\s{2,}/g, ' ').trim()
    },
  }
}

/** Where the last piece of a list item's text stands — a Ziffer's own text, or its last Litera's. */
function lastTextOf(node: LawNode): string {
  const last = node.children.at(-1)
  return last ? lastTextOf(last) : node.text
}

const ENDS_SENTENCE = /[.!?]["')\]]*$/

/**
 * The sentences of an Absatz that carries a list, counted only where the
 * count is certain.
 *
 * "…sind die Ordinationsstätten von 1. … 2. …, denen die Anerkennung erteilt
 * worden ist." runs from the Einleitung through the Ziffern into the
 * Schlussteil, and until 26.09.2026 that made every sentence of such an
 * Absatz uncountable — "erster Satz lautet" had replaced the fragment in
 * front of the list and left the list standing (Ärztegesetz §§ 12, 12a, 13,
 * BGBl. I Nr. 21/2024, 2026-09-09). But the sentences on either side of that
 * one are ordinary sentences in one node each:
 *
 *  - in front of the list, every part of the Einleitung except its last,
 *    which is where the list sentence begins — „erster Satz" in StabAbgG § 5
 *    Abs. 1, whose Ziffern follow a second sentence;
 *  - behind it, every part of the Schlussteil except its first where that
 *    continues the list sentence („einzurichten. Neben den in Z 1 bis 10
 *    genannten …", Gesundheitsqualitätsgesetz § 9a Abs. 1). Where the last
 *    item closes with a full stop and the Schlussteil opens with a capital, it
 *    begins a sentence of its own (Umweltförderungsgesetz § 23 Abs. 1).
 *
 * So the front is counted from the front and the back from the back. The
 * list sentence itself is named where the count lands on it — „erster Satz"
 * when nothing stands before it, „letzter Satz" when nothing follows — and
 * comes back as its pieces, for a phrase to be found in exactly one of them.
 * Counting forward past the list is refused: whether the Ziffern's own full
 * sentences count is not settled by the text.
 */
function listSentences(node: LawNode, satz: string, count: number): { slots: Slot[]; throughList: boolean } | null {
  // A table is no list, and a lead that ends its own sentence before the list
  // is a shape this reading does not know.
  if (node.children.some((c) => c.level === 'schluss' && c.id !== 'schluss')) return null
  const schluss = node.children.at(-1)?.level === 'schluss' ? node.children.at(-1)! : null
  const list = node.children.filter((c) => c !== schluss)
  if (list.length === 0) return null
  const lead = node.text.trim() ? splitSentences(node.text) : []
  const tail = schluss ? splitSentences(schluss.text) : []
  if (lead === null || tail === null) return null
  if (lead.length > 0 && ENDS_SENTENCE.test(lead.at(-1)!)) return null
  const closed = ENDS_SENTENCE.test(lastTextOf(list.at(-1)!).trim()) && /^[A-ZÄÖÜ"„§(]/.test(tail[0] ?? '')
  const continues = tail.length > 0 && !closed
  const before = Math.max(0, lead.length - 1)
  const after = tail.length - (continues ? 1 : 0)
  const throughList = (): { slots: Slot[]; throughList: boolean } => ({
    slots: [
      ...(lead.length > 0 ? [partsSlot(node, lead, lead.length - 1, 1)] : []),
      ...list.flatMap((c) => lawTextNodes(c).map(textSlot)),
      ...(continues ? [partsSlot(schluss!, tail, 0, 1)] : []),
    ],
    throughList: true,
  })
  const n = Math.max(1, count)
  if (satz === 'letzter') {
    if (after >= n) return { slots: [partsSlot(schluss!, tail, tail.length - n, n)], throughList: false }
    return n === 1 && after === 0 ? throughList() : null
  }
  if (satz === 'vorletzter') {
    if (after >= 2) return { slots: [partsSlot(schluss!, tail, tail.length - 2, 1)], throughList: false }
    return after === 1 ? throughList() : null
  }
  const first = ORDINALS[satz] ?? -1
  if (first < 0) return null
  if (first + n <= before) return { slots: [partsSlot(node, lead, first, n)], throughList: false }
  return first === before && n === 1 ? throughList() : null
}

/**
 * The text a sentence-level address reads — for the guard's size accounting,
 * which charged the whole Absatz for a one-sentence replacement and flagged
 * every correct one (2026-09-09). Null where the engine would refuse.
 */
export function addressedSentence(node: LawNode, satz: string, count = 1): string | null {
  return sentenceSlot(node, satz, count)?.read() ?? null
}

/**
 * The sentence a Halbsatz lies in: the one the address names, or — where it
 * names none — the first for the first Halbsatz and the last for the last.
 * Any other ordinal needs a unit of one sentence. Where the first sentence
 * runs through a list, its first Halbsatz is in front of it („§ 36 Abs. 9
 * lautet der erste Halbsatz: ‚… beziehen:'"), so that piece is the host.
 */
function halbsatzHost(node: LawNode, a: NovaoAddress): Slot | null {
  const satz = a.satz ?? (a.halbsatz === 'erster' ? 'erster' : a.halbsatz === 'letzter' ? 'letzter' : null)
  if (satz) {
    const found = sentenceSlots(node, satz, 1)
    if (!found) return null
    if (!found.throughList) return found.slots[0]!
    return a.halbsatz === 'erster' ? (found.slots[0] ?? null) : null
  }
  const only = sentenceSlots(node, 'erster', 1)
  const all = only && !only.throughList ? splitSentences(bodyOf(node).text) : null
  return all?.length === 1 ? only!.slots[0]! : null
}

const MARK_END = /[,;:.]$/

/**
 * Where the Halbsatz a replacement names lies in its sentence — found
 * through the text that replaces it.
 *
 * The drafting does not agree on what a Halbsatz is. All seven „lautet der
 * erste Halbsatz" of the draft corpus end their new text at a comma („…
 * Auskünfte darüber verlangen,"), RAO § 50 means the part in front of a
 * semicolon, and one draft says „der zweite Halbsatz nach dem Strichpunkt"
 * because the word alone does not. A boundary rule would be right for one
 * usage and write the wrong text for the other, so there is none: the new
 * text says where it ends. The old Halbsatz ends where the old sentence
 * carries the same last two words with the same mark — exactly once — and a
 * later Halbsatz also begins where the old sentence carries the new text's
 * first two words right behind a mark. The first begins with the sentence.
 * Where either is not unique, the replacement is refused; a change in the
 * very words the anchor needs is refused too, and that is the price.
 */
export function halbsatzSpan(sentence: string, halbsatz: string, replacement: string): { at: number; end: number } | null {
  const words = [...sentence.matchAll(/\S+/g)].map((m) => ({ text: m[0], at: m.index!, end: m.index! + m[0].length }))
  const next = replacement.trim().split(/\s+/)
  if (next.length < 2 || !MARK_END.test(next.at(-1)!)) return null
  const [pen, last] = [next.at(-2)!, next.at(-1)!]
  const ends = words.flatMap((w, i) => (i > 0 && w.text === last && words[i - 1]!.text === pen ? [w.end] : []))
  let at = words[0]?.at ?? 0
  if (halbsatz !== 'erster') {
    const starts = words.flatMap((w, i) => (i > 0 && MARK_END.test(words[i - 1]!.text) && w.text === next[0] && words[i + 1]?.text === next[1] ? [w.at] : []))
    if (starts.length !== 1) return null
    at = starts[0]!
  }
  const after = ends.filter((e) => e > at)
  if (after.length === 1) return { at, end: after[0]! }
  if (after.length > 1) return null
  // The new text may change the very last words of its Halbsatz — RAO § 50
  // Abs. 2 Z 2 lit. a replaces its second one by two. Two ends are exact
  // then. A semicolon closes a Halbsatz and hardly anything else in legal
  // text, so where the new text closes with one, the old Halbsatz ends at the
  // next one. Otherwise only the last Halbsatz can be found: where the new
  // text closes with the mark the sentence closes with, and none stands in
  // between. A comma is never looked for — it separates too much else.
  const closing = replacement.trim().at(-1)!
  const rest = sentence.trimEnd()
  if (closing === ';') {
    const semicolon = rest.indexOf(';', at)
    return semicolon >= 0 ? { at, end: semicolon + 1 } : null
  }
  if (halbsatz !== 'erster' && rest.endsWith(closing) && !rest.slice(at, -1).includes(closing)) return { at, end: rest.length }
  return null
}

/** The sentence a Halbsatz address searches — for the guard, which counts a „jeweils" where the engine replaces it. */
export function addressedHalbsatzHost(node: LawNode, a: NovaoAddress): string | null {
  return halbsatzHost(node, a)?.read() ?? null
}

/** The old text of the Halbsatz a replacement names — for the guard, which charges a Halbsatz, not its unit. */
export function addressedHalbsatz(node: LawNode, a: NovaoAddress, replacement: string): string | null {
  const host = a.halbsatz ? halbsatzHost(node, a) : null
  const text = host?.read() ?? ''
  const span = host ? halbsatzSpan(text, a.halbsatz!, replacement) : null
  return span ? text.slice(span.at, span.end) : null
}

/**
 * Every slot an address opens up for a phrase operation, **grouped by the
 * addressed unit** — one group per § or Absatz the address names.
 *
 * The grouping is what „jeweils" needs. „In § 81 Abs. 1 und 2 wird das Wort
 * „Acten" jeweils durch das Wort „Akten" ersetzt" is ONE address covering two
 * Absätze, and the word stands once in each; asked across the union it is
 * found twice and the instruction is refused. Over the corpus that is the
 * single largest class of applications that read correctly and then failed —
 * 95 of 804 refusals (26.09.2026), against 64 for „Textstelle nicht
 * gefunden".
 *
 * `everyOccurrence` in `kons/novao.ts` has stated the rule since it was
 * written: with several places „jeweils" distributes the change over them,
 * „und inside each the phrase must still be unique". The reading half obeyed
 * it; the applying half never got the units to obey it *in*.
 *
 * **Two failures, two reasons.** A unit that is not there and a unit whose
 * sentences cannot be counted both came back as „Nicht im geltenden Text",
 * and the Prüfstand then filed the second kind under „eine frühere Anweisung
 * hat sie entfernt" — 13 of the 21 lines it counted there were sentences of a
 * unit that stood untouched in the standing text (26.09.2026). The replace and
 * delete branches have said „Satz … nicht auffindbar" since they were
 * written; the phrase branch now says the same.
 */
function phraseSlotGroups(law: StandingLaw, a: NovaoAddress): Slot[][] | { error: string } {
  const missing = { error: `Nicht im geltenden Text: ${a.raw.slice(0, 60)}` }
  const scope = scopeOf(law, a)
  if (!scope) return missing
  if (a.heading) {
    const titled = scope.filter((n) => (n.heading ?? '') !== '')
    return titled.length ? titled.map((n) => [headingSlot(n)]) : missing
  }
  const groups: Slot[][] = []
  for (const node of scope) {
    // A phrase inside a Halbsatz is looked for in the sentence the Halbsatz
    // lies in, and must be unique there. Its boundary is not in the words
    // („im letzten Halbsatz vor der Wortfolge ‚…' wird das Wort ‚oder' …");
    // the qualifier is there because the phrase recurs, and if it recurs in
    // that sentence the instruction is refused as any other would be.
    if (a.halbsatz) {
      const host = halbsatzHost(node, a)
      if (!host) return { error: `Halbsatz ${a.halbsatz} nicht auffindbar` }
      groups.push([host])
      continue
    }
    if (a.satz) {
      const found = sentenceSlots(node, a.satz, a.satzCount)
      if (!found) return { error: `Satz ${a.satz} nicht auffindbar` }
      groups.push(found.slots)
      continue
    }
    groups.push(lawTextNodes(node).map(textSlot))
  }
  return groups
}

/**
 * The units a phrase operation has to be applied in, in order.
 *
 * Without „jeweils" the address is ONE place however many units it spans, and
 * the phrase has to be unique across all of them — that is the old behaviour
 * and it stays, because loosening it everywhere would let an instruction that
 * names two §§ and means one of them write into both. With „jeweils" the
 * instruction says outright that it means each unit once, so each unit is its
 * own question.
 */
function phraseUnits(law: StandingLaw, a: NovaoAddress, eachUnit: boolean): Slot[][] | { error: string } {
  const groups = phraseSlotGroups(law, a)
  if ('error' in groups) return groups
  return eachUnit ? groups : [groups.flat()]
}

/**
 * Where the phrase sits in every addressed unit — resolved for ALL of them
 * before a single one is written to.
 *
 * **Two passes, and the first version was one.** Applying unit by unit and
 * returning on the first failure left the units before it changed and the
 * instruction refused: „In § 81 Abs. 1 und 2 … jeweils" over a § whose second
 * Absatz does not carry the word rewrote the first and reported a refusal.
 * A half-applied instruction is the one outcome this engine may never produce
 * — the same rule the operand pairing states one file over („either every
 * pair is read, or the instruction is refused"), and a unit test now holds it.
 *
 * The units cannot overlap, so the offsets stay valid until the writes:
 * `scopeOf` reads one level, and its nodes are siblings.
 */
function locateInUnits(units: readonly (readonly Slot[])[], needle: string, wordBound: boolean): { hits: (Span & { slot: Slot })[] } | { error: string } {
  const hits: (Span & { slot: Slot })[] = []
  for (const slots of units) {
    const found = uniqueSlot(slots, needle, wordBound)
    if ('error' in found) return { error: found.error }
    hits.push(found.hit)
  }
  return { hits }
}

/**
 * Rule 1 in practice: find the one slot containing `needle` exactly once,
 * across the whole addressed scope. Anything else — not found, found twice,
 * found in two units — is a refusal, not a choice.
 */
function uniqueSlot(slots: readonly Slot[], needle: string, wordBound = false): { hit: Span & { slot: Slot } } | { error: string } {
  if (!needle) return { error: 'Textstelle ohne Inhalt' }
  const find = (spans: (h: string, n: string, w: boolean) => Span[]): (Span & { slot: Slot })[] =>
    slots.flatMap((slot) => spans(slot.read(), needle, wordBound).map((s) => ({ ...s, slot })))
  const exact = find(exactSpans)
  if (exact.length === 1) return { hit: exact[0]! }
  if (exact.length > 1) return { error: `Textstelle ${exact.length}× gefunden, nicht eindeutig: "${needle.slice(0, 60)}"` }
  // Only where the text is nowhere to be found as written. A spelling that
  // matches in TWO places says the tolerance is what made it ambiguous, and
  // then the instruction is refused as it was before — never applied to a
  // place the exact spelling did not point at.
  const loose = find(tolerantSpans)
  if (loose.length === 1) return { hit: loose[0]! }
  return { error: `Textstelle nicht gefunden${loose.length > 1 ? `, in anderer Schreibweise ${loose.length}×` : ''}: "${needle.slice(0, 60)}"` }
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

const ORDINALS: Record<string, number> = {
  erster: 0, zweiter: 1, dritter: 2, vierter: 3, fünfter: 4, sechster: 5, siebenter: 6, siebter: 6, achter: 7, neunter: 8, zehnter: 9,
}

function levelOf(child: string): NodeLevel | null {
  return child === 'abs' || child === 'z' || child === 'lit' || child === 'para' ? (child as NodeLevel) : null
}

/** Insert `nodes` into `host.children` behind (or in front of) the anchor. */
function spliceChildren(host: LawNode, anchorId: string | null, level: NodeLevel, nodes: LawNode[], where: 'after' | 'before'): boolean {
  if (anchorId === null) {
    host.children.push(...nodes)
    return true
  }
  const at = host.children.findIndex((c) => c.level === level && c.id === anchorId)
  if (at < 0) return false
  host.children.splice(where === 'after' ? at + 1 : at, 0, ...nodes)
  return true
}

/**
 * Where a new § stands among the Paragraphen when no § anchors it: in front
 * of the first one its number precedes — § 148a behind § 148, before § 149 —
 * and before the schedules, which a law prints last.
 */
function numberedSlot(paragraphs: readonly LawNode[], id: string): number {
  const at = paragraphs.findIndex((p) => isSchedule(p.marker) || byParagraphOrder(p.id, id) > 0)
  return at < 0 ? paragraphs.length : at
}

/**
 * The refusal of an operation the engine carries out at one place whose
 * address still lists several units — carried out, it would change the first
 * of them and report the line applied.
 */
const ONE_PLACE_SIBLINGS = 'Mehrere Einheiten für eine Stelle'

/**
 * Applies one instruction. Mutates `law`; returns null on success or the
 * reason for refusal.
 */
function applyOne(law: StandingLaw, { op, payload }: Instruction): string | null {
  switch (op.kind) {
    case 'toc':
      // The table of contents follows from the headings; deriving it is
      // safer than applying instructions to it.
      return null
    case 'container':
      return null

    case 'replaceHeading': {
      const para = findParagraph(law, op.target)
      if (!para) return `§ nicht im geltenden Text: ${op.target.para}`
      // "Es entfällt die Überschrift des § 19 und § 19 lautet:" read as a
      // heading replacement made the whole new § the heading (NEHG, BGBl. I
      // Nr. 60/2024, 2026-09-09). A heading is one short line without inner
      // numbering; anything else is body text and the instruction misread.
      if (payload.length !== 1 || payload[0]!.children.length > 0) return 'Überschrift mit Fließtext — Anweisung nicht eindeutig'
      const heading = plainText(payload[0]!).trim()
      if (!heading) return 'Überschrift ohne neuen Text'
      if (heading.length > 200 || /\(\d+[a-z]*\)/.test(heading)) return 'Überschrift mit Fließtext — Anweisung nicht eindeutig'
      para.heading = heading
      return null
    }

    case 'replace': {
      if (op.target.level !== 'para') payload = unwrapParaPayload(payload, op.target)
      const ids = [op.target.level === 'para' ? (bareParaId(op.target.para) ?? '') : deepestId(op.target), ...op.target.siblings]
      if (op.target.level === 'para') {
        const paras = ids.map((id) => law.paragraphs.find((p) => p.id === id) ?? null)
        // "§ 7 lautet:" can arrive without a para-level block at all, when the
        // payload opens straight into "(1) …" and the § symbol stayed in the
        // instruction. One target and one block is still a 1:1 replacement.
        const blocks = payload.filter((p) => p.level === 'para')
        const absent = ids.filter((_, i) => paras[i] === null)
        if (absent.length > 0) {
          // „Die §§ 34a bis 34e samt Überschriften lauten:" where § 34e is new
          // (BUAG, BGBl. I Nr. 66/2026): the range runs past the standing
          // text, and the payload spells out every § of it. That is the run
          // form, and it is determinate exactly when the blocks ARE the named
          // §§, one each and in order — the check that keeps a stale heading
          // from becoming a § of its own (Privatschulgesetz, below). A range
          // none of whose §§ stand is no replacement at all.
          const named = blocks.length === ids.length && blocks.every((b, i) => b.id === ids[i])
          if (!named || absent.length === ids.length) return `§ nicht im geltenden Text: § ${absent[0]}`
          return spliceRun(law.paragraphs, paras.filter((p): p is LawNode => p !== null), blocks, 'para')
        }
        const outgoing = paras as LawNode[]
        const single = outgoing.length === 1 && blocks.length === 0 && payload.length > 0
        // Taking the first block and dropping the rest looked like a success
        // and deleted seven §§ of the IVS-Gesetz (2026-09-09). A run that
        // changes length is spliced; only a 1:1 replacement keeps the old
        // designation, because there "§ 5 lautet:" renumbers nothing.
        if (!single && blocks.length !== outgoing.length) {
          if (blocks.length === 0) return 'Ersetzung ohne neuen Text'
          // Only "durch folgende §§ 7 bis 14 ersetzt" may change the count. A
          // plain "§ 30 lautet:" with two blocks means the payload picked up
          // text that is not § 30's — a stale heading of the § before it
          // inserted a § 27b consisting of that heading alone (Privatschul-
          // gesetz, 2026-09-09).
          if (!op.run) return `${outgoing.length} Ziel, ${blocks.length} Textblöcke`
          return spliceRun(law.paragraphs, outgoing, blocks, 'para')
        }
        if (single) {
          // The payload is the § *body*: "§ 7 lautet:" followed by (1) … (6).
          // Treating the first Absatz as the whole § dropped the other five
          // (Privatschulgesetz, 2026-09-09) — they are all its children, and
          // the designation stays the one the standing law already carries.
          const para = outgoing[0]!
          const at = law.paragraphs.indexOf(para)
          if (op.withHeading) return 'samt Überschrift, aber keine Überschrift im neuen Text'
          // The group headings above the § are not the §'s own text and a
          // replacement does not touch them, so they carry over unchanged.
          law.paragraphs.splice(at, 1, { level: 'para' as const, id: para.id, marker: para.marker, heading: para.heading, context: para.context, text: '', children: payload })
          return null
        }
        for (const [i, para] of outgoing.entries()) {
          // The payload of a § replacement is the § itself; a heading line in
          // front of it is that §'s new Überschrift, not a block of its own.
          // A printed heading is the new heading whether or not the line
          // says "samt Überschrift" — RIS installs it either way
          // (Privatschulgesetz § 15, 2026-09-09); "samt Überschrift" without
          // a printed heading is an instruction the payload does not fulfil.
          const replacement = blocks[i]
          if (!replacement) return 'Ersetzung ohne neuen Text'
          if (op.withHeading && !replacement.heading) return 'samt Überschrift, aber keine Überschrift im neuen Text'
          if (!replacement.heading && replacement.children.length === 0 && !replacement.text) return 'Neufassung ohne Text'
          const at = law.paragraphs.indexOf(para)
          law.paragraphs.splice(at, 1, { ...replacement, level: 'para' as const, id: para.id, marker: para.marker, heading: replacement.heading ?? para.heading })
        }
        return null
      }
      // A sub-unit run that changes length is the same form one level down:
      // "In § 1 wird der Abs. 3 durch folgende Abs. 3 bis 5 ersetzt" quietly
      // lost two Absätze before this existed (2026-09-09). It only applies
      // when the address names no sentence — "der zweite Satz durch folgende
      // Sätze" replaces text inside a node, not the node.
      if (!op.target.satz && !op.target.halbsatz && payload.length > 0 && ids.length !== payload.length) {
        const level = op.target.lit ? 'lit' : op.target.z ? 'z' : 'abs'
        if (!op.run) return `${ids.length} Ziel(e), ${payload.length} Textblöcke`
        if (payload.some((p) => p.level !== level)) return `${ids.length} Ziele, aber ${payload.length} Textblöcke`
        const outgoing: LawNode[] = []
        for (const id of ids) {
          const node = resolveTarget(law, op.target, id)
          if (!node) return `Nicht im geltenden Text: ${op.target.raw.slice(0, 60)}`
          outgoing.push(node)
        }
        const parent = parentOf(law, outgoing[0]!)
        if (!parent) return 'Elternknoten nicht gefunden'
        return spliceRun(parent.children, outgoing, payload, level)
      }
      // „§ 1 Z 1 bis 5 lautet:" where Z 5 is new (Waldresilienzfondsgesetz):
      // the run below the § — the form `Die §§ 34a bis 34e lauten` has at §
      // level, under the same condition, the blocks ARE the named units,
      // one each and in order.
      if (!op.target.satz && !op.target.halbsatz && ids.length > 1) {
        const nodes = ids.map((id) => resolveTarget(law, op.target, id))
        const absent = ids.filter((_, i) => nodes[i] === null)
        if (absent.length > 0 && absent.length < ids.length) {
          const level = op.target.lit ? 'lit' : op.target.z ? 'z' : 'abs'
          const named = payload.length === ids.length && payload.every((b, i) => b.level === level && b.id === ids[i])
          const present = nodes.filter((n): n is LawNode => n !== null)
          const parent = parentOf(law, present[0]!)
          if (!named || !parent) return `Nicht im geltenden Text: ${op.target.raw.slice(0, 60)}`
          return spliceRun(parent.children, present, payload, level)
        }
      }
      for (const [i, id] of ids.entries()) {
        const node = resolveTarget(law, op.target, id)
        if (!node) return `Nicht im geltenden Text: ${op.target.raw.slice(0, 60)}`
        const block = payload[i] ?? payload[0]
        if (!block) return 'Ersetzung ohne neuen Text'
        if (op.target.halbsatz) {
          const host = halbsatzHost(node, op.target)
          if (!host) return `Halbsatz ${op.target.halbsatz} nicht auffindbar`
          const replacement = payload.map((p) => plainText(p)).join(' ').trim()
          const text = host.read()
          const span = halbsatzSpan(text, op.target.halbsatz, replacement)
          if (!span) return `Halbsatz ${op.target.halbsatz}: Grenze im geltenden Text nicht bestimmbar`
          host.write(joinPhrase(text.slice(0, span.at), replacement, text.slice(span.end)))
          continue
        }
        if (op.target.satz) {
          // The whole payload replaces the addressed sentence(s): "der zweite
          // Satz durch folgende Sätze ersetzt" installs several at once.
          const slot = sentenceSlot(node, op.target.satz, op.target.satzCount)
          if (!slot) return `Satz ${op.target.satz} nicht auffindbar`
          slot.write(payload.map((p) => plainText(p)).join(' '))
        } else {
          node.text = block.text || plainText(block)
          node.children = block.children
        }
      }
      return null
    }

    case 'delete': {
      // "Es entfällt die Überschrift des § 6": the heading goes and the § stays.
      // The address says so — `parseAddress` marks a heading address — and
      // without reading it here the branch below took the whole § out of the
      // law and reported success, the failure class of 09.09.2026 one level
      // up. Reachable on its own ("Die Überschrift zu § 8 entfällt.") and now
      // also as half of a compound line, since those are split at "und".
      if (op.target.heading) {
        const node = resolveTarget(law, op.target)
        if (!node) return `Nicht im geltenden Text: ${op.target.raw.slice(0, 60)}`
        if (!node.heading) return 'Überschrift nicht im geltenden Text'
        node.heading = null
        return null
      }
      // "In § 37 Abs. 2 entfällt der zweite Satz" removes a sentence, not the
      // Absatz. This case read only the unit level and dropped the whole node
      // — the engine's worst failure mode, deleting standing law while
      // reporting success (LMSVG 75/2026, LWA-G 30/2026, 2026-09-09).
      // A Halbsatz names no boundary a deletion could cut at — only a
      // replacement brings one (`halbsatzSpan`).
      if (op.target.halbsatz) return `Streichung eines Halbsatzes — Grenze nicht bestimmbar`
      if (op.target.satz) {
        // One place: the parser splits „Abs. 1c und 1d … jeweils" into one
        // op per Absatz (`oneUnitEach`), and an op that still lists siblings
        // would strike the sentence from the first of them alone.
        if (op.target.siblings.length > 0) return ONE_PLACE_SIBLINGS
        const node = resolveTarget(law, op.target)
        if (!node) return `Nicht im geltenden Text: ${op.target.raw.slice(0, 60)}`
        const only = sentenceSlot(node, op.target.satz, op.target.satzCount)
        if (!only) return `Satz ${op.target.satz} nicht auffindbar`
        only.write('')
        return null
      }
      const ids = [deepestId(op.target), ...op.target.siblings]
      for (const id of ids) {
        if (op.target.level === 'para') {
          const at = law.paragraphs.findIndex((p) => p.id === id)
          if (at < 0) return `§ nicht im geltenden Text: § ${id}`
          law.paragraphs.splice(at, 1)
          continue
        }
        const node = resolveTarget(law, op.target, id)
        if (!node) return `Nicht im geltenden Text: ${op.target.raw.slice(0, 60)}`
        const parent = parentOf(law, node)
        if (!parent) return 'Elternknoten nicht gefunden'
        parent.children.splice(parent.children.indexOf(node), 1)
      }
      return null
    }

    case 'append': {
      // Resolved once, so one place — the same rule as the sentence deletion.
      if (op.target.siblings.length > 0) return ONE_PLACE_SIBLINGS
      let host = resolveTarget(law, op.target)
      if (!host) return `Nicht im geltenden Text: ${op.target.raw.slice(0, 60)}`
      if (payload.length === 0) return 'Anfügung ohne Text'
      // A Satz is not a node: it joins the target's own text. Common enough
      // that refusing it cost a fifth of the appends in the harness.
      if (op.child === 'satz' || op.child === 'halbsatz') {
        const added = payload.map((p) => plainText(p)).join(' ').trim()
        if (!added) return 'Anfügung ohne Text'
        // Behind the sentence the clause before named, where it named one —
        // the mark it replaced ends that sentence (`novao.ts`, payload-only
        // clauses) — and with that mark replaced in the same step
        // (`mergeEndMarks`): read once, before either change moves it.
        if (op.target.satz || op.endMark) {
          const slot = op.target.satz ? sentenceSlot(host, op.target.satz, op.target.satzCount) : lastTextSlot(bodyOf(host))
          if (!slot) return op.target.satz ? `Satz ${op.target.satz} nicht auffindbar` : 'Ende der Einheit nicht auffindbar'
          let text = slot.read().trimEnd()
          if (op.endMark) {
            if (!text.endsWith(op.endMark.from)) return `Satzzeichen „${op.endMark.from}" steht nicht am Ende`
            text = joinPhrase(text.slice(0, -op.endMark.from.length), op.endMark.to, '')
          }
          // A new sentence of a unit named without one goes behind its list
          // as a Schlussteil, below; the mark in front of it is replaced here.
          if (!op.target.satz && op.child === 'satz' && host.children.length) slot.write(text)
          else {
            slot.write(`${text} ${added}`.replace(/\s+/g, ' ').trim())
            return null
          }
        }
        // „Dem § 8 wird folgender Satz angefügt": into the § 's one Absatz,
        // not as a Schlussteil beside it.
        host = bodyOf(host)
        // "Dem Abs. 2 wird folgender Satz angefügt" puts the sentence at the
        // end of the Absatz. When the Absatz carries a list, its end is
        // behind the list — the Schlussteil — not the text in front of it.
        const schluss = [...host.children].reverse().find((c) => c.level === 'schluss')
        if (schluss) schluss.text = `${schluss.text} ${added}`.replace(/\s+/g, ' ').trim()
        else if (host.children.length) host.children.push(makeNode('schluss', 'schluss', '', added))
        else host.text = `${host.text} ${added}`.replace(/\s+/g, ' ').trim()
        return null
      }
      // „Dem § 26 Abs. 3 Z 2 wird folgender Schlussteil angefügt": the text
      // that closes the unit's list, behind it. Only where the unit HAS a list
      // and no Schlussteil yet — a second one, or one without a list to
      // close, has no place the words determine (28.09.2026).
      if (op.child === 'schluss') {
        const added = payload.map((p) => plainText(p)).join(' ').trim()
        if (!added) return 'Anfügung ohne Text'
        const body = bodyOf(host)
        const items = body.children.filter((c) => c.level !== 'schluss')
        if (items.length === 0) return 'Schlussteil ohne Liste, die er schließt'
        if (body.children.some((c) => c.level === 'schluss')) return 'Schlussteil besteht bereits'
        body.children.push(makeNode('schluss', 'schluss', '', added))
        return null
      }
      const level = levelOf(op.child)
      if (!level) return 'Angefügte Einheit nicht bestimmbar'
      // „Dem § 3 werden folgende Z 16 bis 20 angefügt" in a § without Absatz
      // numbering: its Ziffern hang off the one unnumbered Absatz, so the new
      // ones do too. Pushed onto the § they would stand beside that Absatz —
      // the same words in a tree no rendering reads as one list.
      if (host.level === 'para' && level === 'z') host = bodyOf(host)
      const nodes = payload.map((p) => ({ ...p, level }))
      for (const n of nodes) if (n.id && childById(host, level, n.id)) return `${n.marker} existiert bereits`
      // The end of the enumeration, not the end of the node. Where the Absatz
      // closes with a Schlussteil ("Die Anzeige hat schriftlich zu
      // erfolgen."), a plain push put the new Ziffer *behind* that clause and
      // the closing sentence read as part of the list — standing law in the
      // wrong place, and `guardParagraph` passes it, because no word was
      // invented and the size barely moves. The `satz` branch above has
      // located the closing clause since it was written; this one pushed past
      // it (23.09.2026).
      let at = host.children.length
      while (at > 0 && host.children[at - 1]!.level === 'schluss') at--
      host.children.splice(at, 0, ...nodes)
      return null
    }

    case 'insertAfter': {
      const level = levelOf(op.child)
      if (!level) return 'Eingefügte Einheit nicht bestimmbar'
      if (payload.length === 0) return 'Einfügung ohne Text'
      if (level === 'para') {
        // „Nach der Überschrift zum 2. Abschnitt … werden folgende §§ 148a und
        // 148b eingefügt": the stock holds no Abschnitt to stand behind, but a
        // new § is wholly its payload, so it goes where its number puts it
        // (`numberedSlot`) — only where the payload is exactly the announced §§.
        const byNumber = isDivision(op.anchor.para)
        const anchor = byNumber ? null : findParagraph(law, op.anchor)
        if (!anchor && !byNumber) return `Anker nicht im geltenden Text: ${op.anchor.para}`
        // A payload without a § line of its own is the body of one new §:
        // "(1) …" straight after the instruction. Inserting those Absätze as
        // §§ gave them ids "1", "2", … and either collided ("§ 1 existiert
        // bereits", Privatschulgesetz § 27b) or, worse, would have shadowed
        // real paragraphs. The instruction announced the § ("folgender
        // § 27b"), and only a one-to-one announcement is taken.
        let blocks = payload
        if (!payload.every((p) => p.level === 'para')) {
          if (payload.some((p) => p.level === 'para')) return 'Neuer Paragraph und lose Absätze gemischt'
          blocks = [{ ...makeNode('para', '', '', ''), children: payload }]
        }
        const unnamed = blocks.filter((p) => !p.id)
        if (unnamed.length > 0) {
          if (unnamed.length !== blocks.length || op.childIds.length !== blocks.length) return 'Neuer Paragraph ohne eigene Bezeichnung'
          blocks = blocks.map((p, i) => ({ ...p, id: op.childIds[i]!, marker: `§ ${op.childIds[i]}.` }))
        }
        for (const p of blocks) if (law.paragraphs.some((x) => x.id === p.id)) return `§ ${p.id} existiert bereits`
        if (!anchor) {
          if (blocks.length !== op.childIds.length || blocks.some((p, i) => p.id !== op.childIds[i])) return `${op.anchor.para} — die eingefügten Paragraphen sind nicht die angekündigten`
          law.paragraphs.splice(numberedSlot(law.paragraphs, blocks[0]!.id), 0, ...blocks.map((p) => ({ ...p, level: 'para' as const })))
          return null
        }
        const at = law.paragraphs.indexOf(anchor)
        law.paragraphs.splice(op.where === 'after' ? at + 1 : at, 0, ...blocks.map((p) => ({ ...p, level: 'para' as const })))
        return null
      }
      // A sub-unit insert names its anchor at the same level inside the §,
      // and one anchor.
      if (op.anchor.siblings.length > 0) return ONE_PLACE_SIBLINGS
      const para = findParagraph(law, op.anchor)
      if (!para) return `§ nicht im geltenden Text: ${op.anchor.para}`
      const host = op.anchor.level === 'para' ? para : (resolveTarget(law, op.anchor) ?? para)
      const anchorId = op.anchor.level === 'para' ? null : deepestId(op.anchor)
      const container = anchorId && host !== para ? (parentOf(law, host) ?? para) : para
      // A new Absatz, Ziffer or Litera prints its own designation. Without
      // one the payload line was read as something else — „nach Abs. 7
      // folgender Abs. 8 eingefügt:" over a bare sentence came out as a
      // heading, and the unit went in with no number and no text while the
      // insertion reported success (Bundesstraßengesetz 1971 § 7, 30.09.2026).
      // The Paragraph branch above refuses the same case; this one never did.
      if ((level === 'abs' || level === 'z' || level === 'lit') && payload.some((p) => !p.id || p.level !== level)) return 'Eingefügte Einheit ohne eigene Bezeichnung'
      const nodes = payload.map((p) => ({ ...p, level }))
      for (const n of nodes) if (n.id && childById(container, level, n.id)) return `${n.marker} existiert bereits`
      if (!spliceChildren(container, anchorId, level, nodes, op.where)) return `Anker nicht gefunden: ${op.anchor.raw.slice(0, 60)}`
      return null
    }

    case 'renumber':
      return renumberBatch(law, [{ op, payload }], [])

    case 'replacePhrase': {
      const units = phraseUnits(law, op.target, op.eachUnit)
      if ('error' in units) return units.error
      if (op.atEnd) return replaceEndMark(units, op.from, op.to)
      if (op.truncate) {
        // One place, one mark: the sentence ends at the new mark, and the
        // Halbsatz behind the old one goes. Across several slots „the rest"
        // would reach into units the instruction does not name.
        const slots = units.flat()
        if (slots.length !== 1) return 'Halbsatz hinter dem Zeichen — Stelle nicht eindeutig'
        const found = uniqueSlot(slots, op.from)
        if ('error' in found) return found.error
        const text = found.hit.slot.read()
        found.hit.slot.write(joinPhrase(text.slice(0, found.hit.at), op.to, ''))
        return null
      }
      if (op.everywhere) {
        let hits = 0
        for (const slot of units.flat()) {
          // Seam by seam: "/" replaced by "bzw." inside "Bundesministerin/der"
          // needs the spaces a plain split-and-join does not add
          // (Tierschutzgesetz, BGBl. I Nr. 124/2024, 2026-09-09). Cut by
          // `phraseIndex` rather than by `split`, so a word operand skips the
          // occurrences that stand inside another word.
          const text = slot.read()
          let out = ''
          let last = 0
          let here = 0
          for (let at = phraseIndex(text, op.from, op.wordBound); at >= 0; at = phraseIndex(text, op.from, op.wordBound, at + op.from.length)) {
            out = here === 0 ? text.slice(0, at) : joinPhrase(out, op.to, text.slice(last, at))
            last = at + op.from.length
            here++
          }
          if (here === 0) continue
          hits += here
          slot.write(joinPhrase(out, op.to, text.slice(last)))
        }
        return hits === 0 ? `Textstelle nicht gefunden: "${op.from.slice(0, 60)}"` : null
      }
      // One unit without „jeweils", one question per unit with it. A unit
      // the phrase is not in, or is in twice, refuses the whole instruction:
      // „jeweils" is the ressort saying every one of them carries it, so a
      // unit that does not is a disagreement about the standing text and not
      // a place to skip quietly.
      const located = locateInUnits(units, op.from, op.wordBound)
      if ('error' in located) {
        // „vor der Wortfolge ‚des Sachverständigen' das Wort ‚oder'": where
        // the operand recurs, the anchor says which one — the operand and
        // the anchor side by side, and that pair must be unique in turn.
        if (!op.beside || op.everywhere || !/nicht eindeutig/.test(located.error)) return located.error
        const b = op.beside
        const pair = b.where === 'before' ? `${op.from.trim()} ${b.text.trim()}` : `${b.text.trim()} ${op.from.trim()}`
        const next = b.where === 'before' ? joinPhrase('', op.to, b.text) : joinPhrase(b.text, op.to, '')
        const near = locateInUnits(units, pair, op.wordBound)
        if ('error' in near) return located.error
        for (const { slot, at, len } of near.hits) {
          const current = slot.read()
          slot.write(joinPhrase(current.slice(0, at), next, current.slice(at + len)))
        }
        return null
      }
      for (const { slot, at, len } of located.hits) {
        const current = slot.read()
        slot.write(joinPhrase(current.slice(0, at), likeStanding(op.to, op.from, current.slice(at, at + len), current), current.slice(at + len)))
      }
      return null
    }

    case 'insertPhrase': {
      const units = phraseUnits(law, op.target, op.eachUnit)
      if ('error' in units) return units.error
      if (op.atEnd) {
        // The mark that ends each unit's text in reading order — and only
        // where it IS its last character; a unit that ends otherwise is a
        // disagreement with the draft, not a place to choose another mark.
        const ends: { slot: Slot; at: number }[] = []
        for (const slots of units) {
          const last = [...slots].reverse().find((sl) => sl.read().trim() !== '')
          const text = last?.read().trimEnd() ?? ''
          if (!last || !text.endsWith(op.anchor)) return `Satzzeichen „${op.anchor}" steht nicht am Ende`
          if (op.bareEnd && /[.,;:]$/.test(text)) return `Einheit endet mit „${text.at(-1)}" — vor oder nach dem Zeichen nicht entscheidbar`
          ends.push({ slot: last, at: text.length - op.anchor.length })
        }
        for (const { slot, at } of ends) {
          const current = slot.read().trimEnd()
          const cut = op.where === 'before' ? at : at + op.anchor.length
          slot.write(joinPhrase(current.slice(0, cut), op.text, current.slice(cut)))
        }
        return null
      }
      const located = locateInUnits(units, op.anchor, op.wordBound)
      if ('error' in located) return located.error
      for (const { slot, at, len } of located.hits) {
        const current = slot.read()
        const text = likeStanding(op.text, op.anchor, current.slice(at, at + len), current)
        slot.write(
          op.where === 'after'
            ? joinPhrase(current.slice(0, at + len), text, current.slice(at + len))
            : joinPhrase(current.slice(0, at), text, current.slice(at)),
        )
      }
      return null
    }

    case 'deletePhrase': {
      const units = phraseUnits(law, op.target, op.eachUnit)
      if ('error' in units) return units.error
      const located = locateInUnits(units, op.text, op.wordBound)
      if ('error' in located) return located.error
      for (const { slot, at, len } of located.hits) {
        const current = slot.read()
        // „(§ 43 BFA-VG)" without „ BFA-VG" is „(§ 43)", not „(§ 43 )" — the
        // space goes where the cut meets a parenthesis (BFA-VG § 10, 28.09.2026).
        let left = current.slice(0, at)
        let right = current.slice(at + len)
        if (right.startsWith(')')) left = left.trimEnd()
        if (left.endsWith('(')) right = right.trimStart()
        slot.write(`${left}${right}`.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1').trim())
      }
      return null
    }
  }
}

/** The last text of a unit in reading order — where its last sentence ends. */
function lastTextSlot(node: LawNode): Slot | null {
  const last = [...lawTextNodes(node)].reverse().find((n) => n.text.trim() !== '')
  return last ? textSlot(last) : null
}

/**
 * Replace the mark each unit's text ends on — only where it IS its last
 * character; a unit that ends otherwise disagrees with the draft.
 */
function replaceEndMark(units: readonly (readonly Slot[])[], from: string, to: string): string | null {
  const ends: Slot[] = []
  for (const slots of units) {
    const last = [...slots].reverse().find((sl) => sl.read().trim() !== '')
    if (!last || !last.read().trimEnd().endsWith(from)) return `Satzzeichen „${from}" steht nicht am Ende`
    ends.push(last)
  }
  for (const slot of ends) {
    const text = slot.read().trimEnd()
    slot.write(joinPhrase(text.slice(0, -from.length), to, ''))
  }
  return null
}

/**
 * One or several renumberings applied at once. Every target must exist, the
 * new designations must be as many as the units they name, and no new id may
 * collide with a unit that is *not* moving — units that are moving in the
 * same batch may swap freely.
 */
function renumberBatch(law: StandingLaw, batch: readonly Pick<Instruction, 'op' | 'payload'>[], renamed: Renaming[] = []): string | null {
  const moves: { node: LawNode; id: string; level: NodeLevel; siblings: LawNode[]; para: string }[] = []
  for (const { op } of batch) {
    if (op.kind !== 'renumber') return 'keine Umbenennung'
    const ids = [deepestId(op.target), ...op.target.siblings]
    const nodes: LawNode[] = []
    for (const id of ids) {
      const node = op.target.level === 'para' ? (law.paragraphs.find((p) => p.id === id) ?? null) : resolveTarget(law, op.target, id)
      if (!node) return `Nicht im geltenden Text: ${op.target.raw.slice(0, 60)}`
      nodes.push(node)
    }
    // `to === ''` is the Wegfall of a designation: the unit keeps its text
    // and loses its number ("entfällt die Absatzbezeichnung „(1)“").
    const first = op.to === '' ? '' : (bareParaId(op.to) ?? op.to.replace(/[^\w]/g, ''))
    if (!first && op.to !== '') return 'Neue Bezeichnung nicht lesbar'
    if (first === '' && (op.toLast || nodes.length !== 1)) return 'Wegfall einer Bezeichnung nur für eine Einheit'
    // "die Z 5 bis 9 erhalten die Ziffernbezeichnungen „4.“ bis „8.“": the
    // new run must be exactly as long as the old one, or nothing moves.
    let newIds = [first]
    if (op.toLast) {
      const range = expandRange(first, bareParaId(op.toLast) ?? '')
      if (!range) return `Zielbezeichnungen ${op.to} bis ${op.toLast} nicht aufzählbar`
      newIds = [first, ...range]
    }
    if (newIds.length !== nodes.length) return `${nodes.length} Einheiten, ${newIds.length} neue Bezeichnungen`
    const siblings = op.target.level === 'para' ? law.paragraphs : (parentOf(law, nodes[0]!)?.children ?? [])
    // „Der bisherige Inhalt des § 29 erhält die Absatzbezeichnung ‚(1)'"
    // (`absatzDrawnIn` in `kons/novao.ts`): the unnumbered Absatz is the
    // bisherige Inhalt only where it IS the whole §. Anything beside it would
    // stay outside the new Abs. 1 and read as text of no Absatz at all.
    if (op.target.level === 'abs' && nodes.some((n) => n.id === '') && siblings.length !== 1) return 'Der bisherige Inhalt ist nicht ein einziger Absatz'
    nodes.forEach((node, i) => moves.push({ node, id: newIds[i]!, level: node.level, siblings, para: op.target.para ?? '' }))
  }
  const moving = new Set(moves.map((m) => m.node))
  for (const m of moves) {
    const clash = m.siblings.find((n) => !moving.has(n) && n.level === m.level && n.id === m.id)
    if (clash) return `Bezeichnung ${m.id} existiert bereits`
  }
  if (new Set(moves.map((m) => `${m.level}|${m.id}`)).size !== moves.length) return 'Zwei Einheiten erhalten dieselbe Bezeichnung'
  for (const m of moves) {
    renamed.push({ level: m.level, para: m.level === 'para' ? `§ ${m.id}` : m.para, from: m.node.id, to: m.id })
    m.node.id = m.id
    m.node.marker = m.id === '' ? '' : m.level === 'para' ? `§ ${m.id}.` : m.level === 'abs' ? `(${m.id})` : m.level === 'lit' ? `${m.id})` : `${m.id}.`
  }
  return null
}

/**
 * A run of units replaced by a different number of units: "Die §§ 7 bis 9
 * werden durch folgende §§ 7 bis 14 ersetzt", "In § 1 wird der Abs. 3 durch
 * folgende Abs. 3 bis 5 ersetzt". Six of these sit in two laws of the
 * 17-Novellen corpus, so it is a form, not an oddity (2026-09-09).
 *
 * Determinate, and therefore applicable rather than refusable, because the
 * address expands to the whole outgoing run and every incoming block carries
 * its own marker: the run comes out, the blocks go in at its place. Two
 * conditions have to hold, or the result would be law that does not exist —
 * the outgoing units must be contiguous siblings, and no incoming id may
 * collide with a unit outside the run, which would shadow standing text.
 */
function spliceRun(siblings: LawNode[], outgoing: LawNode[], incoming: LawNode[], level: NodeLevel): string | null {
  const positions = outgoing.map((n) => siblings.indexOf(n))
  if (positions.some((i) => i < 0)) return 'Zu ersetzende Einheit nicht am erwarteten Ort'
  const at = Math.min(...positions)
  const contiguous = positions.slice().sort((a, b) => a - b).every((pos, i) => pos === at + i)
  if (!contiguous) return `${outgoing.length} zu ersetzende Einheiten sind nicht zusammenhängend`
  if (incoming.some((n) => !n.id)) return 'Neuer Textblock ohne eigene Bezeichnung'
  const survivors = new Set(siblings.filter((n) => !outgoing.includes(n)).map((n) => `${n.level}|${n.id}`))
  for (const n of incoming) if (survivors.has(`${level}|${n.id}`)) return `${n.marker} existiert bereits`
  siblings.splice(at, outgoing.length, ...incoming.map((n) => ({ ...n, level })))
  return null
}

/**
 * „§ 24 Abs. 1 lautet:" with a payload that opens „§ 24. (1) …": the ressort
 * quoted the Absatz with its Paragraph around it. Read as it stood, the whole
 * § went INTO Abs. 1 — the old text flattened and the new Absatz nested below
 * it (RAO, BGBl. I Nr. 63/2026, 28.09.2026). Unwrapped to the addressed units,
 * and only where every step down the address finds exactly the one named unit;
 * anything else is left as it came.
 */
function unwrapParaPayload(payload: readonly LawNode[], a: NovaoAddress): LawNode[] {
  if (payload.length !== 1 || payload[0]!.level !== 'para' || payload[0]!.id !== bareParaId(a.para)) return [...payload]
  const path: [NodeLevel, string | null][] = [['abs', a.abs], ['z', a.z], ['lit', a.lit]]
  let node = payload[0]!
  for (const [level, id] of path) {
    if (level === a.level) {
      const units = node.children.filter((c) => c.level === level)
      return units.length > 0 && units.length === node.children.length && units[0]!.id === id ? units : [...payload]
    }
    if (id === null) return [...payload]
    const next = node.children.filter((c) => c.level === level && c.id === id)
    if (next.length !== 1 || node.children.length !== 1) return [...payload]
    node = next[0]!
  }
  return [...payload]
}

function deepestId(a: NovaoAddress): string {
  return a.lit ?? a.z ?? a.abs ?? bareParaId(a.para) ?? ''
}

/** All nodes an address scopes over — several when the address lists siblings. */
function scopeOf(law: StandingLaw, a: NovaoAddress): LawNode[] | null {
  if (a.level === 'document') return law.paragraphs
  const ids = [deepestId(a), ...a.siblings]
  const nodes: LawNode[] = []
  for (const id of ids) {
    // Through `findParagraph`, not past it: a second lookup by bare number is
    // how an Anlage and a § of the same number changed places (26.09.2026).
    const node = a.level === 'para' ? findParagraph(law, a, id) : resolveTarget(law, a, id)
    if (!node) return null
    nodes.push(node)
  }
  return nodes
}

function parentOf(law: StandingLaw, node: LawNode): LawNode | null {
  for (const para of law.paragraphs) {
    const stack: LawNode[] = [para]
    while (stack.length) {
      const n = stack.pop()!
      if (n.children.includes(node)) return n
      stack.push(...n.children)
    }
  }
  return null
}

/**
 * `left` + `text` + `right` with the whitespace of the two junctions decided
 * here, and nothing else touched. An operand is quoted with its own leading
 * space — "die Wort- und Zeichenfolge „ , 10c, 10f“" — and inserting it
 * after a word left "Erzeugnissen , die" where the law reads "Erzeugnissen,
 * die"; four §§ of the Tabakgesetz and Luftfahrtgesetz diverged on nothing
 * but that space, and "TierÄG ,BGBl." needs the space on the other side
 * (2026-09-09). The first attempt normalised the whole Absatz, and undid a
 * space RIS itself prints in the standing text ("gegenüberzustellen ,",
 * ORF-G § 10a) — so only the seams are edited. Digits stay: "27,5 vH".
 */
function joinPhrase(left: string, text: string, right: string): string {
  const l = left.replace(/\s+$/, '')
  const r = right.replace(/^\s+/, '')
  const t = text.trim().replace(/^([,;])(?=[^\s\d])/, '$1 ')
  if (!t) return `${l} ${r}`.replace(/\s+([,.;:])(?=\s|$)/g, '$1').trim()
  const sepLeft = !l || /^[,.;:]/.test(t) || /[(„"]$/.test(l) ? '' : ' '
  const sepRight = !r || /^[,.;:)]/.test(r) || /[(„"]$/.test(t) ? '' : ' '
  return `${l}${sepLeft}${t}${sepRight}${r}`.trim()
}

/** Deep copy, so a refused run leaves the standing law untouched. */
function cloneLaw(law: StandingLaw): StandingLaw {
  const clone = (n: LawNode): LawNode => ({ ...n, children: n.children.map(clone) })
  return { paragraphs: law.paragraphs.map(clone) }
}

/**
 * Applies a Novelle. Instructions run in printed order — legistic drafting
 * assumes that, e.g. renumbering before a later instruction addresses the
 * new number.
 */
export function applyNovelle(input: StandingLaw, instructions: readonly Instruction[]): ApplyReport {
  const law = cloneLaw(input)
  const results: ApplyResult[] = []
  const unresolved = new Set<string>()
  /**
   * Where a renumbering has been carried out so far: inside which §§, and
   * whether §§ themselves were moved (which changes every later § address).
   */
  const renumberedIn = new Set<string>()
  let paragraphsRenumbered = false
  const extra: ApplyResult[] = []
  const renamed: Renaming[] = []
  for (let i = 0; i < instructions.length; i++) {
    const instruction = instructions[i]!
    const { op, line } = instruction
    const target = opAddress(op)
    const para = target?.para ?? null
    let reason: string | null
    try {
      // "§ 107 Z 6 (neu) lautet:" addresses the numbering *after* an earlier
      // renumbering. If that renumbering was not applied — refused because
      // the standing § 107 has no Z 9, or not read — the address silently
      // lands on the old Z 6 (LMSVG, 2026-09-09). A renumbering elsewhere in
      // the Novelle does not license it; moved §§ do, for every § address.
      const renumbered = paragraphsRenumbered || (para !== null && renumberedIn.has(para))
      if (target && /\(neu\)/i.test(target.raw) && !renumbered) reason = '„(neu)" ohne vorangehende Umbenennung'
      // „Die Überschrift des 4. Abschnitts lautet:" — the standing text holds
      // no Abschnitt, and looked up by its number the address found § 4: the
      // Abschnitt's heading went over § 4's, „Der 4. Abschnitt lautet:" over
      // its text, and both reported success (02.10.2026).
      // A new § announced by its number is the one exception (`numberedSlot`).
      else if (isDivision(para) && !(op.kind === 'insertAfter' && op.child === 'para' && op.childIds.length > 0)) reason = `${para} — Gliederung über dem Paragraphen, im geltenden Text nicht geführt`
      else if (op.kind === 'renumber') {
        // Renumberings printed as one line happen at once: "Die §§ 5 bis 7
        // erhalten die Bezeichnungen § 7 bis § 9; die §§ 8 bis 13 erhalten
        // die Bezeichnungen § 15 bis § 20" — applied one after the other, the
        // first collides with the § 8 the second is about to move
        // (IVS-Gesetz, 2026-09-09).
        const batch = [instruction]
        while (i + 1 < instructions.length && instructions[i + 1]!.op.kind === 'renumber' && instructions[i + 1]!.line === line) batch.push(instructions[++i]!)
        reason = renumberBatch(law, batch, renamed)
        // One result per instruction, in instruction order — callers zip the two.
        for (const b of batch.slice(1)) extra.push({ line: b.line, kind: 'renumber', applied: reason === null, reason, para: 'target' in b.op ? b.op.target.para : null })
      } else reason = applyOne(law, instruction)
    } catch (err) {
      reason = `Fehler beim Anwenden: ${String(err)}`
    }
    if (reason === null && op.kind === 'renumber') {
      if (op.target.level === 'para') paragraphsRenumbered = true
      else if (para) renumberedIn.add(para)
    }
    results.push({ line, kind: op.kind, applied: reason === null, reason, para }, ...extra)
    // Every § the address names: a failed „Die §§ 12a und 13 entfallen"
    // leaves § 13 as unresolved as § 12a, and a § 13 that is marked clean
    // would be shown as if the line had never been written.
    if (reason !== null && target) for (const p of namedParagraphs(target)) unresolved.add(p)
    for (const r of extra) if (r.reason !== null && r.para) unresolved.add(r.para)
    extra.length = 0
  }
  return { law, results, unresolved, renamed }
}
