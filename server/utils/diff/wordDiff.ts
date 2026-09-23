/**
 * The word-level diff, and the question whether a change is editorial.
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * Eight modules read this: the law diff itself, the annex comparison and its
 * PDF reader, the Begründungsvergleich, the consolidated reading twice, the
 * plausibility guard, the report and the annex oracle. It lived in `lawDiff.ts`
 * and was the reason half of them imported the whole package comparison.
 *
 * Nothing here decides differently than it did there: the class order of
 * `classifyToken`, the placeholder slash, `MAX_DP_CELLS` and every word list
 * are measured decisions (`docs/refactor-plan.md` §9).
 */
import type { LawDiffSegment } from '../../../shared/types'
import { compareTokens } from '../lawtext/normalize'

/** Above this many token pairs the word-level diff is skipped (O(n·m) memory). */
const MAX_DP_CELLS = 2_500_000

// ---------------------------------------------------------------------------
// Token diff (LCS)
// ---------------------------------------------------------------------------

/**
 * The compared words of a text — `compareTokens`, not `normalizeText`, since
 * 23.09.2026.
 *
 * The two forms have to fold the same artefacts away, or a unit that is
 * „geändert" for any other reason collects a changed WORD for every space in
 * front of a full stop and every hyphen one side sets and the other does not
 * (the measurement is at `compareTokens`). The reader still sees the
 * document's own spelling: the segments carry these tokens, and the side that
 * wrote „E-Mail-Adresse" is the side the word comes from.
 */
function tokens(t: string): string[] {
  return compareTokens(t).split(' ').filter(Boolean)
}

export interface TokenDiff {
  similarity: number
  segments: LawDiffSegment[] | null
}

/** Longest-common-subsequence diff over word tokens; similarity = 2·lcs/(n+m). */
export function diffTokens(aText: string, bText: string): TokenDiff {
  const a = tokens(aText)
  const b = tokens(bText)
  const n = a.length
  const m = b.length
  if (n === 0 && m === 0) return { similarity: 1, segments: [] }
  if (n * m > MAX_DP_CELLS) return { similarity: bagSimilarity(a, b), segments: null }

  // dp[i][j] = LCS length of a[i..] and b[j..]
  const width = m + 1
  const dp = new Uint16Array((n + 1) * width)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * width + j] = a[i] === b[j] ? dp[(i + 1) * width + j + 1]! + 1 : Math.max(dp[(i + 1) * width + j]!, dp[i * width + j + 1]!)
    }
  }
  const lcs = dp[0]!
  const segments: LawDiffSegment[] = []
  const emit = (type: LawDiffSegment['type'], word: string) => {
    const last = segments[segments.length - 1]
    if (last && last.type === type) last.text += ` ${word}`
    else segments.push({ type, text: word })
  }
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      emit('equal', a[i]!)
      i++
      j++
    } else if (dp[(i + 1) * width + j]! >= dp[i * width + j + 1]!) {
      emit('removed', a[i]!)
      i++
    } else {
      emit('inserted', b[j]!)
      j++
    }
  }
  while (i < n) emit('removed', a[i++]!)
  while (j < m) emit('inserted', b[j++]!)
  return { similarity: (2 * lcs) / (n + m), segments }
}

/**
 * The similarity alone, without building the segment list — the answer two
 * of the three alignment steps want.
 *
 * Identical to `diffTokens(a, b).similarity` in every case, including the
 * `MAX_DP_CELLS` fallback; it computes the LCS over a rolling row instead of
 * the full matrix, because nothing is backtracked.
 *
 * `minimum` is a caller's threshold, and it is exact rather than an
 * approximation: `bagSimilarity` is `2·|multiset ∩|/(n+m)` and an LCS can
 * never be longer than that intersection, so the bag is an UPPER BOUND on the
 * similarity. A pair below the caller's threshold in the bag cannot reach it
 * in the LCS either, and the quadratic step is skipped. What comes back is
 * then the bound, which is below the threshold by construction — no caller
 * may read it as a score, and none does: both compare it against exactly this
 * threshold. Measured cause: step 3 ran a full LCS per remaining pair, 240×240
 * units = 2,0 s (`docs/refactor-plan.md` §6.3).
 */
