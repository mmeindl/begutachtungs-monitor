/**
 * Novellierungsanordnungen → typed operations (docs/architecture.md §12.12).
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * An Austrian Novelle is a list of instructions ("In § 9 Abs. 1 wird nach
 * der Wortfolge X die Wortfolge Y eingefügt"). To show the law that comes
 * out of them, each instruction has to become an operation on the standing
 * text. This module does the reading half; lawApply.ts does the applying.
 *
 * Measured over 6.576 instructions from 300 drafts of the RIS Begut corpus
 * (2026-09-08, `scripts/novao-corpus.ts`): six verbs carry 98,6 % of them —
 * lautet 28 %, ersetzt 26 %, angefügt 19 %, eingefügt 17 %, entfällt 13 %,
 * Bezeichnung 1,4 %. The long tail is in the *address*, not the verb.
 *
 * Design rule, and the whole point of the module: **it refuses rather than
 * guesses.** A wrongly applied instruction publishes a law text that does
 * not exist — worse than showing the instruction. Everything not understood
 * comes back as `null` with a reason, and stays an instruction on screen.
 */
import { normalizeText, stripQuotes } from './lawText'

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

/** Which level of the law an address points at. */
export type UnitLevel = 'para' | 'abs' | 'z' | 'lit' | 'satz' | 'abschnitt' | 'titel' | 'document'

/**
 * One addressed place in a law: "§ 9 Abs. 1 Z 3 lit. b zweiter Satz".
 * Components are strings, not numbers — "5a", "3b" and roman Anlagen are
 * all legal, and the number is an identifier, never arithmetic.
 */
export interface NovaoAddress {
  /** "§ 9", "Art. 3", "Anlage 2" — the top-level unit, as written */
  para: string | null
  abs: string | null
  z: string | null
  lit: string | null
  /**
   * "erster", "zweiter", "letzter" — a sentence inside the addressed unit;
   * "einleitung" is the Einleitungssatz in front of a list, "schluss" the
   * Schlussteil behind it.
   */
  satz: string | null
  /** How many sentences from `satz` on: "die ersten beiden Sätze" is erster + 2 */
  satzCount: number
  /** Further targets of the same instruction ("Abs. 2 und 3"): ids at `level` */
  siblings: string[]
  /** The deepest level the address names */
  level: UnitLevel
  /** True when the instruction addresses the *heading* rather than the text */
  heading: boolean
  raw: string
}

/**
 * The sentence-level address, in every form the corpus showed (46 of 459
 * instructions in the 23-Novellen harness, 2026-09-09):
 *
 *   der zweite Satz · zweiter Satz · im zweiten Satz · des zweiten Satzes ·
 *   2. Satz · erster und zweiter Satz · die ersten beiden Sätze · die
 *   letzten beiden Sätze · Einleitungssatz · Schlusssatz · Schlussteil
 *
 * German declines the ordinal, so the stem is captured and normalised to the
 * "-er" form the ordinal table uses. Matching only "zweiter Satz" left the
 * other forms with `satz` null, the address fell back to the Absatz, and
 * "entfallen die letzten beiden Sätze" deleted the whole Absatz while
 * reporting success (Luftfahrtgesetz § 169, 2026-09-09). Which is why a
 * sentence word the parser does *not* understand now refuses the address
 * (`SATZ_WORD`) instead of widening it.
 */
const ORDINAL_WORD = '(?:erste|zweite|dritte|vierte|fünfte|sechste|siebente|siebte|achte|neunte|zehnte|letzte|vorletzte)'
const ORDINAL_SATZ = new RegExp(`\\b(${ORDINAL_WORD})[rnsm]?(?:\\s+und\\s+(${ORDINAL_WORD})[rnsm]?)?\\s+Satz(?:es)?\\b`, 'i')
const NUMERIC_SATZ = /\b(\d{1,2})\.\s*Satz(?:es)?\b/i
const GROUP_SATZ = /\b(ersten|letzten)\s+(beiden|zwei|drei|vier|fünf)\s+Sätze\b/i
const PART_SATZ = /\b(Einleitungssatz|Einleitungsteil|Schlusssatz|Schlussteil)\b/i
/** Any sentence word at all — an address that carries one must resolve it or be refused. */
const SATZ_WORD = /\bS[äa]tze?s?\b|\bHalbsatz|\bEinleitungssatz|\bEinleitungsteil|\bSchlusssatz|\bSchlussteil/i

const ORDINAL_INDEX: Record<string, number> = { erste: 0, zweite: 1, dritte: 2, vierte: 3, fünfte: 4, sechste: 5, siebente: 6, siebte: 6, achte: 7, neunte: 8, zehnte: 9 }
const ORDINAL_BY_INDEX = ['erster', 'zweiter', 'dritter', 'vierter', 'fünfter', 'sechster', 'siebenter', 'achter', 'neunter', 'zehnter']
const COUNT_WORD: Record<string, number> = { beiden: 2, zwei: 2, drei: 3, vier: 4, fünf: 5 }

