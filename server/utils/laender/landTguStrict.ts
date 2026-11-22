/**
 * The right column of a Land's Textgegenüberstellung against the wording
 * the draft itself quotes for the § — word for word and in order
 * (20.11.2026).
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * The rule „nicht im Entwurf" (`landTguGuard.ts`) asks whether the words a §
 * shows as new occur among the words the draft's instructions carry for it:
 * a bag, with floors. A wrongly read word, a changed number and a lost
 * sentence pass it by construction, and the fault injection measured that
 * (0 of 476, 0 of 551, 0 of 338 on GP XXVIII, 19.11.2026). This module holds
 * the same § against the same instructions as a SEQUENCE:
 *
 * - what the draft WRITES for the § (`draftWording`): the payload under an
 *   instruction („§ 5 Abs 2 lautet: „…"", „wird eingefügt: „…""), cut to
 *   the § where one payload prints several, and the new half of a
 *   replacement the instruction quotes in its own line („die Zahl „19"
 *   durch die Zahl „18" ersetzt");
 * - against the §'s right column as the page shows it (`strictCheck`). The
 *   payloads are aligned with it in order (`align`): every word the page
 *   marks as NEW must be a word of a payload at its place, and every word
 *   of a payload must stand in the right column, in that order. A stretch
 *   quoted in an instruction's line is not aligned — where it goes, the
 *   line says in words — but must stand in the column as one stretch, and
 *   accounts for the new words it stands at.
 *
 * A NUMBER IS A WORD. `comparableTokens`, which the bag rule reads with,
 * drops every token under three characters and with it nearly every number
 * of a law; `strictTokens` keeps them all.
 *
 * AND WHAT IT STRIKES (22.11.2026, `struckAccount`): every word the page
 * shows as struck must be struck by an instruction for the § — quoted as the
 * old wording, repealed or rewritten as a unit by address, rewritten where a
 * payload stands, or no more stretches than the instructions strike by a
 * position they only count. Where none does, the column strikes what the
 * draft keeps: `StrictCheck.struckNotInDraft`. It decides the verdict only
 * where the caller asks (`struck`, the Bund's annex); a Land's page withholds
 * a § that differs, and the Länder do not ask until the maintainer decides.
 *
 * WHAT CANNOT BE HELD THIS WAY IS SAID, NOT PASSED (`StrictCheck.state`
 * `unchecked`, with its reason): a § no instruction of the draft names, a
 * law that could not be named in the draft, an instruction whose quotes
 * this module cannot tell old from new or that leaves the wording to the
 * reader's grammar, a payload printed for several §§ without their
 * designations, new text the draft writes elsewhere in the law. The bag
 * rule's verdict stands for those, and they are counted apart.
 *
 * ONLY TYPOGRAPHY IS NORMALISED: case, quotation marks, the kinds of dash,
 * punctuation, a word broken at a line's end, where a space stands inside
 * or between two words (`respace`), and what a misread font left of „ß",
 * the umlauts and the quotation marks in two Tirol drafts
 * (`withoutResidue`). Not normalised: any letter, any digit, the order. No
 * threshold and no share: a single word is a finding.
 *
 * MEASURED ON GP XXVIII (20.11.2026, `pnpm harness:land-guard`, 63
 * documents of Oberösterreich, Salzburg, Tirol and Wien, 1,162 §§ changed
 * or new): 1,044 held word for word, 72 not held this way, 46 differing and
 * withheld. Of injected faults in the §§ shown the product sees 611 of 652
 * changed numbers, 876 of 934 swapped words and 315 of 348 dropped
 * sentences (the bag rule: none), and 1,061 of 1,106 sentences of another §
 * of the same draft (the bag rule, where it could judge: 303 of 520).
 *
 * The first run withheld 93, and reading them found our own reader: most
 * of the 47 that are held since were Oberösterreich's marks read one
 * letter off, where an underlined stretch runs into a struck one
 * („einzuhaltend", „Z 3, 4 und 4" for „und 5") — fixed where the letters
 * are placed (`landTgu.ts`, `placedCentres`). Of the 46 left, some are the Land's two
 * documents differing (Wien 2026009: the draft raises a fine to „3 000",
 * its Textgegenüberstellung prints „2 500"; Oö. 2025-16094 strikes
 * „Amtsverschwiegenheit" one letter short), the others sound §§ lost to
 * this module's limits — a table read in another order, a payload our
 * draft reader lost or left a footer in.
 *
 * ITS OWN MISSES (21.11.2026): 11 injected faults passed where this module
 * held the §. Closed: a citation the draft wraps onto a line of its own cut a
 * payload as if a § began there (Salzburg 32025, § 48a); a single new number
 * passed for the draft's because the instruction's line names it as an
 * address („am Ende der Z 8"); a part of a quoted wording passed as the
 * instruction's text where the whole stood at another place („jeweils").
 * Since then (1,044 held, 71 not held, 47 differing) the strict check sees
 * every changed number and swapped word in the §§ it holds, and 317 of 324
 * dropped sentences. The seven it does not see: a word the new text shares
 * with the old at its seam lost there (Oö. 2025-16094, § 21, in three laws:
 * old text lost from the right column, which no rule here reads); a quoted
 * wording of one word that stands again inside a payload's text („(3)",
 * „(5)", „Bemessung"; three — a quote and a payload may share a place, so
 * the place is not asked); and a payload's word found again further down the
 * § by the alignment, which keeps order but not adjacency (one).
 *
 * ITS READERS (21.11.2026): the 71 §§ not held were read one by one, and
 * most had a reader fault behind them — an instruction the PDF wraps before
 * a cited § or a date, a „§" printed as „ß", an address the Bund's grammar
 * refuses, a place quoted before the verb, „§ 24 b", a count from „0.", a law
 * named with a comma or a declined adjective, three forms of quotes. Since
 * then 1,073 held, 44 not held, 48 differing — two of them the Land's two
 * documents differing (Salzburg 32075 § 24b: „(xx)" against „(14)"; 31782
 * § 30: „und" against „oder"). The 44: ranges of designations and wordings
 * left to grammar (refused on purpose), §§ too long for the word difference,
 * payloads printed for several §§ unnamed, laws the comparison calls by a
 * new title, and instructions the draft numbers twice, not at all, or out of
 * sequence. The floor over the §§ it holds is unchanged: every changed
 * number and swapped word, 329 of 336 dropped sentences (the same seven).
 */
import type { LawDiffSegment, LawDiffUnit } from '../../../shared/types'
import { segmentUnits, type LawUnit, type TextBlock } from '../lawtext/lawUnits'
import { normalizeText } from '../lawtext/normalize'
import { designationKey } from '../annex/annexText'
import { draftUnits, type DraftUnit } from '../annex/annexDraft'
import { RUNS_ON_RE } from './landTgu'

const JOINERS = 'und|oder|bzw|sowie|beziehungsweise'
/** A word broken at a line's end („Verord- nung", „Infrastruktur- Dienstleistung"), never an Ergänzungsstrich („Land- und Forstwirtschaft"). The marks of `markedText` between the halves stay. */
const BROKEN_WORD_RE = new RegExp(`(?<=[\\p{L}\\p{N}])-([\\s\\uE000\\uE001]+)(?!(?:${JOINERS})(?![\\p{L}\\p{N}]))(?=\\p{L})`, 'gu')
const TOKEN_RE = /[\uE000\uE001]|§|[\p{L}\p{N}-]+/gu

/** A token with whether it stands inside a stretch marked `\uE000…\uE001` — two private-use characters no text carries and no normalisation touches. */
interface Marked {
  word: string
  marked: boolean
  /** Whether the word is printed as a designation, where a unit begins (`designationForm`). */
  designation?: boolean
  /** …and how: „(5)", „5." or „e)" (`shapeOf`). */
  shape?: Shape
  /** Where the word stands in the §'s word diff, removed words counted (`diffWords`); none for the heading. */
  at?: number
  /** A sentence ends after the word: „." before no small letter and no figure, and not after an abbreviation („Abs.", „BGBl."). */
  stop?: true
}

/** How a designation is printed: „(5)", „5." or „e)". */
type Shape = '()' | '.' | ')'

/** How the figure at `at` of `flat` is printed, where it is printed like a designation. */
function shapeOf(flat: string, at: number, length: number): Shape {
  let k = at - 1
  while (k >= 0 && /[\s]/u.test(flat[k]!)) k--
  return flat[k] === '(' && flat[at + length] === ')' ? '()' : flat[at + length] === ')' ? ')' : '.'
}

/** The level of the unit a designation opens: Absatz 1, Ziffer 2, Litera 3, Sublitera („aa)") 4. */
const levelOf = (word: string, shape: Shape): number => (/^\d/.test(word) ? (shape === '()' ? 1 : 2) : /^([a-z])\1$/.test(word) ? 4 : 3)

/** What follows a word that ends a sentence: „." (a closing mark between) before neither a small letter nor a figure — a semicolon ends none („erster Satz" counts to the full stop). */
const STOP_RE = /^[“”"»«)\]]*[.!?][“”"»«)\]]*(?=\s|$)(?!\s*[\p{Ll}\d])/u
/** Words a full stop follows as an abbreviation, not as a sentence's end. */
const ABBREVIATIONS = new Set(['abs', 'z', 'lit', 'nr', 'art', 's', 'bgbl', 'lgbl', 'abl', 'vgl', 'bzw', 'ca', 'gem', 'lt', 'usw', 'etc', 'dh', 'zb', 'ua', 'idf', 'ff', 'sublit', 'anl', 'ziff'])

/** The words a figure stands after in an address or a citation, not where a unit begins: „Abs. 5.", „Nr. 5.", „S. 1.". */
const ADDRESS_WORDS = new Set(['abs', 'absatz', 'z', 'ziffer', 'lit', 'litera', '§', 'art', 'artikel', 'nr', 's', 'satz', 'anlage'])

/**
 * Whether the token at `at` of `flat` is printed as a designation: „(5)", or
 * „5." / „e)" where a unit can begin — after a mark, or after the joiner that
 * ends a list's last unit („… soll oder 10. die …"); not after an address word
 * („Abs. 5.", „Nr. 5.") or a joiner of designations („Z 4 und 5.").
 */
function designationForm(flat: string, at: number, length: number, previous: readonly Marked[]): boolean {
  // The marks of a new stretch (`markedTokens`) are no character of the text.
  const blank = (c: string | undefined) => c === undefined || /[\s\uE000\uE001]/u.test(c)
  let k = at - 1
  while (k >= 0 && blank(flat[k])) k--
  const after = flat[at + length]
  if (flat[k] === '(' && after === ')') return true
  // „5.", „e)", and „5.." as Oö. 2026-16120 prints it.
  let end = at + length
  while (flat[end] === '.' || flat[end] === ')') end++
  if (end === at + length || !blank(flat[end])) return false
  const [two, one] = [previous.at(-2)?.word, previous.at(-1)?.word]
  if (k >= 0 && /[\p{L}\p{N}]/u.test(flat[k]!)) return /^(?:und|oder|sowie)$/.test(one ?? '') && !/^\d/.test(two ?? '')
  return !ADDRESS_WORDS.has(one ?? '')
}

/**
 * What a misread font leaves in a Land's PDF where a line mixes it with a
 * sound one, so that the reader's repair (`repairMacRoman`, line by line)
 * passes the line by — Tirol's 575/2026 and 722/2026: „ã…Ò" for „…",
 * „¸ ‰ ˆ" for „ü ä ö", „ð" for a list's dash. None of the six is a letter
 * of a German law text.
 */
const withoutResidue = (text: string): string => text.replace(/[ðÐ]/g, ' ').replace(/ã/g, '„').replace(/Ò/g, '“').replace(/¸/g, 'ü').replace(/‰/g, 'ä').replace(/ˆ/g, 'ö')

function markedTokens(text: string): Marked[] {
  const normal = normalizeText(withoutResidue(text))
  const flat = normal
    .toLowerCase()
    .replace(BROKEN_WORD_RE, (_m, gap: string) => gap.replace(/\s+/g, ''))
  // The same text with its capitals (where lower case keeps every length): what follows a full stop says whether a sentence ends.
  const cased = normal.replace(BROKEN_WORD_RE, (_m, gap: string) => gap.replace(/\s+/g, ''))
  const out: Marked[] = []
  let on = false
  for (const m of flat.matchAll(TOKEN_RE)) {
    if (m[0] === '\uE000') on = true
    else if (m[0] === '\uE001') on = false
    else {
      // „ß" read as the ligature „ﬂ" comes back as „fl" („Maflgabe", the same two drafts): one spelling for both.
      const word = m[0].replace(/-/g, '').replace(/ß/g, 'fl')
      const designation = designationForm(flat, m.index, m[0].length, out)
      // A shape also where the figure is printed like one but not read as a unit's start: „… 15." after an elision mark the caller reads as a word.
      const like = designation || (/^(?:\d+[a-z]*|[a-z]{1,2})$/.test(word) && /[.)]/.test(flat[m.index + m[0].length] ?? ''))
      const stop = !designation && !ABBREVIATIONS.has(word) && cased.length === flat.length && STOP_RE.test(cased.slice(m.index + m[0].length, m.index + m[0].length + 8))
      if (word) out.push({ word, marked: on, designation, ...(like ? { shape: shapeOf(flat, m.index, m[0].length) } : {}), ...(stop ? { stop: true as const } : {}) })
    }
  }
  return out
}

/**
 * Every word and every number of a text, in order: lower case, without
 * quotation marks, punctuation and hyphens, a word broken at a line's end
 * joined. Nothing is dropped for its length.
 */
export function strictTokens(text: string): string[] {
  return markedTokens(text).map((t) => t.word)
}

// ---------------------------------------------------------------------------
// The draft's wording for a §
// ---------------------------------------------------------------------------

/** One stretch of words the draft writes for a §. */
export interface Wording {
  tokens: string[]
  /**
   * Words that need not stand in the right column: a § designation and the
   * heading printed with it, which the page shows above the text.
   */
  optional: boolean[]
  /**
   * Wording an instruction quotes in its own line („die Zahl „19" durch die
   * Zahl „18" ersetzt", „erhält die Absatzbezeichnung „(7)""): where in the
   * § it goes the line says in words, often for several places („jeweils"),
   * so it is not aligned. It accounts for every place of the right column
   * it stands at as one stretch.
   */
  repeats: boolean
  /** …and must stand there once at least, where its instruction names one § only. */
  once?: boolean
  /**
   * A designation the instruction gives („erhält die Absatzbezeichnung
   * „(5)""): a single token accounts only for a place printed as a
   * designation (`designationForm`), not for the same figure in the text.
   */
  designation?: boolean
}

/** What the draft writes for one §, or why that cannot be said. */
export interface DraftWording {
  wordings: Wording[]
  /**
   * The instructions naming the § as they stand, line and payload, without
   * what they quote as old or as a place: a new stretch that is one stretch
   * of these is the draft's, wherever the alignment put it.
   */
  text: string[][]
  /**
   * The same instructions without their lines' own words: what they quote as
   * new (a quotation the line leaves open runs to its end) and their
   * payloads. A single new word must stand here to be the draft's — in the
   * line it is an address („Z 8", „Abs. 10"), not wording.
   */
  written: string[][]
  /** Set where an instruction naming the § could not be read as wording; the § is then not held strictly. */
  unread: string | null
  /** What the instructions naming the § strike (`Struck`); none where they strike nothing. */
  struck?: Struck
}

/**
 * What a draft's instructions for a § strike (22.11.2026), each with the
 * instruction's line: the wording they quote as replaced or struck
 * (`named`: „wird die Wortfolge „X“ durch … ersetzt", „entfällt das Wort
 * „X“", and the payload under „entfällt der folgende Satz:"), the units they
 * repeal by designation without quoting them (`repealed`: „Abs. 3 entfällt",
 * „Z 4 und 5 werden aufgehoben", „§ 9 samt Überschrift entfällt"; level 0
 * is the § itself, 1 the Absatz, 2 the Ziffer, 3 the Litera, 4 the
 * Sublitera), and what they strike or replace by a position they only count
 * or describe (`byPosition`: „der letzte Satz entfällt", „lautet der zweite
 * Satz:", „entfällt der Schlussteil"), as many stretches as they name.
 */