export function tokenSimilarity(aText: string, bText: string, minimum = 0): number {
  const a = tokens(aText)
  const b = tokens(bText)
  const n = a.length
  const m = b.length
  if (n === 0 && m === 0) return 1
  if (minimum > 0) {
    const bound = bagSimilarity(a, b)
    if (bound < minimum) return bound
  }
  if (n * m > MAX_DP_CELLS) return bagSimilarity(a, b)
  return (2 * lcsLength(a, b)) / (n + m)
}

/** LCS length over a rolling row — the same recurrence `diffTokens` fills a matrix with. */
function lcsLength(a: readonly string[], b: readonly string[]): number {
  const m = b.length
  let next = new Uint16Array(m + 1)
  let row = new Uint16Array(m + 1)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      row[j] = a[i] === b[j] ? next[j + 1]! + 1 : Math.max(next[j]!, row[j + 1]!)
    }
    const spent = next
    next = row
    row = spent
    row.fill(0)
  }
  return next[0]!
}

export function bagSimilarity(a: string[], b: string[]): number {
  const count = new Map<string, number>()
  for (const t of a) count.set(t, (count.get(t) ?? 0) + 1)
  let common = 0
  for (const t of b) {
    const c = count.get(t) ?? 0
    if (c > 0) {
      common++
      count.set(t, c - 1)
    }
  }
  return (2 * common) / (a.length + b.length)
}

// ---------------------------------------------------------------------------
// Editorial or substantive?
// ---------------------------------------------------------------------------

/** Legal citation vocabulary: a change made only of these plus numbers is a shifted reference. */
const CITATION_WORDS = new Set(
  '§ §§ abs abs. z lit lit. art art. artikel nr nr. anlage anhang satz halbsatz ziffer ziff. pkt pkt. idf ivm bgbl bgbl. teil abschnitt hauptstück hauptstueck unterabsatz uabs uabs. sublit sublit. buchstabe fassung'.split(
    ' ',
  ),
)
/** Words that only glue citations together; a change made of these alone is substantive ("und" → "oder"). */
const CONNECTIVES = new Set('bis und oder sowie in im der des dem den die das gemäß gemaess nach vom von zu zum zur bzw bzw. jeweils folgender folgende folgenden'.split(' '))
/**
 * The connectives that carry no meaning of their own: articles, and the two case
 * variants a Novellierungsanweisung uses interchangeably ("In § 28 wird folgender
 * Abs. angefügt" → "Dem § 28 …"). Deliberately excludes the logical ones — "und" →
 * "oder" and "bis" change the norm — and the directional ones: "nach" → "vor" moves
 * an insertion.
 */
const FUNCTION_WORDS = new Set('der die das dem den des in im'.split(' '))
/**
 * Numbers, letter-suffixed numbers, dates, BGBl numbers, roman numerals, and
 * single letters (lit. a, lit. b).
 *
 * **The date and the Fundstelle keep an optional full stop**, measured in
 * rv→bgbl on 23.09.2026. `bare` clears the quotation marks and a trailing
 * comma but not a period, so the two forms a sentence ends on fell through
 * to `word` — and one `word` ends `isEditorialChange` at once. „BGBl. I Nr.
 * 31/2026." is the filled Fundstelle of 69/ME, printed seven times in one
 * Inkrafttretensbestimmung; „30.10.2023." is the ABl. date of 77/ME and
 * 79/ME. The placeholder side was already recognised (`isPlaceholder` strips
 * the period), so only the FILLED side was missing, which is the side the
 * Kundmachung writes.
 */
const NUMBER_RE = /^\(?\d+[a-z]?\.?\)?$|^\d{1,2}\.\d{1,2}\.\d{4}\.?$|^\d+\/\d+\.?$|^[ivxlc]+\.?$|^[a-z]\)?\.?$/i
const PUNCT_RE = /^[\p{P}\p{S}]+$/u
/** A German numeric date, "1.1.2027" or "26.06.2024" — day, month, year. */
const DATE_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/
/** The sentence's closing punctuation, which belongs to the sentence and not to the number. */
const TRAILING_PUNCT_RE = /[.,;:]+$/