/**
 * Reads the sentence part of an address. `null` means no sentence is
 * addressed; `{ satz: null }` means a sentence word is there but not
 * understood, and the caller must refuse.
 */
export function parseSatz(tail: string): { satz: string | null; satzCount: number } | null {
  const part = PART_SATZ.exec(tail)
  if (part) return { satz: /^Einleitung/i.test(part[1]!) ? 'einleitung' : 'schluss', satzCount: 1 }
  const group = GROUP_SATZ.exec(tail)
  if (group) return { satz: /^ersten$/i.test(group[1]!) ? 'erster' : 'letzter', satzCount: COUNT_WORD[group[2]!.toLowerCase()]! }
  const ordinal = ORDINAL_SATZ.exec(tail)
  if (ordinal) {
    const first = ordinal[1]!.toLowerCase()
    if (!ordinal[2]) return { satz: `${first}r`, satzCount: 1 }
    // "erster und zweiter Satz": only a consecutive pair is a range.
    const a = ORDINAL_INDEX[first]
    const b = ORDINAL_INDEX[ordinal[2]!.toLowerCase()]
    if (a === undefined || b === undefined || b !== a + 1) return { satz: null, satzCount: 0 }
    return { satz: `${first}r`, satzCount: 2 }
  }
  const numeric = NUMERIC_SATZ.exec(tail)
  if (numeric) {
    const word = ORDINAL_BY_INDEX[Number(numeric[1]) - 1]
    return word ? { satz: word, satzCount: 1 } : { satz: null, satzCount: 0 }
  }
  if (SATZ_WORD.test(tail)) return { satz: null, satzCount: 0 }
  return null
}

const PARA_RE = /(?:§+\s*(\d+[a-z]*(?:\.\d+)?)|\bArt(?:\.|ikel)\s*(\d+[a-z]*(?:\.\d+)?)|\b(Anlage|Anhang)\s+([\dIVXL]+[a-z]*))/i
const ABS_RE = /\bAbs\.?\s*(\d+[a-z]*)/i
const Z_RE = /\bZ(?:iffer)?\.?\s*(\d+[a-z]*)/i
const LIT_RE = /\blit\.?\s*([a-z]+)\b/i
const ABSCHNITT_RE = /\b(\d+[a-z]*)\.\s*(?:Haupt|Unter)?[Aa]bschnitt(?:e?s)?\b|\b(?:Haupt|Unter)?[Aa]bschnitt\s+([\dIVXL]+[a-z]*)/
const TITEL_RE = /\bTitel des (?:Bundesgesetzes|Gesetzes)\b|\bder Titel dieses\b/i
const DOCUMENT_RE = /\b(?:im|Im) gesamten (?:Gesetzes|Verordnungs|Bundesgesetzes)?text\b|\bin allen (?:Bestimmungen|Paragraf)/i

/**
 * "Die Überschrift zu § 5 lautet" targets the heading; "§ 5 lautet samt
 * Überschrift" replaces the paragraph *including* it. Two different
 * operations, one word apart.
 *
 * No `\b` in front of "Überschrift": JavaScript word boundaries are ASCII,
 * so "Ü" counts as a non-word character and `\bÜberschrift` never matches
 * at the start of a word. Silent, and it cost this module 57 of 67 heading
 * instructions in the first measurement (2026-09-08).
 */
const HEADING_TARGET_RE = /Überschrift(?:en)?\s+(?:zu|des|der|von|zum|im|dieses)\b|erhäl?t folgende Überschrift|Anlagenbezeichnung/i

/** Quoted spans are operands, never addresses — "…den Ausdruck 'Abs. 1 Z 1 bis 5'…". */
function maskQuotes(t: string): string {
  return t.replace(/"[^"]*"/g, '""')
}

/**
 * An instruction that creates text describes the new unit after "folgende…":
 * "Dem § 5 wird folgender Abs. 4 angefügt". Everything from that word on is
 * payload, not address — reading it as the target made "§ 5" become
 * "§ 5 Abs. 4", which would have appended into the wrong place.
 */
const PAYLOAD_MARKER = /\bfolgende[rnms]?\b|\bnachstehende[rnms]?\b/i

export function splitPayloadScope(head: string): { scope: string; payload: string } {
  const m = PAYLOAD_MARKER.exec(head)
  return m ? { scope: head.slice(0, m.index), payload: head.slice(m.index) } : { scope: head, payload: '' }
}

/**
 * "Z 10 bis 15" → the ids in between. Two forms are safe: plain integers,
 * and a shared numeric stem with single letters ("Abs. 4a bis 4c"). Anything
 * else returns null and the instruction is refused rather than guessed.
 */