export interface Struck {
  /** …each with the places its line names (`places`): it accounts only there, or anywhere in the § where they name the § whole or nothing below it. */
  named: { tokens: string[]; line: string; designation?: true; places?: AddressUnit[] }[]
  repealed: (AddressUnit & { line: string })[]
  /** …`replaces` where the line writes the stretch anew (a payload, a quoted new wording), `heading` where it is the heading. */
  byPosition: { count: number; places: AddressUnit[]; line: string; replaces?: true; heading?: true }[]
  /** The units the instructions write anew by address („§ 14 Abs. 5 und 6 lautet:"; level 0 the § itself): their old words are rewritten. */
  replaced?: (AddressUnit & { line: string })[]
  /** An instruction for the § speaks of designations („erhält die Absatzbezeichnung", „entfällt die bisherige Absatzbezeichnung (1)", „ohne Nummerierung"): a designation struck alone is notation. */
  renumbers?: boolean
}

const OPEN = '„»'
const CLOSE = '“”«'
/** A quotation inside an instruction line: „…" (the closing mark as the PDF types it). */
const QUOTE_RE = new RegExp(`[${OPEN}]([^${OPEN}${CLOSE}]*)[${CLOSE}]`, 'gu')
const REMOVING = 'entfällt|entfallen|aufgehoben|gestrichen'
const ADDING = 'eingefügt|angefügt|vorangestellt|angehängt|ergänzt'
const VERB_RE = new RegExp(`(?<![\\p{L}])(${REMOVING}|${ADDING}|ersetzt|lautet|lauten)(?![\\p{L}])`, 'u')
const UNIT_WORD = '(?:Wort(?:e|es|folge|folgen|laut|lautes|gruppe)?|Wörter|Wörtern|Ausdruck(?:es|s)?|Ausdrücke|Zitat(?:es|s|e)?|Verweis(?:es|ung)?|Wendung|Zeichenfolge|Wort-\\s+und\\s+Zeichenfolge|Klammerausdruck(?:es|s)?|Klammerzitat(?:es|s)?|Betrag(?:es|s)?|Zahl|Ziffer|Datum|Satzteil(?:es|s)?|Halbsatz(?:es)?|Begriff(?:es|s)?|Bezeichnung|Abkürzung|Jahreszahl|Prozentsatz(?:es)?|Text(?:es|s)?|Passage|Überschrift)'
/** „nach dem Wort „X"", „vor der Wortfolge „X"" — and at the line's start, „Nach der Überschrift „X"" (Oö. 2026-16124): the place, not the text. */
const ANCHOR_RE = new RegExp(`(?<![\\p{L}])(?:[Nn]ach|[Vv]or|[Hh]inter)\\s+(?:de[mnr]\\s+|die\\s+|das\\s+)?(?:\\p{L}+\\s+)?${UNIT_WORD}\\s*$`, 'u')
const NEW_AFTER_RE = /:\s*$|(?<![\p{L}])(?:lautet|lauten|eingefügt|angefügt|vorangestellt|\p{L}*[Bb]ezeichn?ung(?:en)?|folgende[rnms]?(?:\s+\p{L}+){0,3})\s*$/u

type Role = 'new' | 'old' | 'anchor' | null

/** „entfällt", „entfallen", „erhält", „erhalten": the verbs a designation is taken or given by. */
const DESIGNATION_VERB_RE = /(?<![\p{L}])(entfällt|entfallen|erhält|erhalten)(?![\p{L}])/gu
/** The verbs of an instruction line, „erhält" and „bezeichnet" among them: which comes first after a quoted designation. */
const NEXT_VERB_RE = /(?<![\p{L}])(entfällt|entfallen|aufgehoben|gestrichen|eingefügt|angefügt|vorangestellt|angehängt|ergänzt|ersetzt|lautet|lauten|erhält|erhalten|bezeichnet)(?![\p{L}])/u

/**
 * Whether a line removes the designation it quotes (22.11.2026): „In § 98
 * entfällt die Absatzbezeichnung „(1)“", „entfallen Abs. 1 und 2 sowie die
 * Absatzbezeichnung „(3)“", „werden die Absatzbezeichnung „(1)“ und die
 * Abs. 2, 3 und 4 aufgehoben". The last of „entfällt" and „erhält" before the
 * quotation governs it, with no clause opened in between („Abs. 1 entfällt;
 * die Abs. 2 bis 4 erhalten die Absatzbezeichnungen „(1)“ bis „(3)“" gives
 * them). Where neither stands before it: the verb right behind it („Die
 * Absatzbezeichnung „(1)“ entfällt"), or the passive whose verb comes later
 * („wird die Absatzbezeichnung „(1)“ … aufgehoben"). Read as a designation
 * the line gives, the check looked for a new „(1)" in a column that rightly
 * prints none, and the § differed by wording nobody wrote.
 */
function removesDesignation(head: string, after: string): boolean {
  const bare = head.replace(QUOTE_RE, ' ')
  const last = [...bare.matchAll(DESIGNATION_VERB_RE)].at(-1)
  if (last) return last[1]!.startsWith('entf') && !/;|(?<![\p{L}])(?:wird|werden|tritt|treten|lautet|lauten)(?![\p{L}])/u.test(bare.slice(last.index + last[0].length))
  if (/^\s*(?:ersatzlos\s+)?(?:entfällt|entfallen)(?![\p{L}])/u.test(after)) return true
  if (!/(?<![\p{L}])(?:wird|werden)\s+(?:die|der)\s+(?:bisherigen?\s+)?\p{L}*[Bb]ezeichn?ung(?:en)?\s*$/u.test(bare)) return false
  const next = NEXT_VERB_RE.exec(after.replace(QUOTE_RE, ' '))?.[1]
  return next !== undefined && new RegExp(`^(?:${REMOVING})$`).test(next)
}

/** Where a line's next clause opens: „… entfällt die Wortfolge „X" und wird das Wort „Y" durch …". */
const CLAUSE_RE = /(?:(?<![\p{L}])(?:und|sowie)|[,;])\s+(?:es\s+|im\s+§[^„]*?\s)?(?=(?:wird|werden|entfällt|entfallen|erhält|erhalten|tritt|treten|hat|haben)(?![\p{L}]))/gu
/** Between two quotations of one list: „„Vorlage" und „Beibringung"", „„11.", „12." und „13."". */
const LIST_RE = new RegExp(`^\\s*(?:,|und|sowie|oder|bzw\\.?)\\s*(?:(?:die|das|der|den|dem)\\s+)?(?:${UNIT_WORD}\\s*)?$`, 'u')
/**
 * A quoted wording replaced by a sign, no wording: „„und“ am Ende von lit. a
 * durch einen Strichpunkt ersetzt" — only place words between, no verb, no
 * conjunction, no comma: „„bzw. einer Umweltqualitätsnorm“ eingefügt und der
 * Punkt am Ende durch einen Strichpunkt ersetzt" replaces the full stop.
 */
const REPLACED_BY_SIGN_RE = new RegExp(`^\\s*(?:(?!(?:und|sowie|oder|${REMOVING}|${ADDING}|ersetzt|lautet|lauten)(?![\\p{L}]))[\\p{L}\\d.]+\\s+){0,6}durch\\s+(?:einen|ein)\\s+(?:Strichpunkt|Punkt|Beistrich|Doppelpunkt)(?![\\p{L}])`, 'u')
/** A quotation the line gives as a designation: „erhält die Absatzbezeichnung „(4)“", „die Bezeichnungen „4.“ und „5.“" — not a name („die Bezeichnung „Lemböckgasse“"). „Bezeichung" as two Bund drafts print it. */
const DESIGNATION_BEFORE_RE = /bezeichn?ung(?:en)?\s*$/iu
/** „„X“ wird in § 7a Abs. 2 durch …": the old wording, an address between the verb and „durch". */
const OLD_BEFORE_DURCH_RE = /^\s*(?:wird|werden)\s+in\s+§[^„“]{0,60}?\s+durch(?![\p{L}])/u
/** „tritt an die Stelle der Wortfolge „X“", „an die Stelle von „X“ tritt …": the old wording. */
const IN_PLACE_OF_RE = new RegExp(`(?<![\\p{L}])[Aa]n\\s+die\\s+Stelle\\s+(?:von\\s+|de[srmn]\\s+)?(?:\\p{L}+\\s+){0,4}$`, 'u')
/** …and what follows it, the new: „… jeweils das Wort „Y“", „… tritt „Y“". */
const IN_PLACE_NEW_RE = new RegExp(`^\\s*(?:(?:tritt|treten)\\s+)?(?:jeweils\\s+)?(?:(?:der|die|das|den|dem|des)\\s+)?(?:${UNIT_WORD}(?:\\s+und\\s+(?:der|die|das|den|dem|des)\\s+${UNIT_WORD})?\\s*)?$`, 'u')
const DESIGNATION_TEXT_RE = /^\s*(?:\(\s*\d+[a-z]*\s*\)|\d+[a-z]*\.?|[a-z]{1,2}\)?)\s*$/u
/** A replacement the instruction leaves to the reader's grammar: the wording is not quoted as it will stand. */
const INEXACT_RE = /grammatikalisch|sinngemäß|in\s+der\s+jeweiligen|im\s+jeweiligen|jeweils\s+richtigen/u

/**
 * What each quotation of an instruction line is: the new wording, the old
 * one it replaces or deletes, or the place it is set at. Null where the
 * line's grammar does not say — the § is then not held strictly.
 *
 * Read clause by clause, since German puts the verb at either end:
 * „entfällt die Wortfolge „X"" and „wird die Wortfolge „X" gestrichen".
 */
export function quoteRoles(raw: string): { text: string; role: Role; designation: boolean; range: boolean }[] {
  const line = withoutResidue(raw)
  const quotes = [...line.matchAll(QUOTE_RE)]
  const bounds = [...line.matchAll(CLAUSE_RE)].map((m) => m.index)
  // The instruction's words, not its payload's: „… unter sinngemäßer Anwendung des § 55a …“ (Salzburg 32075, § 16).
  const inexact = INEXACT_RE.test(line.replace(QUOTE_RE, ' '))
  const out = quotes.map((m, i) => {
    const start = m.index
    const end = start + m[0].length
    const before = line.slice(i > 0 ? quotes[i - 1]!.index + quotes[i - 1]![0].length : 0, start)
    const after = line.slice(end, quotes[i + 1]?.index ?? line.length)
    let role: Role = null
    const designation = DESIGNATION_BEFORE_RE.test(before) && DESIGNATION_TEXT_RE.test(m[1]!)
    // „„X“ durch …", „„X“ wird durch …" (Oö. 2026-16120), „„und“ am Ende durch einen Punkt ersetzt" (2026-16124, Tirol 575/2026): the old wording.
    // So are „„X“ ersetzt durch „Y“" and „„X“ wird in § 7a Abs. 2 durch „Y“ ersetzt" (the Bund, 21.11.2026), and „an die Stelle der Wortfolge „X“".
    if (/^\s*(?:(?:wird|werden)\s+)?(?:jeweils\s+)?(?:ersetzt\s+)?durch(?![\p{L}])/u.test(after) || OLD_BEFORE_DURCH_RE.test(after) || REPLACED_BY_SIGN_RE.test(after)) role = 'old'
    else if (IN_PLACE_OF_RE.test(before)) role = 'old'
    else if (/(?<![\p{L}])durch\s+(?:\p{L}+[\s-]+){0,5}$/u.test(before)) role = 'new'
    else if (ANCHOR_RE.test(before)) role = 'anchor'
    // A designation the line removes, not one it gives (`removesDesignation`).
    else if (designation && removesDesignation(line.slice(0, start), after)) role = 'old'
    else if (NEW_AFTER_RE.test(before) || /^\s*bezeichnet(?![\p{L}])/u.test(after)) role = 'new'
    return { text: m[1]!, role, before, after, start, end, designation, range: false }
  })
  // A list of quotations shares the role its last or its first member has.
  const lists = () => {
    for (let i = out.length - 2; i >= 0; i--) if (out[i]!.role === null && LIST_RE.test(out[i]!.after)) out[i]!.role = out[i + 1]!.role
    for (let i = 1; i < out.length; i++) if (out[i]!.role === null && LIST_RE.test(out[i]!.before)) out[i]!.role = out[i - 1]!.role
  }
  // „an die Stelle der Wortfolge „X“ die Wortfolge „Y“": the quotation after the replaced one.
  for (let i = 1; i < out.length; i++) if (out[i]!.role === null && out[i - 1]!.role === 'old' && IN_PLACE_OF_RE.test(out[i - 1]!.before) && IN_PLACE_NEW_RE.test(out[i]!.before)) out[i]!.role = 'new'
  lists()
  // „die Abs. 2 bis 4 erhalten die Absatzbezeichnungen „(1)“ bis „(3)“": the range's second end is a designation the line gives too,
  // not the old wording of an „entfällt" before it („Abs. 1 entfällt; die Abs. 2 bis 4 erhalten …"; 21.11.2026). Never one the
  // line itself reads as old („die Bezeichnungen „c“ bis „e“ durch die Ziffernbezeichnungen … ersetzt").
  for (let i = 1; i < out.length; i++) {
    if (out[i]!.role !== 'old' && out[i - 1]!.role === 'new' && out[i - 1]!.designation && /^\s*bis\s*$/u.test(out[i]!.before) && DESIGNATION_TEXT_RE.test(out[i]!.text)) Object.assign(out[i]!, { role: 'new', designation: true, range: true })
  }
  // What is left takes its clause's verb: before it („entfällt die Wortfolge „X""), or after („wird die Wortfolge „X" gestrichen").
  for (const q of out) {
    if (q.role !== null) continue
    const clauseStart = bounds.filter((b) => b < q.start).at(-1) ?? 0
    const clauseEnd = bounds.find((b) => b >= q.end) ?? line.length
    const head = line.slice(clauseStart, q.start).replace(QUOTE_RE, ' ')
    const tail = line.slice(q.end, clauseEnd).replace(QUOTE_RE, ' ')
    // „entfällt das Wort „X" und nach dem Wort „Y" wird die Wortfolge „Z" eingefügt": an auxiliary since the last quotation opens a clause whose verb comes after.
    const verbLast = /(?<![\p{L}])(?:wird|werden|hat|haben)(?![\p{L}])/u.test(q.before)
    const verb = !verbLast && /(?<![\p{L}])(?:entfällt|entfallen)(?![\p{L}])/u.test(head) ? 'entfällt' : VERB_RE.exec(tail)?.[1]
    if (verb && new RegExp(`^(?:${REMOVING})$`).test(verb)) q.role = 'old'
    else if (verb && new RegExp(`^(?:${ADDING})$`).test(verb)) q.role = 'new'
  }
  lists()
  // „die Bezeichnungen „4.“ und „5.“": a list of designations.
  for (let i = 1; i < out.length; i++) if (out[i - 1]!.designation && out[i]!.role === out[i - 1]!.role && LIST_RE.test(out[i]!.before) && DESIGNATION_TEXT_RE.test(out[i]!.text)) out[i]!.designation = true
  // A designation, given (`new`) or removed or replaced (`old`): held, and struck, only where the column prints it as one.
  return out.map(({ text, role, designation, range }) => ({ text, role: inexact && role === 'new' ? null : role, designation: (role === 'new' || role === 'old') && designation, range }))
}

/** A block that opens with a § designation: „§ 2. (1) Die …", „„§ 21a", „§ 20a". */
const DESIGNATION_BLOCK_RE = /^[„"»\s]*§\s*(\d+[a-z]*)\.?(?=\s*(?:$|\(|[„"»\p{Lu}]))(?!\s*(?:Abs\b|Abs\.|Z\s|Z\d|Satz\b))/u
/** A heading line: short, no sentence. */
const isHeadingBlock = (text: string): boolean => {
  const bare = text.replace(/^[„"»\s]+|[“”"«\s]+$/gu, '')
  return bare.length > 0 && bare.length <= 160 && !/[.;:,]$/.test(bare) && !/^(?:\(\d+[a-z]*\)|\d+[a-z]?\.|[a-z]{1,2}\)|§)/.test(bare)
}

/** Salzburg numbers the instructions under one: „21.1. Abs 4 lautet:", „21.2. Im Abs 5 wird …" — no law text is numbered so. */
const SUB_INSTRUCTION_RE = /^\d+(?:\.\d+)+\.?\s/

