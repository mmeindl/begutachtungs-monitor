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
import { articleNumberKey } from '../text/designation'

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
function parseSatz(tail: string): { satz: string | null; satzCount: number } | null {
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
function siblingsAfter(rest: string, first: string): string[] | null {
  const m = /^\s*((?:,\s*\d+[a-z]*\s*)*)(und|bis|sowie|,)\s*(\d+[a-z]*)\b/i.exec(rest)
  if (!m) return []
  if (OWN_COMPONENT_RE.test(rest.slice(m[0].length))) return null
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
    return { para: null, artikel, abs: null, z: null, lit: null, satz: null, satzCount: 0, siblings: [], level: 'document', heading: false, alsoHeading: false, raw: t }
  }

  const pm = PARA_RE.exec(scope)
  if (!pm) {
    const sm = ABSCHNITT_RE.exec(scope)
    if (sm) {
      const nr = sm[1] ?? sm[2] ?? ''
      return { para: `Abschnitt ${nr}`, artikel, abs: null, z: null, lit: null, satz: null, satzCount: 0, siblings: [], level: 'abschnitt', heading, alsoHeading, raw: t }
    }
    if (TITEL_RE.test(t)) {
      return { para: null, artikel, abs: null, z: null, lit: null, satz: null, satzCount: 0, siblings: [], level: 'titel', heading: true, alsoHeading: false, raw: t }
    }
    if (!inherited?.para) return null
  }

  const para = pm ? (pm[1] ? `§ ${pm[1]}` : pm[2] ? `Art. ${pm[2]}` : `${pm[3]} ${pm[4]}`) : inherited!.para
  // Components are read after the § so a § number is not mistaken for an
  // Absatz of an earlier reference in the same sentence.
  const tail = pm ? scope.slice(pm.index + pm[0].length) : scope
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

  return { para, artikel, abs, z, lit, satz, satzCount, siblings, level, heading, alsoHeading, raw: t }
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
  return { ...a, abs: null, z: null, lit: null, satz: null, satzCount: 0, siblings: [], level: 'para', heading: true, alsoHeading: false }
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
  // Either every paragraph carries its own symbol, or the plural shorthand
  // spells the first one and leaves the rest bare. Both can occur in one
  // instruction, so each explicit segment is offered to the splitter again.
  const segments = withPara.length >= 2 ? withPara : splitPluralParagraphs(t)
  if (!segments) {
    const single = parseAddress(text, inherited)
    return single ? [single] : null
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
  for (const segment of segments) {
    for (const one of splitPluralParagraphs(segment) ?? [segment]) {
      const qualified = prefix && !ARTIKEL_QUALIFIER_RE.test(one) ? prefix + one : one
      const a = parseAddress(qualified, inherited)
      if (!a) return null
      out.push(a)
    }
  }
  return out
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
  /**
   * "In § 5 Abs. 1 wird die Wortfolge X durch die Wortfolge Y ersetzt."
   *
   * `everywhere` — every occurrence inside ONE place ("In § 5 wird jeweils …").
   * `eachUnit` — once in EACH unit the address spans ("In § 81 Abs. 1 und 2
   * wird das Wort X jeweils durch Y ersetzt"). The two are the two readings of
   * „jeweils", and which one applies is decided by whether the address names
   * one place or several (`everyOccurrence`).
   */
  | { kind: 'replacePhrase'; target: NovaoAddress; from: string; to: string; everywhere: boolean; eachUnit: boolean; wordBound: boolean }
  /** "In § 5 Abs. 1 wird nach der Wortfolge X die Wortfolge Y eingefügt." */
  | { kind: 'insertPhrase'; target: NovaoAddress; anchor: string; where: 'after' | 'before'; text: string; eachUnit: boolean; wordBound: boolean }
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
  '(?:Wort-\\s*und\\s*Zeichenfolge|Zeichen-\\s*und\\s*Wortfolge|Wortfolge|Wortgruppe|Wortlaut|Worte|Wort|Wendung|Klammerausdrücke|Klammerausdruck|Ausdrücke|Ausdruck|Zitierung|Zitat|Begriff|Bezeichnung|Satzteil|Verweis|Fundstelle|Zeichenfolge|Zeichen|Punkt|Strichpunkt|Beistrich|Datum|Betrag|Prozentsatz|Altersangabe|Zahl|Jahreszahl|Fassung der Kundmachung|Norm|Einträge|Eintrag)(?:e|en|n|s)?'
const PHRASE_RE = new RegExp(`\\b${PHRASE_OBJECT}\\b`, 'i')
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

function parseOne(raw: string, inherited: NovaoAddress | null | undefined, whole: string): ParsedInstruction {
  const line = normalizeText(raw).replace(NUMBER_PREFIX, '')
  const head = instructionHead(line)
  const quotes = quotedParts(line)
  const ok = (op: NovaoOp): ParsedInstruction => ({ ops: [op], reason: null, line })
  const fail = (reason: string): ParsedInstruction => ({ ops: [], reason, line })

  if (/^(Im |Das |Die |In dem )?Inhaltsverzeichnis/i.test(head)) return ok({ kind: 'toc' })

  const { scope, payload } = splitPayloadScope(head)
  const targets = parseAddressList(scope || head, inherited)
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
  // operation with a different danger, and it stays refused rather than
  // running as a renumbering of the Paragraph.
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
    return ok({
      kind: 'replacePhrase',
      target,
      from: PUNCT_WORD[punct[1]!.toLowerCase()]!,
      to: PUNCT_WORD[punct[2]!.toLowerCase()]!,
      everywhere: false,
      // „In § 27a Abs. 2 und § 27b Abs. 2 wird in Z 16 jeweils das Wort
      // „sowie" durch einen Beistrich ersetzt" — the punctuation form carries
      // the same „jeweils" as the quoted one.
      eachUnit: eachUnitOccurrence(head),
      // A single punctuation character carries no word boundary to ask for.
      wordBound: false,
    })
  }

  if (PHRASE_RE.test(head)) {
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
      const mixed = operands.length < 2 ? punctReplacement(head, operands, line) : null
      if (mixed) {
        return {
          ops: places.map((t) => ({ kind: 'replacePhrase' as const, target: t, from: mixed.from, to: mixed.to, everywhere: everyOccurrence(head, targets), eachUnit, wordBound: mixed.wordBound })),
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
      // Both German forms name the old text first — "wird A durch B ersetzt"
      // and "tritt an die Stelle der Wortfolge A die Wortfolge B". Only when
      // the new text is fronted ("Die Wortfolge B tritt an die Stelle von A")
      // does the order flip, and the position of the verb says which it is.
      const verb = /an (?:die )?Stelle/i.exec(line)
      const reversed = verb !== null && verb.index > operands[0]!.at
      const from = reversed ? operands[1]! : operands[0]!
      const to = reversed ? operands[0]! : operands[1]!
      const everywhere = everyOccurrence(head, targets)
      return { ops: places.map((t) => ({ kind: 'replacePhrase' as const, target: t, from: from.text, to: to.text, everywhere, eachUnit, wordBound: wordOperand(line, from.ord) })), reason: null, line }
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
 * The address an operation leaves behind for the clause after it — its target,
 * or the anchor of an operation that has no target of its own. `insertPhrase`
 * carries an `anchor` that is a piece of TEXT rather than an address, so the
 * target is asked for first.
 */
function opContext(op: NovaoOp): NovaoAddress | null {
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
export function parseInstruction(raw: string, inherited?: NovaoAddress | null): ParsedInstruction {
  const line = normalizeText(raw).replace(NUMBER_PREFIX, '')
  const parts = splitCompound(line)
  if (parts.length === 1) return parseOne(line, inherited, line)

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
  return { ops, reason: reasons.length ? `Teil nicht gelesen: ${reasons[0]}` : null, line }
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
    if (address.para) {
      paras.add(address.para)
      // A trailing enumeration attaches to the address's *deepest* component,
      // so "§ 5 Abs. 2 und 3" lists Absätze and names one §. Only at para
      // level do the siblings name §§ of their own — "§§ 7 bis 14", which
      // `parseAddress` has already expanded through `expandRange`.
      if (address.level === 'para') for (const id of address.siblings) paras.add(designationOf(address.para, id))
    }
    // "Nach § 5 wird folgender § 5a eingefügt": § 5 is the anchor and § 5a is
    // what the payload spells out. Both belong here — the anchor because an
    // insertion inside a § is common enough to be worth its words, the child
    // because it is the § the annex will print the payload under.
    if ((op.kind === 'insertAfter' || op.kind === 'append') && op.child === 'para') {
      for (const id of op.childIds) paras.add(designationOf(address.para ?? '§', id))
    }
    if (op.kind === 'renumber') {
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