export function expandRange(from: string, to: string): string[] | null {
  if (/^\d+$/.test(from) && /^\d+$/.test(to)) {
    const a = Number(from)
    const b = Number(to)
    if (b <= a || b - a > 60) return null
    return Array.from({ length: b - a }, (_, i) => String(a + i + 1))
  }
  const fm = /^(\d+)([a-z])$/.exec(from)
  const tm = /^(\d+)([a-z])$/.exec(to)
  if (fm && tm && fm[1] === tm[1]) {
    const a = fm[2]!.charCodeAt(0)
    const b = tm[2]!.charCodeAt(0)
    if (b <= a || b - a > 25) return null
    return Array.from({ length: b - a }, (_, i) => `${fm[1]}${String.fromCharCode(a + i + 1)}`)
  }
  return null
}

/**
 * Trailing enumerations on the deepest component: "Abs. 2 und 3",
 * "Z 4 bis 7", "Abs. 1, 2 und 5". Returns null when the enumeration is real
 * but cannot be expanded — the caller must then refuse the instruction
 * rather than silently act on the first target only.
 */
function siblingsAfter(rest: string, first: string): string[] | null {
  const m = /^\s*((?:,\s*\d+[a-z]*\s*)*)(und|bis|sowie|,)\s*(\d+[a-z]*)\b/i.exec(rest)
  if (!m) return []
  const listed = [...m[1]!.matchAll(/(\d+[a-z]*)/g)].map((x) => x[1]!)
  const last = m[3]!
  if (/^bis$/i.test(m[2]!)) {
    const range = expandRange(first, last)
    return range === null ? null : [...listed, ...range]
  }
  return [...listed, last]
}

/**
 * Reads the deepest address in an instruction fragment. Returns null when no
 * unit is named at all — a bare "In Abs. 5 …" only makes sense inside a
 * container ("§ 12 wird wie folgt geändert:"), which the caller resolves by
 * passing `inherited`.
 */
export function parseAddress(text: string, inherited?: NovaoAddress | null): NovaoAddress | null {
  const t = maskQuotes(normalizeText(text))
  const heading = HEADING_TARGET_RE.test(t)

  // A law organised in Artikel addresses a § that exists only inside one of
  // them: "Art. II § 1 Abs. 5 lautet". Neither this address model nor the
  // standing law carries the Artikel, so the § resolved against the whole
  // document — in the Lebensmittelbewirtschaftungsgesetz "Art. II § 1" found
  // Art. 1's Verfassungsbestimmung and missed editing it by a single Absatz
  // (2026-09-09). An `Art.` *after* the § is a citation ("die Wortfolge Art. 9
  // der Verordnung"), not a container, so only the leading form is refused.
  // Until the Artikel is part of a paragraph's identity this is a refusal.
  const artikel = /\bArt(?:\.|ikel)\s*[\dIVXL]+/i.exec(t)
  const paragraphAt = t.indexOf('§')
  if (artikel && paragraphAt > artikel.index) return null

  if (DOCUMENT_RE.test(t)) {
    return { para: null, abs: null, z: null, lit: null, satz: null, satzCount: 0, siblings: [], level: 'document', heading: false, raw: t }
  }

  const pm = PARA_RE.exec(t)
  if (!pm) {
    const sm = ABSCHNITT_RE.exec(t)
    if (sm) {
      const nr = sm[1] ?? sm[2] ?? ''
      return { para: `Abschnitt ${nr}`, abs: null, z: null, lit: null, satz: null, satzCount: 0, siblings: [], level: 'abschnitt', heading, raw: t }
    }
    if (TITEL_RE.test(t)) {
      return { para: null, abs: null, z: null, lit: null, satz: null, satzCount: 0, siblings: [], level: 'titel', heading: true, raw: t }
    }
    if (!inherited?.para) return null
  }

  const para = pm ? (pm[1] ? `§ ${pm[1]}` : pm[2] ? `Art. ${pm[2]}` : `${pm[3]} ${pm[4]}`) : inherited!.para
  // Components are read after the § so a § number is not mistaken for an
  // Absatz of an earlier reference in the same sentence.
  const tail = pm ? t.slice(pm.index + pm[0].length) : t
  const am = ABS_RE.exec(tail)
  const zm = Z_RE.exec(tail)
  const lm = LIT_RE.exec(tail)
  // The sentence word can stand in front of the § ("Im Schlussteil des
  // § 169 Abs. 1"), so it is read from the whole address, not from the tail.
  const sentence = parseSatz(t)
  // A sentence word the parser cannot place widens the target to the whole
  // unit if it is ignored — the over-deletion this module exists to prevent.
  if (sentence && sentence.satz === null) return null

  const abs = am?.[1] ?? (pm ? null : inherited?.abs) ?? null
  const z = zm?.[1] ?? null
  const lit = lm?.[1] ?? null
  const satz = sentence?.satz ?? null
  const satzCount = sentence?.satzCount ?? 0
  const level: UnitLevel = satz ? 'satz' : lit ? 'lit' : z ? 'z' : abs ? 'abs' : 'para'

  // The enumeration attaches to the deepest numbered component.
  const deepest = lm ?? zm ?? am
  let siblings: string[] = []
  if (deepest) {
    const after = tail.slice(deepest.index + deepest[0].length)
    const found = siblingsAfter(after, deepest[1]!)
    if (found === null) return null
    siblings = found
  } else if (pm) {
    const found = siblingsAfter(tail, pm[1] ?? pm[2] ?? pm[4] ?? '')
    if (found === null) return null
    siblings = found
  }

  return { para, abs, z, lit, satz, satzCount, siblings, level, heading, raw: t }
}

