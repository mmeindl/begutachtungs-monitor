/**
 * The faults a reader makes in a right column's new text, as edits of that
 * text: a figure, a label, a word, the last sentence. Built for the Länder
 * harness (`harness/landGuard.ts`, 19.11.2026) and asked of the Bund's annex
 * gate too (`harness/faultInjection.ts`, 21.11.2026), so both measure the
 * same fault. Each edit returns null where the text has nothing to break.
 *
 * The sentence splitter is the caller's: each harness keeps the one its
 * published figures were measured with.
 *
 * **Each edit builds what its name says (21.11.2026).** „Zahl" changed the
 * first number of the text, and on the Bund's PDF path 96 of the 115 the
 * oracle let through were a Ziffer's or an Absatz's marker („23." to „30.",
 * „(2)"), 9 the § number and 7 a division's number: labels, which no check
 * of the text reads. „Satz weg" took a bare „(3)" or a heading for the last
 * sentence, and cut a date after its day („tritt mit 1." / „Jänner 2027 in
 * Kraft."). A figure is now a number of the text and a sentence a sentence
 * of it; a label has a class of its own (`bumpedDesignation`).
 */
import { MIN_STANDING_STRETCH } from '../../server/utils/annex/rightColumn'

/** „1." before a month is a date's day. */
const MONTH_RE = /^\s*(?:Jänner|Januar|Feber|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)(?!\p{L})/u
/** A designator a number of the text follows: „Abs. 2.", „Z 4.", „S. 1.", „Teil 2." (`CITATION_BEFORE_RE` in `kons/tguOracle.ts`). */
const DESIGNATOR_BEFORE_RE = /(?:(?<!\p{L})(?:Abs|Art|lit|Nr|Z|Ziff|Pkt|Tz|Rz)\.?|(?<!\p{L})S\.|(?<!\p{L})(?:Absatz|Absätze|Artikel|Ziffer|Ziffern|Satz|Sätze|Punkt|Teil|Abschnitt|Hauptstück|Kapitel))\s*$/u
/** An article or a possessive: the number after it is an ordinal of the text, „das 18. Lebensjahr" (`ORDINAL_BEFORE_RE`). */
const DETERMINER_BEFORE_RE = /(?<!\p{L})(?:der|die|das|dem|den|des|am|im|zum|zur|vom|beim|ins|ans|ein|eine|einem|einen|einer|eines|sein|seine|seinem|seinen|seiner|seines|ihr|ihre|ihrem|ihren|ihrer|ihres|jede[mnrs]?)\s*$/iu
const DIVISION_AFTER_RE = /^\s*(?:Teil|Abschnitt|Hauptstück|Unterabschnitt|Kapitel|Titel)(?!\p{L})/u

/**
 * The labels of a text, as the oracle reads them (`stripMarkers` in
 * `kons/tguOracle.ts`): an Absatz's „(2)" and a Ziffer's „23." standing
 * free, a Litera's „b)", the § designation „§ 31." — unless the text around
 * says the number is the text's (a date's day, a citation's number, an
 * ordinal after an article, a year), and the number of a division „4.
 * Abschnitt" (kind `division`). In order, with where each stands.
 */
