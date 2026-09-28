/**
 * Novellierungsanordnungen → typed operations (docs/architecture.md §12.12).
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * An Austrian Novelle is a list of instructions ("In § 9 Abs. 1 wird nach
 * der Wortfolge X die Wortfolge Y eingefügt"). To show the law that comes
 * out of them, each instruction has to become an operation on the standing
 * text. This module does the reading half; `kons/lawApply.ts` does the
 * applying.
 *
 * Measured over 6.576 instructions from 300 drafts of the RIS Begut corpus
 * (2026-09-08, `scripts/corpus/novao.ts`): six verbs carry 98,6 % of them —
 * lautet 28 %, ersetzt 26 %, angefügt 19 %, eingefügt 17 %, entfällt 13 %,
 * Bezeichnung 1,4 %. The long tail is in the *address*, not the verb.
 *
 * Design rule, and the whole point of the module: **it refuses rather than
 * guesses.** A wrongly applied instruction publishes a law text that does
 * not exist — worse than showing the instruction. Everything not understood
 * comes back as `null` with a reason, and stays an instruction on screen.
 */
import { normalizeText, stripQuotes } from '../lawtext/normalize'
import { articleNumberKey, bareParaId } from '../text/designation'

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
  /**
   * "2" — the Artikel of the STANDING law this § lives in, normalised to the
   * arabic form RIS keys it by; null where the law has no Artikel level,
   * which is the ordinary case.
   *
   * Not part of `para`, and deliberately so: `para` is the designation as
   * written, and every reader of it downstream — `bareParaId`, the annex's
   * `§ 3.`, `addressedParagraphs` — wants the § alone. The Artikel is the
   * SCOPE the § is unique in, so it belongs beside the designation rather
   * than inside it (§12.12a).
   */
  artikel: string | null
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
  /**
   * "erster", "zweiter", "letzter" — a Halbsatz, inside `satz` where one is
   * named. What a Halbsatz IS the drafting does not settle: in the corpus it
   * ends at a comma (all seven „lautet der erste Halbsatz" of the drafts, LFG
   * § 169 Abs. 5) or at a semicolon (RAO § 50). So the address carries only the
   * ordinal, and the engine finds the boundary where the operation itself
   * says it lies (`halbsatzSpan` in `kons/lawApply.ts`).
   */
  halbsatz: string | null
  /** Further targets of the same instruction ("Abs. 2 und 3"): ids at `level` */
  siblings: string[]
  /** The deepest level the address names */
  level: UnitLevel
  /** True when the instruction addresses the *heading* rather than the text */
  heading: boolean
  /**
   * True when the address names the heading *in addition to* the text: "In
   * § 22 samt Überschrift … wird die Wortfolge X durch Y ersetzt". Two loci,
   * one instruction — `heading` would drop the text, its absence drops the
   * heading (StPO § 22, Bundesstaatsanwaltschaft-Entwurf, 2026-09-19).
   */
  alsoHeading: boolean
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
/** „der Halbsatz", „der Satz" in front of a (masked) quotation: the noun of the quoted text, not a sentence word. */
const HALBSATZ_NOUN_RE = /\b(?:der|den|dem|die|einen?|ein)\s+(?:Halbsatz(?:es)?|Satz(?:es)?|Sätze)\s*(?="")/gi
/** „erster Halbsatz", „im letzten Halbsatz", „der zweite Halbsatz". */
const ORDINAL_HALBSATZ = new RegExp(`\\b(${ORDINAL_WORD})[rnsm]?\\s+Halbsatz(?:es)?\\b`, 'i')
/** Any sentence word at all — an address that carries one must resolve it or be refused. */
const SATZ_WORD = /\bS[äa]tze?s?\b|\bHalbsatz|\bEinleitungssatz|\bEinleitungsteil|\bSchlusssatz|\bSchlussteil/i

/**
 * The units below the Litera — and the whole reason they are named here is
 * that neither this address model nor `lawtext/konsTree.ts` has a level for
 * them.
 *
 * `NovaoAddress` ends at `lit`, `LIT_RE` takes the *first* `lit` it finds, and
 * nothing reads the word behind it; the tree has no sub-Litera either, so RIS
 * files „aa)" as a `lit` **sibling** of „a)". An address that names one was
 * therefore read as if the word were not there: „§ 5 Z 20 lit. a sublit. bb
 * lautet:" rewrote lit. a, „§ 7 Abs. 1 Z 2 lit. h sublit. cc entfällt."
 * deleted lit. h, and „In § 1 Abs. 1 Z 2 lautet der erste Teilstrich:"
 * replaced the whole Ziffer. No refusal, and both gate signals passed.
 *
 * Over the 6.576 harvested instructions (300 Entwürfe, `.cache/novao`,
 * 23.09.2026): 18 addresses name a `sublit`, 19 a `Teilstrich`, 8 a
 * `Spiegelstrich`; 13 of them are whole-unit operations (lautet/entfällt) —
 * thirteen §§ rewritten or deleted one level too high.
 *
 * Same mechanism as `SATZ_WORD`, and for the same reason: a component word
 * the model cannot place widens the target if it is ignored, and widening a
 * target is how standing law gets deleted while the engine reports success.
 * The reason names the word, because the refusal list is read to decide what
 * to build next.
 */
const SUBUNIT_WORD = /\b(sub-?lit(?:\.|era)?|Unterlit(?:\.|era)?|Teilstrich(?:e[ns]?|s|es)?|Spiegelstrich(?:e[ns]?|s|es)?)\b/i

/** The sub-unit word an address names, as written — null where it names none. */
export function unplaceableSubUnit(text: string): string | null {
  return SUBUNIT_WORD.exec(maskQuotes(normalizeText(text)))?.[1] ?? null
}

/**
 * The unit an address names that this model has **no root for** — not a
 * subdivision of a Paragraph like `sublit` above, but a structure standing
 * beside it: the law's `Titel`, an `Anhang` with its own Ziffern and Litera,
 * the `Tarifpost` of the Gerichtsgebührengesetz, the `Halbsatz` inside a
 * sentence, the heading of a `Hauptstück`, `Abschnitt` or `Teil`.
 *
 * All of them are refused either way — the point is the **census**. „Keine
 * auflösbare Adresse" was one bucket of 55 over 40 Sammelnovellen, and a
 * bucket that size says nothing about what to build. Named, it is: Anhang 18,
 * Tarifpost 13, Titel 7, Halbsatz 6, Hauptstück 3, Abschnitt 2, Artikel in
 * römischer Zahl 2, Teil 2 — and 2 that name no unit at all (26.09.2026).
 * Each of those is a different piece of work on a different part of the
 * model, and three of them need the standing text to carry the unit at all
 * (`StandingLaw` holds paragraphs and nothing above them, so „Der Titel
 * lautet:" has nowhere to go and is right to be refused).
 *
 * The reason carries the word **without a colon**, because the harness cuts
 * its census at the colon (`causeOf`) — with one, all eight would collapse
 * back into the single bucket this exists to split.
 */
const UNROOTED_UNIT = /\b(Anhang|Anhäng|Tarifpost|Anmerkung|Halbsatz|Halbsätz|Hauptstück|Abschnittsbezeichnung|Abschnitt|Titel|Teil)(?:e|en|es|s|n)?\b/i
const UNROOTED_NAME: Record<string, string> = { anhäng: 'Anhang', halbsätz: 'Halbsatz', abschnittsbezeichnung: 'Abschnitt' }

/** „Dem Art. VI wird folgende Z 85 angefügt" — the old laws number their Artikel in Roman. */
const ROMAN_ARTICLE = /\bArt(?:\.|ikel)\s+[IVXLCDM]+\b/

/** The unit an unresolvable address names, in one word — null where it names none. */
export function unrootedUnit(text: string): string | null {
  const clean = maskQuotes(normalizeText(text))
  if (ROMAN_ARTICLE.test(clean)) return 'Artikel in römischer Zahl'
  const word = UNROOTED_UNIT.exec(clean)?.[1]
  if (!word) return null
  return UNROOTED_NAME[word.toLowerCase()] ?? word
}

const ORDINAL_INDEX: Record<string, number> = { erste: 0, zweite: 1, dritte: 2, vierte: 3, fünfte: 4, sechste: 5, siebente: 6, siebte: 6, achte: 7, neunte: 8, zehnte: 9 }
const ORDINAL_BY_INDEX = ['erster', 'zweiter', 'dritter', 'vierter', 'fünfter', 'sechster', 'siebenter', 'achter', 'neunter', 'zehnter']
const COUNT_WORD: Record<string, number> = { beiden: 2, zwei: 2, drei: 3, vier: 4, fünf: 5 }

/**
 * Reads the sentence part of an address. `null` means no sentence is
 * addressed; `{ satz: null }` means a sentence word is there but not
 * understood, and the caller must refuse.
 */
function parseSatz(text: string): { satz: string | null; satzCount: number; halbsatz: string | null } | null {
  // The Halbsatz first, and out of the text, so the sentence words that are
  // left say which sentence it lies in („im letzten Satz der zweite
  // Halbsatz") — or that there is one the reading cannot place.
  const hm = ORDINAL_HALBSATZ.exec(text)
  const halbsatz = hm ? `${hm[1]!.toLowerCase()}r` : null
  const tail = hm ? text.replace(hm[0], ' ') : text
  const sentence = parseSentence(tail)
  if (!halbsatz) return sentence ? { ...sentence, halbsatz: null } : null
  if (sentence?.satz === null) return { satz: null, satzCount: 0, halbsatz: null }
  return { satz: sentence?.satz ?? null, satzCount: sentence?.satzCount ?? 0, halbsatz }
}