/**
 * An instruction may name several full addresses at once: "In § 17 Abs. 4,
 * § 19 Abs. 1, § 29 Abs. 3, § 31 Abs. 1 und § 46 Abs. 2 werden jeweils …".
 * Reading only the first one applied the change to a fifth of the law and
 * reported success — a silent wrong result, the one outcome this module
 * exists to prevent (found by the harness on BGBl. I Nr. 187/2022).
 *
 * Returns one address per named place, or null if any part fails to parse.
 */
export function parseAddressList(text: string, inherited?: NovaoAddress | null): NovaoAddress[] | null {
  const t = maskQuotes(normalizeText(text))
  const parts = t.split(/\s*,\s*|\s+(?:und|sowie)\s+/i).filter((p) => p.trim())
  const withPara = parts.filter((p) => PARA_RE.test(p))
  if (withPara.length < 2) {
    const single = parseAddress(text, inherited)
    return single ? [single] : null
  }
  const out: NovaoAddress[] = []
  for (const part of withPara) {
    const a = parseAddress(part, inherited)
    if (!a) return null
    out.push(a)
  }
  return out
}

/** Stable key of an address, for matching against parsed law units. */
export function addressKey(a: NovaoAddress): string {
  if (a.level === 'document') return '(gesamter Text)'
  if (a.level === 'titel') return '(Titel)'
  const satz = a.satz === 'einleitung' ? 'Einleitungssatz' : a.satz === 'schluss' ? 'Schlussteil' : a.satz && (a.satzCount > 1 ? `${a.satz} Satz +${a.satzCount - 1}` : `${a.satz} Satz`)
  return [a.para, a.abs && `Abs. ${a.abs}`, a.z && `Z ${a.z}`, a.lit && `lit. ${a.lit}`, satz].filter(Boolean).join(' ')
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/** What kind of child an insert/append instruction creates. */
export type ChildLevel = 'para' | 'abs' | 'z' | 'lit' | 'satz' | 'unknown'

export type NovaoOp =
  /**
   * "§ 5 Abs. 2 lautet:" — the addressed unit is replaced by the quoted text.
   * `run` marks the explicit form "durch folgende §§ 7 bis 14 ersetzt", the
   * only one allowed to change the number of units.
   */
  | { kind: 'replace'; target: NovaoAddress; withHeading: boolean; run: boolean }
  /** "Die Überschrift zu § 5 lautet:" */
  | { kind: 'replaceHeading'; target: NovaoAddress }
  /** "Dem § 5 wird folgender Abs. 4 angefügt:" — appended as the last child */
  | { kind: 'append'; target: NovaoAddress; child: ChildLevel; childIds: string[] }
  /** "Nach § 5 wird folgender § 5a eingefügt:" — inserted behind the anchor */
  | { kind: 'insertAfter'; anchor: NovaoAddress; child: ChildLevel; childIds: string[]; where: 'after' | 'before' }
  /** "§ 5 Abs. 3 entfällt." */
  | { kind: 'delete'; target: NovaoAddress; withHeading: boolean }
  /** "In § 5 Abs. 1 wird die Wortfolge X durch die Wortfolge Y ersetzt." */
  | { kind: 'replacePhrase'; target: NovaoAddress; from: string; to: string; everywhere: boolean }
  /** "In § 5 Abs. 1 wird nach der Wortfolge X die Wortfolge Y eingefügt." */
  | { kind: 'insertPhrase'; target: NovaoAddress; anchor: string; where: 'after' | 'before'; text: string }
  /** "In § 5 Abs. 1 entfällt die Wortfolge X." */
  | { kind: 'deletePhrase'; target: NovaoAddress; text: string }
  /**
   * "Der bisherige § 10 erhält die Paragrafenbezeichnung „§ 11.“"; with
   * `toLast`, a run: "die Z 5 bis 9 erhalten die Ziffernbezeichnungen „4.“ bis „8.“"
   */
  | { kind: 'renumber'; target: NovaoAddress; to: string; toLast: string | null }
  /** "§ 5 wird wie folgt geändert:" — a heading over sub-instructions */
  | { kind: 'container'; target: NovaoAddress }
  /** "Im Inhaltsverzeichnis …" — derivable from the text, never applied */
  | { kind: 'toc' }

export interface ParsedInstruction {
  /** The operations this line asks for; a line may carry two (…ersetzt sowie … angefügt) */
  ops: NovaoOp[]
  /** Why nothing was produced — the string a coverage report groups by */
  reason: string | null
  /** Instruction line without its Ziffer number, normalised */
  line: string
}

const NUMBER_PREFIX = /^\s*(?:\d+[a-z]?|[a-z])[.)]\s*/
const QUOTED = /"([^"]*)"/g