function labelsOf(text: string, before: string, behind = ''): { at: number; end: number; kind: 'abs' | 'z' | 'lit' | 'para' | 'division' | 'chain'; label: string }[] {
  const out: { at: number; end: number; kind: 'abs' | 'z' | 'lit' | 'para' | 'division' | 'chain'; label: string }[] = []
  for (const m of text.matchAll(/§+\.?\s*\d+[a-z]*\.|\(\s*\d+[a-z]?\s*\)(?=\s|$|…|\.\.)|(?<![\p{L}\d.,/])\d+[a-z]?\.(?=\s|$|…|\.\.)|(?<![\p{L}\d.,/])\d+[a-z]?(?=\s*(?:…|\.\.\.))|(?<![\p{L}\d])[a-z]{1,2}\)(?=\s)/gu)) {
    const head = before + text.slice(0, m.index)
    const after = text.slice(m.index! + m[0].length) + behind
    const label = m[0]
    const at = { at: m.index!, end: m.index! + label.length, label }
    if (label.startsWith('§')) out.push({ ...at, kind: 'para' })
    // „Abs. 1 bis 8…", „1. bis 6……", „(1) bis (56) ...", „3. … 3a.": a label
    // of an omission or of its chain, which no unit's words follow.
    else if (/^\d+[a-z]?$/.test(label) || CHAIN_AFTER_RE.test(after) || CHAIN_BEFORE_RE.test(head)) out.push({ ...at, kind: 'chain' })
    else if (!/(?:^|\s)$/.test(head)) continue
    else if (label.startsWith('(')) out.push({ ...at, kind: 'abs' })
    // „lit. b)" is a citation.
    else if (label.endsWith(')')) {
      if (!/lit\.\s*$/.test(head)) out.push({ ...at, kind: 'lit' })
    } else {
      const num = label.slice(0, -1)
      if (MONTH_RE.test(after) || DESIGNATOR_BEFORE_RE.test(head) || CITATION_CHAIN_BEFORE_RE.test(head) || /^\d{4,}/.test(num) || (num !== '1' && DETERMINER_BEFORE_RE.test(head))) continue
      out.push({ ...at, kind: DIVISION_AFTER_RE.test(after) ? 'division' : 'z' })
    }
  }
  return out
}
/** What follows a label of an omission or a chain: the mark, or the chain's join. */
const CHAIN_AFTER_RE = /^\s*(?:…|\.\.|bis(?!\p{L})|und(?!\p{L})|-|–)/u
/** …and what precedes the chain's last label: a label and the join. */
const CHAIN_BEFORE_RE = /(?:\(\s*\d+[a-z]?\s*\)|(?<![\p{L}\d])\d+[a-z]?\.)\s*(?:bis|und|-|–)\s*$/u
/** „gemäß § 60.", „§§ 105 und 105a.", „Anlage 9.": the number of a citation ending a sentence. */
const CITATION_CHAIN_BEFORE_RE = /(?:§+|Anlage|Anhang|Artikel)\s*(?:\d+[a-z]*\s*(?:,|und|bis|oder)\s*)*$/u