type TokenClass = 'number' | 'placeholder' | 'citation' | 'connective' | 'punct' | 'word'

/** The quotes and brackets a token carries into the diff are not part of it. */
function bare(raw: string): string {
  return raw.replace(/^[„“"'(]+|[„“"'),;:]+$/g, '').toLowerCase()
}

/**
 * A value the draft left open for a later stage to fill in: "(xx)", "XX",
 * "20xx" — and "xxx/2025", the form a Fundstelle takes. Two blank letters or
 * one next to digits; a lone "X" is either a roman numeral or a genuine blank
 * ("X Wochen"), where naming the number is a decision, not typesetting.
 *
 * **"y" counts as a blank letter too, measured 23.09.2026.** The ressorts do
 * not agree on the character: rv→bgbl over GP XXVIII writes „xxx/yyyy"
 * (45/ME), „yyy/202Y" (63/ME) and „yyy/2026" (77/ME, 79/ME) beside the usual
 * „xxx/2025". Read as a `word`, each of them made the whole
 * Inkrafttretensbestimmung substantive, so the page reported a change to a
 * law that had only filled in its own Fundstelle — the same failure the slash
 * fixed on 19.09.2026, one character further on.
 *
 * THE SLASH WAS ADDED ON 19.09.2026, and it was missing at the most
 * expensive place. Every law cites itself in its Inkrafttretensbestimmung —
 * „in der Fassung des Bundesgesetzes BGBl. I Nr. xxx/2025" — and the number
 * is fixed only with the Kundmachung. Without the slash „xxx/2025" fell
 * through every class but `word`, and one `word` ends `isEditorialChange` at
 * once: the comparison Plenarfassung → Kundmachung then reported 136 of 626
 * units as substantively changed (Budgetbegleitgesetz 2025), where nothing
 * had happened but the law filling in its own Fundstelle.
 */
function isPlaceholder(raw: string): boolean {
  // Trailing punctuation belongs to the sentence, not to the number:
  // „xxx/2025." stands at the end of an Inkrafttretensbestimmung, and `bare`
  // clears the quotation marks but not the period in front of them.
  const t = raw.replace(TRAILING_PUNCT_RE, '')
  if (!/^[xy\d]+(?:\/[xy\d]+)?$/i.test(t)) return false
  const blanks = (t.match(/[xy]/gi) ?? []).length
  return blanks >= 2 || (blanks === 1 && /\d/.test(t))
}

function classifyToken(raw: string): TokenClass {
  const t = bare(raw)
  if (!t) return 'punct'
  if (CITATION_WORDS.has(t)) return 'citation' // before punct: "§" is a punctuation character
  if (PUNCT_RE.test(t)) return 'punct'
  if (isPlaceholder(t)) return 'placeholder' // before NUMBER_RE: "xx" also reads as a roman numeral
  if (NUMBER_RE.test(t)) return 'number'
  if (CONNECTIVES.has(t)) return 'connective'
  return 'word'
}

/**
 * What this comparison knows about the change it is classifying, beyond the
 * segments themselves.
 *
 * Exactly one thing so far: which § of the earlier version is which § of the
 * later one, built by `diffLawUnits` from its own alignment. Optional, and
 * absent means "nothing established" — every caller that cannot supply it
 * gets the stricter answer, never a more generous one.
 */
export interface EditorialContext {
  /** Bare § id of the earlier version → bare § id of the later one, for the ONE article of this unit. */
  renumbered?: ReadonlyMap<string, string>
}

/**
 * True when every inserted or removed piece is citation, number, date or
 * punctuation. A piece made of connectives alone ("und" → "oder") is a real
 * change; a piece with any ordinary word is a real change.
 *
 * **A changed cross-reference is editorial only where this comparison itself
 * explains it, since 23.09.2026.** Any citation-adjacent number change used
 * to be editorial, on the reasoning that a reference which merely follows a
 * renumbering says nothing new. The reasoning is right and the test was not:
 * it never asked whether a renumbering had happened. Measured over the 88
 * ME→RV pairs of GP XXVIII, 70 editorial units turned on nothing but a
 * citation-adjacent number, and 38 of them are provably renumbering
 * consequences — but four are changes of the norm that the badge hid under
 * „kein einziges Wort geändert": § 48 → § 48a BAO (27/ME Z4), § 49c Abs. 4
 * Z 1 → § 49b Abs. 1a Z 10 (30/ME Z12), a shrunk UGB range (4/ME Z3) and a
 * Verfassungsbestimmung that gained „§ 169 Abs. 7" (32/ME § 1).
 *
 * So the number pairs have to be renumberings THIS diff established: the
 * alignment paired a unit with `fromId` old and `id` new. Three consequences
 * follow from that and each closes one of the four:
 *   - a reference into another law can never be in the map (27/ME, 4/ME),
 *   - a reference one side does not carry at all has no pair (32/ME),
 *   - an Abs./Z/lit. address is not a unit of this comparison, so a diff of
 *     Novellierungsanordnungen establishes nothing about it (30/ME).
 *
 * The residual class is named rather than hidden: the map is keyed by the
 * bare number, so „Abs. 6" → „Abs. 4" in a draft that also renumbered § 6 to
 * § 4 reads as explained although the two have nothing to do with each other.
 * It needs a draft that renumbers §§ wholesale, and it errs toward the badge —
 * the direction the four cases above showed to be the expensive one, so it is
 * the next thing to tighten, not a reason to keep the old rule.
 */
export function isEditorialChange(segments: readonly LawDiffSegment[] | null, context?: EditorialContext): boolean {
  if (!segments) return false
  let sawChange = false
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]!
    if (s.type === 'equal') continue
    sawChange = true
    const tokens = s.text.split(/\s+/).filter(Boolean)
    const classes = tokens.map(classifyToken)
    if (classes.includes('word')) return false
    // "und" → "oder" is a real change; swapping an article or the case of a
    // Novellierungsanweisung is not.
    if (classes.every((c) => c === 'connective' || c === 'punct') && classes.includes('connective')) {
      if (!tokens.every((t) => FUNCTION_WORDS.has(bare(t)) || classifyToken(t) === 'punct')) return false
    }
    if (classes.includes('number') || classes.includes('citation')) {
      // A number that replaces a placeholder is formatting, and so is a date
      // RESPELLED — but not a date moved (`sameCalendarDay`). Both answer
      // before the reference rule, because neither is a reference.
      if (sameCalendarDay(segments, i) || fillsPlaceholder(segments, i)) continue
      // A bare number is a reference only next to a citation word ("Abs. 6" →
      // "Abs. 4"); "6 Wochen" → "4 Wochen" is a real change. A piece that
      // carries the citation word itself needs no neighbour to say so.
      if (!classes.includes('citation') && !citationAdjacent(segments, i)) return false
      // And a reference is editorial only where the renumbering is ours.
      if (classes.includes('number') && !renumberingExplains(segments, i, context?.renumbered)) return false
    }
  }
  return sawChange
}