function parseSentence(tail: string): { satz: string | null; satzCount: number } | null {
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

/**
 * The unit an address names: a §, an Artikel that IS the target, or an
 * Anlage/Anhang.
 *
 * The Artikel branch reads a Roman numeral as well, because the older laws
 * number their Artikel that way and the instruction follows them: „Dem
 * Art. VI wird folgende Z 85 angefügt" (Gerichtsgebührengesetz), „Dem
 * Art. VII wird folgender Abs. 28 angefügt" (Altlastensanierungsgesetz).
 * Both were refused for want of a readable address while RIS carries the
 * unit as „Art. 6" and „Art. 7" — `articleNumberKey` joins the two
 * spellings, exactly as it already does for the Artikel that stands in front
 * of a § („Art. II § 7").
 *
 * The numeral may not be followed by a letter, or „Art. Inkrafttreten" would
 * read as Artikel 1. This branch is reached only where no § follows the
 * Artikel at all — with one, `parseAddress` cuts the scope at the § before
 * `PARA_RE` ever sees the Artikel.
 */
const PARA_RE = /(?:§+\s*(\d+[a-z]*(?:\.\d+)?)|\bArt(?:\.|ikel)\s*(\d+[a-z]*(?:\.\d+)?|[IVXLCDM]+(?![A-Za-zÄÖÜäöüß]))|\b(Anlage|Anhang)(?:e?s)?\b(?:\s+((?:\d+[a-z]*|[IVXL]+)(?![A-Za-zÄÖÜäöüß])))?)/i
const ABS_RE = /\bAbs\.?\s*(\d+[a-z]*)/i
const Z_RE = /\bZ(?:iffer)?\.?\s*(\d+[a-z]*)/i
const LIT_RE = /\blit\.?\s*([a-z]+)\b/i
const ABSCHNITT_RE = /\b(\d+[a-z]*)\.\s*(?:Haupt|Unter)?[Aa]bschnitt(?:e?s)?\b|\b(?:Haupt|Unter)?[Aa]bschnitt\s+([\dIVXL]+[a-z]*)/
const TITEL_RE = /\bTitel des (?:Bundesgesetzes|Gesetzes)\b|\bder Titel dieses\b/i
const DOCUMENT_RE = /\b(?:im|Im) gesamten (?:Gesetzes|Verordnungs|Bundesgesetzes)?text\b|\bin allen (?:Bestimmungen|Paragraf)/i
/**
 * The Artikel DIRECTLY in front of a § — "Art. II § 3", "Artikel 1 § 2".
 * Roman and arabic both occur, in one draft even both spellings of the same
 * Artikel (`articleNumberKey` joins them).
 *
 * The adjacency is the whole rule, and it was bought: "Art. n" anywhere ahead
 * of a § also matches a citation that has nothing to do with the target — "In
 * Umsetzung von Art. 5 der Richtlinie wird § 3 geändert". Read as a container
 * that § is looked up in an Artikel the law does not have, and worse, it
 * disagrees with the same § addressed plainly elsewhere, which costs the whole
 * Artikel its display (`kons/konsGate.ts`, measured on 116/ME). Every
 * container form in the corpus writes the § immediately behind the Artikel.
 */
const ARTIKEL_QUALIFIER_RE = /\bArt(?:\.|ikel)\s*([\dIVXLCDM]+)\s*§/i

/**
 * The Artikel a line names in front of its §, as the line writes it —
 * null where none stands there.
 *
 * Exported so that the readers outside this module ask the same grammar
 * rather than a second regex of their own; the arabic join is
 * `text/designation.articleNumberKey`, deliberately a separate step.
 */
export function articleQualifier(text: string): string | null {
  return ARTIKEL_QUALIFIER_RE.exec(maskQuotes(normalizeText(text)))?.[1] ?? null
}

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

/**
 * "samt Überschrift" *inside an address* — the heading comes along, the text
 * stays addressed. For a Neufassung that is the `withHeading` flag on the
 * operation; for a phrase operation it is a second place to act on, which
 * this module expresses as a second op against the heading slot.
 *
 * Population: 2 of 6.576 harvested instructions (300 Entwürfe, 2026-09-19) —
 * tiny, and both were half-applied before this existed: the body renamed,
 * the heading left standing. One of the two passed the Anhang gate that way.
 */
const ALSO_HEADING_RE = /samt\s+(?:der\s+|den\s+)?Überschrift(?:en)?/i

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
const PAYLOAD_MARKER = /\bfolgende[rnms]?\b|\bnachstehende[rnms]?\b|\bals\s+neue[rnms]?\b/i

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
  // „lit. h bis k": the Litera run itself, one letter each.
  if (/^[a-z]$/.test(from) && /^[a-z]$/.test(to)) {
    const a = from.charCodeAt(0)
    const b = to.charCodeAt(0)
    if (b <= a) return null
    return Array.from({ length: b - a }, (_, i) => String.fromCharCode(a + i + 1))
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
 * A component marker directly behind an enumerated number — the signal that
 * the number is a *paragraph* of its own and not a sibling of the component
 * in front of it.
 */
const OWN_COMPONENT_RE = /^\s*(?:Abs(?:\.|atz)|Z(?:iff(?:er)?)?\b|lit(?:\.|era))/i

/**
 * Trailing enumerations on the deepest component: "Abs. 2 und 3",
 * "Z 4 bis 7", "Abs. 1, 2 und 5". Returns null when the enumeration is real
 * but cannot be expanded — the caller must then refuse the instruction
 * rather than silently act on the first target only.
 *
 * **And null too where the number is no sibling at all.** In „In den §§ 48
 * Abs. 13 und 217 Abs. 13 wird die Wortfolge … ersetzt" only the *first*
 * Paragraph carries its § sign; the rest stand as bare numbers. So
 * `parseAddressList` sees one address and falls back to `parseAddress`, where
 * the 217 landed as a sibling of the deepest component: read as „§ 48
 * Abs. 217". The signal that separates the two cases stands directly behind
 * the number — where a component of its own follows it, it is a Paragraph.
 *
 * Measured over 60 Bundesgesetzblätter (18.09.2026): 40 instructions of this
 * shape. 36 of them refused anyway, but with a nonsensical reason
 * („Untereinheit nicht im Ausgangstext: § 48 Abs. 217"), and made up a large
 * part of the biggest class of application errors — the Vergabe-Gesetze alone
 * 42 of 107. **The other 4 were applied**, to exactly one of the Paragraphen
 * named, and reported success: „In den §§ 30 Abs. 3 zweiter Satz, 32 Abs. 4
 * …, 33 Abs. 6 … und 57 Abs. 2" changed § 30 and left three Paragraphen
 * untouched. RIS calls all four `halbangewendet` or `unvollständig` — no
 * invented word, no standing text either, and invisible to every check of the
 * engine against its own reading.
 *
 * An address over several Paragraphen is not representable in this model (an
 * operation has one `target`), so it is refused rather than guessed — the
 * same decision as for the article-structured laws. A refusal always beats
 * half an application („Verweigern schlägt Deckung", §12.12).
 */
function siblingsAfter(rest: string, first: string, level: EnumLevel = 'abs'): { ids: string[]; consumed: number } | null {
  const id = ENUM_ID[level]
  const des = ENUM_DESIGNATOR[level]
  // One sibling at a time, behind any of the separators: „1, 2 und 5", but
  // also „1 und 2 und 3" — which is how `parseAddressList` hands back „Abs. 1,
  // Abs. 2 und Abs. 3" after cutting it at every comma, and the old pattern
  // read two of the three (26.09.2026).
  const step = new RegExp(`^\\s*(,|und|sowie|bis)\\s*${des ? `${des}?` : ''}(${id})(?![\\p{L}\\p{N}])`, 'u')
  const ids: string[] = []
  let at = 0
  let previous = first
  for (let m = step.exec(rest); m; m = step.exec(rest.slice(at))) {
    const next = m[2]!
    // A Litera is one letter or a doubled one („aa"). Anything else the
    // two-letter pattern catches is a word — „und im Schlussteil" is no
    // Litera „im" — and ends the enumeration in front of it.
    if (level === 'lit' && next.length === 2 && next[0] !== next[1]) break
    if (m[1] === 'bis') {
      const range = expandRange(previous, next)
      if (range === null) return null
      ids.push(...range)
    } else ids.push(next)
    previous = next
    at += m[0].length
  }
  if (ids.length === 0) return { ids: [], consumed: 0 }
  if (OWN_COMPONENT_RE.test(rest.slice(at))) return null
  return { ids, consumed: at }
}

type EnumLevel = 'para' | 'abs' | 'z' | 'lit'
/**
 * What a sibling looks like at each level: a number, and for a Litera a
 * letter — „§ 21c Z 1 lit. b, c, e und f entfällt" deleted lit. b alone,
 * because only numbers were read as siblings (26.09.2026).
 */
const ENUM_ID: Record<EnumLevel, string> = { para: '\\d+[a-z]*', abs: '\\d+[a-z]*', z: '\\d+[a-z]*', lit: '[a-z]{1,2}' }
/**
 * The designator a sibling may repeat: „Abs. 1 und Abs. 2", „Z 7 und Z 7a",
 * „lit. a und lit. b". Repeated, the enumeration was not read at all and the
 * second unit dropped — „In § 139a Abs. 1 und Abs. 2 wird jeweils … eingefügt"
 * changed Abs. 1 and reported success.
 */
const ENUM_DESIGNATOR: Record<EnumLevel, string> = { para: '', abs: '(?:Abs(?:\\.|atz)\\s*)', z: '(?:Z(?:iffer)?\\s*)', lit: '(?:lit(?:\\.|era)\\s*)' }

/** Where the address ends and the instruction begins: its finite verb. */
const FINITE_VERB_RE = /(?<![\p{L}])(?:wird|werden|entfällt|entfallen|lautet|lauten|erhält|erhalten|tritt|treten)(?![\p{L}])/u
/** „Abs. 4", „Z 7a", „lit. b" — a designator with its number, wherever it stands. */
const DESIGNATOR_TOKEN_RE = /(?<![\p{L}\p{N}])(?:Abs(?:\.|atz)\s*\d|Z(?:iffer)?\s*\d|lit(?:\.|era)\s*[a-z](?![\p{L}]))/u
const JOIN_RE = /(?<![\p{L}])(?:und|sowie|oder|bis)(?![\p{L}])|,/u

/**
 * **One address names one place** (26.09.2026). Its designators descend —
 * Abs., Z, lit. — and one of them repeats only in the enumeration of the
 * deepest, which `siblingsAfter` reads.
 *
 * Everything else was read as if it were not there. „§ 48 Abs. 1 Z 2 und
 * Abs. 4" came out as Abs. 1 Z 2 and changed that one; „In § 6 Abs. 3 und
 * Abs. 6 Z 1" was taken apart component by component and put back together
 * as Abs. 3 Z 1, a place the instruction does not name; „In § 5 Abs. 1 und 2
 * werden … der Z 3 …" dropped the Abs. 2. Over the Prüfstand's 1.711
 * instruction lines these shapes stood in a dozen, and every one was either
 * refused for the wrong reason or carried out on part of what it names. So a
 * place the reading would leave out refuses the address; the list reading
 * (`parseAddressList`) takes apart what are really two.
 *
 * Only the stretch in front of the verb is the address. A designator behind
 * it is an anchor or an operand's description („wird der Punkt am Ende der
 * Z 22 … ersetzt") and is read as it always was.
 */
function onePlace(tail: string, components: readonly (RegExpExecArray | null)[], deepest: RegExpExecArray, enumerationEnd: number): boolean {
  // The address ends at the first verb behind its first component — not at
  // the first verb at all: „… und wird in den Z 5 und 7 lit. a jeweils …"
  // puts the verb in front, and measured from there the address was empty
  // and „Z 5 und 7" passed as one place: Z 5 lit. a, and Z 7 dropped
  // (AsylG § 72, 28.09.2026).
  const first = Math.min(...components.filter((c): c is RegExpExecArray => c !== null).map((c) => c.index))
  const verbs = [...tail.matchAll(new RegExp(FINITE_VERB_RE.source, FINITE_VERB_RE.flags.replace('g', '') + 'g'))]
  const verb = verbs.find((v) => v.index > first)
  const end = verb ? verb.index : tail.length
  const inAddress = components.filter((c): c is RegExpExecArray => c !== null && c.index < end).sort((a, b) => a.index - b.index)
  for (const [i, c] of inAddress.entries()) {
    const stop = inAddress[i + 1]?.index ?? end
    if (c === deepest) {
      if (DESIGNATOR_TOKEN_RE.test(tail.slice(enumerationEnd, stop))) return false
      continue
    }
    const between = tail.slice(c.index + c[0].length, stop)
    if (JOIN_RE.test(between) || DESIGNATOR_TOKEN_RE.test(between)) return false
  }
  return true
}

/**
 * Reads the deepest address in an instruction fragment. Returns null when no
 * unit is named at all — a bare "In Abs. 5 …" only makes sense inside a
 * container ("§ 12 wird wie folgt geändert:"), which the caller resolves by
 * passing `inherited`.
 */
export function parseAddress(text: string, inherited?: NovaoAddress | null): NovaoAddress | null {
  const t = maskQuotes(normalizeText(text))
  // A sub-unit this model has no level for widens the target to the unit above
  // it if it is ignored — the same over-reach `parseSatz` refuses below, one
  // level down (`SUBUNIT_WORD`).
  if (SUBUNIT_WORD.test(t)) return null
  const heading = HEADING_TARGET_RE.test(t)
  const alsoHeading = !heading && ALSO_HEADING_RE.test(t)

  // A law organised in Artikel addresses a § that exists only inside one of
  // them: "Art. II § 1 Abs. 5 lautet". The Artikel is then not decoration but
  // the scope the § number is unique in — read as if it were not there, the §
  // resolves against the whole document, and in the
  // Lebensmittelbewirtschaftungsgesetz "Art. II § 1" found Art. 1's
  // Verfassungsbestimmung and missed editing it by a single Absatz
  // (2026-09-09). Until 25.09.2026 that was a refusal; now the Artikel is
  // carried as part of the address, and the refusal stays for the one case
  // that still cannot be joined: a numeral this cannot read.
  //
  // An `Art.` *after* the § is a citation ("die Wortfolge Art. 9 der
  // Verordnung"), not a container, so only the leading form qualifies.
  const leadingArtikel = ARTIKEL_QUALIFIER_RE.exec(t)
  // An `Art.` that stands ahead of the § WITHOUT the § behind it is neither a
  // container nor harmless: `PARA_RE` reads it as the target, so "In Umsetzung
  // von Art. 5 der Richtlinie wird in § 3 Abs. 1 …" would change § 5. That was
  // refused before the Artikel became part of an address and is refused still
  // — only the adjacent form was opened.
  const anyArtikel = /\bArt(?:\.|ikel)\s*[\dIVXLCDM]+/i.exec(t)
  const paragraphAt = t.indexOf('§')
  if (anyArtikel && paragraphAt > anyArtikel.index && anyArtikel.index !== leadingArtikel?.index) return null
  const artikel = leadingArtikel ? articleNumberKey(leadingArtikel[1]!) : (inherited?.artikel ?? null)
  if (leadingArtikel && artikel === null) return null
  // From the § on, so the components are read out of the § and not out of the
  // Artikel in front of it: `PARA_RE` matches "Artikel 1" too, and the arabic
  // form of "Artikel 1 § 2 Abs. 3" would otherwise come back as "Art. 1
  // Abs. 3" — the very confusion the refusal used to prevent. The sentence
  // word and the heading words are still read from the whole address, because
  // both may stand in front of the Artikel.
  const scope = leadingArtikel ? t.slice(leadingArtikel.index + leadingArtikel[0].length - 1) : t

  if (DOCUMENT_RE.test(t)) {
    return { para: null, artikel, abs: null, z: null, lit: null, satz: null, satzCount: 0, halbsatz: null, siblings: [], level: 'document', heading: false, alsoHeading: false, raw: t }
  }

  const pm = PARA_RE.exec(scope)
  if (!pm) {
    const sm = ABSCHNITT_RE.exec(scope)
    if (sm) {
      const nr = sm[1] ?? sm[2] ?? ''
      return { para: `Abschnitt ${nr}`, artikel, abs: null, z: null, lit: null, satz: null, satzCount: 0, halbsatz: null, siblings: [], level: 'abschnitt', heading, alsoHeading, raw: t }
    }
    if (TITEL_RE.test(t)) {
      return { para: null, artikel, abs: null, z: null, lit: null, satz: null, satzCount: 0, halbsatz: null, siblings: [], level: 'titel', heading: true, alsoHeading: false, raw: t }
    }
    if (!inherited?.para) return null
  }

  // „Z 1 lit. n des Anhangs" names no number, and that is not an omission:
  // the law has exactly one, so the definite article IS the designation. The
  // number stays off the address rather than being invented — which of the
  // law's units it is, is the standing text's answer and not the parser's
  // (`findParagraph` takes the single schedule, and refuses where there are
  // several). 18 lines over 40 Sammelnovellen, all of them in two laws
  // (Verbraucherbehördenkooperationsgesetz, UWG; 26.09.2026).
  const para = pm ? (pm[1] ? `§ ${pm[1]}` : pm[2] ? `Art. ${articleNumberKey(pm[2]) ?? pm[2]}` : `${pm[3]}${pm[4] ? ` ${pm[4]}` : ''}`) : inherited!.para
  // Components are read after the § so a § number is not mistaken for an
  // Absatz of an earlier reference in the same sentence.
  //
  // **A schedule is the exception, because German puts it the other way
  // round:** „Z 1 lit. d des Anhangs entfällt" names the unit first and the
  // document afterwards. Read from the tail, that address came out as the
  // whole Anhang and the deletion would have taken the schedule instead of
  // its litera — the over-deletion this module exists to prevent. So where
  // the designation is a schedule, the components are read from the whole
  // address; a schedule that carries them behind it („Anlage 2 Z 3") reads
  // the same either way.
  const schedule = pm !== null && pm[3] !== undefined
  const tail = pm && !schedule ? scope.slice(pm.index + pm[0].length) : scope
  const am = ABS_RE.exec(tail)
  const zm = Z_RE.exec(tail)
  const lm = LIT_RE.exec(tail)
  // The sentence word can stand in front of the § ("Im Schlussteil des
  // § 169 Abs. 1"), so it is read from the whole address, not from the tail.
  // „der Halbsatz ‚…'" is the noun of the quotation behind it, like „die
  // Wortfolge" — not a place. Read as a sentence word it refused the whole
  // address (Zahnärztegesetz §§ 19, 22, 27.09.2026).
  // „am Ende des Satzes" locates a mark (`atEnd`), it names no sentence —
  // LFG § 19 Abs. 1 has three, and the end meant is the Absatz's.
  const sentence = parseSatz(t.replace(HALBSATZ_NOUN_RE, ' ').replace(/\bam\s+Ende\s+des\s+Satzes\b/gi, ' am Ende '))
  // A sentence word the parser cannot place widens the target to the whole
  // unit if it is ignored — the over-deletion this module exists to prevent.
  if (sentence && sentence.satz === null && sentence.halbsatz === null) return null

  // **What an inheriting clause keeps of the place before it** — the second
  // half of a compound line, which names no § of its own.
  //
  // It used to keep the § and the Absatz and nothing else, so „In § 5 Abs. 1
  // Z 6 wird A durch B ersetzt und entfällt das Wort ‚c'" deleted „c"
  // anywhere in Abs. 1, and „… erhält Z 6 die Ziffernbezeichnung ‚5.' und
  // lautet:" replaced the whole Absatz with the new Ziffer's text (26.09.2026).
  // A clause with no place of its own IS the place before it, down to the
  // Litera, the siblings and the heading. A clause that names one keeps what
  // lies above it and replaces the rest.
  //
  // **Not the sentence.** In an address it is as often the anchor as the
  // place: „In § 12 Abs. 3 wird nach dem zweiten Satz der Satz ‚…' eingefügt;
  // die Wortfolge ‚…' entfällt" deletes in the Absatz, and carried over, the
  // second sentence confined the deletion to a place the phrase is not in
  // (Niederlassungs- und Aufenthaltsgesetz, measured the same day).
  //
  // One exception: a clause that names only a sentence. A Schlussteil or an
  // Einleitung belongs to the unit that carries the list, one level above the
  // place before — „in Z 1 … ersetzt; im Schlussteil …" is the Absatz's,
  // „in der lit. e … ersetzt; der Schlussteil wird durch folgende lit. f …
  // ersetzt" the Ziffer's (Ärztegesetz 1998 § 59 Abs. 1 Z 3). An ordinal
  // sentence keeps the old reading, the Absatz's.
  const from = pm ? null : (inherited ?? null)
  const carry = from !== null && !am && !zm && !lm && !sentence
  const abs = am?.[1] ?? from?.abs ?? null
  const listPart = sentence?.satz === 'schluss' || sentence?.satz === 'einleitung'
  const z = zm?.[1] ?? (!am && (!sentence || (listPart && from?.lit)) ? from?.z : null) ?? null
  const lit = lm?.[1] ?? (!am && !zm && !sentence ? from?.lit : null) ?? null
  const satz = sentence?.satz ?? null
  const satzCount = sentence?.satzCount ?? 0
  const halbsatz = sentence?.halbsatz ?? null
  const level: UnitLevel = satz || halbsatz ? 'satz' : lit ? 'lit' : z ? 'z' : abs ? 'abs' : 'para'

  // The enumeration attaches to the deepest numbered component.
  const deepest = lm ?? zm ?? am
  let siblings: string[] = carry ? [...from.siblings] : []
  if (deepest) {
    const at = deepest.index + deepest[0].length
    const found = siblingsAfter(tail.slice(at), deepest[1]!, lm ? 'lit' : zm ? 'z' : 'abs')
    if (found === null) return null
    siblings = found.ids
    if (!onePlace(tail, [am, zm, lm], deepest, at + found.consumed)) return null
  } else if (pm) {
    const found = siblingsAfter(tail, pm[1] ?? pm[2] ?? pm[4] ?? '', 'para')
    if (found === null) return null
    siblings = found.ids
  }

  // The plural sign, as the last signal. „In den §§ 46 Abs. 3 zweiter Satz,
  // 47 Abs. 6 zweiter Satz, 213 … und 214 …" names four Paragraphen, and
  // behind „Abs. 3" there is no bare number for `siblingsAfter` to notice it
  // by, but „zweiter Satz". What is left is the plural sign itself: where it
  // stands in the *address* — quotations are long since masked by
  // `maskQuotes`, or every „die Wortfolge '§§ 41, 42'" would count — and the
  // address as read still points at a sub-level, the first Paragraph is only
  // the first of several.
  //
  // Over 60 Bundesgesetzblätter (18.09.2026): 16 such addresses stay at
  // Paragraph level and are real, working multi-addresses; 11 stand on a
  // sub-level and mean several Paragraphen without exception. Three of those
  // were applied — to one of the named each. Not a single false hit in the
  // sample.
  //
  // „Several" is counted, not suspected: the plural sign stays even where
  // `parseAddressList` has already split the enumeration and this piece
  // carries one Paragraph only („In den §§ 184 Abs. 4 sowie in § 380 Abs. 1
  // Z 3" → „In den §§ 184 Abs. 4"). So it refuses only once two numbers with
  // a component of their own really stand there.
  if (level !== 'para' && /§§/.test(t) && [...t.matchAll(/\d+[a-z]*\s*(?:Abs(?:\.|atz)|Z(?:iff(?:er)?)?\b|lit(?:\.|era))/gi)].length > 1) return null

  return { para, artikel, abs, z, lit, satz, satzCount, halbsatz, siblings, level, heading: heading || (carry && from.heading), alsoHeading, raw: t }
}

/**
 * „In den §§ 48 Abs. 13 und 217 Abs. 13" → `["§ 48 Abs. 13", "§ 217 Abs. 13"]`.
 *
 * The legistic shorthand puts the § sign into the plural once and leaves it
 * off every further Paragraph. The line between "another Paragraph" and
 * "another sibling of the same component" is the one `siblingsAfter` draws:
 * **a number followed by a component of its own is a Paragraph.** „§§ 20
 * Abs. 6 und 7 sowie 193 Abs. 6 und 7" therefore splits correctly — the 7
 * stays an Absatz of § 20, the 193 becomes a Paragraph of its own.
 *
 * Returns null where nothing can be split; the caller then falls back to the
 * single address, which refuses in its turn as soon as a plural sign is left
 * standing over a sub-level.
 */
function splitPluralParagraphs(t: string): string[] | null {
  const plural = /§§\s*/.exec(t)
  if (!plural) return null
  const tail = t.slice(plural.index + plural[0].length)
  const sep = /(?:\s*,\s*|\s+(?:und|sowie)\s+)(?=\d+[a-z]*\s*(?:Abs(?:\.|atz)|Z(?:iff(?:er)?)?\b|lit(?:\.|era)))/gi
  const cuts: { at: number; len: number }[] = []
  for (const m of tail.matchAll(sep)) cuts.push({ at: m.index!, len: m[0].length })
  if (cuts.length === 0) return null
  const parts: string[] = []
  let last = 0
  for (const c of cuts) {
    parts.push(tail.slice(last, c.at))
    last = c.at + c.len
  }
  parts.push(tail.slice(last))
  // A trailing part that already carries its own § ("… sowie in § 380 Abs. 1")
  // is left as it stands; only the bare ones get the symbol back.
  return parts.map((p) => p.trim()).filter(Boolean).map((p) => (PARA_RE.test(p) ? p : `§ ${p}`))
}

/**
 * The Überschrift of the Paragraph an address names, as an address of its
 * own.
 *
 * Lifted to the Paragraph, because a heading belongs to the § and not to the
 * Absatz the address happens to name: „§ 15a Abs. 1 und 2 samt Überschrift"
 * means the Überschrift of § 15a. The siblings fall away — they count on the
 * level being left behind here.
 */
function headingTwin(a: NovaoAddress): NovaoAddress {
  return { ...a, abs: null, z: null, lit: null, satz: null, satzCount: 0, halbsatz: null, siblings: [], level: 'para', heading: true, alsoHeading: false }
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
  // **A part that carries no designation is no place of its own — it is the
  // continuation of the one before it.** In „In § 9, § 10 Abs. 1 und 2,
  // § 11a …" that part is **„2"**: the second Absatz of § 10. Dropped, the
  // address came out as „§ 10 Abs. 1", the instruction was carried out in one
  // of the two Absätze and reported success — 27 of 219 addresses with an
  // „Abs. X und Y" over 300 Entwürfe (26.09.2026), and nothing but the
  // Beilage would have caught them. Joined back on, `siblingsAfter` reads it
  // where it belongs. Standing alone („In § 9 Abs. 1 und 2 wird …") the
  // address was always right; only inside a longer list did the part lose
  // its § and with it its home.
  //
  // **A part that opens a level above the one before it is a place of its
  // own** under the same § (26.09.2026): „§ 48 Abs. 1 Z 2 und Abs. 4", „§ 6
  // Abs. 3 und Abs. 6 Z 1". Joined on, it was either dropped or put together
  // with the part before it into a place neither names (`onePlace`). Read on
  // its own, it keeps what lies above it from the place before — the § and,
  // for a Ziffer, the Absatz.
  const units: { text: string; place: boolean }[] = []
  for (const part of parts) {
    const last = units.at(-1)
    if (!last || PARA_RE.test(part)) units.push({ text: part, place: false })
    else if (opensPlace(last.text, part)) units.push({ text: part, place: true })
    else last.text += ` und ${part}`
  }
  const merged = units.filter((u) => !u.place).map((u) => u.text)
  const withPara = merged.filter((p) => PARA_RE.test(p))
  const hasPlaces = units.some((u) => u.place)
  // Either every paragraph carries its own symbol, or the plural shorthand
  // spells the first one and leaves the rest bare. Both can occur in one
  // instruction, so each explicit segment is offered to the splitter again.
  const segments = withPara.length >= 2 ? withPara : hasPlaces ? null : splitPluralParagraphs(t)
  if (!segments) {
    if (!hasPlaces) {
      const single = parseAddress(text, inherited)
      return single ? [single] : null
    }
    const out: NovaoAddress[] = []
    for (const u of units) {
      const a = parseAddress(u.text, u.place ? (out.at(-1) ?? inherited) : inherited)
      if (!a) return null
      out.push(a)
    }
    return out
  }
  // The Artikel is written once and holds for the rest of the list, exactly
  // like the § sign in the plural shorthand: "In Artikel II § 8 und § 9
  // Abs. 1" names two §§ of Artikel II, not one of it and one of the whole
  // law. It is handed on as TEXT rather than as a parsed value, so every
  // segment goes through the one reading in `parseAddress` — a second place
  // that decides what an Artikel is would be a second place for the two to
  // drift apart.
  const carried = ARTIKEL_QUALIFIER_RE.exec(t)
  const prefix = carried ? `Art. ${carried[1]} ` : ''
  const out: NovaoAddress[] = []
  // The explicit segments are the units, and a unit's places follow it; the
  // plural shorthand's segments come from the whole text and carry none.
  const ordered = segments === withPara ? units.filter((u) => u.place || withPara.includes(u.text)) : segments.map((text) => ({ text, place: false }))
  for (const u of ordered) {
    if (u.place) {
      const a = parseAddress(u.text, out.at(-1) ?? inherited)
      if (!a) return null
      out.push(a)
      continue
    }
    for (const one of splitPluralParagraphs(u.text) ?? [u.text]) {
      const qualified = prefix && !ARTIKEL_QUALIFIER_RE.test(one) ? prefix + one : one
      const a = parseAddress(qualified, inherited)
      if (!a) return null
      out.push(a)
    }
  }
  return out
}

const COMPONENT_DEPTH: Record<string, number> = { abs: 1, absatz: 1, z: 2, ziffer: 2, lit: 3, litera: 3 }
const COMPONENT_AT_RE = /(?<![\p{L}\p{N}])(Abs(?:\.|atz)|Z(?:iffer)?|lit(?:\.|era))\s*(?:\d+[a-z]*|[a-z](?![\p{L}]))/gu

/** Depth of each designator in `text`, in order: „§ 48 Abs. 1 Z 2" → [1, 2]. */
function componentDepths(text: string): number[] {
  return [...text.matchAll(COMPONENT_AT_RE)].map((m) => COMPONENT_DEPTH[m[1]!.replace(/\.$/, '').toLowerCase()] ?? 0)
}

/**
 * Does `part`, standing behind `before` in an address list, open a place of
 * its own? Where it begins above the deepest level before it („Z 2 und
 * Abs. 4"), or on that level with a deeper one behind it („Abs. 3 und
 * Abs. 6 Z 1"). A bare sibling on the same level („Abs. 1 und Abs. 2") is
 * an enumeration, and one that begins deeper („Abs. 1 und Z 3") has no
 * reading and is left to `onePlace` to refuse.
 */
function opensPlace(before: string, part: string): boolean {
  if (!OWN_COMPONENT_RE.test(part)) return false
  const own = componentDepths(part.slice(0, FINITE_VERB_RE.exec(part)?.index ?? part.length))
  const prior = componentDepths(before.slice(0, FINITE_VERB_RE.exec(before)?.index ?? before.length))
  if (own.length === 0 || prior.length === 0) return false
  const deepest = Math.max(...prior)
  return own[0]! < deepest || (own[0]! === deepest && own.length > 1)
}

/** Stable key of an address, for matching against parsed law units. */
export function addressKey(a: NovaoAddress): string {
  if (a.level === 'document') return '(gesamter Text)'
  if (a.level === 'titel') return '(Titel)'
  const satz = a.satz === 'einleitung' ? 'Einleitungssatz' : a.satz === 'schluss' ? 'Schlussteil' : a.satz && (a.satzCount > 1 ? `${a.satz} Satz +${a.satzCount - 1}` : `${a.satz} Satz`)
  // The Artikel leads, in RIS's own spelling ("Art. 2 § 3"): it is the scope
  // the § number is unique in, so two Artikel of one law must not share a key.
  return [a.artikel && `Art. ${a.artikel}`, a.para, a.abs && `Abs. ${a.abs}`, a.z && `Z ${a.z}`, a.lit && `lit. ${a.lit}`, satz].filter(Boolean).join(' ')
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/** What kind of child an insert/append instruction creates. */
export type ChildLevel = 'para' | 'abs' | 'z' | 'lit' | 'satz' | 'halbsatz' | 'schluss' | 'unknown'

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
  | {
    kind: 'append'
    target: NovaoAddress
    child: ChildLevel
    childIds: string[]
    /**
     * „wird der Punkt am Ende durch einen Beistrich ersetzt und folgender
     * Halbsatz angefügt": the mark the new text is joined behind, replaced in
     * the same step (`mergeEndMarks`).
     */
    endMark?: { from: string; to: string }
  }
  /** "Nach § 5 wird folgender § 5a eingefügt:" — inserted behind the anchor */
  | { kind: 'insertAfter'; anchor: NovaoAddress; child: ChildLevel; childIds: string[]; where: 'after' | 'before' }
  /** "§ 5 Abs. 3 entfällt." */
  | { kind: 'delete'; target: NovaoAddress; withHeading: boolean }
  /**
   * "In § 5 Abs. 1 wird die Wortfolge X durch die Wortfolge Y ersetzt."
   *
   * `everywhere` — every occurrence inside ONE place ("In § 5 wird jeweils …").
   * `eachUnit` — once in EACH unit the address spans ("In § 81 Abs. 1 und 2
   * wird das Wort X jeweils durch Y ersetzt"). The two are the two readings of
   * „jeweils", and which one applies is decided by whether the address names
   * one place or several (`everyOccurrence`).
   */
  | {
    kind: 'replacePhrase'
    target: NovaoAddress
    from: string
    to: string
    everywhere: boolean
    eachUnit: boolean
    wordBound: boolean
    /** „der Punkt am Ende … durch einen Beistrich": the mark that ends the unit's text, not any occurrence of it. */
    atEnd?: boolean
    /**
     * „… wird der Strichpunkt durch einen Punkt ersetzt; der nachfolgende
     * Halbsatz entfällt": the new mark ends the sentence, and what followed
     * the old one goes with it.
     */
    truncate?: boolean
    /**
     * „vor der Wortfolge ‚des Sachverständigen' das Wort ‚oder'": the text the
     * operand stands right beside — asked only where the operand alone is
     * not unique.
     */
    beside?: { text: string; where: 'before' | 'after' }
  }
  /** "In § 5 Abs. 1 wird nach der Wortfolge X die Wortfolge Y eingefügt." */
  | {
    kind: 'insertPhrase'
    target: NovaoAddress
    anchor: string
    where: 'after' | 'before'
    text: string
    eachUnit: boolean
    wordBound: boolean
    /** „vor dem Punkt am Ende": the anchor is the mark that ends the unit's text, not any occurrence of it. */
    atEnd?: boolean
    /** „am Ende das Wort ‚ sowie' eingefügt": holds only where the unit ends without a closing mark. */
    bareEnd?: boolean
  }
  /** "In § 5 Abs. 1 entfällt die Wortfolge X." */
  | { kind: 'deletePhrase'; target: NovaoAddress; text: string; eachUnit: boolean; wordBound: boolean }
  /**
   * "Der bisherige § 10 erhält die Paragrafenbezeichnung „§ 11.“"; with
   * `toLast`, a run: "die Z 5 bis 9 erhalten die Ziffernbezeichnungen „4.“ bis „8.“"
   */
  | { kind: 'renumber'; target: NovaoAddress; to: string; toLast: string | null }
  /** "§ 5 wird wie folgt geändert:" — a heading over sub-instructions */
  | { kind: 'container'; target: NovaoAddress }
  /** "Im Inhaltsverzeichnis …" — derivable from the text, never applied */
  | { kind: 'toc' }

/**
 * The unit an operation addresses: its `target`, or the `anchor` an insertion
 * hangs behind. Null only for `toc`, the one kind that addresses nothing —
 * the table of contents is derived from the law text and never applied.
 *
 * Named for the op, not for the address: `explanations/risExplanations.ts`
 * already holds `addressOf` in the auto-import namespace, and it answers a
 * different question (which §§ a heading of the Erläuterungen names).
 */
export function opAddress(op: Exclude<NovaoOp, { kind: 'toc' }>): NovaoAddress
export function opAddress(op: NovaoOp): NovaoAddress | null
export function opAddress(op: NovaoOp): NovaoAddress | null {
  return 'target' in op ? op.target : 'anchor' in op ? op.anchor : null
}

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
 *
 * **The plural is part of the noun**, because one clause may name several
 * texts: "es entfallen die Zitierungen „A" und „B"", "nach den Wortfolgen „A"
 * und „B"". Without it the clause missed the phrase branch entirely and fell
 * through to the *unit* deletion below it, which reads the same sentence as
 * an order to remove the whole Absatz — reachable only since compound lines
 * are split at a conjunction, and the one outcome worse than a refusal. The
 * suffix covers the regular forms; the three legistic umlaut plurals are
 * written out, longest first so the alternation cannot stop at the singular.
 *
 * Prozentsatz and Altersangabe came out of the third reading of the refusals
 * (18.09.2026): „In § 4 Z 2 wird der Prozentsatz ‚65%' durch den Prozentsatz
 * ‚50%' ersetzt" is an ordinary phrase replacement and failed on the noun
 * alone — 11 instructions in the corpus, all of the same shape. The
 * vocabulary grows against measured lines only, never on suspicion: a noun
 * that never occurs makes the alternation longer and the next measurement no
 * better.
 */
const PHRASE_OBJECT =
  '(?:Wort-\\s*und\\s*Zeichenfolge|Zeichen-\\s*und\\s*Wortfolge|Wortfolge|Wortgruppe|Wortlaut|Worte|Wort|Wendung|Klammerausdrücke|Klammerausdruck|Ausdrücke|Ausdruck|Zitierung|Zitat|Begriff|Bezeichnung|Satzzeichen|Satzteil|Halbsatz(?=\\s*")|Klammerzitat|Verweiskette|Verweis|Abkürzung|Datumsangabe|Fundstelle|Zeichenfolge|Zeichen|Punkt|Strichpunkt|Beistrich|Datum|Beträge|Betrag|Prozentsatz|Altersangabe|Zahl|Jahreszahl|Fassung der Kundmachung|Norm|Einträge|Eintrag)(?:e|en|n|s)?'
const PHRASE_RE = new RegExp(`\\b${PHRASE_OBJECT}\\b`, 'i')
/**
 * „Im Schlussteil des § 169 Abs. 1 wird der Satz ‚…' durch die Sätze ‚…'
 * ersetzt" (LFG): a sentence named by its text is a phrase operand — but
 * only where it is replaced. „nach dem zweiten Satz der Satz ‚Neu.'
 * eingefügt" inserts a sentence and is read as one (28.09.2026).
 */
const SATZ_REPLACED_RE = /\b(?:der|den)\s+Satz\s*"[^"]*"\s*durch\s+(?:den|die)\s+(?:Satz|Sätze)\s*"/i
const PHRASE_OBJECT_RE = new RegExp(`\\b${PHRASE_OBJECT}\\b`, 'gi')

/**
 * Is the operand in the `index`-th quotation announced as a **word** rather
 * than as a stretch of text?
 *
 * „Wort" and „Worte" name a lexical unit, and the engine matched them like
 * every other operand — as a substring. „…wird das Wort ‚Amt' durch das Wort
 * ‚Behörde' ersetzt" on „Die Amtsstelle entscheidet." produced „Die
 * Behördesstelle entscheidet."; `guardParagraph` caught it as `unerklärt` and
 * withheld the § with a reason about unexplained words rather than about a
 * match inside another word (23.09.2026). „Wortfolge", „Zeichenfolge" and the
 * rest stay literal: a Wortfolge may begin or end mid-word, and requiring a
 * boundary there would refuse correct instructions.
 *
 * Read from the noun that stands closest *in front of* the operand, because
 * one instruction may announce its two operands differently („das Wort ‚X'
 * durch die Wortfolge ‚Y'") and because the fronted form („Die Wortfolge B
 * tritt an die Stelle von A") swaps which quotation is searched for.
 */
function wordOperand(line: string, index: number): boolean {
  const quote = [...line.matchAll(QUOTED)][index]
  if (!quote) return false
  const nouns = [...line.slice(0, quote.index).matchAll(PHRASE_OBJECT_RE)]
  const noun = nouns[nouns.length - 1]
  return noun !== undefined && /^Worte?[ns]?$/i.test(noun[0])
}
const AFTER_ANCHOR_RE = new RegExp(`\\bnach (?:dem|der|den) ${PHRASE_OBJECT}\\b`, 'i')
const BEFORE_ANCHOR_RE = new RegExp(`\\bvor (?:dem|der|den) ${PHRASE_OBJECT}\\b`, 'i')

/**
 * The same two anchors as they stand in front of the quotation they point at
 * — "nach dem Zitat " immediately before the opening mark, and nothing but
 * spacing in between. Anchored at the end because a clause may carry both an
 * anchor and an object, and only the quotation that FOLLOWS the anchor phrase
 * is the anchor.
 */
const ANCHOR_BEFORE_QUOTE_RE = new RegExp(`\\b(?:nach|vor)\\s+(?:dem|der|den)\\s+${PHRASE_OBJECT}\\b\\s*$`, 'i')

/**
 * The one anchor quotation of a replacement and which side of it the
 * operand stands on: „vor der Wortfolge ‚X' das Wort ‚Y' durch …" puts Y
 * right before X. Null where there is none or more than one.
 */
function besideAnchor(line: string): { text: string; where: 'before' | 'after' } | null {
  const marks = [...line.matchAll(QUOTED)]
  const found: { text: string; where: 'before' | 'after' }[] = []
  let from = 0
  for (const m of marks) {
    const a = ANCHOR_BEFORE_QUOTE_RE.exec(line.slice(from, m.index))
    if (a) found.push({ text: stripQuotes(m[1]!), where: /^vor\b/i.test(a[0]) ? 'before' : 'after' })
    from = m.index + m[0].length
  }
  return found.length === 1 && found[0]!.text.trim() !== '' ? found[0]! : null
}

/** A quotation of the instruction line that is an operand, not an anchor. */
interface QuoteMark {
  /** Where it opens in the line — the fronted forms are told apart by position. */
  at: number
  /** Its place among ALL quotations, which is what `wordOperand` counts. */
  ord: number
  text: string
}

/**
 * The quotations a clause offers as OPERANDS — everything that is not
 * introduced as an anchor.
 *
 * An anchor says where in the unit to look ("wird nach dem Ausdruck „AsylG
 * 2005" das Wort „und" durch einen Beistrich ersetzt"), and counting it as an
 * operand paired the citation with the word and wrote one over the other
 * (BFA-VG § 14, caught by the corpus run of 26.09.2026). It is dropped rather
 * than resolved, because the engine's own requirement — the text must stand
 * exactly once in the addressed unit — is stricter than the anchor, so an
 * instruction that needed it is refused instead of misplaced.
 *
 * A clause may carry several operands: "es entfallen die Zitierungen „A" und
 * „B"" removes two texts, and removing one of them left a § that was neither
 * the old law nor the new one.
 */
function operandQuotes(line: string): QuoteMark[] {
  const marks = [...line.matchAll(QUOTED)]
  const out: QuoteMark[] = []
  let from = 0
  marks.forEach((m, ord) => {
    if (!ANCHOR_BEFORE_QUOTE_RE.test(line.slice(from, m.index))) out.push({ at: m.index, ord, text: stripQuotes(m[1]!) })
    from = m.index + m[0].length
  })
  return out
}

const CHILD_BY_WORD: readonly (readonly [RegExp, ChildLevel])[] = [
  [/\bAbs(atz|ätze)?\.?\s*\d|\bAbsätze\b|\bAbsatz\b/i, 'abs'],
  [/\bZ(?:iffern?)?\.?\s*\d/i, 'z'],
  [/\blit(era)?\.?\s*[a-z]\b/i, 'lit'],
  [/\bHalbs(?:atz|ätze)\b/i, 'halbsatz'],
  [/\bSchlussteil\b/i, 'schluss'],
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
  const more = siblingsAfter(payload.slice(m.index + m[0].length), first, level === 'z' || level === 'lit' || level === 'abs' ? level : 'para')
  return more === null ? [first] : [first, ...more.ids]
}

/**
 * A single line can carry two instructions: "In § 1 Abs. 4 Z 8 werden der
 * Punkt am Ende durch einen Strichpunkt ersetzt sowie folgende Z 9 und Z 10
 * angefügt:". 1,7 % of the corpus in the form that creates a unit.
 *
 * The conjunction used to be a boundary only where the second half opened
 * with "folgende…" and a creating verb, and that left the commonest compound
 * of all unread: **two text operations in one sentence** — "… wird die
 * Wortfolge „A" durch „B" ersetzt und es entfällt die Wortfolge „C"". One
 * verb branch was handed both halves' quotations, so the line came out as an
 * operand count ("4 Operanden, Paarbildung unklar", "Ersetzung ohne zwei
 * Operanden"): 71 of 469 refusals over 40 Sammelnovellen, the largest class
 * left after „jeweils" (26.09.2026).
 *
 * What makes a separator a boundary is **a verb on each side** — the test the
 * semicolon already carried, now asked of "und", "sowie" and the comma too.
 * It is the whole guard, and it holds because a German legistic clause puts
 * its verb at the end: in an address list ("In § 12 Abs. 1 Z 1 und § 13
 * Abs. 1 wird …"), in an operand list ("die Wortfolge „A" und die Wortfolge
 * „B" entfallen") and in a chain of operand pairs ("der Ausdruck „A" durch
 * „B", das Wort „C" durch „D" … ersetzt") everything in front of the
 * separator carries no verb, so none of them is split.
 *
 * The comma is in the list because leaving it out left the same sentence half
 * read rather than refused: "wird der Beistrich … durch das Wort „sowie"
 * ersetzt, entfällt die Z 6 und erhält die bisherige Z 7 …" had its
 * replacement carried out and its deletion dropped on the floor (Ärztegesetz
 * § 14, corpus run of 26.09.2026) — the branch that read the clause consumed
 * it whole.
 *
 * Splitting cannot half-apply a line: `kons/lawApply.ts` refuses an
 * instruction whose parse carries any reason at all, so a compound with one
 * unreadable half is refused whole — the same outcome as before, reached
 * after reading the other half rather than instead of it.
 */
const COMPOUND_SPLIT = /[;,]\s*(?=[A-Za-zÄÖÜ§])|\s+(?:sowie|und)\s+/gi

// `bezeichnung` without a leading boundary: "die Z 5 bis 9 erhalten die
// Ziffernbezeichnungen" is the second half of a compound line, and with
// `\bBezeichnung\b` it never counted as a verb, so the line was not split, the
// renumbering silently dropped, and "§ 107 Z 6 (neu) lautet" then landed on
// the old Z 6 (LMSVG, BGBl. I Nr. 75/2026, 2026-09-09).
const VERB_RE = /\blaute[nt]\b|\bersetzt\b|\bangefügt\b|\beingefügt\b|\bentfäll[te]\b|\bentfallen\b|\baufgehoben\b|bezeichnung(?:en)?\b|wie folgt geändert/i

/**
 * „Der bisherige § 57 erhält die Absatzbezeichnung ‚(1)'. Als neuer Abs. 2
 * wird angefügt:" — two instruction sentences in one line. Read as one, the
 * address took the „Abs. 2" of the second and the renumbering ran on it:
 * Abs. 2 → (1), where the line renumbers the § 's one Absatz and appends a
 * second (Notarversorgungsgesetz, 27.09.2026). A full stop separates where
 * the next sentence opens the way an instruction does and both carry a verb.
 */
const SENTENCE_SPLIT = /\s*\.\s+(?=(?:Als|Dem|Den|Der|Die|Das|In|Im|Nach|Vor)\s)/g

export function splitCompound(line: string): string[] {
  const sentences = splitInstructionSentences(line)
  if (sentences.length > 1) return sentences.flatMap(splitCompound)
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

function splitInstructionSentences(line: string): string[] {
  const masked = line.replace(/"[^"]*"/g, (m) => '\uE000'.repeat(m.length))
  const out: string[] = []
  let start = 0
  for (const m of masked.matchAll(SENTENCE_SPLIT)) {
    const left = line.slice(start, m.index)
    const right = line.slice(m.index! + m[0].length)
    if (!VERB_RE.test(left.replace(/"[^"]*"/g, '""')) || !(VERB_RE.test(right) || /:\s*$/.test(right))) continue
    out.push(left.trim())
    start = m.index! + m[0].length
  }
  out.push(line.slice(start).trim())
  return out.filter(Boolean)
}

/**
 * The unquoted punctuation operands of legistic drafting: "wird der Punkt am
 * Ende durch einen Strichpunkt ersetzt". They carry no quotation marks
 * because they are single characters.
 */
const PUNCT_WORD: Record<string, string> = { punkt: '.', strichpunkt: ';', beistrich: ',', doppelpunkt: ':', gedankenstrich: '–' }
/** „vor dem Punkt am Ende", „nach dem Strichpunkt am Ende": the mark that closes the unit, as an anchor. */
const END_MARK_RE = /\b(nach|vor)\s+(?:dem|der)\s+(Punkt|Strichpunkt|Beistrich|Doppelpunkt)\s+am\s+Ende\b/i
/** „am Ende der Z 13 vor dem Beistrich": the same place with the unit named in between. */
const END_MARK_REV_RE = /\bam\s+Ende\s+(?:der|des)\s+(?:Z(?:iffer)?\s*\d+[a-z]*|lit\.\s*[a-z]{1,2}|Abs(?:\.|atzes)\s*\d+[a-z]*)\s+(nach|vor)\s+(?:dem|der)\s+(Punkt|Strichpunkt|Beistrich|Doppelpunkt)\b/i
/** „der nachfolgende Halbsatz entfällt" — the Halbsatz behind a mark the clause before has replaced. */
const FOLLOWING_HALBSATZ_GONE_RE = /^(?:der|die)\s+(?:nachfolgende|darauf\s*folgende|danach\s+folgende)\s+Halbs(?:atz|ätze)\s+(?:entfällt|entfallen)\.?$/i
/** The verbs of an append. */
/** „Im Inhaltsverzeichnis …" — also as „Inhaltverzeichnis", which the Bankwesengesetz prints. */
const TOC_RE = /^(?:Im |Das |Die |In dem )?Inhalts?verzeichnis\b/i
const APPEND_VERB_RE = /\bangefügt\b|\bhinzugefügt\b|\bangeschlossen\b/i
/** „… ersetzt und (danach) folgender (Halb)Satz angefügt", „…; folgender Satz wird angefügt". */
const APPENDS_SENTENCE_RE = /\bersetzt\b[^"]*?(?:\bund\b|\bsowie\b|;)\s*(?:danach\s+)?(?:wird\s+)?folgende[rn]?\s+(?:Halbs(?:atz|ätze)|S(?:atz|ätze))\b/i
const PUNCT_REPLACE_RE = /\bde[rn]\s+(Punkt|Strichpunkt|Beistrich|Doppelpunkt|Gedankenstrich)\b[^"]*?\bdurch\s+(?:einen|ein|das|die|der)\s+(Punkt|Strichpunkt|Beistrich|Doppelpunkt|Gedankenstrich)\b/i
/** The same five characters where only ONE of the two operands is named. */
const PUNCT_NAMED_RE = /\b(?:de[rn]|das|die|einen?|eine)\s+(Punkt|Strichpunkt|Beistrich|Doppelpunkt|Gedankenstrich)\b/i

/**
 * A replacement whose two operands are written differently: one in quotation
 * marks, one named in words.
 *
 * "In § 15 Abs. 1 Z 2 wird der Strichpunkt am Ende durch das Wort „ oder"
 * ersetzt" and "In § 15 Abs. 1 Z 3 wird das Wort „oder" durch einen Punkt
 * ersetzt" are the two halves of one renumbering of a list, and both were
 * refused as "Ersetzung ohne zwei Operanden" — the count says one operand
 * because only one of them can be quoted.
 *
 * Which is which is decided by the position of "durch" and never by the order
 * of the two, so the fronted form cannot swap them. A quotation introduced by
 * an anchor is no operand at all and refuses the reading rather than being
 * replaced.
 */
function punctReplacement(head: string, operands: readonly QuoteMark[], line = head): { from: string; to: string; wordBound: boolean } | null {
  const only = operands.length === 1 ? operands[0]! : null
  const cut = /\bdurch\b/i.exec(head)
  if (!only || !cut || only.at >= head.length) return null
  const named = (part: string): string | null => {
    const m = PUNCT_NAMED_RE.exec(part)
    return m ? PUNCT_WORD[m[1]!.toLowerCase()]! : null
  }
  if (only.at < cut.index) {
    const to = named(head.slice(cut.index))
    return to ? { from: only.text, to, wordBound: wordOperand(line, only.ord) } : null
  }
  const from = named(head.slice(0, cut.index))
  return from ? { from, to: only.text, wordBound: false } : null
}

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
  return single && JEWEILS_RE.test(head)
}

const JEWEILS_RE = /\bjeweils\b|\bjedes Mal\b/i

/**
 * The OTHER reading of „jeweils": once in each unit the address spans.
 *
 * „In § 81 Abs. 1 und 2 wird das Wort „Acten" jeweils durch das Wort „Akten"
 * ersetzt" — one address, two Absätze, the word once in each. Asked across
 * the union of the two the word is found twice and the instruction is
 * refused; asked per Absatz it is unique in both. 95 of 804 refusals over the
 * corpus were this, the largest class of instructions that were read
 * correctly and then not carried out (26.09.2026).
 *
 * The flag travels with the operation rather than being re-derived in
 * `kons/lawApply.ts`, because it is a statement about the *sentence* and only
 * the parser has it. Without „jeweils" nothing changes: the address stays one
 * place however many units it spans, and the phrase has to be unique across
 * all of them — a rule worth keeping, because an instruction that names two
 * §§ and means one of them must not write into both.
 */
function eachUnitOccurrence(head: string): boolean {
  return JEWEILS_RE.test(head)
}

/**
 * „Der bisherige Inhalt des § 29 erhält die Absatzbezeichnung ‚(1)'", „Dem
 * Text des § 26 wird die Absatzbezeichnung ‚(1)' vorangestellt": a Paragraph
 * without Absatz numbering gets its first number, because the next line
 * appends an Abs. 2.
 *
 * **Read as what it is — the one unnumbered Absatz becomes Abs. 1.** The
 * standing text already carries a § like that as a single Absatz with an
 * empty designation (`lawtext/konsTree.ts`), so the operation is an ordinary
 * renumbering one level below the §, from „" to „(1)". Refused until
 * 26.09.2026 in one word order and, in the other one, carried out as the
 * renumbering of the **Paragraph**: „Der bisherige Inhalt des § 29 erhält …"
 * put the verb straight before the noun, passed the guard that was meant to
 * stop exactly this, and turned § 29 into a § 1 while reporting success. The
 * next line, „Dem § 29 wird folgender Abs. 2 angefügt", then found no § 29
 * (Notariatsprüfungsgesetz, BGBl. I Nr. 63/2026).
 *
 * An Absatzbezeichnung other than „(1)" on a whole Paragraph has no reading
 * and is refused — it is never a new number for the §.
 */
function absatzDrawnIn(head: string, quotes: readonly string[], targets: readonly NovaoAddress[]): { op?: NovaoOp; reason?: string } | null {
  const target = targets[0]!
  if (target.level !== 'para' || !target.para?.startsWith('§')) return null
  if (!/\berh(?:äl|al)t(?:en)?\b|\bvorangestellt\b/i.test(head)) return null
  // „Dem bisherigen Text des § 459f wird die Bezeichnung ‚(1)' vorangestellt"
  // (ASVG): the bare noun, and „(1)" is the only thing that makes it an
  // Absatz — so without the „(1)" the line is not read here at all.
  const bare = !/\bAbsatzbezeichnung\b/i.test(head)
  if (bare && !(/\bBezeichnung\b/i.test(head) && quotes.length === 1 && quotes[0]!.replace(/\s+/g, '') === '(1)')) return null
  if (targets.length > 1 || target.siblings.length > 0) return { reason: `${targets.length + target.siblings.length} Paragraphen für eine Absatzbezeichnung` }
  if (quotes.length !== 1 || quotes[0]!.replace(/\s+/g, '') !== '(1)') return { reason: 'Absatzbezeichnung für einen ganzen Paragraphen' }
  return { op: { kind: 'renumber', target: { ...target, abs: '', level: 'abs' }, to: '(1)', toLast: null } }
}

/**
 * The unit a clause like „folgende Z 5 und 6 werden angefügt" appends to:
 * the place the clause before it named, cut to the level above what it
 * appends. „In § 1 Abs. 4 Z 10 wird der Punkt … ersetzt sowie folgende
 * Z 11 bis 17 angefügt" appends to Abs. 4, not to Z 10; „Der Text des § 26
 * erhält die Absatzbezeichnung ‚(1)'; folgender Abs. 2 wird angefügt" to
 * § 26.
 *
 * Null where the cut leaves more than one unit — the place before named
 * several Absätze and the Ziffer could go into any of them — or where the
 * level above is missing, a Litera behind a place that names no Ziffer. A
 * Ziffer behind a place that names no Absatz is appended to the §: a § without
 * Absatz numbering carries its Ziffern in its one unnumbered Absatz, and the
 * engine descends into it (`kons/lawApply.ts`).
 */
function appendHost(from: NovaoAddress, child: 'abs' | 'z' | 'lit'): NovaoAddress | null {
  if (!from.para || from.level === 'document') return null
  const depth = from.lit !== null ? 3 : from.z !== null ? 2 : from.abs !== null ? 1 : 0
  const hostDepth = child === 'abs' ? 0 : child === 'z' ? 1 : 2
  if (child === 'lit' && from.z === null) return null
  if (depth <= hostDepth && from.siblings.length > 0) return null
  const base: NovaoAddress = { ...from, satz: null, satzCount: 0, halbsatz: null, siblings: [], heading: false, alsoHeading: false }
  if (child === 'abs') return { ...base, abs: null, z: null, lit: null, level: 'para' }
  if (child === 'z') return { ...base, z: null, lit: null, level: from.abs !== null ? 'abs' : 'para' }
  return { ...base, lit: null, level: 'z' }
}

function parseOne(raw: string, inherited: NovaoAddress | null | undefined, whole: string): ParsedInstruction {
  const line = normalizeText(raw).replace(NUMBER_PREFIX, '')
  const head = instructionHead(line)
  const quotes = quotedParts(line)
  const ok = (op: NovaoOp): ParsedInstruction => ({ ops: [op], reason: null, line })
  const fail = (reason: string): ParsedInstruction => ({ ops: [], reason, line })

  if (TOC_RE.test(head)) return ok({ kind: 'toc' })

  const { scope, payload } = splitPayloadScope(head)
  // „…; folgender Satz wird angefügt", „… und danach folgender Halbsatz
  // angefügt": a clause that opens with its payload names no place of its
  // own — the place is the one handed on. Its head is the payload's
  // announcement, and read as an address it gave „Z 5" out of „folgende
  // Z 5" (see `appendHost`) or refused „folgender Satz" as a sentence word it
  // could not place (7 draft lines, 27.09.2026).
  const payloadOnly = scope.replace(/\b(?:danach|dann|sodann|ferner|weiters)\b/gi, '').trim() === '' && payload !== '' && !!inherited && APPEND_VERB_RE.test(head)
  const targets = payloadOnly ? [inherited!] : parseAddressList(scope || head, inherited)
  if (!targets || targets.length === 0) {
    // Name the word rather than report a missing address: „sublit." and the
    // two Strich forms are perfectly readable addresses that this model has no
    // level for, and the refusal list is what decides what gets built next.
    const sub = unplaceableSubUnit(scope || head)
    if (sub) return fail(`Untergliederung ohne eigene Ebene: ${sub}`)
    const unit = unrootedUnit(scope || head)
    return fail(unit ? `${unit} ohne eigene Ebene` : 'keine auflösbare Adresse')
  }
  const target = targets[0]!

  if (/wird wie folgt geändert|werden wie folgt geändert|wird wie folgt geändert/i.test(head)) return ok({ kind: 'container', target })

  // "erhält die Absatzbezeichnung", "erhalten die Paragraphenbezeichnungen",
  // "erhält die Bezeichnung": the noun varies in spelling (Paragrafen/
  // Paragraphen) and number, so only its tail is matched.
  //
  // A subject may stand between verb and noun — „In § 213 erhält **Abs. 4**
  // die Absatzbezeichnung ‚(5)'", „In § 7 erhält **der bisherige Abs. 8** die
  // Absatzbezeichnung ‚(9)'". That is the same renumbering with the subject
  // spelled out, and the address is already right: `parseAddress` reads the
  // „Abs. 4" out of the tail behind the §. 70 such lines in the corpus
  // (18.09.2026).
  //
  // **Only where the subject is a sub-unit.** „In § 10 erhält der bisherige
  // *Inhalt* die Absatzbezeichnung ‚(1)'" renames nothing; it pulls in a
  // level — the whole Paragraph text becomes Abs. 1. That is a different
  // operation with a different danger, and it is read by its own branch
  // below rather than running as a renumbering of the Paragraph.
  const drawnIn = absatzDrawnIn(head, quotes, targets)
  if (drawnIn) return drawnIn.reason ? fail(drawnIn.reason) : ok(drawnIn.op!)
  if (/erh(?:äl|al)t(?:en)?\s+(?:[^"]{0,60}?\s+)?die\s+\w*bezeichnung(?:en)?\b/i.test(head) && (/erh(?:äl|al)t(?:en)?\s+die\s+\w*bezeichnung/i.test(head) || target.level !== 'para')) {
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
    // „der Punkt am Ende …", or a mark whose line appends a sentence behind
    // it: the mark the unit ends on. Asked for as a unique occurrence, a
    // Punkt was refused in every sentence that carries an abbreviation — RAO
    // § 49 Abs. 1a „zweiter Satz wird der Punkt durch einen Strichpunkt ersetzt
    // und folgender Halbsatz angefügt" has „31. Dezember" in it (27.09.2026).
    const atEnd = /\bam\s+Ende\b/i.test(maskQuotes(head)) || APPENDS_SENTENCE_RE.test(maskQuotes(whole))
    return ok({
      kind: 'replacePhrase',
      target,
      from: PUNCT_WORD[punct[1]!.toLowerCase()]!,
      to: PUNCT_WORD[punct[2]!.toLowerCase()]!,
      ...(atEnd ? { atEnd: true } : {}),
      everywhere: false,
      // „In § 27a Abs. 2 und § 27b Abs. 2 wird in Z 16 jeweils das Wort
      // „sowie" durch einen Beistrich ersetzt" — the punctuation form carries
      // the same „jeweils" as the quoted one.
      eachUnit: eachUnitOccurrence(head),
      // A single punctuation character carries no word boundary to ask for.
      wordBound: false,
    })
  }

  if (PHRASE_RE.test(head) || SATZ_REPLACED_RE.test(head)) {
    // "In § 22 samt Überschrift, § 23 Abs. 1a … wird das Wort X durch Y
    // ersetzt": the heading is a second place, not a second reading of the
    // same one. It becomes its own op, so the phrase must be found in each
    // place exactly once — and a heading that does not carry the phrase
    // refuses the instruction instead of quietly renaming only the body.
    const places = targets.flatMap((t) => (t.alsoHeading ? [t, headingTwin(t)] : [t]))
    const eachUnit = eachUnitOccurrence(head)
    // "wird in der jeweils grammatikalisch richtigen Form die Wortfolge X
    // durch Y ersetzt": the drafters say outright that the replacement is to
    // be declined per context — "der Bundesministerin" becomes "des
    // Bundesministers". A literal substitution wrote "der Bundesminister"
    // into the Bundesstraßen-Mautgesetz (BGBl. I Nr. 83/2025, 2026-09-09).
    // Not a text operation; refused.
    if (/grammatikalisch (?:richtigen|korrekten) Form/i.test(head)) return fail('Ersetzung in der grammatikalisch richtigen Form — nicht mechanisch')
    if (/\bersetzt\b|\ban (?:die )?Stelle\b/i.test(head)) {
      // One operand quoted and one named in words, because a single character
      // carries no quotation of its own: "wird das Wort „oder" durch einen
      // Punkt ersetzt", "wird der Punkt durch das Wort „ und" ersetzt".
      // `PUNCT_REPLACE_RE` above reads the form where BOTH sides are named;
      // this is the mixed one, and the position of "durch" says which side
      // the quotation stands on.
      // An anchor is not an operand — "nach dem Ausdruck „AsylG 2005" das
      // Wort „und" durch einen Beistrich ersetzt" says where to look first.
      const operands = operandQuotes(line)
      const beside = besideAnchor(line)
      const mixed = operands.length < 2 ? punctReplacement(head, operands, line) : null
      if (mixed) {
        return {
          // „der Punkt am Ende der Z 4 durch das Wort ‚oder'": the mark named
          // in words is the one the unit ends on, as in the form with both
          // marks named (`atEnd` above).
          ops: places.map((t) => ({ kind: 'replacePhrase' as const, target: t, from: mixed.from, to: mixed.to, ...(/^[.;,:]$/.test(mixed.from) && /\bam\s+Ende\b/i.test(maskQuotes(head)) ? { atEnd: true } : {}), ...(beside ? { beside } : {}), everywhere: everyOccurrence(head, targets), eachUnit, wordBound: mixed.wordBound })),
          reason: null,
          line,
        }
      }
      if (operands.length < 2) return fail('Ersetzung ohne zwei Operanden')
      // "… der Verweis auf A durch B und der Betrag von C durch D ersetzt":
      // four operands, two substitutions. Applying only the first pair would
      // publish a text that is half-amended — so either every pair is read,
      // or the instruction is refused.
      if (operands.length > 2) {
        const pairs = (head.match(/\bdurch\b/gi) ?? []).length
        if (operands.length % 2 !== 0 || pairs !== operands.length / 2) return fail(`${operands.length} Operanden, Paarbildung unklar`)
        const everywhere = everyOccurrence(head, targets)
        const many: NovaoOp[] = []
        for (const t of places) for (let i = 0; i + 1 < operands.length; i += 2) many.push({ kind: 'replacePhrase', target: t, from: operands[i]!.text, to: operands[i + 1]!.text, everywhere, eachUnit, wordBound: wordOperand(line, operands[i]!.ord) })
        return { ops: many, reason: null, line }
      }
      // Two quotations under two „durch" are two replacements, each with one
      // operand named in words: „wird in Z 1 das Wort ‚ oder' durch einen
      // Beistrich und in Z 2 der Punkt durch das Wort ‚ , oder' ersetzt".
      // Paired with each other they made one replacement that neither half
      // says, and it ran as soon as the line around it stopped being refused
      // (Fremdenpolizeigesetz 2005 § 81, 26.09.2026).
      if ((maskQuotes(head).match(/\bdurch\b/gi) ?? []).length > 1) return fail('2 Operanden unter zwei „durch" — Paarbildung unklar')
      // Both German forms name the old text first — "wird A durch B ersetzt"
      // and "tritt an die Stelle der Wortfolge A die Wortfolge B". Only when
      // the new text is fronted ("Die Wortfolge B tritt an die Stelle von A")
      // does the order flip, and the position of the verb says which it is.
      const verb = /an (?:die )?Stelle/i.exec(line)
      const reversed = verb !== null && verb.index > operands[0]!.at
      const from = reversed ? operands[1]! : operands[0]!
      const to = reversed ? operands[0]! : operands[1]!
      const everywhere = everyOccurrence(head, targets)
      return { ops: places.map((t) => ({ kind: 'replacePhrase' as const, target: t, from: from.text, to: to.text, everywhere, eachUnit, wordBound: wordOperand(line, from.ord), ...(beside && !everywhere ? { beside } : {}) })), reason: null, line }
    }
    if (/\beingefügt\b|\bergänzt\b|\bangefügt\b|\bvorangestellt\b|\beinzufügen\b|\bgesetzt\b/i.test(head)) {
      const before = BEFORE_ANCHOR_RE.test(head) || /vorangestellt/i.test(head)
      // „vor dem Punkt am Ende der Halbsatz ‚ , sofern …' eingefügt": the
      // anchor is a mark named in words, and „am Ende" says which of the
      // unit's marks it is — Zahnärztegesetz § 22 Abs. 2 carries six full
      // stops, so asking for a unique one would refuse (27.09.2026).
      const endMark = END_MARK_RE.exec(maskQuotes(head)) ?? END_MARK_REV_RE.exec(maskQuotes(head))
      if (endMark && quotes.length === 1) {
        const where = endMark[1]!.toLowerCase() === 'vor' ? 'before' : 'after'
        return { ops: places.map((t) => ({ kind: 'insertPhrase' as const, target: t, anchor: PUNCT_WORD[endMark[2]!.toLowerCase()]!, where: where as 'before' | 'after', text: quotes[0]!, eachUnit, wordBound: false, atEnd: true })), reason: null, line }
      }
      // „In Abs. 2 Z 1 wird am Ende der Halbsatz ‚…;' angefügt": the text is
      // quoted in the line itself and joined behind the last character of
      // the unit — an anchor of nothing, at its end. Only for a Halbsatz and
      // only for „angefügt": a clause stands behind its unit's closing mark,
      // while „am Ende der Z 2 der Ausdruck ‚, oder' angefügt" would land
      // behind a full stop, „am Ende der Z 13 vor dem Beistrich …" names an
      // anchor of its own, and whether „eingefügt" means in front of the
      // closing mark or behind it is not in the words.
      const masked = maskQuotes(head)
      if (quotes.length === 1 && !endMark && /\bam\s+Ende\b/i.test(masked) && /\b(?:der|den)\s+Halbsatz\s*""/i.test(masked) && /\bangefügt\b/i.test(head) && !/\b(?:vor|nach)\s+(?:dem|der|den)\b/i.test(masked)) {
        return { ops: places.map((t) => ({ kind: 'insertPhrase' as const, target: t, anchor: '', where: 'after' as const, text: quotes[0]!, eachUnit, wordBound: false, atEnd: true })), reason: null, line }
      }
      // „In § 5 Abs. 1 wird der Z 3 das Wort ‚ oder' angefügt", „In § 2 Abs. 1
      // Z 5 wird am Ende das Wort ‚ sowie' eingefügt": one quoted word and no
      // anchor, so the unit's end is the place. „angefügt" joins it behind
      // everything, the closing Beistrich included — Lebensmittelsicherheits-
      // gesetz § 5 reads „entsprechen, oder" in the RIS. „eingefügt" does not
      // say which side of a closing mark it means, so it holds only where
      // the unit ends without one (`bareEnd`). So does a text that opens
      // with a mark („der Ausdruck ‚, oder'"): behind a standing one it
      // would double it (27.09.2026).
      if (quotes.length === 1 && !endMark && (/\b(?:das\s+Wort|die\s+Wortfolge|der\s+Ausdruck)\s*""/i.test(masked) || /\bfolgende\s+Wortfolge\s+angefügt\s*:\s*""\W*$/i.test(maskQuotes(line))) && !/\b(?:vor|nach)\s+(?:dem|der|den)\b/i.test(masked)) {
        const appended = /\bangefügt\b/i.test(head)
        const bareEnd = !appended || !/^\s*[\p{L}\d]/u.test(quotes[0]!)
        if (appended || (/\beingefügt\b/i.test(head) && /\bam\s+Ende\b/i.test(masked))) {
          return { ops: places.map((t) => ({ kind: 'insertPhrase' as const, target: t, anchor: '', where: 'after' as const, text: quotes[0]!, eachUnit, wordBound: false, atEnd: true, ...(bareEnd ? { bareEnd: true } : {}) })), reason: null, line }
        }
      }
      // „In § 9 Abs. 4 Z 5 wird der lit. d ein Strichpunkt angefügt": a mark
      // named in words at the unit's end — only where none stands there.
      const markAppended = /\b(?:ein|einen)\s+(Beistrich|Strichpunkt|Punkt|Doppelpunkt)\s+angefügt\b/i.exec(masked)
      if (quotes.length === 0 && markAppended && !/\b(?:vor|nach)\s+(?:dem|der|den)\b/i.test(masked)) {
        return { ops: places.map((t) => ({ kind: 'insertPhrase' as const, target: t, anchor: '', where: 'after' as const, text: PUNCT_WORD[markAppended[1]!.toLowerCase()]!, eachUnit, wordBound: false, atEnd: true, bareEnd: true })), reason: null, line }
      }
      // „In § 69 Abs. 2 Z 1 wird vor dem Strichpunkt die Wortfolge ‚…'
      // eingefügt": the anchor is a mark without „am Ende", so it must be the
      // unit's only one — `locateInUnits` refuses a second. Not the Punkt: an
      // abbreviation carries one too.
      const markAnchor = /\b(nach|vor)\s+(?:dem|der)\s+(Strichpunkt|Beistrich|Doppelpunkt)\b/i.exec(masked)
      if (quotes.length === 1 && !endMark && markAnchor && /\beingefügt\b/i.test(head)) {
        return { ops: places.map((t) => ({ kind: 'insertPhrase' as const, target: t, anchor: PUNCT_WORD[markAnchor[2]!.toLowerCase()]!, where: (markAnchor[1]!.toLowerCase() === 'vor' ? 'before' : 'after') as 'before' | 'after', text: quotes[0]!, eachUnit, wordBound: false })), reason: null, line }
      }
      // „In § 5 wird nach dem Wort ‚Absicht' ein Beistrich eingefügt": the
      // anchor is quoted, the text is a mark named in words (27.09.2026).
      const markInserted = /\b(?:ein|einen|der|das)\s+(Beistrich|Strichpunkt|Punkt|Doppelpunkt)\s+(?:eingefügt|gesetzt)\b/i.exec(masked)
      if (quotes.length === 1 && !endMark && markInserted && (before ? BEFORE_ANCHOR_RE : AFTER_ANCHOR_RE).test(masked)) {
        return { ops: places.map((t) => ({ kind: 'insertPhrase' as const, target: t, anchor: quotes[0]!, where: (before ? 'before' : 'after') as 'before' | 'after', text: PUNCT_WORD[markInserted[1]!.toLowerCase()]!, eachUnit, wordBound: wordOperand(line, 0) })), reason: null, line }
      }
      // „In § 38 Abs. 1 Z 2 wird folgender Satzteil angefügt:", „… wird der
      // Z 1 folgende Wortfolge angefügt:": the text is the payload, and it
      // joins the unit's end like a Halbsatz — behind the closing Beistrich,
      // as the RIS shows for both (LMSVG § 38, ALSAG § 3, 28.09.2026).
      if (quotes.length === 0 && /^folgende[rn]?\s+(?:Satzteil|Wortfolge|Wortgruppe)\s+(?:wird\s+)?angefügt\b/i.test(payload) && !/\b(?:vor|nach)\s+(?:dem|der|den)\b/i.test(masked)) {
        return { ops: places.map((t) => ({ kind: 'append' as const, target: t, child: 'halbsatz' as const, childIds: [] })), reason: null, line }
      }
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
      return { ops: places.map((t) => ({ kind: 'insertPhrase' as const, target: t, anchor: quotes[0]!, where: (before ? 'before' : 'after') as 'before' | 'after', text, eachUnit, wordBound: wordOperand(line, 0) })), reason: null, line }
    }
    if (/\bentfäll[te]\b|\bentfallen\b|\bgestrichen\b|\baufgehoben\b|\bentfernt\b/i.test(head)) {
      // A deletion's operands are read by their ROLE, not by position: an
      // anchor names where the text stands ("entfällt nach dem Zitat „49
      // Abs. 1" das Zitat „ , 2""), every other quotation is a text that goes.
      // Taking the first one deleted the anchor there, and deleted only the
      // first of several ("es entfallen die Zitierungen „A" und „B"") — both
      // were reachable before this file split compound lines, and the second
      // one was a silently half-carried instruction.
      const objects = operandQuotes(line)
      if (objects.length === 0) return fail('Streichung ohne Text')
      return { ops: places.flatMap((t) => objects.map((q) => ({ kind: 'deletePhrase' as const, target: t, text: q.text, eachUnit, wordBound: wordOperand(line, q.ord) }))), reason: null, line }
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
    // A unit deletion removes a whole Absatz, Ziffer or Paragraph, and it
    // names no text while doing so. A quotation in the clause therefore says
    // this was a *text* deletion whose noun the phrase branch above has no
    // word for — and carrying it out as a unit deletion would remove law the
    // ressort left standing. The refusal carries the clause, so the next
    // reading of the list can name the noun.
    if (head.includes('"')) return fail('Streichung nennt einen Text — Einheit oder Textstelle nicht entscheidbar')
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

  if (APPEND_VERB_RE.test(head)) {
    const child = childLevel(payload || whole)
    // "Nach § 408a wird folgender § 408b samt Überschrift angefügt": a new §
    // behind the named one, not a child of it. As an append it was pushed
    // into § 408a's children and became part of its text (ASVG, BGBl. I Nr.
    // 38/2024, 2026-09-09).
    if (child === 'para') {
      if (targets.length > 1) return fail(`${targets.length} Anker für einen neuen Paragraphen`)
      return ok({ kind: 'insertAfter', anchor: target, child, childIds: childIds(payload, child), where: 'after' })
    }
    // „… wird der Punkt am Ende der Z 4 durch einen Strichpunkt ersetzt;
    // folgende Z 5 und 6 werden angefügt:" — the ordinary way to extend a
    // list. The second clause opens with its own payload and names no place,
    // so the address was read out of the payload: „Z 5", which does not
    // exist yet, and the append was refused as „Nicht im geltenden Text".
    // The Prüfstand filed those under „die Fassung ist älter, als der Entwurf
    // annimmt" — 21 of its 48 lines there were this (26.09.2026).
    if (payloadOnly && (child === 'abs' || child === 'z' || child === 'lit')) {
      const host = appendHost(inherited!, child)
      if (!host) return fail(`Anfügung ${child === 'abs' ? 'eines Absatzes' : child === 'z' ? 'einer Ziffer' : 'einer Litera'} — Einheit davor nicht eindeutig`)
      return ok({ kind: 'append', target: host, child, childIds: childIds(payload, child) })
    }
    // A sentence or a Halbsatz goes where the clause before it left off —
    // behind the mark it has just replaced, at the end of the sentence it
    // names: „In § 57 Abs. 2 erster Satz wird am Ende der Punkt durch einen
    // Beistrich ersetzt und folgender Halbsatz angefügt". Here, and only
    // here, the sentence is handed on: in any other clause it is as often
    // the anchor as the place (`parseAddress`).
    if (payloadOnly && (child === 'satz' || child === 'halbsatz')) {
      if (inherited!.siblings.length > 0) return fail(`Anfügung ${child === 'satz' ? 'eines Satzes' : 'eines Halbsatzes'} — Einheit davor nicht eindeutig`)
      return ok({ kind: 'append', target: { ...inherited!, heading: false, alsoHeading: false }, child, childIds: [] })
    }
    // "§ 3 Abs. 1 und § 4 Abs. 1 wird jeweils folgender Satz angefügt" names
    // two places; appending to the first alone reported success on a law
    // that was half amended (Bildungsinvestitionsgesetz, 2026-09-09).
    return { ops: targets.map((t) => ({ kind: 'append' as const, target: t, child, childIds: childIds(payload, child) })), reason: null, line }
  }

  return fail('kein bekanntes Verb')
}

/**
 * The address an operation leaves behind for the clause after it — its target,
 * or the anchor of an operation that has no target of its own. `insertPhrase`
 * carries an `anchor` that is a piece of TEXT rather than an address, so the
 * target is asked for first.
 *
 * **A renumbering leaves its unit behind under the NEW designation.** „In § 7
 * erhält Abs. 6 die Absatzbezeichnung ‚(5)' und wird die Wortfolge … ersetzt"
 * is one Absatz throughout — the subject of both verbs — and by the time the
 * second clause runs it is called (5). Handed on as Abs. 6 it pointed at a
 * unit that no longer existed, and was refused (Reisegebührenvorschrift, AsylG
 * 2005 § 32, 26.09.2026); where the old number is taken by the next renumbering,
 * it would have pointed at the wrong one. Only a single renumbering — a run
 * „Z 5 bis 9 … ‚4.' bis ‚8.'" leaves no one unit behind.
 */
function opContext(op: NovaoOp): NovaoAddress | null {
  if (op.kind === 'renumber' && op.toLast === null && op.target.siblings.length === 0) {
    const t = op.target
    const id = bareParaId(op.to) ?? op.to.replace(/[^\w]/g, '')
    if (t.lit !== null) return { ...t, lit: id }
    if (t.z !== null) return { ...t, z: id }
    if (t.abs !== null) return { ...t, abs: id }
    return t.level === 'para' && t.para?.startsWith('§') && id ? { ...t, para: `§ ${id}` } : t
  }
  if ('target' in op) return op.target
  if ('anchor' in op && typeof op.anchor !== 'string') return op.anchor
  return null
}

/**
 * One Novellierungsanordnung line → its operations, or a reason why not.
 *
 * `inherited` carries the address of an enclosing container instruction, so
 * that "a) In Abs. 5 wird …" under "§ 12 wird wie folgt geändert:" resolves.
 */
/**
 * A place of its own at the head of a segment behind the verb: „in Z 1",
 * „in der lit. d", „in Abs. 3", „im Schlussteil", „im Einleitungsteil",
 * „im zweiten Satz".
 */
const LEADING_PLACE_RE = /(?<![\p{L}])(?:im\s+(?:Schlussteil|Schlusssatz|Einleitungsteil|Einleitungssatz|(?:ersten|zweiten|dritten|vierten|fünften|letzten|vorletzten)\s+Satz)|in\s+(?:der\s+|dem\s+)?(?:Z(?:iffer)?\s*\d+[a-z]*|lit\.\s*[a-z]{1,2}(?![\p{L}])|Abs\.\s*\d+[a-z]*))/gu
const EMBEDDED_PLACE_RE = /(?<=(?:,|\sund|\ssowie)\s+)(?:der|den|das|die)\s+(?:Punkt|Strichpunkt|Beistrich|Doppelpunkt)\s+am\s+Ende\s+(?:der|des)\s+(?:Z(?:iffer)?\s*\d+[a-z]*|lit\.\s*[a-z]{1,2})(?![\p{L}])/gu
const GAPPED_VERB_RE = /(?<![\p{L}])(?:wird|werden|entfällt|entfallen)(?![\p{L}])/u
const PARTICIPLE_RE = /(?<![\p{L}])(ersetzt|eingefügt|angefügt|gestrichen)(?![\p{L}])/u
const OPERAND_RE = /\uE000|(?<![\p{L}])(?:Punkt|Strichpunkt|Beistrich|Doppelpunkt|Gedankenstrich)(?![\p{L}])/u

/**
 * „In § 59 Abs. 4 wird in Z 1 die Wortfolge A durch B und im Schlussteil der
 * Ausdruck C durch D ersetzt": one verb for several operations, and each
 * names its own place. Read as one instruction the address took the Ziffer
 * AND the Schlussteil — the Schlussteil of Z 1, which does not exist — and
 * both replacements were refused (AsylG 2005 § 59, Energieausweis-Vorlage-
 * Gesetz § 9, Transparenzdatenbankgesetz 2012 § 40b; 26.09.2026). Worse, where
 * each operation has one operand in words („in Z 1 das Wort ‚ oder' durch
 * einen Beistrich und in Z 2 der Punkt durch das Wort ‚ , oder'"), the two
 * quotations were paired with each other.
 *
 * Split into one instruction per segment, each with the head in front of the
 * verb and — where the verb closes the line — the participle behind it:
 * „In § 59 Abs. 4 wird in Z 1 die Wortfolge A durch B ersetzt", „In § 59
 * Abs. 4 wird im Schlussteil der Ausdruck C durch D ersetzt". Two places
 * in a row share what follows them: „im Einleitungsteil und in der Z 6 der
 * Ausdruck A jeweils durch B ersetzt" is the same replacement in both.
 *
 * Only where EVERY segment opens with a place of its own. „In § 5 Abs. 1
 * wird in Z 1 das Wort A durch B und das Wort C durch D ersetzt" names one
 * place, and whether it holds for both is not in the words — that line stays
 * whole, as it was.
 */
export function splitPlaces(line: string): string[] {
  const masked = line.replace(/"[^"]*"/g, (m) => '\uE000'.repeat(m.length))
  const verb = GAPPED_VERB_RE.exec(masked)
  if (!verb) return [line]
  const afterVerb = verb.index + verb[0].length
  // A segment may also carry its place inside it, behind the mark it
  // replaces: „in Z 3 das Wort ‚oder' durch einen Strichpunkt und der Punkt
  // am Ende der Z 4 durch das Wort ‚oder' ersetzt" (AsylG 2005 § 53,
  // 28.09.2026). Such a segment starts at its article; the place in it is
  // read by the address as it always is.
  const embedded = [...masked.matchAll(EMBEDDED_PLACE_RE)].map((m) => Object.assign([''] as unknown as RegExpExecArray, { index: m.index! }))
  const places = [...masked.matchAll(LEADING_PLACE_RE), ...embedded].filter((m) => m.index! >= afterVerb).sort((a, b) => a.index! - b.index!)
  if (places.length < 2 || masked.slice(afterVerb, places[0]!.index).trim() !== '') return [line]
  // Every later place stands behind a separator — otherwise it is part of a
  // segment („nach dem Wort ‚A' in Z 3"), not the head of one.
  const starts: number[] = []
  for (const [i, p] of places.entries()) {
    if (i === 0) continue
    const before = masked.slice(places[i - 1]!.index!, p.index)
    const sep = /(?:,|\s(?:und|sowie))\s*$/u.exec(before)
    if (!sep) return [line]
    starts.push(places[i - 1]!.index! + sep.index)
  }
  const base = line.slice(0, afterVerb)
  const segments = places.map((p, i) => line.slice(p.index, i + 1 < places.length ? starts[i] : line.length).trim())
  // Places in a row share the operation behind the last of them.
  for (let i = segments.length - 2; i >= 0; i--) {
    if (OPERAND_RE.test(masked.slice(places[i]!.index!, starts[i]))) continue
    const next = places[i + 1]!
    segments[i] = `${segments[i]} ${line.slice(next.index! + next[0].length, i + 2 < places.length ? starts[i + 1] : line.length).trim()}`
  }
  const closing = PARTICIPLE_RE.exec(masked.slice(places.at(-1)!.index!))
  const parts = segments.map((seg) => {
    const withVerb = closing && !PARTICIPLE_RE.test(seg.replace(/"[^"]*"/g, '""')) ? `${seg.replace(/[.\s]+$/, '')} ${closing[1]}` : seg
    return `${base} ${withVerb}`.replace(/\s{2,}/g, ' ')
  })
  if (parts.some((p) => !OPERAND_RE.test(p.replace(/"[^"]*"/g, (m) => '\uE000'.repeat(m.length))))) return [line]
  return parts
}

export function parseInstruction(raw: string, inherited?: NovaoAddress | null): ParsedInstruction {
  const line = normalizeText(raw).replace(NUMBER_PREFIX, '')
  // „Im Inhaltsverzeichnis entfällt der Eintrag zu § 17; die Einträge zu den
  // §§ 18 und 19 lauten:" — the second clause has lost its subject, and split
  // off it was read as a phrase replacement. The whole line is the table of
  // contents, which follows from the headings (BFA-VG, 28.09.2026).
  if (TOC_RE.test(line)) return { ops: [{ kind: 'toc' }], reason: null, line }
  const parts = splitCompound(line).flatMap(splitPlaces)
  if (parts.length === 1) return parseOne(parts[0]!, inherited, line)

  const ops: NovaoOp[] = []
  const reasons: string[] = []
  // The second half of "…in § 1 Abs. 4 Z 8 … sowie folgende Z 9 angefügt"
  // has no address of its own; it inherits the first half's.
  //
  // **All of them, not the first.** "In § 12 Abs. 1 Z 1 und § 13 Abs. 1 wird
  // … eingefügt und entfällt … das Zitat „ , 2"" names two places, and the
  // second clause names none: carrying the first address alone into it wrote
  // the insertion into both §§ and the deletion into one — an instruction
  // half carried out, which is the outcome the engine may never produce. So
  // the clause is read once per inherited place and the results are merged;
  // a clause with an address of its own resolves the same way every time and
  // the duplicates fall out.
  let contexts: (NovaoAddress | null)[] = [inherited ?? null]
  for (const part of parts) {
    // „In § 27 Abs. 2 letzter Satz wird der Strichpunkt durch einen Punkt
    // ersetzt; der nachfolgende Halbsatz entfällt" (RAO, BGBl. I Nr. 63/2026):
    // the Halbsatz has no boundary of its own left once its semicolon is a
    // full stop, so the two halves are one act — the sentence ends at the new
    // mark (`truncate`). Only behind exactly that replacement.
    const before = ops.at(-1)
    if (FOLLOWING_HALBSATZ_GONE_RE.test(part.trim()) && before?.kind === 'replacePhrase' && (before.from === ';' || before.from === ',') && before.to === '.' && !before.everywhere && !before.atEnd) {
      ops[ops.length - 1] = { ...before, truncate: true }
      continue
    }
    const seen = new Set<string>()
    const got: NovaoOp[] = []
    let refusal: string | null = null
    for (const context of contexts) {
      const parsed = parseOne(part, context, line)
      if (parsed.ops.length === 0) {
        // One place out of several that will not resolve refuses the whole
        // line, for the same reason: the alternative is a partial reading.
        refusal ??= parsed.reason ?? '?'
        continue
      }
      for (const op of parsed.ops) {
        const key = JSON.stringify(op)
        if (seen.has(key)) continue
        seen.add(key)
        got.push(op)
      }
    }
    if (refusal !== null) reasons.push(refusal)
    ops.push(...got)
    const next = got.map(opContext).filter((a): a is NovaoAddress => a !== null)
    if (next.length > 0) {
      const byKey = new Map(next.map((a) => [addressKey(a), a] as const))
      contexts = [...byKey.values()]
    }
  }
  if (ops.length === 0) return { ops: [], reason: reasons[0] ?? 'kein bekanntes Verb', line }
  return { ops: mergeEndMarks(ops), reason: reasons.length ? `Teil nicht gelesen: ${reasons[0]}` : null, line }
}

/**
 * „In § 57 Abs. 2 erster Satz wird am Ende der Punkt durch einen Beistrich
 * ersetzt und folgender Halbsatz angefügt" is one act, and as two operations
 * the first undid what the second needs: with its Punkt a comma, the first
 * sentence ran into the second, and the Halbsatz was joined behind both
 * (27.09.2026). So the replacement of the closing mark travels with the
 * append behind it, and the engine does both at once — or neither.
 */
function mergeEndMarks(ops: readonly NovaoOp[]): NovaoOp[] {
  const out: NovaoOp[] = []
  for (const op of ops) {
    const before = out.at(-1)
    if (op.kind === 'append' && (op.child === 'satz' || op.child === 'halbsatz') && before?.kind === 'replacePhrase' && before.atEnd && addressKey(before.target) === addressKey(op.target)) {
      out[out.length - 1] = { ...op, endMark: { from: before.from, to: before.to } }
      continue
    }
    out.push(op)
  }
  return out
}

/**
 * Every top-level unit one instruction may print text for, in the
 * designations the draft itself writes ("§ 5a", "Anlage 2").
 *
 * `addressedParagraph` in `lawtext/instructionAddress.ts` answers a
 * neighbouring question, and answers it deliberately narrowly: which single §
 * of the *standing* law may lend this change its heading. So it refuses an
 * insertion — the new § has no standing heading — and it refuses two §§,
 * because two have no one name.
 *
 * Here the question is the opposite one, and every refusal there is a hit
 * here: which §§ can this instruction legitimately carry text for. The §§ it
 * *creates* are the clearest case of all, since a payload's words are
 * evidence for exactly the § it installs; and a renumbering carries both
 * designations, in both directions, because a reader of two documents meets
 * the same provision under two numbers — which of them is printed where is
 * the ressort's choice, and the corpus shows both.
 *
 * The same divergence runs one level up: `parseInstruction` refuses an
 * instruction whose *operation* it cannot type, and most of those name their §
 * perfectly well. `refusedAddresses` reads it, under its own three refusals.
 *
 * `reason` is what makes a miss usable rather than silent: an instruction
 * nobody could read must weaken a check, never fail a §, and the caller can
 * only honour that if it knows which instructions it lost.
 */
export interface AddressedUnits {
  /** Designations as written, for `designationKey` (`annex/annexText.ts`) to key. */
  paras: string[]
  /**
   * Designations this instruction declares to be *one* provision: the old and
   * the new number of a renumbering.
   *
   * They are not the same as two addressed §§. A caller that holds a
   * document against the standing law meets the two numbers in two different
   * documents — the annex prints the § under the designation the standing law
   * gives it, the following instructions address it under its new one — and
   * without the pair it reads one provision as two.
   */
  aliases: [string, string][]
  /** Why the list is empty — null whenever it is not. */
  reason: string | null
}

/** "§" + "5a" → "§ 5a": a sibling or child id in the form its address is written in. */
function designationOf(para: string, id: string): string {
  const prefix = /^(§|Art\.|Anlage|Anhang)/.exec(para)
  return `${prefix ? prefix[1] : '§'} ${id}`
}

/**
 * Every top-level unit ONE address names, written as the draft writes them.
 *
 * „Die §§ 12a und 13 entfallen" is one address, and its siblings are §§ of
 * their own; below the § they are Absätze or Ziffern of the one § and name no
 * further one. The loader, the refusal bookkeeping and the annex side each
 * read this — the annex side (`addressedUnits`) always did, the other two
 * stopped at the first §, so § 13 was neither fetched nor marked refused
 * when the line failed on it (AsylG 2005, BGBl. I Nr. 39/2026, 26.09.2026).
 */
export function namedParagraphs(address: NovaoAddress): string[] {
  if (!address.para) return []
  if (address.level !== 'para') return [address.para]
  return [address.para, ...address.siblings.map((id) => designationOf(address.para!, id))]
}

/** The numeral inside a new designation: "„§ 11.“" → "11", "4." → "4". */
function numeralOf(designation: string): string | null {
  return /(\d+[a-z]*)/.exec(designation)?.[1] ?? null
}

/**
 * An instruction the grammar refused still names its §, and the reason it was
 * refused is nearly always the *verb*, not the address.
 *
 * Measured over GP XXVIII (2026-09-11): of the 731 units the PDF corpus filed
 * in the general bag, only 185 failed on „keine auflösbare Adresse". The other
 * 546 had an address `parseAddressList` had already read — and `parseOne` threw
 * it away because it could not type the operation: "4 Operanden, Paarbildung
 * unklar" (40), "3 Operanden" (40), "Ersetzung ohne zwei Operanden" (34),
 * "kein bekanntes Verb" (90) and a long tail of the same shape. Those refusals
 * are right for `kons/lawApply.ts`, which has to *perform* the instruction; they are
 * beside the point for the question this file's collector asks, which is only
 * which §§ an instruction may print text for.
 *
 * So the address is read again where no operation came out at all — never
 * beside one, because an instruction that produced an op has already said what
 * it addresses, and a `toc` op says on purpose that it addresses no §.
 *
 * **Three refusals of its own**, each measured against the corpus, because a
 * wrong address is worse than none — it takes an instruction's words out of the
 * general bag that every § of the law receives, and the § that really owns them
 * then shows them as unexplained:
 *
 * - **no legistic verb** (or a colon opening a quoted payload). A line that
 *   orders nothing is not an instruction, and its §§ are citations: "der
 *   Regierungsberater gemäß § 5 Abs. 1 Bundes-Krisensicherheitsgesetz" is law
 *   text RIS tagged as `novao1`. Costs 5 units on each path — among them two
 *   ministry typos ("eingfügt", "entfälllt") and two of the renumbering form
 *   "Der bisherige § 9 wird zu § 16.", which is left in the general bag on
 *   purpose: reading it would file the unit under § 9 alone while § 16 lost
 *   the same words.
 * - **`§§` with a single designation.** "In den §§ 156 Abs. 2 und 317 Abs. 2 …"
 *   names two provisions and `parseAddressList` resolves one, because the
 *   second half carries no § sign of its own. Filing the unit under § 156 would
 *   take its words from § 317. Costs 4 units on the PDF path and none on the
 *   table path, and all four are in the Bundesvergabegesetz. The plural sign
 *   is read on the *masked* head — "die Wortfolge „gemäß §§ 52b oder 52c"" is
 *   an operand, and testing the raw text cost seven sound units.
 * - **any part of a compound that does not resolve.** "…ersetzt sowie folgende
 *   Z 9 angefügt" is two instructions, and reading one of them files the whole
 *   unit — whose text covers both — under half its §§.
 *
 * Payload and head are cut exactly as `parseOne` cuts them, so the §§ a
 * payload *creates* are not mistaken for the ones it addresses;
 * `annex/annexDraft.ts` picks those up from the quoted Gliederungssymbole,
 * where they are not a guess.
 */
const INSTRUCTION_VERB_RE =
  /\blaute[nt]\b|\bersetzt\b|\bangefügt\b|\beingefügt\b|\beingereiht\b|\bentfäll[te]\b|\bentfallen\b|\baufgehoben\b|\bgestrichen\b|\bentfernt\b|\bvorangestellt\b|\bhinzugefügt\b|\bangeschlossen\b|\bergänzt\b|\bgesetzt\b|\beinzufügen\b|\bgeändert\b|bezeichnung(?:en)?\b|an (?:die )?Stelle\b|\berhäl?t folgende\b|\berhalten folgende\b/i

/** A head that ends in the colon opening its quoted text is an instruction too: "§ 19 Abs. 3 erster Satz:". */
const OPENS_PAYLOAD_RE = /:\s*$/

export function refusedAddresses(raw: string, inherited?: NovaoAddress | null): string[] | null {
  const line = normalizeText(raw).replace(NUMBER_PREFIX, '')
  const paras: string[] = []
  // The second half of "Dem Text des § 5 wird die Absatzbezeichnung „(1)"
  // vorangestellt; folgender Abs. 2 wird angefügt:" has no address of its own
  // and inherits the first half's — the same carry `parseInstruction` does.
  let context = inherited ?? null
  for (const part of splitCompound(line)) {
    if (!INSTRUCTION_VERB_RE.test(part) && !OPENS_PAYLOAD_RE.test(part)) return null
    const head = instructionHead(part)
    const { scope } = splitPayloadScope(head)
    const found = parseAddressList(scope || head, context)
    if (!found) return null
    context = found[0] ?? context
    const named: string[] = []
    for (const a of found) {
      if (!a.para) continue
      named.push(a.para)
      if (a.level === 'para') for (const id of a.siblings) named.push(designationOf(a.para, id))
    }
    if (named.length === 0) return null
    if (/§§/.test(maskQuotes(scope || head)) && new Set(named).size < 2) return null
    paras.push(...named)
  }
  return paras.length > 0 ? paras : null
}

/** The instruction was read and names no § because none is meant: the table of contents, the whole text. */
export const NO_PARAGRAPH_ADDRESSED = 'kein Paragraph adressiert'

export function addressedUnits(line: string, inherited?: NovaoAddress | null): AddressedUnits {
  const { ops, reason } = parseInstruction(line, inherited)
  const paras = new Set<string>()
  const aliases: [string, string][] = []
  for (const op of ops) {
    // The table of contents is derived from the law text, never text of its
    // own; an instruction that only touches it addresses no § (`NovaoOp`).
    if (op.kind === 'toc') continue
    const address = opAddress(op)
    // A trailing enumeration attaches to the address's *deepest* component,
    // so "§ 5 Abs. 2 und 3" lists Absätze and names one §. Only at para
    // level do the siblings name §§ of their own — "§§ 7 bis 14", which
    // `parseAddress` has already expanded through `expandRange`.
    for (const para of namedParagraphs(address)) paras.add(para)
    // "Nach § 5 wird folgender § 5a eingefügt": § 5 is the anchor and § 5a is
    // what the payload spells out. Both belong here — the anchor because an
    // insertion inside a § is common enough to be worth its words, the child
    // because it is the § the annex will print the payload under.
    if ((op.kind === 'insertAfter' || op.kind === 'append') && op.child === 'para') {
      for (const id of op.childIds) paras.add(designationOf(address.para ?? '§', id))
    }
    // Only a § renumbered names a new §. „erhält Abs. 4 die Absatzbezeichnung
    // ‚(5)'" and „Der bisherige Inhalt des § 5 erhält die Absatzbezeichnung
    // ‚(1)'" carried „(5)" and „(1)" in here as if they were designations of
    // their own — dropped downstream by `designationKey`, which reads them as
    // nothing, but a wrong entry all the same.
    if (op.kind === 'renumber' && op.target.level === 'para') {
      if (op.to) {
        paras.add(op.to)
        if (op.target.para) aliases.push([op.target.para, op.to])
      }
      // "die §§ 5 bis 9 erhalten die Paragrafenbezeichnungen „6.“ bis „10.“":
      // the numbers in between are renumbered too and the annex shows them.
      const from = numeralOf(op.to)
      const to = op.toLast === null ? null : numeralOf(op.toLast)
      if (from !== null && to !== null) for (const id of expandRange(from, to) ?? []) paras.add(designationOf(op.target.para ?? '§', id))
    }
  }
  // Nothing could be typed — but the address may still be readable, and a
  // refusal of the *verb* is no reason to widen the reference of a whole law.
  if (ops.length === 0) for (const para of refusedAddresses(line, inherited) ?? []) paras.add(para)
  return { paras: [...paras], aliases, reason: paras.size > 0 ? null : (reason ?? NO_PARAGRAPH_ADDRESSED) }
}