function quotedParts(t: string): string[] {
  return [...t.matchAll(QUOTED)].map((m) => stripQuotes(m[1]!))
}

/** The instruction proper, cut before the colon that opens a quoted block. */
function instructionHead(t: string): string {
  const colon = t.indexOf(':')
  return colon > 0 && colon <= 240 ? t.slice(0, colon) : t
}

/**
 * The words legistic drafting uses for "a piece of text". Extended from the
 * corpus: Verweis, Fundstelle and Zeichenfolge appeared only in the refusal
 * list of the first measurement; Zitierung, Wortgruppe and the mirror form
 * "Zeichen- und Wortfolge" only in the second (2026-09-09). Order matters —
 * the alternation is tried left to right, so a compound has to precede the
 * word it starts with, or "Zeichen- und Wortfolge" matches as bare "Zeichen".
 */
const PHRASE_OBJECT =
  '(?:Wort-\\s*und\\s*Zeichenfolge|Zeichen-\\s*und\\s*Wortfolge|Wortfolge|Wortgruppe|Wortlaut|Worte|Wort|Wendung|Ausdruck|Zitierung|Zitat|Klammerausdruck|Begriff|Bezeichnung|Satzteil|Verweis|Fundstelle|Zeichenfolge|Zeichen|Punkt|Strichpunkt|Beistrich|Datum|Betrag|Zahl|Jahreszahl|Fassung der Kundmachung|Norm|Eintrag)'
const PHRASE_RE = new RegExp(`\\b${PHRASE_OBJECT}\\b`, 'i')
const AFTER_ANCHOR_RE = new RegExp(`\\bnach (?:dem|der|den) ${PHRASE_OBJECT}\\b`, 'i')
const BEFORE_ANCHOR_RE = new RegExp(`\\bvor (?:dem|der|den) ${PHRASE_OBJECT}\\b`, 'i')

const CHILD_BY_WORD: readonly (readonly [RegExp, ChildLevel])[] = [
  [/\bAbs(atz|ätze)?\.?\s*\d|\bAbsätze\b|\bAbsatz\b/i, 'abs'],
  [/\bZ(?:iffern?)?\.?\s*\d/i, 'z'],
  [/\blit(era)?\.?\s*[a-z]\b/i, 'lit'],
  [/\bSätze\b|\bSatz\b/i, 'satz'],
  [/§|\bParagraf|\bArt(\.|ikel)|\bAnlage\b/i, 'para'],
]

function childLevel(payload: string): ChildLevel {
  for (const [re, level] of CHILD_BY_WORD) if (re.test(payload)) return level
  return 'unknown'
}

/** The ids the payload announces: "folgende Abs. 4 und 5" → ["4","5"]. */
function childIds(payload: string, level: ChildLevel): string[] {
  const re = level === 'abs' ? ABS_RE : level === 'z' ? Z_RE : level === 'lit' ? LIT_RE : PARA_RE
  const m = re.exec(payload)
  if (!m) return []
  const first = m[1] ?? m[2] ?? m[4] ?? ''
  const more = siblingsAfter(payload.slice(m.index + m[0].length), first)
  return more === null ? [first] : [first, ...more]
}

/**
 * A single line can carry two instructions: "In § 1 Abs. 4 Z 8 werden der
 * Punkt am Ende durch einen Strichpunkt ersetzt sowie folgende Z 9 und Z 10
 * angefügt:". 1,7 % of the corpus. The split is deliberately conservative —
 * only where the second half opens with "folgende…" and a creating verb.
 */
const COMPOUND_SPLIT = /;\s*(?=[A-Za-zÄÖÜ§])|\s+(?:sowie|und)\s+(?=(?:es wird |es werden )?folgende[rnms]?\s)/gi

// `bezeichnung` without a leading boundary: "die Z 5 bis 9 erhalten die
// Ziffernbezeichnungen" is the second half of a compound line, and with
// `\bBezeichnung\b` it never counted as a verb, so the line was not split, the
// renumbering silently dropped, and "§ 107 Z 6 (neu) lautet" then landed on
// the old Z 6 (LMSVG, BGBl. I Nr. 75/2026, 2026-09-09).
const VERB_RE = /\blaute[nt]\b|\bersetzt\b|\bangefügt\b|\beingefügt\b|\bentfäll[te]\b|\bentfallen\b|\baufgehoben\b|bezeichnung(?:en)?\b|wie folgt geändert/i