/**
 * True when the pieces of this change are citation vocabulary, numbers and
 * punctuation and nothing else — the ADDRESS of an instruction, not its
 * content.
 *
 * The alignment asks it, not the badge: two Novellierungsanordnungen off the
 * same legistic template read alike word for word („§ 63 entfällt samt
 * Überschrift." against „§ 4a entfällt samt Überschrift.", 74/ME ME Z127 and
 * RV Z50 at similarity 0,86), and the ONE thing that distinguishes them is
 * the § they address. Pairing them compares an instruction about § 63 with an
 * instruction about § 4a and then reports the result as a changed reference.
 *
 * Deliberately stricter than `isEditorialChange`: a connective in the change
 * („§ 1 und § 2" → „§ 1") already makes it more than an address, and a pair
 * that is not refused here is simply kept, so the strict answer is the safe
 * one.
 */
export function isAddressOnlyDifference(segments: readonly LawDiffSegment[] | null): boolean {
  if (!segments) return false
  let sawNumber = false
  let sawChange = false
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]!
    if (s.type === 'equal') continue
    sawChange = true
    const classes = s.text.split(/\s+/).filter(Boolean).map(classifyToken)
    if (classes.some((c) => c !== 'citation' && c !== 'number' && c !== 'punct')) return false
    if (!classes.includes('number')) continue
    if (!classes.includes('citation') && !citationAdjacent(segments, i)) return false
    sawNumber = true
  }
  return sawChange && sawNumber
}