/** „xx/2026", „XXX/202#": a Bundesgesetzblatt not yet issued — read by the oracle as a placeholder (`PLACEHOLDER_RE`), no figure. */
function isPlaceholder(text: string, at: number, digits: string): boolean {
  const token = /(?:[\dxXyY#]+\s*\/\s*)*[\dxXyY#]*$/.exec(text.slice(0, at))![0] + digits + /^[\dxXyY#]*(?:\s*\/\s*[\dxXyY#]+)*/.exec(text.slice(at + digits.length))![0]
  return token.includes('/') && /[xXyY#]/.test(token)
}

/** RIS's note „(Anm.: § 86 (1) BAO entspricht …)", which no comparison reads (`RIS_NOTE_RE`, `kons/tguOracle.ts`). */
function inNote(text: string, at: number): boolean {
  return [...text.matchAll(/\(Anm\.?\s*:[^()]*(?:\([^()]*\)[^()]*)*\)/g)].some((n) => at >= n.index! && at < n.index! + n[0].length)
}

/** Zahl: the first figure of the text — no label (`labelsOf`), no placeholder — plus seven. `before` and `behind`: what the column prints around the text. */
export function raisedNumber(text: string, before = '', behind = ''): string | null {
  const labels = labelsOf(text, before, behind)
  for (const m of text.matchAll(/\d+/g)) {
    if (labels.some((l) => m.index! >= l.at && m.index! < l.end) || isPlaceholder(text, m.index!, m[0]) || inNote(before + text, before.length + m.index!)) continue
    return `${text.slice(0, m.index)}${Number(m[0]) + 7}${text.slice(m.index! + m[0].length)}`
  }
  return null
}

/**
 * Bezeichnung (21.11.2026): the first label of a unit below the § — an
 * Absatz's „(2)", a Ziffer's „3.", a Litera's „b)" — moved by one: the
 * result's „Bezeichnung" class (`harness/faultInjection.ts`) on the annex's
 * side. Not the § designation, which keys the row the text is filed under,
 * and not a division's number, which no result carries.
 */
export function bumpedDesignation(text: string, before = '', behind = ''): string | null {
  const site = labelsOf(text, before, behind).find((l) => l.kind === 'abs' || l.kind === 'z' || l.kind === 'lit')
  if (!site) return null
  const moved = site.label.replace(/\d+|^[a-z]+(?=\))/, (m) => (/\d/.test(m) ? String(Number(m) + 1) : m.slice(0, -1) + String.fromCharCode(m.charCodeAt(m.length - 1) + 1)))
  return `${text.slice(0, site.at)}${moved}${text.slice(site.end)}`
}

/** Wort: the longest word of the text swapped for one no draft uses. */
export function swappedWord(text: string): string | null {
  const longest = text.split(/\s+/).filter((w) => /^\p{L}{6,}$/u.test(w)).sort((a, b) => b.length - a.length)[0]
  return longest ? text.replace(longest, 'Bewilligungsvoraussetzung') : null
}

/** The markers and omission marks a sentence may open with: no words of their own. */
const LEADING_MARKS_RE = /^(?:(?:\(\d+[a-z]?\)|\d+[a-z]?\.|[a-z]{1,2}\)|\[\s*(?:…|\.\.\.)\s*\]|…|\.\.\.)\s*)+/
/** A sentence has words: below this many, a part is a heading or a marker. */
const MIN_SENTENCE_WORDS = 3

/** Does this part of a text say something: three words after its markers, ending on a sentence mark? */
export function isSentence(part: string): boolean {
  const words = part.replace(LEADING_MARKS_RE, '').split(/\s+/).filter((w) => /\p{L}{2}/u.test(w))
  return words.length >= MIN_SENTENCE_WORDS && /[.;:!?…]["'»«›‹)“”’‘]*$/.test(part.trim())
}

/**
 * Satz weg: the text's last sentence gone (`isSentence`) — its words, not
 * the marker it opens with; what follows it, a heading or an omission,
 * stays. Null where the text holds fewer than two sentences. The splitter's
 * cut after a date's day is undone first („tritt mit 1." / „Jänner 2027 in
 * Kraft.").
 */
export function lastSentenceGone(text: string, split: RegExp): string | null {
  const parts: string[] = []
  for (const part of text.split(split)) {
    const prev = parts[parts.length - 1]
    if (prev !== undefined && /(?:^|\s)\d{1,2}\.$/.test(prev) && MONTH_RE.test(part)) parts[parts.length - 1] = `${prev} ${part}`
    else parts.push(part)
  }
  const sentences = parts.map((p, i) => (isSentence(p) ? i : -1)).filter((i) => i >= 0)
  if (sentences.length < 2) return null
  const last = sentences[sentences.length - 1]!
  const marks = LEADING_MARKS_RE.exec(parts[last]!)?.[0].trim() ?? ''
  return [...parts.slice(0, last), ...(marks ? [marks] : []), ...parts.slice(last + 1)].join(' ')
}

/*
 * The Bund's own classes, asked of the Länder too (21.11.2026): L, R-alt and
 * U (`harness/faultInjection.ts`, 2026-09-10). The edits and their
 * conditions are kept here once, so both harnesses inject the same fault;
 * the splitter and the word counter are the caller's.
 */

/** A donor sentence has to carry enough words to be evidence of anything (R-alt, U). */
const MIN_DONOR_TOKENS = 8
/** The injection site's left column: three sentences to lose the middle one of… */
const MIN_SITE_SENTENCES = 3
/** …and enough prose that losing one sentence still leaves a judgeable §. */
const MIN_SITE_TOKENS = 30

/**
 * L: a left column without its second sentence — what a reader does when it
 * files a line into the wrong column, and the word diff then paints
 * standing law as new. Only where the column has three sentences and thirty
 * words and the second is six words at least: a shorter one is a fault the
 * rules are not built to see (`MIN_STANDING_STRETCH`), and counting it as a miss would measure the
 * injector. Null elsewhere.
 */
export function secondSentenceGone(text: string, split: RegExp, words: (s: string) => readonly string[]): string | null {
  const sentences = text.split(split)
  if (sentences.length < MIN_SITE_SENTENCES || words(text).length < MIN_SITE_TOKENS || words(sentences[1]!).length < MIN_STANDING_STRETCH) return null
  return sentences.filter((_, i) => i !== 1).join(' ')
}

/** The donor of R-alt and U: the first sentence of another §'s standing text with `MIN_DONOR_TOKENS` words, or null. */
export function donorSentence(text: string, split: RegExp, words: (s: string) => readonly string[]): string | null {
  return text.split(split).find((s) => words(s).length >= MIN_DONOR_TOKENS) ?? null
}