/** Whether a § designation follows at `i`, after at most two more heading lines („5. Abschnitt" / „Maßnahmen …" / „§ 14"). */
function headsDesignation(blocks: readonly TextBlock[], i: number): boolean {
  for (let k = i; k < Math.min(blocks.length, i + 3); k++) {
    const text = `${blocks[k]!.gld ?? ''} ${blocks[k]!.text}`.trim()
    if (DESIGNATION_BLOCK_RE.test(text)) return true
    if (!isHeadingBlock(text)) return false
  }
  return false
}

/** A page footer the draft reader left inside the text (Tirol: „VD-1590/1/33-2026 Fassung vom 24. August 2026"). */
const FOOTER_RE = /\bVD-\d+\/[\d/-]+\s+Fassung\s+vom\s+\d{1,2}\.\s*\p{L}+\s+\d{4}/gu

interface Piece { key: string | null; tokens: string[]; optional: boolean[] }

/**
 * A payload's blocks, cut at the §§ it prints: one piece per § designation
 * with the heading above or below it, and one piece without a key for what
 * stands before the first designation (the payload of „§ 5 Abs 2 lautet:").
 */
function payloadPieces(blocks: readonly TextBlock[]): Piece[] {
  const pieces: Piece[] = []
  let open: Piece = { key: null, tokens: [], optional: [] }
  const push = (text: string, optional: boolean) => {
    for (const w of strictTokens(text)) {
      open.tokens.push(w)
      open.optional.push(optional)
    }
  }
  const close = () => {
    if (open.tokens.length) pieces.push(open)
  }
  let heading: string | null = null
  /** The block read last into the open piece as text. */
  let last: string | null = null
  for (let i = 0; i < blocks.length; i++) {
    const text = `${blocks[i]!.gld ?? ''} ${blocks[i]!.text}`.replace(FOOTER_RE, ' ').trim()
    const next = blocks[i + 1] ? `${blocks[i + 1]!.gld ?? ''} ${blocks[i + 1]!.text}`.replace(FOOTER_RE, ' ').trim() : ''
    // „… richtet sich nach" / „§ 73 AVG; …": a citation the line wrapped, not a § (`RUNS_ON_RE`, as the readers take it; Salzburg 32025, § 48a, and Oö. 2026-16122, § 57).
    const designation = last !== null && RUNS_ON_RE.test(last) ? null : DESIGNATION_BLOCK_RE.exec(text)
    // A heading above the designation opens the §'s piece.
    if (!designation && isHeadingBlock(text) && headsDesignation(blocks, i + 1)) {
      heading = `${heading ?? ''} ${text}`
      continue
    }
    if (designation) {
      // The next §'s heading at the end of the block before it („… gelten als bewilligte Maßnahmen. Gigabit-Netze" / „§ 14b"): not this §'s text.
      if (heading === null && last !== null) {
        const tail = /(?:^|[.;:!?“”"]\s+)([^.;:!?“”"]{3,160})$/u.exec(last)?.[1]
        const count = tail && /^\p{Lu}/u.test(tail.trim()) ? strictTokens(tail).length : 0
        for (let k = 1; k <= count && k <= open.optional.length; k++) open.optional[open.optional.length - k] = true
      }
      close()
      open = { key: designationKey(`§ ${designation[1]}`), tokens: [], optional: [] }
      if (heading !== null) push(heading, true)
      heading = null
      last = null
      push(designation[0], true)
      const after = text.slice(designation[0].length)
      // „§ 20a Verweisungen" — the heading on the designation's line; not the lead-in of a list that follows
      // („§ 19. Die Organe … haben … mitzuwirken durch" / „1. Vorbeugungsmaßnahmen …", VersSichG § 19).
      push(after, isHeadingBlock(after) && !/[.;:]/.test(after) && !/^[„"»\s]*\d+[a-z]?\.\s/u.test(next))
      // …or on the line below it.
      if (!after.trim() && next && isHeadingBlock(next) && !DESIGNATION_BLOCK_RE.test(next)) {
        push(next, true)
        i++
      }
      continue
    }
    push(text, false)
    last = text
  }
  close()
  return pieces
}

/** At most this many designations between the two ends of a quoted range: beyond it the line is not read as one. */
const MAX_RANGE = 30

/**
 * The designations a renumbering gives in words between the two it quotes
 * (21.11.2026): „die Abs. 3 bis 6 erhalten die Absatzbezeichnungen „(4)" bis
 * „(7)"" prints „(5)" and „(6)" nowhere, and the right column shows them as
 * new. Two numbers or two single letters, ascending, at most `MAX_RANGE`
 * apart; any other shape adds nothing. Held as the quoted ends are
 * (`Wording.designation`).
 */
function rangeDesignations(roles: readonly { text: string; role: Role; range: boolean }[]): string[] {
  const out = new Set<string>()
  roles.forEach((q, i) => {
    if (!q.range || q.role !== 'new' || i === 0) return
    const [a, b] = [strictTokens(roles[i - 1]!.text), strictTokens(q.text)].map((t) => (t.length === 1 ? t[0]! : ''))
    if (/^\d+$/.test(a!) && /^\d+$/.test(b!) && Number(b) > Number(a) && Number(b) - Number(a) <= MAX_RANGE) {
      for (let n = Number(a) + 1; n < Number(b); n++) out.add(String(n))
    } else if (/^[a-z]$/.test(a!) && /^[a-z]$/.test(b!) && b! > a!) {
      for (let c = a!.charCodeAt(0) + 1; c < b!.charCodeAt(0); c++) out.add(String.fromCharCode(c))
    }
  })
  return [...out]
}

const designationWording = (t: string): Wording => ({ tokens: [t], optional: [false], repeats: true, designation: true })

/** What a draft writes, for one law. */
export interface LawWording {
  /** § key (`designationKey`) → what the draft writes for it, the instructions in the draft's order. */
  byKey: Map<string, DraftWording>
  /** The new wording of instructions that name no § the reader could read („In § 29 Abs. 4, § 30 … wird jeweils …"): every § of the law may carry it. */
  general: Wording[]
  /** Those instructions as they stand: text that may be any §'s. */
  generalText: string[][]
  /** …and the wording they quote as replaced or struck (`Struck.named`): every § of the law may lose it. */
  generalStruck?: Struck['named']
}

/** What a line quotes: „…" closed, or opened and left open to the line's end. */
const WRITTEN_RE = new RegExp(`[${OPEN}]([^${OPEN}${CLOSE}]*)(?:[${CLOSE}]|$)`, 'gu')

/** A unit's blocks as the lines of its instructions and the payloads between them. */
interface Run { line: string | null; payload: TextBlock[] }

/** A restating or adding verb, then a quotation the line does not close: the payload's first line. */
const PAYLOAD_OPENS_RE = new RegExp(`((?<![\\p{L}])(?:lautet|lauten|eingefügt|angefügt|ersetzt)\\s*:?\\s*)[${OPEN}][^${OPEN}${CLOSE}]*$`, 'u')

/** An instruction numbered below a payload's closing quote in the same block: „… Hygieneartikel," 3.1.3. Die Z 4 lautet:". */
const SUB_INSIDE_RE = /(?<=[“”"])\s+(?=\d+(?:\.\d+)+\.?\s+\p{Lu})/u

/** How many quotations a payload's blocks leave open. */
const quoteDepth = (blocks: readonly TextBlock[]): number => [...withoutResidue(blocks.map((b) => b.text).join(' '))].reduce((n, ch) => n + (OPEN.includes(ch) ? 1 : CLOSE.includes(ch) ? -1 : 0), 0)

/**
 * A line runs on into the next block where it ends neither on a colon nor
 * on a full stop nor on a closing quote, or leaves a quotation open: the
 * list of §§ of one „jeweils" instruction over two blocks, „… durch den
 * Eintrag" / „„§ 2 Menschen mit Behinderungen" ersetzt.".
 */
function runsOf(unit: LawUnit): Run[] {
  const blocks = unit.blocks.flatMap((b) => {
    if (b.kind === 'novao') return [b]
    const parts = b.text.split(SUB_INSIDE_RE)
    return parts.map((text, i) => ({ ...b, gld: i === 0 ? b.gld : null, text }))
  })
  const runs: Run[] = [{ line: null, payload: [] }]
  const open = (line: string) => {
    const quotes = [...withoutResidue(line)].reduce((n, ch) => n + (OPEN.includes(ch) ? 1 : CLOSE.includes(ch) ? -1 : 0), 0)
    return quotes > 0 || !/[:.“”"]\s*$/u.test(withoutResidue(line).trim())
  }
  let continued = 0
  for (const block of blocks) {
    const text = `${block.gld ?? ''} ${block.text}`.replace(FOOTER_RE, ' ').trim()
    const run = runs.at(-1)!
    // A payload's last line that RIS sets in the instruction's class, unnumbered and closing the quotation the payload
    // opened („Zu diesem Zweck dürfen … betreten werden.“", VersSichG § 19): the payload's, not a new instruction.
    const closesPayload = block.kind === 'novao' && run.payload.length > 0 && !/^\s*\d+[a-z]?\.\s/u.test(block.text) && /[“”"]\s*$/u.test(block.text) && quoteDepth(run.payload) > 0
    if (!closesPayload && (block.kind === 'novao' || SUB_INSTRUCTION_RE.test(block.text))) {
      // „4. § 9 lautet „Ablehnung und Einschränkung der Grundversorgung": the payload opens on the instruction's line and runs on below.
      const opens = PAYLOAD_OPENS_RE.exec(withoutResidue(text))
      if (opens) runs.push({ line: text.slice(0, opens.index + opens[1]!.length), payload: [{ ...block, kind: 'ziff', gld: null, text: text.slice(opens.index + opens[1]!.length) }] })
      else runs.push({ line: text, payload: [] })
      continued = 0
    } else if (run.line !== null && !run.payload.length && continued < 2 && open(run.line) && !DESIGNATION_BLOCK_RE.test(text)) {
      run.line = `${run.line} ${text}`
      continued++
    } else run.payload.push(block)
  }
  return runs
}

/**
 * Whether the payload under a line is the old wording (22.11.2026): the
 * line's last verb before its colon removes — „In Anlage 1 werden folgende
 * Aufzählungen gestrichen:", „In § 70 Abs. 1b entfällt der folgende Satz:",
 * „In der Anlage entfällt nachstehender Eintrag:". Such a payload is what
 * the § no longer says, as a quotation the line reads as old. Over the 243
 * cached Bund drafts with an annex, 63 instruction lines end on a colon with
 * a removing verb in them; in these 5 it is the last verb, in the others an
 * adding or restating one follows („… entfällt; die Z 3 lautet:").
 */
function removesPayload(line: string): boolean {
  const own = withoutResidue(line).replace(QUOTE_RE, ' ')
  if (!/:\s*$/.test(own)) return false
  const last = [...own.matchAll(new RegExp(VERB_RE.source, 'gu'))].at(-1)?.[1]
  return last !== undefined && new RegExp(`^(?:${REMOVING})$`).test(last)
}

/** A unit's id: „5", „5a", „1.08", a Litera „c", a Sublitera „cc" — never a word („in"). */
const UNIT_ID = String.raw`(?:\d+(?:\.\d+)*[a-z]*|(?:aa|bb|cc|dd|ee|ff|gg|hh|ii|jj|kk|ll|mm|nn|[a-z])(?![a-z])|[IVXLC]+(?![\p{L}]))`
const UNIT_IDS = String.raw`${UNIT_ID}(?:\s*(?:,|und|bis|sowie)\s*${UNIT_ID})*`
/** An address part a repeal names: „§ 9", „§§ 24 bis 28", „Abs. 2 und 3 sowie 14 bis 16", „Z 4", „lit. c und d", „sublit. cc". */
const UNIT_PART = String.raw`(§§?|Art\.?|Artikel|Anlagen?|Anhang|Anhänge|Absätze|Absatz|Abs\.?|Ziffern|Ziffer|Z|litera|lit\.?|sublit\.?)(?![\p{L}])\s*(${UNIT_IDS})(?![\p{L}\d])`
const UNIT_LEVEL: Record<string, number> = { '§': 0, '§§': 0, art: 0, artikel: 0, anlage: 0, anlagen: 0, anhang: 0, anhänge: 0, abs: 1, absatz: 1, absätze: 1, z: 2, ziffer: 2, ziffern: 2, lit: 3, litera: 3, sublit: 4 }
/** The verbs that open or close a clause of an instruction line. */
const ANY_VERB_RE = new RegExp(`(?<![\\p{L}])(?:${REMOVING}|${ADDING}|ersetzt|lautet|lauten|erhält|erhalten|tritt|treten)(?![\\p{L}])|;`, 'gu')
/** A place, not what is repealed: „In § 4 Abs. 1 entfallen …", „In der Anlage 2 entfallen die Zeilen …", „am Ende der Z 5", „der nunmehrige Abs. 1" (renumbered). „die bisherige Z 6 entfällt" is the subject. */
const PLACE_BEFORE_RE = /(?:^|\s)(?:[Ii]n(?:\s+de[rnm])?|[Ii]m|nach|vor|von|zu|Ende\s+der|nunmehrigen?)\s*$/u

/** The ids of an address part, a range between two figures or two letters spelt out. */
function unitIds(list: string): string[] {
  const out: string[] = []
  const parts = list.split(/\s*(,|und|sowie|bis)\s*/u)
  for (let i = 0; i < parts.length; i += 2) {
    const id = parts[i]!.toLowerCase()
    const prev = out.at(-1)
    if (parts[i - 1] === 'bis' && prev !== undefined) {
      if (/^\d+$/.test(prev) && /^\d+$/.test(id) && Number(id) > Number(prev) && Number(id) - Number(prev) <= MAX_RANGE) for (let n = Number(prev) + 1; n < Number(id); n++) out.push(String(n))
      else if (/^[a-z]$/.test(prev) && /^[a-z]$/.test(id) && id > prev) for (let c = prev.charCodeAt(0) + 1; c < id.charCodeAt(0); c++) out.push(String.fromCharCode(c))
    }
    out.push(id)
  }
  return out
}

/** A word that can open a unit of the text: a figure of up to three digits, a letter, a letter doubled („5", „5a", „c", „cc") — not „1897)" or „Nr." of a citation. */
const DESIGNATION_WORD_RE = /^(?:\d{1,3}[a-z]{0,2}|[a-z]|([a-z])\1)$/

/** A line that names a § by the number a renumbering gives it: „Im nunmehrigen § 18", „§ 18 (neu)". */
export const NEW_NUMBER_RE = /(?:nunmehrigen?|neuen)\s+§|§\s*\d+[a-z]*\s*\(neu\)/u

/** One part of an address: its level (0 the § or the Anlage, 1 the Absatz, 2 the Ziffer, 3 the Litera, 4 the Sublitera) and its ids. */
interface AddressPart { level: number; ids: string[]; fresh?: true }
/** A unit an address names, with the parts above it the address names too (`path`, from the § down): „§ 5 Abs. 2 Z 3" is the Ziffer 3 of Abs. 2 of § 5. */
export interface AddressUnit extends AddressPart { path: AddressPart[] }

/**
 * The units an address names, each at its lowest level: „§ 42 Abs. 3 und 4" two
 * Absätze, „§ 2 Abs. 3 Z 4 sowie Abs. 5" a Ziffer and an Absatz — a part no
 * deeper than the one before opens the next address. Each with the parts
 * above it (22.11.2026): the address's own, else those of `context`, the
 * place the line names before it („In § 5 Abs. 2 entfällt die Z 3"). Without
 * them „the Z 3" was every Ziffer 3 of the §, and „§ 42 Abs. 2, § 42b
 * Abs. 11 … entfallen" gave § 42b the Absätze of § 42.
 */
function addressUnits(text: string, context: readonly AddressPart[] = []): AddressUnit[] {
  const out: AddressUnit[] = []
  let parents = [...context]
  let last = -1
  for (const m of text.matchAll(new RegExp(UNIT_PART, 'gu'))) {
    const word = m[1]!.replace(/\.$/, '').toLowerCase()
    const level = UNIT_LEVEL[word]!
    // An Anlage is keyed as the annex keys its group (`designationKey`): „Anl 7"; an Artikel „Art 11" (a Verfassungsgesetz is keyed by them).
    const ids = unitIds(m[2]!).map((id) => (word.startsWith('anl') || word.startsWith('anh') ? `anl ${id}` : word.startsWith('art') ? `art ${id}` : id))
    // „Abs. 7 (neu)": a number of the new count, which the left column does not print.
    const fresh = /^\s*\(neu\)/u.test(text.slice(m.index! + m[0].length))
    if (level > last && out.length) {
      const parent = out.pop()!
      parents = [...parent.path, { level: parent.level, ids: parent.ids, ...(parent.fresh ? { fresh: true as const } : {}) }]
    }
    parents = parents.filter((p) => p.level < level)
    out.push({ level, ids, path: parents, ...(fresh ? { fresh: true as const } : {}) })
    last = level
  }
  return out
}

/** The parts of the address a line names last before `end`, the deepest with what it stands in: the place of what follows („In § 5 Abs. 2 entfällt die Z 3"). */
function contextAt(line: string, end: number): AddressPart[] {
  // Walked once per line: a line of a thousand addresses asks at each.
  if (walked?.line !== line) {
    const at: { end: number; context: AddressPart[] }[] = []
    for (const m of line.matchAll(new RegExp(UNIT_PART, 'gu'))) {
      const unit = addressUnits(m[0], at.at(-1)?.context ?? [])[0]!
      // A part no deeper than the one before opens the next address, as in `addressUnits`.
      const previous = at.at(-1)?.context ?? []
      const deeper = unit.level > (previous.at(-1)?.level ?? -1)
      const parents = deeper ? previous : previous.filter((p) => p.level < unit.level)
      const fresh = /^\s*\(neu\)/u.test(line.slice(m.index + m[0].length))
      at.push({ end: m.index + m[0].length, context: [...parents, { level: unit.level, ids: unit.ids, ...(fresh ? { fresh: true as const } : {}) }] })
    }
    walked = { line, at }
  }
  return walked.at.filter((x) => x.end <= end).at(-1)?.context ?? []
}
let walked: { line: string; at: { end: number; context: AddressPart[] }[] } | null = null

/** What a removing verb's clause opens with where its object is no unit: an article and a word that is no address part („entfällt die Wortfolge", „der letzte Satz"), not „die bisherige Z 6". */
const OWN_OBJECT_RE = /^\s*(?:jeweils\s+)?(?:(?:nach|vor|in|im)\s+(?:dem\s+|der\s+)?(?:Abs\.?|Z|lit\.?)\s*\d+[a-z]*\s+)?(?:die|der|das|den)\s+(?!(?:§|Art|Artikel|Anlagen?|Anh(?:ang|änge)|Absätze|Absatz|Abs|Ziffern|Ziffer|Z|litera|lit|sublit|bisherigen?|nunmehrigen?)(?![\p{L}]))\p{L}/u

/** An address part said of the verb as its object: after an article, or first after the verb — not a place („in Abs. 1", „am Ende der Z 5"). */
const OBJECT_BEFORE_RE = /(?:^\s*(?:jeweils\s+)?|(?<!(?:Ende|nach|vor|[Ii]n|[Ii]m|zu|von|aus)\s+)(?:die|der|das|den)\s+|(?:und|sowie|,)\s+)$/u
const ADDRESS_RE = new RegExp(String.raw`(?:${UNIT_PART}\s*(?:(?:,|und|sowie)\s*(?=(?:§§?|Art\.?|Artikel|Anlagen?|Anhang|Anhänge|Absätze|Absatz|Abs\.?|Ziffern|Ziffer|Z|litera|lit\.?|sublit\.?)(?![\p{L}])))?)+`, 'gu')

/** The units a verb at `v` in `line` is said of: the addresses after it in its clause that are its objects, else the one right before it that is its subject. */
function unitsOf(line: string, verbs: readonly RegExpMatchArray[], i: number): AddressUnit[] {
  const v = verbs[i]!
  const afterAt = v.index! + v[0].length
  const after = line.slice(afterAt, verbs[i + 1]?.index ?? line.length)
  const beforeAt = i > 0 ? verbs[i - 1]!.index! + verbs[i - 1]![0].length : 0
  const before = line.slice(beforeAt, v.index)
  // „entfallen die Abs. 2 und 3 sowie 14 bis 16", „entfallen der Klammerausdruck „X“ in Abs. 1 und der Abs. 4" — not „entfällt der letzte Satz", „entfällt im Abs. 2 der …".
  // Only where the verb opens its clause: in „§ 359 Abs. 2 entfällt und die Abs. 3 und 4 erhalten …" what follows is the next clause's subject.
  // „entfällt nach Abs. 2 der Abs. 3", „entfallen in Z 1 die Wortfolge „X“ … sowie die Z 5": a place, then the objects.
  const opensClause = /^\s*(?:jeweils\s+)?(?:(?:nach|vor|in|im)\s+(?:dem\s+|der\s+)?(?:Abs\.?|Z|lit\.?)\s*\d+[a-z]*\s+)?(?:(?:die|der|das|den)\s|§|Abs|Absätze|Z\s|Ziffer|lit)/u.test(after)
  const objects = opensClause ? [...after.matchAll(ADDRESS_RE)].filter((m) => OBJECT_BEFORE_RE.test(after.slice(0, m.index))).flatMap((m) => addressUnits(m[0], contextAt(line, afterAt + m.index!))) : []
  if (objects.length) return objects
  // A removing verb with an object of its own — a wording („§ 42 Abs. 4 entfällt die Wendung „…“", „In Art. 11 Abs. 6 entfällt die
  // Wortfolge „…“"), a stretch it counts or describes („entfällt der letzte Satz", „der Klammerausdruck") — repeals no unit: the address before it is its place.
  if (new RegExp(`^(?:${REMOVING})$`).test(v[0]) && OWN_OBJECT_RE.test(after)) return []
  // „In § 19 Z 3 lautet neu:": what „lautet" is said of, where it has no object, is the address before it, „In" or not.
  if (/^laute[tn]$/u.test(v[0])) return after.search(ADDRESS_RE) >= 0 ? [] : [...before.matchAll(ADDRESS_RE)].slice(-1).filter((m) => !/(?:^|\s)(?:nach|vor|zu|von)\s*$/u.test(before.slice(0, m.index))).flatMap((m) => addressUnits(m[0], contextAt(line, beforeAt + m.index!)))
  // „§ 5 Abs. 3 entfällt", „und die Z 6 entfällt", „§ 21 wird ersatzlos gestrichen", „§ 56 samt Überschrift entfällt".
  return subjectUnits(before, (at) => contextAt(line, beforeAt + at))
}

/** What may stand between a subject's address and its verb, or between two addresses of one subject: „samt Überschrift", „wird", „sowie die", and an Anhang the list names besides, which is no unit of the § („… sowie Anhang XIII entfallen"). */
const SUBJECT_FILLER_RE = /samt\s+(?:der\s+|den\s+)?Überschrift(?:en)?|(?:,|und|sowie)\s*(?:die\s+|der\s+)?(?:Anlagen?|Anh(?:ang|änge))\s+[\dIVXLC]+[a-z]?|(?<![\p{L}])(?:wird|werden|ersatzlos|und|sowie|die|der)(?![\p{L}])|[,;]/gu

/** An address of another law: its parts and the law's name after „des" or „der" („§ 5 des Zustellgesetzes"), not „Z 3 der Anlage". */
const FOREIGN_PART_RE = new RegExp(String.raw`(?:${UNIT_PART}\s*)+(?:des|der)\s+(?!Anlage|Anhang)\p{Lu}[\p{L}\d-]*`, 'gu')

/**
 * The address right before a verb that is its subject — „§ 5 Abs. 3 entfällt",
 * „und die Z 6 entfällt", „§ 581 samt Überschrift und § 582 entfallen" — walked
 * part by part from the verb back (a pattern anchored at the end backtracks
 * without bound on a long line); none where the line names it as a place.
 */
function subjectUnits(before: string, context: (at: number) => AddressPart[] = () => []): AddressUnit[] {
  // Another law's § in the list is no unit of this one: „§ 5 Abs. 3 und § 5 des Zustellgesetzes entfallen".
  before = before.replace(FOREIGN_PART_RE, (m) => ' '.repeat(m.length))
  const parts = [...before.matchAll(new RegExp(UNIT_PART, 'gu'))]
  const filler = (text: string) => text.replace(SUBJECT_FILLER_RE, ' ').trim() === ''
  const last = parts.length - 1
  if (last < 0 || !filler(before.slice(parts[last]!.index! + parts[last]![0].length))) return []
  let first = last
  while (first > 0 && filler(before.slice(parts[first - 1]!.index! + parts[first - 1]![0].length, parts[first]!.index))) first--
  if (PLACE_BEFORE_RE.test(before.slice(0, parts[first]!.index))) return []
  return addressUnits(before.slice(parts[first]!.index, parts[last]!.index! + parts[last]![0].length), context(parts[first]!.index!))
}

/**
 * The units an instruction line repeals by designation, without quoting
 * them (`Struck.repealed`): „§ 232 Abs. 6 Z 3 entfällt", „In § 18 entfallen
 * die Abs. 1, 5 und 6", „§§ 24 bis 28 entfallen samt Überschriften", „und
 * die Z 6 entfällt". What the removing verb is said of: the address right
 * after it in its clause, or, where none follows, the one right before it
 * — never one the line names as a place („In § 4 Abs. 1", „am Ende der
 * Z 5"). Of an address, its lowest level: „§ 42 Abs. 3 und 4" repeals two
 * Absätze, not the §.
 */
function repealedOf(raw: string): AddressUnit[] {
  const line = withoutResidue(raw).replace(QUOTE_RE, ' „“ ')
  const verbs = [...line.matchAll(ANY_VERB_RE)]
  return verbs.flatMap((v, i) => (new RegExp(`^(?:${REMOVING})$`).test(v[0]) ? unitsOf(line, verbs, i) : [])).filter((u) => u.ids.length)
}

/**
 * The units a line replaces by address, writing them anew (`Struck.replaced`):
 * „§ 14 Abs. 5 und 6 lautet:", „In § 29 Abs. 1 lautet die Z 20 (neu):", „§ 39
 * lautet:", „In § 24 Abs. 2 werden Z 1 bis 3 durch folgende Z 1 und 2
 * ersetzt:". Not where the line replaces a wording it quotes or a stretch it
 * counts („In § 5 Abs. 2 wird „X“ durch „Y“ ersetzt", „lautet der zweite
 * Satz:"), which is named or struck by position.
 */
function replacedOf(raw: string): AddressUnit[] {
  if (quoteRoles(raw).some((q) => q.role === 'old') || byPositionOf(raw)) return []
  const line = withoutResidue(raw).replace(QUOTE_RE, ' „“ ')
  const verbs = [...line.matchAll(ANY_VERB_RE)]
  return verbs.flatMap((v, i) => {
    if (v[0] === 'lautet' || v[0] === 'lauten') return unitsOf(line, verbs, i)
    // „… werden Z 1 bis 3 durch folgende Z 1 und 2 ersetzt": what stands before „durch".
    const from = i > 0 ? verbs[i - 1]!.index! + verbs[i - 1]![0].length : 0
    const durch = v[0] === 'ersetzt' ? /^(.*?)(?<![\p{L}])durch\s+(?:die\s+)?folgende/u.exec(line.slice(from, v.index)) : null
    return durch ? [...durch[1]!.matchAll(ADDRESS_RE)].filter((m) => !PLACE_BEFORE_RE.test(durch[1]!.slice(0, m.index))).flatMap((m) => addressUnits(m[0], contextAt(line, from + m.index!))) : []
  }).filter((u) => u.ids.length)
}

const ORDINAL = '(?:erste|zweite|dritte|vierte|fünfte|sechste|siebente|siebte|achte|neunte|zehnte|letzte|vorletzte|drittletzte|nachfolgende|(?:darauf\\s+)?folgende|beiden\\s+ersten|beiden\\s+letzten|(?:ersten|letzten)\\s+beiden)[nrsm]?'
const POSITION_UNIT = '(?:Satz|Sätze|Halbsatz|Teilsatz|Satzteil|Absatz|Unterabsatz|Spiegelstrich|Teilstrich|Strich|Zeile|Zeilen|Spalte|Aufzählungspunkt|Klammerausdruck|Eintrag)'
/** „der vorletzte und der letzte Satz", „der zweite, der dritte und der vierte Satz", „letzter Satz": ordinals and the unit they count. */
const BY_ORDINAL_RE = new RegExp(`(?<![\\p{L}])((?:[Dd]e[rnms]|[Dd]ie|[Dd]as)\\s+)?(${ORDINAL}(?:\\s*(?:,|und|sowie)\\s*(?:(?:de[rnms]|die|das)\\s+)?${ORDINAL})*)\\s+${POSITION_UNIT}(?![\\p{L}])`, 'gu')
/** „die Sätze sechs und sieben", „die Sätze drei bis fünf": sentences counted in words after the noun. */
const CARDINALS = ['zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn']
const BY_CARDINAL_RE = new RegExp(`(?<![\\p{L}])(?:die\\s+)?(?:Sätze|Halbsätze)\\s+(${CARDINALS.join('|')})(?:\\s+(und|bis)\\s+(${CARDINALS.join('|')}))?(?![\\p{L}])`, 'gu')
/** „der Schlussteil", „der Klammerausdruck", „die Zeilen betreffend …" — a unit described, not quoted. */
const BY_DESCRIPTION_RE = /(?<![\p{L}])((?:[Dd]e[rnms]|[Dd]ie|[Dd]as)\s+(?:gesamte\s+)?|(?<=\d[a-z]?\.?\s))(?:Klammerausdruck|Klammerzitat|Schlussteil|Schlusssatz|Einleitung|Einleitungsteil|Einleitungssatz|Satzteil|Halbsatz|Teilsatz|Zeilen?|Eintrag|Einträge|Eintragung|Überschrift|Abschnittsüberschrift|Paragraphenbezeichnung|Anmerkung)(?![\p{L}])(?!\s*[„»])/gu

/**
 * How many stretches an instruction line strikes or replaces by a position
 * it only counts or describes (`Struck.byPosition`): „der letzte Satz
 * entfällt" one, „entfallen der vorletzte und der letzte Satz" two,
 * „lautet der zweite Satz:" one, „entfällt der Schlussteil" one, „§ 70 Abs. 3
 * zweiter Satz entfällt." one. The position must be what the verb strikes or
 * replaces: its object, with its article, or bare right before a verb that
 * strikes nothing else — not a place the line names („im ersten Satz wird …
 * eingefügt", „In § 32 Abs. 1 erster Satz wird die Wortfolge „X“ …
 * ersetzt", „In § 39 Abs. 1 dritter Satz entfällt die Wortfolge „X“", „nach
 * dem Klammerausdruck „X“"), nor a sentence it adds („wird folgender Satz
 * angefügt").
 */
function byPositionOf(raw: string): number {
  const line = withoutResidue(raw).replace(QUOTE_RE, ' „“ ')
  if (!new RegExp(`(?<![\\p{L}])(?:${REMOVING}|ersetzt|lautet|lauten|Stelle)(?![\\p{L}])`, 'u').test(line)) return 0
  let count = 0
  const place = (at: number) => /(?:^|\s)(?:[Ii]m|[Ii]n|nach|vor|von|zu|dem)\s*$/u.test(line.slice(0, at))
  // Bare, the position is struck only by a verb right after it with nothing else to strike: „zweiter Satz entfällt."
  // …and „§ 51 zweiter Satz wird durch folgende Sätze ersetzt" (RAO), the position the subject „durch" replaces.
  const struckBare = (end: number) => new RegExp(`^\\s*(?:${REMOVING}|wird\\s+aufgehoben|werden\\s+aufgehoben|lautet|lauten)(?![\\p{L}])\\s*(?:[.;:,]|und\\s|$)|^\\s*(?:wird|werden)\\s+durch(?![\\p{L}])`, 'u').test(line.slice(end))
  for (const m of line.matchAll(BY_ORDINAL_RE)) {
    if (place(m.index) || (!m[1] && !struckBare(m.index + m[0].length))) continue
    // „die beiden ersten", „die letzten beiden": two.
    count += [...m[2]!.matchAll(new RegExp(ORDINAL, 'gu'))].length + (m[2]!.match(/beiden/gu)?.length ?? 0)
  }
  for (const m of line.matchAll(BY_CARDINAL_RE)) count += !m[2] ? 1 : m[2] === 'und' ? 2 : CARDINALS.indexOf(m[3]!) - CARDINALS.indexOf(m[1]!) + 1
  // „der Überschrift des § 38" in the list of places of a line that quotes what it replaces (E-ControlG, 22.11.2026: „In § 4, …
  // der Überschrift des § 38, … wird der Ausdruck „E-Control“ jeweils durch … ersetzt" counted twelve positions in each §): a place.
  const quotesOld = quoteRoles(raw).some((q) => q.role === 'old')
  const ofAddress = (end: number) => quotesOld && /^\s*(?:des|der|zu|zum|zur)\s+(?:§|Art|Anl|\d|[IVXL]+\.|(?:\d+\.\s*)?(?:Abschnitt|Unterabschnitt|Hauptstück|Teil))/u.test(line.slice(end))
  for (const m of line.matchAll(BY_DESCRIPTION_RE)) if (!place(m.index) && !ofAddress(m.index + m[0].length) && (m[1] || struckBare(m.index + m[0].length))) count++
  return count
}

/** What every § of a draft is written as, per law key. */
export function draftWording(blocks: readonly TextBlock[], installed: (unit: DraftUnit) => string[] = () => []): Map<string | null, LawWording> {
  const out = new Map<string | null, LawWording>()
  const law = segmentUnits(blocks)
  const addressed = draftUnits(blocks)
  const lawOf = (lawKey: string | null): LawWording => {
    const w = out.get(lawKey) ?? { byKey: new Map<string, DraftWording>(), general: [], generalText: [] }
    out.set(lawKey, w)
    return w
  }
  const at = (lawKey: string | null, key: string): DraftWording => {
    const byKey = lawOf(lawKey).byKey
    const w = byKey.get(key) ?? { wordings: [], text: [], written: [], unread: null }
    byKey.set(key, w)
    return w
  }
  law.forEach((unit: LawUnit, ui) => {
    const draft = addressed[ui]!
    const keys = [...new Set([...draft.paras, ...installed(draft)].map((p) => designationKey(p)).filter((k): k is string => k !== null))]
    const runs = runsOf(unit)
    // The unit as it stands, without what it quotes as old or as a place.
    const standing: string[] = []
    const written: string[] = []
    for (const run of runs) {
      if (run.line !== null) {
        const roles = quoteRoles(run.line)
        let k = 0
        const kept = withoutResidue(run.line).replace(QUOTE_RE, (m) => (roles[k++]?.role === 'new' ? m : ' '))
        standing.push(...strictTokens(kept))
        // A designation the line gives is held where it is printed as one (`Wording.designation`), not as a word of the text.
        let d = 0
        const own = withoutResidue(run.line).replace(QUOTE_RE, (m) => {
          const role = roles[d++]
          return role?.role === 'new' && !role.designation ? m : ' '
        })
        written.push(...[...own.matchAll(WRITTEN_RE)].flatMap((m) => strictTokens(m[1]!)))
      }
      for (const block of run.line !== null && removesPayload(run.line) ? [] : run.payload) {
        const tokens = strictTokens(`${block.gld ?? ''} ${block.text}`.replace(FOOTER_RE, ' '))
        standing.push(...tokens)
        written.push(...tokens)
      }
    }
    // What each run's line strikes (`Struck`): the wording it quotes as old, and the payload under a line whose last verb removes.
    const struckOf = (run: Run): Struck => {
      const line = run.line ?? ''
      const quoted: Struck['named'] = quoteRoles(line).filter((q) => q.role === 'old').map((q) => ({ tokens: strictTokens(q.text), line, ...(q.designation ? { designation: true as const } : {}) }))
      if (run.line !== null && removesPayload(run.line)) quoted.push(...run.payload.map((b) => ({ tokens: strictTokens(`${b.gld ?? ''} ${b.text}`.replace(FOOTER_RE, ' ')), line })))
      const count = byPositionOf(line)
      // Where it strikes by position: the units the line names („In § 5 Abs. 2 entfällt der letzte Satz"), none for the § itself.
      const bare = withoutResidue(line).replace(QUOTE_RE, ' „“ ')
      const named = [...bare.matchAll(ADDRESS_RE)].flatMap((m) => {
        const units = addressUnits(m[0], contextAt(bare, m.index))
        // „In § 52 Abs. 3 (neu)": the place's number is of the new count.
        return /^\s*\(neu\)/u.test(bare.slice(m.index + m[0].length)) ? units.map((u, i) => (i === units.length - 1 ? { ...u, fresh: true as const } : u)) : units
      })
      const places = named.filter((u) => u.level > 0)
      // „In § 35 Abs. 1c und 1d entfällt jeweils der letzte Satz": once in each unit it names.
      const each = /(?<![\p{L}])jeweils(?![\p{L}])/u.test(line) ? Math.max(1, places.reduce((n, u) => n + u.ids.length, 0)) : 1
      // …and one that writes the position anew, with no removing verb beside: „lautet der zweite Satz:", „wird der letzte Satz durch folgenden Satz ersetzt".
      const own = withoutResidue(line).replace(QUOTE_RE, ' ')
      const replaces = ((run.payload.length > 0 && !removesPayload(line)) || quoteRoles(line).some((q) => q.role === 'new')) && /(?<![\p{L}])(?:lautet|lauten|ersetzt)(?![\p{L}])/u.test(own) && !new RegExp(`(?<![\\p{L}])(?:${REMOVING})(?![\\p{L}])`, 'u').test(own)
      const heading = /(?<![\p{L}])(?:Abschnitts)?[Üü]berschrift(?![\p{L}])/u.test(own) && !/(?<![\p{L}])(?:Satz|Sätze)(?![\p{L}])/u.test(own)
      return { named: quoted.filter((n) => n.tokens.length).map((n) => ({ ...n, places: named })), repealed: repealedOf(line).map((r) => ({ ...r, line })), byPosition: count ? [{ count: count * each, places, line, ...(replaces ? { replaces: true as const } : {}), ...(heading ? { heading: true as const } : {}) }] : [], replaced: replacedOf(line).map((r) => ({ ...r, line })), renumbers: /bezeichn?(?:ung|et)|nummerierung/iu.test(line) }
    }
    if (!keys.length) {
      const into = lawOf(draft.law)
      into.generalText.push(standing)
      for (const run of runs) {
        if (run.line !== null) (into.generalStruck ??= []).push(...struckOf(run).named)
        const roles = run.line === null ? [] : quoteRoles(run.line)
        for (const quote of roles) {
          const tokens = quote.role === 'new' ? strictTokens(quote.text) : []
          if (tokens.length) into.general.push({ tokens, optional: tokens.map(() => false), repeats: true, ...(quote.designation ? { designation: true } : {}) })
        }
        into.general.push(...rangeDesignations(roles).map(designationWording))
      }
      return
    }
    for (const key of keys) {
      at(draft.law, key).text.push(standing)
      at(draft.law, key).written.push(written)
    }
    for (const run of runs) {
      const roles = run.line === null ? [] : quoteRoles(run.line)
      if (run.line !== null) {
        const struck = struckOf(run)
        for (const key of keys) {
          const into = (at(draft.law, key).struck ??= { named: [], repealed: [], byPosition: [] })
          into.named.push(...struck.named)
          into.repealed.push(...struck.repealed)
          into.byPosition.push(...struck.byPosition)
          ;(into.replaced ??= []).push(...(struck.replaced ?? []))
          if (struck.renumbers) into.renumbers = true
        }
      }
      for (const t of rangeDesignations(roles)) for (const key of keys) at(draft.law, key).wordings.push(designationWording(t))
      for (const quote of roles) {
        if (quote.role === null) {
          for (const key of keys) at(draft.law, key).unread ??= `${STRICT_UNCHECKED.quoteRole}${run.line!.slice(0, 120)}`
          continue
        }
        if (quote.role !== 'new') continue
        const tokens = strictTokens(quote.text)
        if (!tokens.length) continue
        for (const key of keys) at(draft.law, key).wordings.push({ tokens, optional: tokens.map(() => false), repeats: true, once: keys.length === 1, ...(quote.designation ? { designation: true } : {}) })
      }
      if (!run.payload.length || removesPayload(run.line ?? '')) continue
      const pieces = payloadPieces(run.payload)
      const keyed = pieces.some((p) => p.key !== null)
      for (const piece of pieces) {
        if (piece.key !== null) {
          const into = at(draft.law, piece.key)
          into.wordings.push({ tokens: piece.tokens, optional: piece.optional, repeats: false })
          if (!keys.includes(piece.key)) {
            into.text.push(standing)
            into.written.push(written)
          }
        } else if (keyed) {
          // Text before the first § of a payload that prints §§: a division heading, or what the reader did not cut. Whose it is, is not read.
          for (const key of keys) at(draft.law, key).unread ??= STRICT_UNCHECKED.beforeFirst
        } else if (keys.length === 1) {
          at(draft.law, keys[0]!).wordings.push({ tokens: piece.tokens, optional: piece.optional, repeats: false })
        } else {
          for (const key of keys) at(draft.law, key).unread ??= STRICT_UNCHECKED.severalUnnamed
        }
      }
    }
  })
  return out
}

// ---------------------------------------------------------------------------
// The alignment
// ---------------------------------------------------------------------------

/** A new stretch found elsewhere in the draft's text of the law says whose it is only from this length on: a word or a number stands everywhere. */
export const MIN_FOREIGN_RUN = 4
/** Above this many cells the alignment is not run, and the § not held strictly. */
export const MAX_ALIGN_CELLS = 30_000_000
/**
 * Which tokens of the right column (`shown`) and of the draft's wording
 * (`draft`) are a placeholder for a figure the document does not know yet —
 * a Bundesgesetzblatt's number or year („BGBl. I Nr. xxx/202x"). Such a token
 * is aligned with any figure or placeholder at its place; every other token
 * only with itself. Given by the caller (`annex/annexStrict.ts`); the Länder
 * pass none.
 */
export interface Placeholders { shown: readonly boolean[]; draft: readonly boolean[] }

/** A word the page shows as new outweighs any number of others: the alignment first accounts for those. */
const NEW_WEIGHT = 4096

/**
 * The heaviest common subsequence of `shown` and `draft`: which words of
 * each side the other accounts for, in order. A word of `shown` marked new
 * weighs `NEW_WEIGHT`, so among all in-order alignments the one that
 * accounts for most new words wins, and among those the longest.
 */
export function align(shown: readonly Marked[], draft: readonly string[], wild?: Placeholders): { shown: boolean[]; draft: boolean[]; at: number[] } {
  const n = shown.length
  const m = draft.length
  const inShown = new Array<boolean>(n).fill(false)
  const inDraft = new Array<boolean>(m).fill(false)
  /** Draft word → the word of `shown` it is aligned with, or -1. */
  const at = new Array<number>(m).fill(-1)
  if (!n || !m) return { shown: inShown, draft: inDraft, at }
  // A placeholder on one side stands for a figure or a placeholder on the other (`Placeholders`).
  const figureS = wild ? shown.map((t, i) => wild.shown[i]! || /^\d+$/.test(t.word)) : null
  const figureD = wild ? draft.map((w, j) => wild.draft[j]! || /^\d+$/.test(w)) : null
  const same = (i: number, j: number): boolean => shown[i]!.word === draft[j] || (wild !== undefined && ((wild.shown[i]! && figureD![j]!) || (wild.draft[j]! && figureS![i]!)))
  // 0 = skip shown[i], 1 = skip draft[j], 2 = match
  const step = new Uint8Array(n * m)
  let below = new Int32Array(m + 1)
  let row = new Int32Array(m + 1)
  for (let i = n - 1; i >= 0; i--) {
    const word = shown[i]!.word
    const weight = shown[i]!.marked ? NEW_WEIGHT : 1
    for (let j = m - 1; j >= 0; j--) {
      let best = below[j]!
      let how = 0
      if (row[j + 1]! > best) {
        best = row[j + 1]!
        how = 1
      }
      if ((word === draft[j] || (wild !== undefined && same(i, j))) && below[j + 1]! + weight >= best) {
        best = below[j + 1]! + weight
        how = 2
      }
      row[j] = best
      step[i * m + j] = how
    }
    const t = below
    below = row
    row = t
    row[m] = 0
  }
  let i = 0
  let j = 0
  while (i < n && j < m) {
    const how = step[i * m + j]
    if (how === 2) {
      inShown[i] = true
      inDraft[j] = true
      at[j] = i
      i++
      j++
    } else if (how === 1) j++
    else i++
  }
  return { shown: inShown, draft: inDraft, at }
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

export interface StrictCheck {
  /**
   * `holds`: every new word is the draft's, every word of the draft's
   * wording stands in the right column, in order. `differs`: at least one
   * does not. `unchecked`: the § could not be held this way (`reason`).
   */
  state: 'holds' | 'differs' | 'unchecked'
  reason: string | null
  /** Words shown as new that the draft's wording for the § does not carry at their place. */
  notInDraft: string[]
  /** Words of the draft's wording for the § that the right column does not carry at their place. */
  notShown: string[]
  /** Words shown as new, and words of the draft's wording, as counted here. */
  newWords: number
  draftWords: number
  /** Words the column shows as struck that no instruction for the § strikes (`struckAccount`); a § differs by them only where the caller asks (`struck`). */
  struckNotInDraft?: string[]
  /** The words the column shows as struck, by what accounts for them (`struckAccount`). */
  struck?: StruckBy
}

/** Struck words by what accounts for them (`struckAccount`); `notation` is no text: a designation, the layout's notation, a word the new text keeps. */
export interface StruckBy { named: number; rewritten: number; repealed: number; byPosition: number; notation: number }

const unchecked = (reason: string): StrictCheck => ({ state: 'unchecked', reason, notInDraft: [], notShown: [], newWords: 0, draftWords: 0 })

/**
 * Why a § was not held this way (`StrictCheck.reason`), in the harness's
 * words — the page says each in its own (`draftUncheckedReason` in
 * `landTguGuard.ts`). `quoteRole` is followed by the instruction's line.
 */
export const STRICT_UNCHECKED = {
  undiffed: 'die Wortdifferenz dieses Paragraphen wurde nicht berechnet',
  nothingNew: 'kein neuer Text',
  unnamed: 'keine Anordnung des Entwurfs nennt den Paragraphen',
  lawUnnamed: 'das Gesetz ist im Entwurf nicht sicher benannt',
  twoUnderOne: 'zwei Anordnungen unter einer Ziffer',
  quoteRole: 'Anführung ohne lesbare Rolle: ',
  beforeFirst: 'Text vor dem ersten Paragraphen eines Wortlauts, der mehrere druckt',
  severalUnnamed: 'ein Wortlaut für mehrere Paragraphen ohne deren Bezeichnung',
  tooLong: 'zu lang für den wortweisen Abgleich',
  elsewhere: 'neuer Text, den der Entwurf an anderer Stelle des Gesetzes schreibt',
} as const

/**
 * The right column as the page shows it, each word with whether it is marked
 * new — the § heading first, which the page prints above the text and a
 * payload „samt Überschrift" carries.
 *
 * A word the diff marks only for its punctuation is not new: „Einzelfall;"
 * against „Einzelfall." is the instruction „der Strichpunkt wird durch einen
 * Punkt ersetzt", and no word of the draft. So the words a new stretch
 * shares, in order, with the removed one beside it lose the mark.
 *
 * `flip`: places of the word diff (`diffWords`) read the other way — a kept
 * word as new, a new one as kept (`keptElsewhere`).
 */
export function shownTokens(unit: LawDiffUnit, flip: ReadonlySet<number> = new Set()): Marked[] | null {
  const heading = markedTokens(unit.heading ?? '')
  if (unit.change === 'inserted') return [...heading, ...markedTokens(`\uE000${unit.toText ?? ''}\uE001`)]
  if (unit.change !== 'changed' || !unit.segments) return null
  const out = [...heading]
  const segments = unit.segments
  let at = 0
  segments.forEach((s, i) => {
    if (s.type === 'removed') {
      at += markedTokens(s.text).length
      return
    }
    if (s.type !== 'inserted') {
      out.push(...markedTokens(s.text).map((t) => ({ ...t, at, marked: flip.has(at++) })))
      return
    }
    const tokens = markedTokens(`\uE000${s.text}\uE001`).map((t) => ({ ...t, at: at++ }))
    const beside = [segments[i - 1], segments[i + 1]].find((x) => x?.type === 'removed')
    // The words the new stretch keeps of the removed one, in order: „geschlechtsbezogene Verhaltensweisen," against „Verhaltensweisen in Bezug auf …,".
    if (beside) align(tokens.map((t) => ({ word: t.word, marked: false })), strictTokens(beside.text)).shown.forEach((kept, k) => {
      if (kept) tokens[k]!.marked = false
    })
    for (const t of tokens) if (flip.has(t.at)) t.marked = false
    out.push(...tokens)
  })
  return out
}

/** A word of a changed §'s word diff, removed ones included, with the row it stands in: a Bund § group joins its rows' diffs with a space of their own (`annexStrict.ts`). */
interface DiffWord { word: string; kind: LawDiffSegment['type']; row: number }

/** The words of a changed §'s word diff in order, as `shownTokens` counts them (`Marked.at`). */
function diffWords(segments: readonly LawDiffSegment[]): DiffWord[] {
  let row = 0
  return segments.flatMap((s) => {
    if (!s.text.trim()) row++
    return markedTokens(s.text).map((t) => ({ word: t.word, kind: s.type, row }))
  })
}

/**
 * Whether each run of kept words a pairing crosses is a trivial equality, as
 * a word diff's semantic cleanup has it: a whole kept stretch between two
 * edits, no longer than the larger side (removed or new) of the edit on
 * either hand. A longer one is the text's own, and the twin is at another
 * place (`keptElsewhere`).
 */
function trivial(diff: readonly DiffWord[], crossed: readonly number[]): boolean {
  const edits = (from: number, step: number): number => {
    let ins = 0
    let del = 0
    for (let k = from; k >= 0 && k < diff.length && diff[k]!.kind !== 'equal' && diff[k]!.row === diff[from - step]!.row; k += step) {
      if (diff[k]!.kind === 'inserted') ins++
      else del++
    }
    return Math.max(ins, del)
  }
  for (let i = 0; i < crossed.length;) {
    let j = i
    while (j + 1 < crossed.length && crossed[j + 1] === crossed[j]! + 1) j++
    const [a, b] = [crossed[i]!, crossed[j]!]
    if (diff[a - 1]?.kind === 'equal' || diff[b + 1]?.kind === 'equal') return false
    if (b - a + 1 > Math.min(edits(a - 1, -1), edits(b + 1, 1))) return false
    i = j + 1
  }
  return true
}

/**
 * KEPT WORDS THE WORD DIFF SHOWS AS NEW (22.11.2026). A row's word diff
 * keeps the longest common sequence of words, and where a few short words
 * stand on both sides it keeps those and shows a word of the left column as
 * new at another place: „Filterbetthöhe [in] der [Phase] der [Wasserspülung]
 * dauerhaft [erforderlich.]" against „Filterbetthöhe erforderlich. Zur … der
 * … der … dauerhaft …" (Bäderhygieneverordnung, § 36). The same two columns
 * read as well with „erforderlich." kept and „in der Phase der Wasserspülung
 * dauerhaft" new — which is what the draft writes.
 *
 * For each stretch of new words the check could not account for (`runs`,
 * places in `diff`): the same words in the left column of the same row, in
 * order, removed or kept. Read so, the stretch is kept, and every kept word
 * the pairing crosses, and the new place of a kept twin, is new instead — to
 * be found in the draft's wording like any other. Of several twins the one
 * that crosses fewest. Null where a stretch has no twin, or two pairings
 * cross, or a crossed run is no trivial equality (`trivial`): without that
 * guard 12 §§ more moved on GP XXVIII, twins across longer kept text (BWG
 * § 20b: an „oder" of a new Abs. 5 paired with one of Abs. 1). It never
 * accounts for a word the left column lacks, and the § holds only where
 * every word new in that reading is the draft's (`strictCheck`).
 *
 * Measured on GP XXVIII (22.11.2026): 29 §§ of the Bund's annexes (both
 * paths) go from „differs" to „holds", every one read and the reading the
 * draft's; one § of the Länder (Oö. 2026-16124, § 29). Of the §§ the
 * oracle confirms and this check objected to, 96 → 81.
 */
function keptElsewhere(diff: readonly DiffWord[], runs: readonly number[][]): Set<number> | null {
  const old = diff.flatMap((d, q) => (d.kind === 'inserted' ? [] : [q]))
  const kept = diff.flatMap((d, r) => (d.kind === 'equal' ? [r] : []))
  const pairs: { o: number[]; n: number[] }[] = []
  const flip = new Set<number>()
  for (const n of runs) {
    const row = diff[n[0]!]!.row
    let best: { o: number[]; turned: number[]; distance: number } | null = null
    for (let s = 0; s + n.length <= old.length; s++) {
      const o = old.slice(s, s + n.length)
      if (o.some((q, x) => diff[q]!.row !== row || diff[q]!.word !== diff[n[x]!]!.word)) continue
      // A kept word not of the twin stands before both or after both; else the pairings cross, and it is new.
      const turned = kept.filter((r) => o.includes(r) || (r < o[0]!) !== (r < n[0]!))
      if (!trivial(diff, turned.filter((r) => !o.includes(r)))) continue
      const distance = Math.abs(o[0]! - n[0]!)
      if (!best || turned.length < best.turned.length || (turned.length === best.turned.length && distance < best.distance)) best = { o, turned, distance }
    }
    if (!best) return null
    if (pairs.some((p) => p.o.some((q) => best.o.includes(q)) || (p.o[0]! < best.o[0]!) !== (p.n[0]! < n[0]!))) return null
    pairs.push({ o: best.o, n })
    // A twin the word diff struck is kept in this reading too: its place goes into `flip`, which `shownTokens` does not read for a removed word and `struckAccount` does.
    for (const p of [...n, ...best.turned, ...best.o]) flip.add(p)
  }
  return flip
}

/**
 * One spacing for both sides: a word one document prints in two pieces
 * („Unterrichtseinhei ten" at a table cell's edge, „m 2" for „m²") or two
 * words it prints as one („41und") are joined on the side that parts them,
 * where the other side carries the joined form and not both pieces. Letters
 * and digits are untouched; only where a space stands differs.
 */
function respace(shown: Marked[], wordings: readonly Wording[]): void {
  const vocabulary = (lists: readonly (readonly string[])[]) => new Set(lists.flat())
  const join = <T>(tokens: T[], word: (t: T) => string, merged: (a: T, b: T) => T, other: ReadonlySet<string>, apart: (t: T) => boolean = () => false): void => {
    for (let i = 0; i + 1 < tokens.length; i++) {
      const a = word(tokens[i]!)
      const b = word(tokens[i + 1]!)
      if (other.has(a + b) && !(other.has(a) && other.has(b)) && !apart(tokens[i]!) && !apart(tokens[i + 1]!)) {
        tokens.splice(i, 2, merged(tokens[i]!, tokens[i + 1]!))
        i = Math.max(-1, i - 2)
      }
    }
  }
  const draftWords = vocabulary(wordings.map((w) => w.tokens))
  // Two words the column runs together („fürJustiz", „7ist") are parted where the draft prints exactly those two side by side, and the joined form nowhere.
  const pairs = new Set(wordings.flatMap((w) => w.tokens.slice(1).map((t, k) => `${w.tokens[k]} ${t}`)))
  for (let i = 0; i < shown.length; i++) {
    const t = shown[i]!
    if (draftWords.has(t.word)) continue
    for (let k = 1; k < t.word.length; k++) {
      if (!pairs.has(`${t.word.slice(0, k)} ${t.word.slice(k)}`)) continue
      shown.splice(i, 1, { word: t.word.slice(0, k), marked: t.marked }, { word: t.word.slice(k), marked: t.marked })
      i++
      break
    }
  }
  // A designation is no half of a word: „§ 3. (1)" is not „31" (Leitungsrechte-DÜV, § 3).
  join(shown, (t) => t.word, (a, b) => ({ word: a.word + b.word, marked: a.marked || b.marked }), draftWords, (t) => t.designation === true)
  const shownWords = new Set(shown.map((t) => t.word))
  // …and the same on the draft's side („Februar2026", TabStG § 4).
  const shownPairs = new Set(shown.slice(1).map((t, k) => `${shown[k]!.word} ${t.word}`))
  for (const w of wordings) {
    const pairs = w.tokens.map((word, i) => ({ word, optional: w.optional[i]! }))
    for (let i = 0; i < pairs.length; i++) {
      const t = pairs[i]!
      if (shownWords.has(t.word)) continue
      for (let k = 1; k < t.word.length; k++) {
        if (!shownPairs.has(`${t.word.slice(0, k)} ${t.word.slice(k)}`)) continue
        pairs.splice(i, 1, { word: t.word.slice(0, k), optional: t.optional }, { word: t.word.slice(k), optional: t.optional })
        i++
        break
      }
    }
    join(pairs, (t) => t.word, (a, b) => ({ word: a.word + b.word, optional: a.optional && b.optional }), shownWords)
    w.tokens = pairs.map((x) => x.word)
    w.optional = pairs.map((x) => x.optional)
  }
}

const REPEALING = new Set(['entfallen', 'entfällt', 'aufgehoben'])

/** Whether `needle` stands in `hay` as one stretch. */
function contains(hay: readonly string[], needle: readonly string[]): boolean {
  return placesOf(hay, needle).length > 0
}

/** Where `needle` stands in `hay` as one stretch. */
function placesOf(hay: readonly string[], needle: readonly string[]): number[] {
  const out: number[] = []
  if (!needle.length) return out
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let j = 0
    while (j < needle.length && hay[i + j] === needle[j]) j++
    if (j === needle.length) out.push(i)
  }
  return out
}

/**
 * Hold one § of the comparison against the draft's wording for it
 * (`draftWording`, under the §'s own number and, renumbered, its old one).
 * `flip` is set by the check alone: the other reading of the §'s word diff
 * (`keptElsewhere`).
 */
export function strictCheck(unit: LawDiffUnit, wording: readonly (DraftWording | undefined)[], law: {
  general: readonly Wording[]
  /** The wording instructions naming no § strike (`LawWording.generalStruck`). */
  generalStruck?: Struck['named']
  elsewhere: readonly string[][]
  placeholders?: (tokens: readonly string[]) => boolean[]
  /**
   * How the caller reads the right column's layout (`annex/annexStrict.ts`;
   * the Länder pass none), given its words as aligned and whether each is
   * marked new: `notText`, the words that are no text of the § — a division
   * heading printed above it, the annex's own notation for a stretch it
   * leaves out — which are never new text of it; `elided`, where the column
   * leaves a stretch out, behind which no word of the draft's wording is
   * missing from it.
   */
  layout?: (words: readonly string[], marked: readonly boolean[]) => { notText: boolean[]; elided: boolean[] }
  /**
   * Whether text the column strikes counts for the verdict (the Bund's
   * annex, `annex/annexStrict.ts`): a § whose column strikes what no
   * instruction for it strikes differs (`struckAccount`). The Länder ask
   * not, and read `struckNotInDraft` only in the harness.
   */
  struck?: boolean
} = { general: [], elsewhere: [] }, flip: ReadonlySet<number> | null = null): StrictCheck {
  const shown = shownTokens(unit, flip ?? undefined)
  if (!shown) return unchecked(unit.change === 'changed' ? STRICT_UNCHECKED.undiffed : STRICT_UNCHECKED.nothingNew)
  const found = wording.filter((w): w is DraftWording => w !== undefined)
  if (!found.length) return unchecked(STRICT_UNCHECKED.unnamed)
  const unread = found.find((w) => w.unread)?.unread
  if (unread) return unchecked(unread)
  // Copies: `respace` rewrites them for this § alone.
  const copy = (w: Wording): Wording => ({ ...w, tokens: [...w.tokens], optional: [...w.optional] })
  const all = found.flatMap((f) => f.wordings).map(copy)
  const general = law.general.map(copy)
  respace(shown, [...all, ...general])
  const words = shown.map((t) => t.word)
  // The §'s own designation is no text of it: the page prints it above, and a payload or a column may print it once more.
  const own = new Set([unit.id, unit.fromId ?? unit.id].map((id) => id.replace(/^§\s*/, '').toLowerCase()))
  const ownAt = (list: readonly string[], i: number) => (list[i] === '§' && own.has(list[i + 1] ?? '')) || (list[i - 1] === '§' && own.has(list[i] ?? ''))
  // What the caller reads as no text of the § (`layout`): never new text of it.
  const layout = law.layout?.(words, shown.map((t) => t.marked))
  shown.forEach((t, i) => {
    if (ownAt(words, i) || layout?.notText[i]) t.marked = false
  })
  // „(2) entfallen": how a column prints a repealed Absatz — the instruction's verb, not text of the law.
  const repeals = found.some((f) => f.text.some((t) => t.some((w) => REPEALING.has(w))))
  shown.forEach((t) => {
    if (repeals && REPEALING.has(t.word)) t.marked = false
  })
  const draft: string[] = []
  const optional: boolean[] = []
  /** Where each payload stands in `draft`, and whether it prints the § from its own designation on: the whole § rewritten. */
  const pieces: { from: number; to: number; whole: boolean }[] = []
  for (const w of all.filter((x) => !x.repeats)) {
    const at = w.tokens.findIndex((t, i) => t === '§' && own.has(w.tokens[i + 1] ?? ''))
    pieces.push({ from: draft.length, to: draft.length + w.tokens.length, whole: at >= 0 && w.optional.slice(0, at + 2).every(Boolean) })
    draft.push(...w.tokens)
    optional.push(...w.optional)
  }
  draft.forEach((_, j) => {
    if (ownAt(draft, j)) optional[j] = true
  })
  if (shown.length * draft.length > MAX_ALIGN_CELLS) return unchecked(STRICT_UNCHECKED.tooLong)
  // A stretch quoted in an instruction's line accounts for each place it stands at…
  const placed = shown.map(() => false)
  for (const w of [...all.filter((x) => x.repeats), ...general]) {
    for (const at of placesOf(words, w.tokens)) {
      // …a designation it gives only where the column prints one: „(5)", not the „5" of „binnen 5 Wochen".
      if (w.designation && w.tokens.length === 1 && !shown[at]!.designation) continue
      for (let k = 0; k < w.tokens.length; k++) placed[at + k] = true
    }
  }
  // …and the payloads are aligned with what is left: a new word accounted for must not pull a payload's word out of its place.
  const wild = law.placeholders ? { shown: law.placeholders(words), draft: law.placeholders(draft) } : undefined
  const aligned = align(shown.map((t, i) => ({ word: t.word, marked: t.marked && !placed[i] })), draft, wild)
  const accounted = shown.map((_, i) => placed[i]! || aligned.shown[i]!)
  const quoted = [...all.filter((x) => x.repeats), ...general].map((w) => w.tokens)
  // A new stretch between two equal words can be cut one word earlier or
  // later („zu [tätigen; 3. … zu] tätigen."): where it is the draft's as one
  // stretch at either cut, it is the draft's.
  for (let i = 0; i < shown.length; i++) {
    if (!shown[i]!.marked) continue
    let j = i
    while (j < shown.length && shown[j]!.marked) j++
    const own = found.flatMap((f) => f.text)
    // One stretch of an instruction naming the §, as it stands: the draft's,
    // wherever the alignment put it. Not a part of a quoted wording, which
    // accounts only where it stands whole (Oö. 2025-16103, § 38: „jeweils",
    // one place cut short); and a single word only from what an instruction
    // quotes or prints — in its line it is an address, „Z 8" (Tirol 728/2026).
    // Never a single figure of the text: one a payload prints somewhere is not
    // the draft's at any place („binnen [5] Wochen" where the payload says
    // „Abs. 5"; 21.11.2026). A designation („(1)", „3.") still may be.
    const stretch = words.slice(i, j)
    // A designation alone is no part of a wording: „(5)" is not the „5" of „5. Unterabschnitt Urkundenarchiv".
    const designation = stretch.length === 1 && shown[i]!.designation === true
    const partOfQuote = !designation && quoted.some((q) => q.length > stretch.length && contains(q, stretch))
    const figure = stretch.length === 1 && /^\d+$/.test(stretch[0]!) && !designation
    if (!accounted.slice(i, j).every(Boolean) && !partOfQuote && !figure && (stretch.length > 1 ? own : found.flatMap((f) => f.written)).some((t) => contains(t, stretch))) for (let k = i; k < j; k++) accounted[k] = true
    if (!accounted.slice(i, j).every(Boolean)) {
      for (let shift = -(j - i); shift <= j - i; shift++) {
        if (shift === 0 || i + shift < 0 || j + shift > shown.length) continue
        // The same text at the other cut: what leaves at one end enters at the other.
        const same = shift > 0 ? words.slice(i, i + shift).every((w, k) => w === words[j + k]) : words.slice(j + shift, j).every((w, k) => w === words[i + shift + k])
        if (same && [draft, ...quoted].some((t) => contains(t, words.slice(i + shift, j + shift)))) {
          for (let k = i; k < j; k++) accounted[k] = true
          break
        }
      }
    }
    i = j
  }
  // The same cut, where the word between two new stretches is the one moved:
  // „5. [eine … oder] die [Unwirtschaftlichkeit …; 6. die] im Zug" inserts
  // „eine … oder die Unwirtschaftlichkeit …; 6." before the old „die". A new
  // word is the draft's where the same word stands unmarked at the other end
  // of new words all accounted for, and the draft's wording took that one.
  for (let i = 0; i < shown.length; i++) {
    if (!shown[i]!.marked || accounted[i]) continue
    for (const step of [-1, 1]) {
      let k = i + step
      while (k >= 0 && k < shown.length && shown[k]!.marked && accounted[k]) k += step
      if (k >= 0 && k < shown.length && k !== i + step && !shown[k]!.marked && aligned.shown[k] && words[k] === words[i]) accounted[i] = true
    }
  }
  const notInDraft = shown.filter((t, i) => t.marked && !accounted[i]).map((t) => t.word)
  // New words the row's word diff may have placed off their twins in the left column (`keptElsewhere`): read the
  // other way, the § holds where every word new in that reading is the draft's; else it stands as read.
  if (!flip && notInDraft.length && unit.segments) {
    const runs: number[][] = []
    let whole = true
    shown.forEach((t, i) => {
      if (!whole || !t.marked || accounted[i]) return
      // A heading's word, or one `respace` parted or joined, has no place of its own in the diff.
      // Nor a designation the column prints beside a new one („(11)(10)", Tiroler Naturschutzgesetz § 3): the old one a renumbering replaces.
      if (t.at === undefined || (t.designation && /^\d+[a-z]*$/.test(t.word) && shown[i + 1]?.designation && /^\d+[a-z]*$/.test(shown[i + 1]!.word))) whole = false
      else if (i > 0 && shown[i - 1]!.marked && !accounted[i - 1]) runs.at(-1)!.push(t.at)
      else runs.push([t.at])
    })
    const turn = whole ? keptElsewhere(diffWords(unit.segments), runs) : null
    const again = turn ? strictCheck(unit, wording, law, turn) : null
    if (again?.state === 'holds') return again
  }
  // A word of the draft's wording the column leaves out where it says it does (`layout.elided`): between the
  // column words its aligned neighbours stand at, an elision. That is not missing, as the gate reads it.
  const behindElision = (j: number): boolean => {
    if (!layout) return false
    let before = j - 1
    while (before >= 0 && aligned.at[before]! < 0) before--
    let after = j + 1
    while (after < draft.length && aligned.at[after]! < 0) after++
    const from = before >= 0 ? aligned.at[before]! : -1
    const to = after < draft.length ? aligned.at[after]! : shown.length
    // Where no word of the wording is aligned on one side, the window would run to the column's edge
    // (22.11.2026): there the mark stands for the missing words only right at the aligned neighbour on the
    // other side. „… betragen. (6) …" does not stand for the sentence the column lost before „(6)".
    if (before < 0 && after < draft.length) return layout.elided[to - 1] === true
    if (before >= 0 && after >= draft.length) return layout.elided[from + 1] === true
    for (let i = from + 1; i < to; i++) if (layout.elided[i]) return true
    return false
  }
  const notShown = draft.filter((_, j) => !optional[j] && !aligned.draft[j] && !behindElision(j))
  for (const w of all) if (w.repeats && w.once && !contains(words, w.tokens)) notShown.push(...w.tokens)
  // New text the draft writes elsewhere — for a § the document prints no
  // block of its own for, or in an instruction whose address was not read:
  // whose text it is, is then not read, and the § is not held strictly.
  // Not where the draft's own wording for the § is missing: that differs,
  // whoever wrote the rest.
  if (notInDraft.length && !notShown.length) {
    let foreign = true
    for (let i = 0; i < shown.length && foreign; i++) {
      if (!shown[i]!.marked || accounted[i]) continue
      let a = i
      while (a > 0 && shown[a - 1]!.marked) a--
      let b = i
      while (b < shown.length && shown[b]!.marked) b++
      const run = words.slice(a, b)
      foreign = run.length >= MIN_FOREIGN_RUN && law.elsewhere.some((t) => contains(t, run))
      i = b
    }
    if (foreign) return unchecked(STRICT_UNCHECKED.elsewhere)
  }
  const struck = struckAccount(unit, flip, found, law.generalStruck ?? [], law.layout, own, shown, { at: aligned.at, pieces, optional }, all.some((w) => w.designation), quoted)
  return {
    state: notInDraft.length || notShown.length || (law.struck && struck.notInDraft.length) ? 'differs' : 'holds',
    reason: null,
    notInDraft,
    notShown,
    newWords: shown.filter((t) => t.marked).length,
    draftWords: optional.filter((o) => !o).length,
    struckNotInDraft: struck.notInDraft,
    struck: struck.by,
  }
}

/**
 * TEXT THE COLUMN STRIKES, HELD AGAINST WHAT THE DRAFT STRIKES (22.11.2026).
 * What a draft strikes, the draft says, as it says what is new. Every word
 * the § shows as struck — its word diff's removed words, in the reading
 * `strictCheck` returns: where it holds only with the diff read the other way
 * (`keptElsewhere`), the twin the diff struck is kept there and is no struck
 * text — is accounted for by the first of:
 *  - notation, no text: the §'s own designation („§ N.", never a citation of
 *    the § in its text); what the left column prints ahead of the one the
 *    group opens with, where the right column prints nothing new there (a
 *    heading printed shorter, a division's heading — `keptDeletion` in
 *    `kons/tguOracle.ts` leaves that zone out alike; measured 22.11.2026:
 *    read as struck text, the zone moves 7 PDF §§, every one a page header,
 *    the previous §'s tail, a heading the row cut, or a division heading the
 *    annex prints on the left only); what the caller's
 *    layout reads as no text (the Bund's elision marks and the designations
 *    that introduce them); the words a new stretch keeps of the removed one
 *    beside it; and a designation, where an instruction for the § gives
 *    designations or speaks of them („erhält die Absatzbezeichnung", „als
 *    Abs. 9 bezeichnet"), struck with nothing unaccounted beside it;
 *  - `named`: a wording an instruction quotes as replaced or struck, where it
 *    stands whole in the left column, or the struck stretch stands in it
 *    („Der Leiter der internen Revision [hat.]" against „… hat die
 *    Anforderungen … zu erfüllen."); spaced as the column spaces it;
 *  - `repealed`: a unit an instruction repeals by its designation („Abs. 3
 *    entfällt", „§ 26 samt Überschrift entfällt"), from that designation in
 *    the left column to the next of its level or higher — or the whole §;
 *    only inside the parts its address names above it (`within`);
 *  - `rewritten`: a unit a line writes anew by address („§ 14 Abs. 5 und 6
 *    lautet:", „§ 39 lautet:", „werden Z 1 bis 3 durch folgende … ersetzt:"),
 *    likewise; between two column words a payload accounts for, with no two
 *    kept words of another unit in between; the left column's unit of the
 *    designation the payload opens with, and inside that unit what stands at
 *    the payload's edges up to the first word both columns keep; and what a
 *    wording quoted as new crosses where it stands whole in the column;
 *  - a twin: a struck stretch whose words stand kept, as one stretch, inside
 *    one of the above — the word diff keeps the first equal words it meets,
 *    and the other copy is the one the draft struck (`check 4` of the oracle
 *    names the same trap);
 *  - `byPosition`: what is left, where it is no more stretches than the
 *    instructions strike or replace by a position they only count or
 *    describe („der letzte Satz entfällt", „lautet der zweite Satz:",
 *    „entfällt der Schlussteil"), each line as many stretches as it counts,
 *    inside the unit it names as its place; a heading line only in the
 *    heading; a line that writes the position anew only in the sentences its
 *    wording replaces: which stretch they mean is not read, so the weakest
 *    reading that still sees a struck sentence they do not name. A
 *    stretch runs across new words and across a single kept word, as the word
 *    diff cuts one struck sentence at a word it shares with kept text.
 * What none accounts for is `notInDraft`: struck in the column, kept by the
 * draft. Measured on GP XXVIII (22.11.2026, both Bund paths): of 3,282 §§
 * showing a struck word, 149 keep some unaccounted, every one read; of the 51
 * shown that differ newly by it, 22 are the two documents differing, 13 how
 * the annex is set, 11 limits of this check, 5 undecided. Of a kept sentence
 * lost from the right column (fault injection, through the page's whole
 * chain) it catches 83 % (PDF) and 85 % (table path); what passes is struck
 * text an instruction accounts for as a whole — a position it only counts,
 * a unit a payload writes anew.
 */
function struckAccount(
  unit: LawDiffUnit,
  flip: ReadonlySet<number> | null,
  found: readonly DraftWording[],
  general: Struck['named'],
  layout: ((words: readonly string[], marked: readonly boolean[]) => { notText: boolean[] }) | undefined,
  own: ReadonlySet<string>,
  shown: readonly Marked[],
  draft: { at: readonly number[]; pieces: readonly { from: number; to: number; whole: boolean }[]; optional: readonly boolean[] },
  designations: boolean,
  quoted: readonly (readonly string[])[],
): { notInDraft: string[]; by: StruckBy } {
  const by: StruckBy = { named: 0, rewritten: 0, repealed: 0, byPosition: 0, notation: 0 }
  if (unit.change !== 'changed' || !unit.segments) return { notInDraft: [], by }
  const segments = unit.segments
  const diff = diffWords(segments)
  // The left column, kept and removed words in order, its designations read in its own text where that counts alike.
  const left = diff.flatMap((d, p) => (d.kind === 'inserted' ? [] : [{ ...d, p }]))
  const whole = markedTokens(segments.filter((s) => s.type !== 'inserted').map((s) => s.text).join(' '))
  const read = whole.length === left.length ? whole : segments.flatMap((s) => (s.type === 'inserted' ? [] : markedTokens(s.text)))
  const words = left.map((l) => l.word)
  const struck = new Set(left.filter((l) => l.kind === 'removed' && !flip?.has(l.p)).map((l) => l.p))
  if (!struck.size) return { notInDraft: [], by }
  const cls = new Map<number, keyof StruckBy>()
  /** Left-column words (kept ones too) inside what an instruction strikes or rewrites, by class: where a twin of a struck stretch may stand (below). */
  const cover = new Map<number, keyof StruckBy>()
  const mark = (p: number, c: keyof StruckBy) => {
    if (c !== 'notation' && c !== 'byPosition' && !cover.has(p)) cover.set(p, c)
    if (struck.has(p) && !cls.has(p)) cls.set(p, c)
  }
  const notText = layout?.(words, left.map((l) => struck.has(l.p))).notText
  /** Whether a unit opens at `k`: a designation, or a figure printed as one right after the layout's notation („1. bis 14. … 15. jede …"). */
  // Only a figure or one or two letters open a unit: „BGBl." after a comma is printed like a designation (SpielzeugV Anlage 2, 22.11.2026);
  // and in brackets only a figure, an Absatz.
  const opensAt = (k: number): boolean => DESIGNATION_WORD_RE.test(words[k]!) && (read[k]!.shape !== '()' || /^\d/.test(words[k]!)) && (read[k]!.designation === true || (read[k]!.shape !== undefined && (notText?.[k - 1] === true || left[k - 1]?.row !== left[k]!.row)))
  /**
   * The left column's unit a designation at `k` opens: up to the next designation of its level or higher. A Ziffer's or a
   * Litera's ends with its row where the next row opens with no deeper designation (22.11.2026): the table path sets one row
   * per element, and a row after a list's last item is its Schlussteil, which a repeal of that item keeps. Not a row that
   * closes a deeper list inside the unit (EStG § 25: „aa) … cc) …" then „eingezahlten Beträge entfallen, …" of the lit. a),
   * and not where the list's earlier items run on over a row of their own too (HonigV § 3: „e) „Presshonig““ then „Durch
   * Pressen …"). A single row (the PDF path) still runs to the next designation.
   */
  const levelAt = (k: number) => levelOf(words[k]!, read[k]!.shape ?? '.')
  const runsOn = (k: number, level: number): boolean => {
    // An earlier item of the same list followed by a row with no designation before the next item.
    for (let j = k - 1; j >= 0; j--) {
      if (!opensAt(j)) continue
      if (levelAt(j) < level) return false
      if (levelAt(j) > level) continue
      for (let e = j + 1; e < k && !(opensAt(e) && levelAt(e) <= level); e++) if (left[e]!.row !== left[e - 1]!.row && !opensAt(e)) return true
    }
    return false
  }
  const ends = new Map<number, number>()
  const unitEnd = (k: number): number => {
    const known = ends.get(k)
    if (known !== undefined) return known
    const level = levelAt(k)
    let e = k + 1
    let deeper = false
    while (e < left.length && !(opensAt(e) && levelAt(e) <= level)) {
      if (opensAt(e)) deeper = true
      else if (level >= 2 && !deeper && left[e]!.row !== left[e - 1]!.row && !runsOn(k, level)) break
      e++
    }
    ends.set(k, e)
    return e
  }
  const markUnit = (k: number, c: keyof StruckBy) => {
    for (let e = k, end = unitEnd(k); e < end; e++) mark(left[e]!.p, c)
  }
  // Which number of the § an instruction's address names (22.11.2026): the one the left column prints, or, where the line
  // names the number as new („Im nunmehrigen § 18", „§ 18 (neu)"), the one the annex renumbers it to (`LawDiffUnit.fromId`).
  // „§ 18 entfällt" beside „der bisherige § 19 erhält die Bezeichnung „§ 18.“" is another §, and repeals nothing of this one.
  const numbered = (id: string) => new Set([id.replace(/^§\s*/, '').toLowerCase()])
  const ownFor = (line: string): ReadonlySet<string> => (NEW_NUMBER_RE.test(line) ? numbered(unit.fromId ?? unit.id) : numbered(unit.id))
  /**
   * Whether the left column's word at `k` stands inside the parts an address names above its unit (22.11.2026): the §
   * this group's, each Absatz, Ziffer or Litera a unit the left column opens with that designation and `k` runs in. A
   * part the column prints no designation for is not located, and nothing in it is the instruction's.
   */
  const within = (k: number, path: readonly AddressPart[] | undefined, ids: ReadonlySet<string>): boolean => (path ?? []).every((part) => (part.level === 0
    ? part.ids.some((id) => ids.has(id))
    : left.some((_, j) => j < k && opensAt(j) && levelOf(words[j]!, read[j]!.shape ?? '.') === part.level && part.ids.includes(words[j]!) && k < unitEnd(j))))
  // Notation. What the left column prints ahead of the §'s designation, where the right column prints nothing new there:
  // a heading printed shorter or not at all, a division's heading, a line of the page above (`keptDeletion` in
  // `kons/tguOracle.ts` leaves it out alike: a heading is not struck by being printed shorter).
  // The §'s designation is „§ N." as a designation prints it, a full stop after the number — not a citation of the § in its own
  // text („des Inkrafttretens des § 28c in der Fassung …", „gemäß § 13 Abs. 1"; 22.11.2026). The head zone runs only up to the one
  // the group opens with, in its first row and after no Absatz: a table's rows print none, and then there is no head zone.
  const designatedAt = (k: number) => words[k] === '§' && own.has(words[k + 1] ?? '') && read[k + 1]?.shape === '.'
  const ownAt = left.findIndex((l, k) => designatedAt(k) && l.row === left[0]!.row)
  const opener = ownAt >= 0 && !read.slice(0, ownAt).some((t) => t.designation && t.shape === '()')
  const head = opener && !diff.slice(0, left[ownAt]!.p).some((d) => d.kind === 'inserted') ? left[ownAt]!.p : 0
  const renumbers = designations || found.some((f) => f.struck?.renumbers)
  left.forEach((l, k) => {
    if (l.p < head || designatedAt(k) || designatedAt(k - 1) || (designations && opensAt(k)) || notText?.[k]) mark(l.p, 'notation')
  })
  let p = 0
  segments.forEach((s, i) => {
    const tokens = markedTokens(s.text)
    if (s.type === 'removed') {
      const beside = [segments[i - 1], segments[i + 1]].find((x) => x?.type === 'inserted')
      if (beside) align(tokens.map((t) => ({ word: t.word, marked: false })), strictTokens(beside.text)).shown.forEach((kept, k) => {
        if (kept) mark(p + k, 'notation')
      })
    }
    p += tokens.length
  })
  // Named — „Biozid Produkte Gesetzes" quoted where the column prints „Biozid-Produkte-Gesetzes": two words joined where the column has the joined one and not both (`respace`).
  // …and „Dublin-Verordnung" where it prints „Dublin - Verordnung": one word parted where the column has the two side by side and not the one.
  const vocabulary = new Set(words)
  const pairs = new Set(words.slice(1).map((w, k) => `${words[k]} ${w}`))
  const named: { tokens: string[]; law: boolean }[] = []
  for (const n of [...found.flatMap((f) => f.struck?.named ?? []), ...general]) {
    // A designation an instruction removes or replaces („entfällt die Absatzbezeichnung „(1)“") accounts for that
    // designation where the column prints it as one — never for the same figure in the text, nor for a stretch that holds it.
    if (n.designation) {
      if (n.tokens.length === 1) left.forEach((l, k) => {
        if (words[k] === n.tokens[0] && read[k]!.shape !== undefined) mark(l.p, 'named')
      })
      continue
    }
    const tokens = [...n.tokens]
    for (let i = 0; i + 1 < tokens.length; i++) {
      for (const width of [3, 2]) {
        const joined = tokens.slice(i, i + width).join('')
        if (i + width <= tokens.length && vocabulary.has(joined) && !tokens.slice(i, i + width).every((t) => vocabulary.has(t))) {
          tokens.splice(i, width, joined)
          break
        }
      }
    }
    for (let i = 0; i < tokens.length; i++) {
      if (vocabulary.has(tokens[i]!)) continue
      for (let k = 1; k < tokens[i]!.length; k++) {
        if (!pairs.has(`${tokens[i]!.slice(0, k)} ${tokens[i]!.slice(k)}`)) continue
        tokens.splice(i, 1, tokens[i]!.slice(0, k), tokens[i]!.slice(k))
        break
      }
    }
    // Inside the unit its line names (22.11.2026): „In § 5 Abs. 1 entfällt das Wort „nicht““ is not the „nicht" of Abs. 2. A
    // law-wide line (no § named) at every place. Measured and not built: as often as the line says (once without „jeweils"),
    // which moved five §§ more, every one a line that lists its places and means every occurrence (LMBG § 20, GSpG § 21).
    const ids = ownFor(n.line)
    const law = !found.some((f) => f.struck?.named.includes(n))
    // The places of this § the line names („In § 1 Abs. 1, § 6, § 7 … wird der Ausdruck „Umwelt“ …"): none, or this § whole, is the whole §.
    const mine = (n.places ?? []).filter((u) => (u.level === 0 ? u.ids.some((id) => ids.has(id)) : u.path.every((x) => x.level > 0 || x.ids.some((id) => ids.has(id)))))
    const units = law || mine.some((u) => u.level === 0) ? [] : mine
    // Where the column prints no unit of a level the line names around the place (the annex elides the Absatz: „(1) …"), which
    // unit it is cannot be told, and the place is not refused; it is refused where the column prints another one there.
    // A wording that opens with a designation („„(3) Das …“", printed inside Abs. 2) stands in the unit of the word before it.
    const enclosing = (at: number, level: number) => {
      for (let j = opensAt(at) ? at - 1 : at; j >= 0; j--) if (opensAt(j) && levelAt(j) === level && at < unitEnd(j)) return j
      return -1
    }
    const inPlace = (at: number, width: number) => !units.length || units.some((u) => [...u.path, u].every((part) => {
      if (part.level === 0) return part.ids.some((id) => ids.has(id))
      if (part.fresh) return true
      const j = enclosing(at, part.level)
      return j < 0 || (part.ids.includes(words[j]!) && at + width <= unitEnd(j))
    }))
    named.push({ tokens, law })
    for (const a of placesOf(words, tokens).filter((x) => inPlace(x, tokens.length))) for (let k = a; k < a + tokens.length; k++) mark(left[k]!.p, 'named')
  }
  // …and a struck stretch that stands in such a wording, though the wording does not stand whole in the column: „Der Leiter der
  // internen Revision [hat.]" where the draft replaces „Der Leiter der internen Revision hat die Anforderungen … zu erfüllen.".
  // A piece of a law-wide wording only with the word beside it on one side the wording's too (22.11.2026): not any stretch that
  // spells a piece of it („und" of „Bundesminister für Arbeit und Soziales"). Measured and not built: the place of a piece of a
  // §'s own wording — refused where the column prints another unit there, it moved 11 §§ more to „nicht bestätigt", where the
  // column prints the unit's designation in a row the check does not see or in a form it does not read.
  const runsLeft = (): number[][] => {
    const runs: number[][] = []
    left.forEach((l) => {
      if (!struck.has(l.p) || cls.has(l.p)) return
      if (runs.length && runs.at(-1)!.at(-1) === l.p - 1) runs.at(-1)!.push(l.p)
      else runs.push([l.p])
    })
    return runs
  }
  const leftOf = new Map(left.map((l, k) => [l.p, k]))
  const piece = (run: readonly number[], n: (typeof named)[number]): boolean => {
    const seq = run.map((q) => diff[q]!.word)
    const k = leftOf.get(run[0]!)!
    // A piece, not the whole wording: that one counts only where its line names it (above).
    if (seq.length >= n.tokens.length) return false
    if (!n.law) return contains(n.tokens, seq)
    return placesOf(n.tokens, seq).some((o) => (o > 0 && words[k - 1] === n.tokens[o - 1]) || (o + seq.length < n.tokens.length && words[k + seq.length] === n.tokens[o + seq.length]))
  }
  for (const run of runsLeft()) if (named.some((n) => piece(run, n))) for (const q of run) mark(q, 'named')
  // Repealed, and the units a line writes anew by address (rewritten).
  for (const [r, c] of [...found.flatMap((f) => f.struck?.repealed ?? []).map((x) => [x, 'repealed'] as const), ...found.flatMap((f) => f.struck?.replaced ?? []).map((x) => [x, 'rewritten'] as const)]) {
    const ids = ownFor(r.line)
    if (r.level === 0) {
      if (r.ids.some((id) => ids.has(id)) && within(0, r.path, ids)) for (let q = 0; q < diff.length; q++) mark(q, c)
      continue
    }
    left.forEach((_, k) => {
      // „the struck stretch is that unit, opening with its designation as the column prints it": a designation, or the first word of a struck stretch printed as one.
      // …or a designation the word diff keeps while it strikes what follows („wenn 1. [dessen Antrag … 2. …]").
      const unaccounted = (x: number) => struck.has(x) && !cls.has(x)
      const opens = opensAt(k) || (read[k]!.shape !== undefined && ((struck.has(left[k]!.p) && !unaccounted(left[k - 1]?.p ?? -1)) || (!struck.has(left[k]!.p) && struck.has(left[k + 1]?.p ?? -1))))
      if (opens && levelOf(words[k]!, read[k]!.shape ?? '.') === r.level && r.ids.includes(words[k]!) && within(k, r.path, ids)) markUnit(k, c)
    })
  }
  // Rewritten.
  for (const piece of draft.pieces) {
    if (piece.whole) {
      for (const q of struck) mark(q, 'rewritten')
      continue
    }
    const places: number[] = []
    let opens: Marked | null = null
    for (let j = piece.from; j < piece.to; j++) {
      const t = draft.at[j]! >= 0 ? shown[draft.at[j]!] : undefined
      if (t?.at === undefined) continue
      places.push(t.at)
      if (opens === null && !draft.optional[j]) opens = t
    }
    if (!places.length) continue
    const [lo, hi] = [Math.min(...places), Math.max(...places)]
    // Between its words: a struck word with, on either hand, nothing but struck and new words before the next of its words.
    // A kept word the payload does not account for in between is text of another unit the alignment reached past
    // (fault injection, 22.11.2026: 145 kept sentences lost from the column passed so).
    const at = new Set(places)
    // A single kept word between is the word diff pairing a „die" across rewritten text, as the oracle's check 4 reads
    // it (`ANCHOR`); two in a row are kept text.
    const enclosed = (q: number): boolean => [-1, 1].every((step) => {
      let x = q + step
      while (x > lo && x < hi && !at.has(x) && (diff[x]!.kind !== 'equal' || (diff[x + step]?.kind !== 'equal' && diff[x - step]?.kind !== 'equal') || at.has(x + step))) x += step
      return at.has(x)
    })
    for (let q = lo; q <= hi; q++) if (at.has(q) || enclosed(q)) mark(q, 'rewritten')
    // The unit it replaces: the left column's of the designation it opens with, the nearest one — printed as a designation,
    // whether or not it stands where a unit begins („… und der Handbücher 1. An Bord …", the payload's own „1.")…
    let unit: [number, number] | null = null
    if (opens?.shape !== undefined && opens.at !== undefined) {
      const level = levelOf(opens.word, opens.shape ?? '.')
      let best = -1
      left.forEach((l, k) => {
        if (read[k]!.shape !== undefined && words[k] === opens!.word && levelOf(words[k]!, read[k]!.shape ?? '.') === level && (best < 0 || Math.abs(l.p - opens!.at!) < Math.abs(left[best]!.p - opens!.at!))) best = k
      })
      if (best >= 0) {
        markUnit(best, 'rewritten')
        unit = [left[best]!.p, left[unitEnd(best)]?.p ?? diff.length]
      }
    }
    // …and, inside that unit, at its edges up to the first word both columns keep: „[Soweit durch Verordnung zugelassen,] {Die Abgabenbehörde} kann …".
    const inUnit = (q: number) => unit !== null && q >= unit[0] && q < unit[1]
    for (let q = lo - 1; q >= 0 && inUnit(q) && diff[q]!.kind !== 'equal'; q--) mark(q, 'rewritten')
    for (let q = hi + 1; q < diff.length && inUnit(q) && diff[q]!.kind !== 'equal'; q++) mark(q, 'rewritten')
  }
  // A designation struck alone — beside it nothing struck that is not accounted for — where an instruction speaks of designations.
  const unaccountedAt = (k: number) => k >= 0 && k < left.length && struck.has(left[k]!.p) && !cls.has(left[k]!.p)
  left.forEach((l, k) => {
    if (renumbers && read[k]!.shape !== undefined && unaccountedAt(k) && !unaccountedAt(k - 1) && !unaccountedAt(k + 1)) mark(l.p, 'notation')
  })
  // A wording an instruction quotes as new („lautet der erste Satz: „…“") that stands whole in the column across struck words: those it replaces.
  const shownWords = shown.map((t) => t.word)
  for (const q of quoted) {
    if (q.length < 2) continue
    for (const at of placesOf(shownWords, q)) {
      const places = shown.slice(at, at + q.length).map((t) => t.at).filter((x): x is number => x !== undefined)
      if (places.length) for (let x = Math.min(...places); x <= Math.max(...places); x++) if (struck.has(x)) mark(x, 'rewritten')
    }
  }
  // A twin: the word diff keeps the first equal words it meets, so where the left column prints a phrase twice and the
  // draft strikes one copy, it may keep that one and strike the other — „(1) [Konventionsreisepässe sind Fremden, denen
  // in …] Fremden, denen in einem anderen Staat" (Fremdenpolizeigesetz, § 94). Read the other way, a struck stretch whose
  // words stand kept, as one stretch, inside what an instruction strikes or rewrites, is that instruction's.
  const twins = (): void => {
    const runs = runsLeft()
    const at = new Map(left.map((l, k) => [l.p, k]))
    for (const run of runs) {
      const seq = run.map((q) => diff[q]!.word)
      for (const k of placesOf(words, seq)) {
        const span = left.slice(k, k + seq.length)
        const c = cover.get(span[0]!.p)
        if (c && span.every((l) => l.kind === 'equal' && cover.get(l.p) === c) && at.get(run[0]!) !== k) {
          for (const q of run) mark(q, c)
          break
        }
      }
    }
  }
  twins()
  // By position: the stretches left, against what the instructions strike by position.
  const stretches: number[][] = []
  let open = false
  let keptRun = 0
  let row = -1
  diff.forEach((d, q) => {
    if (d.row !== row) {
      open = false
      row = d.row
    }
    if (d.kind === 'equal' && !struck.has(q)) {
      keptRun++
      if (keptRun > 1) open = false
      return
    }
    keptRun = 0
    if (!struck.has(q) || cls.has(q)) return
    if (open) stretches.at(-1)!.push(q)
    else stretches.push([q])
    open = true
  })
  const positional = found.flatMap((f) => f.struck?.byPosition ?? [])
  // A stretch counts against a line only inside the unit the line strikes in: a sentence struck in Abs. 3 is not „der letzte Satz" of Abs. 2.
  const leftAt = new Map(left.map((l, k) => [l.p, k]))
  const inPlace = (x: (typeof positional)[number], q: number) => !x.places.length || x.places.some((u) => left.some((l, k) => opensAt(k) && levelOf(words[k]!, read[k]!.shape ?? '.') === u.level && u.ids.includes(words[k]!) && leftAt.get(q)! >= k && leftAt.get(q)! < unitEnd(k) && within(k, u.path, ownFor(x.line))))
  // The sentence each left word stands in.
  const sentence: number[] = []
  left.forEach((_, k) => sentence.push(k > 0 ? sentence[k - 1]! + (read[k - 1]!.stop ? 1 : 0) : 0))
  // The sentences a payload writes anew: those of the words it accounts for.
  const rewrittenIn = new Set(left.flatMap((l, k) => (cover.get(l.p) === 'rewritten' ? [sentence[k]!] : [])))
  const firstUnit = left.findIndex((_, k) => opensAt(k))
  /**
   * Whether a stretch is one a line strikes by position (22.11.2026): inside the unit it names; a heading only in the heading,
   * ahead of the column's first designation; and where the line writes the stretch anew („lautet der zweite Satz: „…“"),
   * only in the sentences its wording replaces — those its payload accounts for and as many beside them as it counts.
   * Its count stays free for no other sentence the draft keeps (BSVG § 24, IFG § 150 under fault injection).
   */
  const fits = (x: (typeof positional)[number], st: readonly number[]) => {
    const k = leftAt.get(st[0]!)!
    if (!inPlace(x, st[0]!)) return false
    if (x.heading && firstUnit >= 0 && k >= firstUnit) return false
    if (x.replaces && !x.heading) return st.every((q) => [...rewrittenIn].some((s) => Math.abs(s - sentence[leftAt.get(q)!]!) < x.count))
    return true
  }
  // Each line as many stretches as it counts, inside its own unit: the allowances are not pooled over the § (a positional line
  // for Abs. 3 let a second stretch pass in Abs. 1).
  const free = positional.map((x) => x.count)
  for (const st of stretches) {
    const i = positional.findIndex((x, j) => free[j]! > 0 && fits(x, st))
    if (i < 0) continue
    free[i]!--
    for (const q of st) mark(q, 'byPosition')
  }
  for (const c of cls.values()) by[c]++
  const notInDraft = stretches.flat().filter((q) => !cls.has(q)).map((q) => diff[q]!.word)
  return { notInDraft, by }
}