/**
 * The numbers a piece names, in printed order and stripped to the form a § id
 * carries — „§ 285b." → „285b", so that it compares with `bareParaId`.
 */
function citationNumbers(text: string): string[] {
  const out: string[] = []
  for (const raw of text.split(/\s+/)) {
    if (!raw || classifyToken(raw) !== 'number') continue
    out.push(bare(raw).replace(/^\(+|[.,;:)]+$/g, ''))
  }
  return out
}

/**
 * Is every number pair of this change a renumbering the comparison itself
 * established?
 *
 * Positional, and it refuses rather than guesses: a side without numbers is a
 * reference ADDED or DROPPED, and two sides naming a different COUNT of
 * provisions have no pairing to check — in both cases the reference does more
 * than follow a renumbering. No map at all (a caller outside `diffLawUnits`)
 * answers no for the same reason.
 *
 * A number that did NOT change needs no renumbering to explain it, and that
 * line is load-bearing: `bare` strips the punctuation off a token, so „(2);"
 * → „(2)," arrives here as the number 2 against the number 2 — a semicolon
 * turned into a comma, which is the plainest editorial change there is
 * (61/ME Z6, 4/ME Z50 „f." → „f", 32/ME § 172).
 */
function renumberingExplains(segments: readonly LawDiffSegment[], i: number, renumbered: ReadonlyMap<string, string> | undefined): boolean {
  const own = citationNumbers(segments[i]!.text)
  const opposite: string[] = []
  for (const s of [segments[i - 1], segments[i + 1]]) {
    if (!s || s.type === 'equal' || s.type === segments[i]!.type) continue
    opposite.push(...citationNumbers(s.text))
  }
  if (own.length !== opposite.length) return false
  const [before, after] = segments[i]!.type === 'removed' ? [own, opposite] : [opposite, own]
  return before.every((old, k) => old === after[k] || renumbered?.get(old) === after[k])
}

/**
 * The calendar days a piece names, in printed order. The sentence's closing
 * punctuation is stripped first, because „30.10.2023," is the same date as
 * „30.10.2023" (77/ME, 79/ME).
 */
function calendarDays(text: string): string[] {
  const days: string[] = []
  for (const raw of text.split(/\s+/)) {
    const m = DATE_RE.exec(bare(raw).replace(TRAILING_PUNCT_RE, ''))
    if (m) days.push(`${Number(m[1])}.${Number(m[2])}.${Number(m[3])}`)
  }
  return days
}

/**
 * Do the two sides of this change name the same days, written differently?
 *
 * **A numeric date used to be editorial by its shape alone, and that is a
 * verdict nobody should have made.** „tritt mit 1.1.2027 in Kraft" →
 * „1.7.2027" moves an Inkrafttreten by six months and was badged
 * „redaktionell"; „31.12.2026." → „31.12.2036." escaped only because the
 * trailing full stop kept the token out of the date test — an accident, not
 * a rule.
 *
 * **Measured before the change** over the 88 ME→RV pairs of GP XXVIII
 * (23.09.2026): exactly three editorial units turn on a numeric date, and
 * they split two against one. 43/ME „26.6.2024" → „26.06.2024" and 61/ME
 * „16.1.2023" → „16.01.2023" are zero padding and nothing else; 2/ME
 * „20.4.2021" → „30.4.2021" corrects the date of an ABl. Fundstelle, which
 * is a different document and a substantive change. So the rule is the
 * calendar and not the spelling: parse both sides numerically and keep the
 * badge only where every day is the same one.
 *
 * A date that fills a placeholder („1. Jänner 20xx" → „1. Jänner 2027") is
 * untouched by this — `fillsPlaceholder` answers it one line up, and that is
 * where the draft really did only leave a blank. It is the YEAR the drafts
 * leave open; a fully dotted „xx.xx.xxxx" occurs 0 times in the same corpus,
 * so `isPlaceholder` was not widened to it.
 */
