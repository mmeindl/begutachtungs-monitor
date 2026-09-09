/**
 * Applies Novellierungsanordnungen to the standing law (docs/architecture.md §12.12).
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * `novao.ts` reads an instruction, `lawStructure.ts` holds the law it acts
 * on, and this module performs the act. It never improvises:
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
import { childById, makeNode, plainText, type LawNode, type NodeLevel } from './lawStructure'
import { normalizeText, type LawUnit } from './lawText'
import { expandRange, parseInstruction, type NovaoAddress, type NovaoOp } from './novao'

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
      abs = null
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
      // §  looking amended-but-wrong. `lawStructure.ts` builds the standing
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
  edit(0, (t) => t.replace(/^((?:§+\s*\d+[a-z]*\.\s*)?)["\u00ab\u2039]\s*/, '$1'))
  // A closing quote is sometimes followed by the instruction's own full stop
  // ("… zu verlangen."."), which left `verlangen".` in the text.
  edit(out.length - 1, (t) => t.replace(/\s*["\u00bb\u203a]\s*\.?$/, ''))
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
  for (const unit of units) {
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

function paraKey(a: NovaoAddress): string | null {
  return a.para
}

/** "§ 5" → the id "5"; "Art. 3" → "3"; "Anlage 2" → "2". */
function idOf(label: string | null): string | null {
  if (!label) return null
  const m = /(\d+[a-z]*(?:\.\d+)?)/.exec(label)
  return m ? m[1]! : null
}

function findParagraph(law: StandingLaw, a: NovaoAddress): LawNode | null {
  const id = idOf(a.para)
  return id === null ? null : (law.paragraphs.find((p) => p.id === id) ?? null)
}

/**
 * A § whose text is not split into numbered Absätze still gets one node, with
 * an empty id — a definition paragraph ("§ 2. Im Sinne dieses Bundesgesetzes
 * bedeuten:") hangs its Ziffern there. An address like "§ 2 Z 3" names no
 * Absatz, so the descent has to pass through that unnumbered node instead of
 * failing. Found by the harness on the Energieausweis-Vorlage-Gesetz.
 */
function childThrough(node: LawNode, level: NodeLevel, id: string): LawNode | null {
  const direct = childById(node, level, id)
  if (direct) return direct
  for (const child of node.children) {
    if (child.id === '' && child.level !== level) {
      const nested = childById(child, level, id)
      if (nested) return nested
    }
  }
  return null
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

/** Every text-carrying node in the subtree, in printed order. */
function textNodes(node: LawNode): LawNode[] {
  return [node, ...node.children.flatMap(textNodes)]
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  let n = 0
  let i = haystack.indexOf(needle)
  while (i >= 0) {
    n++
    i = haystack.indexOf(needle, i + needle.length)
  }
  return n
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
/** After "1." these are ordinals, not sentence ends: "am 1. Jänner", "im 2. Abschnitt". */
const ORDINAL_FOLLOWERS = /^(?:J[äa]nner|Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|Satz|Halbsatz|Abschnitt|Hauptstück|Teil|Unterabschnitt|Kapitel|Stufe|Instanz|Klasse|Kategorie|Quartal|Halbjahr|Jahr|Lebensjahr|Schuljahr|Kalenderjahr|Semester|Absatz|Ziffer|Fall|Alternative|Variante|Tatbestand|Spiegelstrich|Anstrich|Untergliederung|Rate|Tranche|Runde|Wahlgang|Lesung|Auflage|Ausfertigung|Stock|Ebene)\b/

/**
 * Sentences of a node's text, or null when a boundary is not decidable.
 *
 * A period ends a sentence when the word before it is neither an
 * abbreviation nor a bare number or single letter, and the text goes on with
 * a capital, a quote or a §. A period after a number followed by a capital
 * — "gemäß Z 3. Der Bundesminister" against "am 1. Jänner" — is decided by
 * the following word where it is a month or an ordinal noun, and refused
 * otherwise. Quotes are tracked so a full stop inside a quoted warning text
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
      if (/^\d+$/.test(lower) || /^[a-z]$/.test(lower) || /^[ivx]+$/.test(lower)) {
        if (!/^[A-ZÄÖÜ"„§(]/.test(rest)) continue
        if (ORDINAL_FOLLOWERS.test(rest)) continue
        return null
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
function sentenceSlot(node: LawNode, satz: string, count = 1): Slot | null {
  if (satz === 'einleitung') return node.children.length ? textSlot(node) : null
  if (satz === 'schluss') {
    const schluss = [...node.children].reverse().find((c) => c.level === 'schluss')
    return schluss ? textSlot(schluss) : null
  }
  const parts = splitSentences(node.text)
  if (!parts) return null
  const n = Math.max(1, count)
  const first = satz === 'letzter' ? parts.length - n : satz === 'vorletzter' ? parts.length - 2 : (ORDINALS[satz] ?? -1)
  if (first < 0 || first + n > parts.length) return null
  return {
    read: () => parts.slice(first, first + n).join(' '),
    write: (v) => {
      const next = [...parts.slice(0, first), ...(v.trim() ? [v.trim()] : []), ...parts.slice(first + n)]
      node.text = next.join(' ').replace(/\s{2,}/g, ' ').trim()
    },
  }
}

/**
 * The text a sentence-level address reads — for the guard's size accounting,
 * which charged the whole Absatz for a one-sentence replacement and flagged
 * every correct one (2026-09-09). Null where the engine would refuse.
 */
export function addressedSentence(node: LawNode, satz: string, count = 1): string | null {
  return sentenceSlot(node, satz, count)?.read() ?? null
}

/** Every slot an address opens up for a phrase operation. */
function phraseSlots(law: StandingLaw, a: NovaoAddress): Slot[] | null {
  const scope = scopeOf(law, a)
  if (!scope) return null
  if (a.heading) {
    const titled = scope.filter((n) => (n.heading ?? '') !== '')
    return titled.length ? titled.map(headingSlot) : null
  }
  const slots: Slot[] = []
  for (const node of scope) {
    if (a.satz) {
      const only = sentenceSlot(node, a.satz, a.satzCount)
      if (!only) return null
      slots.push(only)
      continue
    }
    slots.push(...textNodes(node).map(textSlot))
  }
  return slots
}

/**
 * Rule 1 in practice: find the one slot containing `needle` exactly once,
 * across the whole addressed scope. Anything else — not found, found twice,
 * found in two units — is a refusal, not a choice.
 */
function uniqueSlot(slots: readonly Slot[], needle: string): { slot: Slot } | { error: string } {
  if (!needle) return { error: 'Textstelle ohne Inhalt' }
  let total = 0
  let hit: Slot | null = null
  for (const slot of slots) {
    const n = countOccurrences(slot.read(), needle)
    if (n > 0) {
      total += n
      hit ??= slot
    }
  }
  if (total === 0) return { error: `Textstelle nicht gefunden: "${needle.slice(0, 60)}"` }
  if (total > 1) return { error: `Textstelle ${total}× gefunden, nicht eindeutig: "${needle.slice(0, 60)}"` }
  return { slot: hit! }
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
      const ids = [op.target.level === 'para' ? (idOf(op.target.para) ?? '') : deepestId(op.target), ...op.target.siblings]
      if (op.target.level === 'para') {
        const paras = ids.map((id) => law.paragraphs.find((p) => p.id === id) ?? null)
        if (paras.some((p) => p === null)) return `§ nicht im geltenden Text: ${op.target.para}`
        const outgoing = paras as LawNode[]
        // "§ 7 lautet:" can arrive without a para-level block at all, when the
        // payload opens straight into "(1) …" and the § symbol stayed in the
        // instruction. One target and one block is still a 1:1 replacement.
        const blocks = payload.filter((p) => p.level === 'para')
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
          law.paragraphs.splice(at, 1, { level: 'para' as const, id: para.id, marker: para.marker, heading: para.heading, text: '', children: payload })
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
      if (!op.target.satz && payload.length > 0 && ids.length !== payload.length) {
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
      for (const [i, id] of ids.entries()) {
        const node = resolveTarget(law, op.target, id)
        if (!node) return `Nicht im geltenden Text: ${op.target.raw.slice(0, 60)}`
        const block = payload[i] ?? payload[0]
        if (!block) return 'Ersetzung ohne neuen Text'
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
      // "In § 37 Abs. 2 entfällt der zweite Satz" removes a sentence, not the
      // Absatz. This case read only the unit level and dropped the whole node
      // — the engine's worst failure mode, deleting standing law while
      // reporting success (LMSVG 75/2026, LWA-G 30/2026, 2026-09-09).
      if (op.target.satz) {
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
      const host = resolveTarget(law, op.target)
      if (!host) return `Nicht im geltenden Text: ${op.target.raw.slice(0, 60)}`
      if (payload.length === 0) return 'Anfügung ohne Text'
      // A Satz is not a node: it joins the target's own text. Common enough
      // that refusing it cost a fifth of the appends in the harness.
      if (op.child === 'satz') {
        const added = payload.map((p) => plainText(p)).join(' ').trim()
        if (!added) return 'Anfügung ohne Text'
        // "Dem Abs. 2 wird folgender Satz angefügt" puts the sentence at the
        // end of the Absatz. When the Absatz carries a list, its end is
        // behind the list — the Schlussteil — not the text in front of it.
        const schluss = [...host.children].reverse().find((c) => c.level === 'schluss')
        if (schluss) schluss.text = `${schluss.text} ${added}`.replace(/\s+/g, ' ').trim()
        else if (host.children.length) host.children.push(makeNode('schluss', 'schluss', '', added))
        else host.text = `${host.text} ${added}`.replace(/\s+/g, ' ').trim()
        return null
      }
      const level = levelOf(op.child)
      if (!level) return 'Angefügte Einheit nicht bestimmbar'
      const nodes = payload.map((p) => ({ ...p, level }))
      for (const n of nodes) if (n.id && childById(host, level, n.id)) return `${n.marker} existiert bereits`
      host.children.push(...nodes)
      return null
    }

    case 'insertAfter': {
      const level = levelOf(op.child)
      if (!level) return 'Eingefügte Einheit nicht bestimmbar'
      if (payload.length === 0) return 'Einfügung ohne Text'
      if (level === 'para') {
        const anchor = findParagraph(law, op.anchor)
        if (!anchor) return `Anker nicht im geltenden Text: ${op.anchor.para}`
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
        const at = law.paragraphs.indexOf(anchor)
        law.paragraphs.splice(op.where === 'after' ? at + 1 : at, 0, ...blocks.map((p) => ({ ...p, level: 'para' as const })))
        return null
      }
      // A sub-unit insert names its anchor at the same level inside the §.
      const para = findParagraph(law, op.anchor)
      if (!para) return `§ nicht im geltenden Text: ${op.anchor.para}`
      const host = op.anchor.level === 'para' ? para : (resolveTarget(law, op.anchor) ?? para)
      const anchorId = op.anchor.level === 'para' ? null : deepestId(op.anchor)
      const container = anchorId && host !== para ? (parentOf(law, host) ?? para) : para
      const nodes = payload.map((p) => ({ ...p, level }))
      for (const n of nodes) if (n.id && childById(container, level, n.id)) return `${n.marker} existiert bereits`
      if (!spliceChildren(container, anchorId, level, nodes, op.where)) return `Anker nicht gefunden: ${op.anchor.raw.slice(0, 60)}`
      return null
    }

    case 'renumber':
      return renumberBatch(law, [{ op, payload }], [])

    case 'replacePhrase': {
      const slots = phraseSlots(law, op.target)
      if (!slots) return `Nicht im geltenden Text: ${op.target.raw.slice(0, 60)}`
      if (op.everywhere) {
        let hits = 0
        for (const slot of slots) {
          const parts = slot.read().split(op.from)
          if (parts.length < 2) continue
          hits += parts.length - 1
          // Seam by seam: "/" replaced by "bzw." inside "Bundesministerin/der"
          // needs the spaces a plain split-and-join does not add
          // (Tierschutzgesetz, BGBl. I Nr. 124/2024, 2026-09-09).
          slot.write(parts.slice(1).reduce((acc, rest) => joinPhrase(acc, op.to, rest), parts[0]!))
        }
        return hits === 0 ? `Textstelle nicht gefunden: "${op.from.slice(0, 60)}"` : null
      }
      const found = uniqueSlot(slots, op.from)
      if ('error' in found) return found.error
      const current = found.slot.read()
      const at = current.indexOf(op.from)
      found.slot.write(joinPhrase(current.slice(0, at), op.to, current.slice(at + op.from.length)))
      return null
    }

    case 'insertPhrase': {
      const slots = phraseSlots(law, op.target)
      if (!slots) return `Nicht im geltenden Text: ${op.target.raw.slice(0, 60)}`
      const found = uniqueSlot(slots, op.anchor)
      if ('error' in found) return found.error
      const current = found.slot.read()
      const at = current.indexOf(op.anchor)
      found.slot.write(
        op.where === 'after'
          ? joinPhrase(current.slice(0, at + op.anchor.length), op.text, current.slice(at + op.anchor.length))
          : joinPhrase(current.slice(0, at), op.text, current.slice(at)),
      )
      return null
    }

    case 'deletePhrase': {
      const slots = phraseSlots(law, op.target)
      if (!slots) return `Nicht im geltenden Text: ${op.target.raw.slice(0, 60)}`
      const found = uniqueSlot(slots, op.text)
      if ('error' in found) return found.error
      found.slot.write(found.slot.read().replace(op.text, '').replace(/\s{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1').trim())
      return null
    }
  }
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
    const first = op.to === '' ? '' : (idOf(op.to) ?? op.to.replace(/[^\w]/g, ''))
    if (!first && op.to !== '') return 'Neue Bezeichnung nicht lesbar'
    if (first === '' && (op.toLast || nodes.length !== 1)) return 'Wegfall einer Bezeichnung nur für eine Einheit'
    // "die Z 5 bis 9 erhalten die Ziffernbezeichnungen „4.“ bis „8.“": the
    // new run must be exactly as long as the old one, or nothing moves.
    let newIds = [first]
    if (op.toLast) {
      const range = expandRange(first, idOf(op.toLast) ?? '')
      if (!range) return `Zielbezeichnungen ${op.to} bis ${op.toLast} nicht aufzählbar`
      newIds = [first, ...range]
    }
    if (newIds.length !== nodes.length) return `${nodes.length} Einheiten, ${newIds.length} neue Bezeichnungen`
    const siblings = op.target.level === 'para' ? law.paragraphs : (parentOf(law, nodes[0]!)?.children ?? [])
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

function deepestId(a: NovaoAddress): string {
  return a.lit ?? a.z ?? a.abs ?? idOf(a.para) ?? ''
}

/** All nodes an address scopes over — several when the address lists siblings. */
function scopeOf(law: StandingLaw, a: NovaoAddress): LawNode[] | null {
  if (a.level === 'document') return law.paragraphs
  const ids = [deepestId(a), ...a.siblings]
  const nodes: LawNode[] = []
  for (const id of ids) {
    const node = a.level === 'para' ? (law.paragraphs.find((p) => p.id === id) ?? null) : resolveTarget(law, a, id)
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
export function joinPhrase(left: string, text: string, right: string): string {
  const l = left.replace(/\s+$/, '')
  const r = right.replace(/^\s+/, '')
  let t = text.trim().replace(/^([,;])(?=[^\s\d])/, '$1 ')
  if (!t) return `${l} ${r}`.replace(/\s+([,.;:])(?=\s|$)/g, '$1').trim()
  const sepLeft = !l || /^[,.;:]/.test(t) || /[(„"]$/.test(l) ? '' : ' '
  const sepRight = !r || /^[,.;:)]/.test(r) || /[(„"]$/.test(t) ? '' : ' '
  return `${l}${sepLeft}${t}${sepRight}${r}`.trim()
}

/** Deep copy, so a refused run leaves the standing law untouched. */
export function cloneLaw(law: StandingLaw): StandingLaw {
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
    const target = 'target' in op ? op.target : 'anchor' in op ? op.anchor : null
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
    if (reason !== null && para) unresolved.add(para)
    for (const r of extra) if (r.reason !== null && r.para) unresolved.add(r.para)
    extra.length = 0
  }
  return { law, results, unresolved, renamed }
}