export function splitCompound(line: string): string[] {
  // A semicolon only separates instructions when both halves carry a verb;
  // inside a quoted law text it separates nothing. Quotes are masked first so
  // "…27,5 vH; für Sofortlotterien…" cannot be mistaken for a second clause.
  const masked = line.replace(/"[^"]*"/g, (m) => '\u0000'.repeat(m.length))
  const bounds: number[] = []
  let last = 0
  for (const m of masked.matchAll(COMPOUND_SPLIT)) {
    const at = m.index! + m[0].length
    if (VERB_RE.test(line.slice(last, m.index!)) && VERB_RE.test(line.slice(at))) {
      bounds.push(m.index!, at)
      last = at
    }
  }
  if (bounds.length === 0) return [line]
  const parts: string[] = []
  let start = 0
  for (let i = 0; i < bounds.length; i += 2) {
    parts.push(line.slice(start, bounds[i]))
    start = bounds[i + 1]!
  }
  parts.push(line.slice(start))
  return parts.map((p) => p.trim()).filter(Boolean)
}

/**
 * The unquoted punctuation operands of legistic drafting: "wird der Punkt am
 * Ende durch einen Strichpunkt ersetzt". They carry no quotation marks
 * because they are single characters.
 */
const PUNCT_WORD: Record<string, string> = { punkt: '.', strichpunkt: ';', beistrich: ',', doppelpunkt: ':', gedankenstrich: '–' }
const PUNCT_REPLACE_RE = /\bde[rn]\s+(Punkt|Strichpunkt|Beistrich|Doppelpunkt|Gedankenstrich)\b[^"]*?\bdurch\s+(?:einen|ein|das|die|der)\s+(Punkt|Strichpunkt|Beistrich|Doppelpunkt|Gedankenstrich)\b/i

/**
 * Does "jeweils" mean *every occurrence*? Only when the instruction names a
 * single place: "In § 5 wird jeweils das Wort X durch Y ersetzt". With several
 * places — "In § 28 Abs. 3 und § 99 Abs. 1 wird jeweils …" — it distributes
 * the change over the places, and inside each the phrase must still be
 * unique. Reading it as every-occurrence there replaced whatever matched.
 */
function everyOccurrence(head: string, targets: readonly NovaoAddress[]): boolean {
  if (targets.some((t) => t.level === 'document')) return true
  const single = targets.length === 1 && targets[0]!.siblings.length === 0
  return single && /\bjeweils\b|\bjedes Mal\b/i.test(head)
}

function parseOne(raw: string, inherited: NovaoAddress | null | undefined, whole: string): ParsedInstruction {
  const line = normalizeText(raw).replace(NUMBER_PREFIX, '')
  const head = instructionHead(line)
  const quotes = quotedParts(line)
  const ok = (op: NovaoOp): ParsedInstruction => ({ ops: [op], reason: null, line })
  const fail = (reason: string): ParsedInstruction => ({ ops: [], reason, line })

  if (/^(Im |Das |Die |In dem )?Inhaltsverzeichnis/i.test(head)) return ok({ kind: 'toc' })

  const { scope, payload } = splitPayloadScope(head)
  const targets = parseAddressList(scope || head, inherited)
  if (!targets || targets.length === 0) return fail('keine auflösbare Adresse')
  const target = targets[0]!

  if (/wird wie folgt geändert|werden wie folgt geändert|wird wie folgt geändert/i.test(head)) return ok({ kind: 'container', target })

  // "erhält die Absatzbezeichnung", "erhalten die Paragraphenbezeichnungen",
  // "erhält die Bezeichnung": the noun varies in spelling (Paragrafen/
  // Paragraphen) and number, so only its tail is matched.
  if (/erh(?:äl|al)t(?:en)?\s+die\s+\w*bezeichnung(?:en)?\b/i.test(head)) {
    const to = quotes[0]
    if (!to) return fail('Umbenennung ohne neue Bezeichnung')
    if (targets.length > 1) return fail(`${targets.length} Ziele für eine Umbenennung`)
    // "die Z 5 bis 9 erhalten die Ziffernbezeichnungen „4.“ bis „8.“" — a run,
    // which the applier expands and checks against the number of targets.
    const range = quotes.length === 2 && /"\s*bis\s*"/.test(line)
    if (quotes.length > 1 && !range) return fail(`${quotes.length} neue Bezeichnungen, Zuordnung unklar`)
    return ok({ kind: 'renumber', target, to, toLast: range ? quotes[1]! : null })
  }

  // Phrase operations are scoped *inside* a unit, so they must be tested
  // before the unit verbs: "In § 5 Abs. 1 entfällt die Wortfolge X" is a
  // phrase deletion, not the deletion of Abs. 1.
  const punct = PUNCT_REPLACE_RE.exec(head)
  if (punct) {
    return ok({
      kind: 'replacePhrase',
      target,
      from: PUNCT_WORD[punct[1]!.toLowerCase()]!,
      to: PUNCT_WORD[punct[2]!.toLowerCase()]!,
      everywhere: false,
    })
  }

  if (PHRASE_RE.test(head)) {
    // "wird in der jeweils grammatikalisch richtigen Form die Wortfolge X
    // durch Y ersetzt": the drafters say outright that the replacement is to
    // be declined per context — "der Bundesministerin" becomes "des
    // Bundesministers". A literal substitution wrote "der Bundesminister"
    // into the Bundesstraßen-Mautgesetz (BGBl. I Nr. 83/2025, 2026-09-09).
    // Not a text operation; refused.
    if (/grammatikalisch (?:richtigen|korrekten) Form/i.test(head)) return fail('Ersetzung in der grammatikalisch richtigen Form — nicht mechanisch')
    if (/\bersetzt\b|\ban (?:die )?Stelle\b/i.test(head)) {
      if (quotes.length < 2) return fail('Ersetzung ohne zwei Operanden')
      // "… der Verweis auf A durch B und der Betrag von C durch D ersetzt":
      // four operands, two substitutions. Applying only the first pair would
      // publish a text that is half-amended — so either every pair is read,
      // or the instruction is refused.
      if (quotes.length > 2) {
        const pairs = (head.match(/\bdurch\b/gi) ?? []).length
        if (quotes.length % 2 !== 0 || pairs !== quotes.length / 2) return fail(`${quotes.length} Operanden, Paarbildung unklar`)
        const everywhere = everyOccurrence(head, targets)
        const many: NovaoOp[] = []
        for (const t of targets) for (let i = 0; i + 1 < quotes.length; i += 2) many.push({ kind: 'replacePhrase', target: t, from: quotes[i]!, to: quotes[i + 1]!, everywhere })
        return { ops: many, reason: null, line }
      }
      // Both German forms name the old text first — "wird A durch B ersetzt"
      // and "tritt an die Stelle der Wortfolge A die Wortfolge B". Only when
      // the new text is fronted ("Die Wortfolge B tritt an die Stelle von A")
      // does the order flip, and the position of the verb says which it is.
      const verb = /an (?:die )?Stelle/i.exec(line)
      const firstQuote = line.indexOf('"')
      const reversed = verb !== null && firstQuote >= 0 && verb.index > firstQuote
      const from = reversed ? quotes[1]! : quotes[0]!
      const to = reversed ? quotes[0]! : quotes[1]!
      const everywhere = everyOccurrence(head, targets)
      return { ops: targets.map((t) => ({ kind: 'replacePhrase' as const, target: t, from, to, everywhere })), reason: null, line }
    }
    if (/\beingefügt\b|\bergänzt\b|\bangefügt\b|\bvorangestellt\b|\beinzufügen\b|\bgesetzt\b/i.test(head)) {
      const before = BEFORE_ANCHOR_RE.test(head) || /vorangestellt/i.test(head)
      if (quotes.length < 2) return fail('Einfügung ohne Anker und Text')
      // "das Wort „zuletzt“ gestrichen sowie nach der Wort- und Zeichenfolge
      // „…“ die Wort- und Zeichenfolge „…“ eingefügt": three operands, and
      // reading the first two as anchor and text inserted a citation behind
      // the word that was to be deleted (BGBl. I Nr. 36/2025 § 20, 2026-09-09).
      if (quotes.length > 2) return fail(`${quotes.length} Operanden für eine Einfügung`)
      if (!before && !AFTER_ANCHOR_RE.test(head)) return fail('Einfügung ohne erkennbaren Anker')
      // "wird nach dem Wort X ein Beistrich gesetzt und danach die Wortfolge Y
      // eingefügt": two insertions in one clause, and the first one carries
      // no quotation marks. Reading only the quoted pair dropped the comma
      // (Luftfahrtgesetz §§ 9, 131, 2026-09-09).
      const punctFirst = /\b(?:ein|der|das)\s+(Beistrich|Strichpunkt|Punkt|Doppelpunkt)\s+(?:gesetzt\s+und\s+danach|(?:und|sowie)\s+die)\b/i.exec(head)
      const text = punctFirst ? `${PUNCT_WORD[punctFirst[1]!.toLowerCase()]} ${quotes[1]!}` : quotes[1]!
      return { ops: targets.map((t) => ({ kind: 'insertPhrase' as const, target: t, anchor: quotes[0]!, where: (before ? 'before' : 'after') as 'before' | 'after', text })), reason: null, line }
    }
    if (/\bentfäll[te]\b|\bentfallen\b|\bgestrichen\b|\baufgehoben\b|\bentfernt\b/i.test(head)) {
      if (!quotes[0]) return fail('Streichung ohne Text')
      return { ops: targets.map((t) => ({ kind: 'deletePhrase' as const, target: t, text: quotes[0]! })), reason: null, line }
    }
    if (/\blaute[nt]\b/i.test(head)) return fail('Wortfolge lautet — Teiltext-Ersetzung, nicht abgesichert')
    return fail('Wortfolge genannt, aber kein bekanntes Verb')
  }

  if (HEADING_TARGET_RE.test(head) && /\blaute[nt]\b|erhäl?t folgende Überschrift/i.test(head)) {
    return ok({ kind: 'replaceHeading', target: { ...target, heading: true } })
  }

  const withHeading = /samt Überschrift/i.test(head)

  // "In § 33 Abs. 1 entfällt die Absatzbezeichnung „(1)“": the *number* goes,
  // the text stays — the § simply has one unnumbered Absatz from then on.
  // Read as a unit deletion this removed the Absatz (Tierschutzgesetz,
  // BGBl. I Nr. 124/2024, 2026-09-09). A renumbering to the empty designation.
  if (/\w*bezeichnung\b/i.test(head) && /\bentfäll[te]\b|\bentfallen\b/i.test(head)) {
    if (targets.length > 1 || target.level === 'para' || target.level === 'satz') return fail('Wegfall einer Bezeichnung — Ziel nicht eindeutig')
    return ok({ kind: 'renumber', target, to: '', toLast: null })
  }

  if (/\bentfäll[te]\b|\bentfallen\b|\baufgehoben\b|\bgestrichen\b/i.test(head)) {
    return { ops: targets.map((t) => ({ kind: 'delete' as const, target: t, withHeading })), reason: null, line }
  }

  // A unit replacement written with `ersetzt` instead of `lautet`: "In § 24j
  // Abs. 3 wird der letzte Satz durch folgende Sätze ersetzt:". Reaching this
  // line means no phrase noun was named, so the thing replaced is the
  // addressed unit itself. The `durch folgende` anchor is required rather
  // than a bare `ersetzt`, because a compound like "… durch einen Beistrich
  // ersetzt und danach folgender Satz angefügt" also carries both words and
  // is an append. Worth 15 of the corpus's refusals (2026-09-09).
  const replacedByPayload = payload !== '' && /\bdurch\s+(?:die|den|das|der)?\s*folgende/i.test(head) && /\bersetzt\b/i.test(head)

  if (/\blaute[nt]\b|\berhäl?t folgende Fassung\b|\berhalten folgende Fassung\b/i.test(head) || replacedByPayload) {
    // Several §§ with one quoted block: which text belongs to which § is not
    // decidable from the instruction alone.
    if (targets.length > 1) return fail(`${targets.length} Ziele für eine Neufassung`)
    return ok({ kind: 'replace', target, withHeading, run: replacedByPayload })
  }

  if (/\beingefügt\b|\beingereiht\b/i.test(head)) {
    const before = /\bvor\b/i.test(scope) && !/\bnach\b/i.test(scope)
    if (!/\bnach\b|\bvor\b/i.test(scope)) return fail('Einfügung ohne Anker')
    const child = childLevel(payload || whole)
    return ok({ kind: 'insertAfter', anchor: target, child, childIds: childIds(payload, child), where: before ? 'before' : 'after' })
  }

  if (/\bangefügt\b|\bhinzugefügt\b|\bangeschlossen\b/i.test(head)) {
    const child = childLevel(payload || whole)
    // "Nach § 408a wird folgender § 408b samt Überschrift angefügt": a new §
    // behind the named one, not a child of it. As an append it was pushed
    // into § 408a's children and became part of its text (ASVG, BGBl. I Nr.
    // 38/2024, 2026-09-09).
    if (child === 'para') {
      if (targets.length > 1) return fail(`${targets.length} Anker für einen neuen Paragraphen`)
      return ok({ kind: 'insertAfter', anchor: target, child, childIds: childIds(payload, child), where: 'after' })
    }
    // "§ 3 Abs. 1 und § 4 Abs. 1 wird jeweils folgender Satz angefügt" names
    // two places; appending to the first alone reported success on a law
    // that was half amended (Bildungsinvestitionsgesetz, 2026-09-09).
    return { ops: targets.map((t) => ({ kind: 'append' as const, target: t, child, childIds: childIds(payload, child) })), reason: null, line }
  }

  return fail('kein bekanntes Verb')
}

/**
 * One Novellierungsanordnung line → its operations, or a reason why not.
 *
 * `inherited` carries the address of an enclosing container instruction, so
 * that "a) In Abs. 5 wird …" under "§ 12 wird wie folgt geändert:" resolves.
 */
export function parseInstruction(raw: string, inherited?: NovaoAddress | null): ParsedInstruction {
  const line = normalizeText(raw).replace(NUMBER_PREFIX, '')
  const parts = splitCompound(line)
  if (parts.length === 1) return parseOne(line, inherited, line)

  const ops: NovaoOp[] = []
  const reasons: string[] = []
  let context = inherited ?? null
  for (const part of parts) {
    const parsed = parseOne(part, context, line)
    if (parsed.ops.length === 0) reasons.push(parsed.reason ?? '?')
    ops.push(...parsed.ops)
    // The second half of "…in § 1 Abs. 4 Z 8 … sowie folgende Z 9 angefügt"
    // has no address of its own; it inherits the first half's.
    const first = parsed.ops[0]
    if (first && 'target' in first) context = first.target
    else if (first && 'anchor' in first) context = first.anchor
  }
  if (ops.length === 0) return { ops: [], reason: reasons[0] ?? 'kein bekanntes Verb', line }
  return { ops, reason: reasons.length ? `Teil nicht gelesen: ${reasons[0]}` : null, line }
}