function sameCalendarDay(segments: readonly LawDiffSegment[], i: number): boolean {
  const own = calendarDays(segments[i]!.text)
  if (own.length === 0) return false
  const opposite: string[] = []
  for (const s of [segments[i - 1], segments[i + 1]]) {
    if (!s || s.type === 'equal' || s.type === segments[i]!.type) continue
    opposite.push(...calendarDays(s.text))
  }
  return own.length === opposite.length && own.every((d, k) => d === opposite[k])
}

/** "(xx)" → "(69)": is the piece on the other side of this change the placeholder it replaces? */
function fillsPlaceholder(segments: readonly LawDiffSegment[], i: number): boolean {
  return [segments[i - 1], segments[i + 1]].some((s) => {
    if (!s || s.type === 'equal') return false
    return s.text.split(/\s+/).filter(Boolean).some((t) => classifyToken(t) === 'placeholder')
  })
}

/**
 * Does the equal text around a changed piece end or start with a citation
 * word? Looks past a sibling change ("6" removed, "4" inserted).
 *
 * **The word the number hangs on, not the last two words, since 23.09.2026.**
 * It used to read the last TWO words before the change, and `CITATION_WORDS`
 * carries five ordinary nouns — `satz`, `teil`, `fassung`, `anlage`, `nr`.
 * One word of distance is all it takes for those to be a subject rather than
 * a citation: „Der Satz beträgt 5 vH." → „7 vH." and „Der Teil beträgt 500
 * Euro." → „700 Euro." came out „redaktionell", because „Satz"/„Teil" stood
 * two words back. A rate and an amount are the substance of a provision, and
 * calling that a shifted reference is the one mistake this badge may not
 * make.
 *
 * The narrow rule — the single token before the change — is wrong in the
 * other direction: a range names its first member first, so in „§§ 1 und 2" →
 * „§§ 1 bis 3" the immediate neighbour is „1" and the citation word is behind
 * it. So the numbers of the run are stepped over, and the first token that is
 * not one of them has to be the citation word. That keeps „Abs. 6" → „Abs. 4"
 * and „§§ 1 bis 3" editorial and drops the two nouns, because „beträgt" is an
 * ordinary word and stops the walk at once.
 *
 * The controls stay where they were: „Der Beitragssatz beträgt 5 vH" and
 * „Nach Abs. 3 sind 500 Euro zu zahlen" were substantive before and are
 * substantive now.
 */
function citationAdjacent(segments: readonly LawDiffSegment[], i: number): boolean {
  let before = i - 1
  while (before >= 0 && segments[before]!.type !== 'equal') before--
  let after = i + 1
  while (after < segments.length && segments[after]!.type !== 'equal') after++
  const anchor = before >= 0 ? numberRunAnchor(segments[before]!.text) : null
  const firstAfter = after < segments.length ? segments[after]!.text.trim().split(/\s+/).slice(0, 1) : []
  return [anchor, ...firstAfter].some((t) => t !== null && classifyToken(t) === 'citation')
}

/** The last token of an equal piece that is not itself part of the number run — "§§" in "nach den §§ 1". */
function numberRunAnchor(text: string): string | null {
  const words = text.trim().split(/\s+/).filter(Boolean)
  for (let k = words.length - 1; k >= 0; k--) {
    const cls = classifyToken(words[k]!)
    if (cls === 'number' || cls === 'placeholder' || cls === 'punct') continue
    return words[k]!
  }
  return null
}
