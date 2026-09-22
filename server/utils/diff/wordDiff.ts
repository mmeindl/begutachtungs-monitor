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
 * are measured decisions (`refactor-plan.md` §9).
 */
import type { LawDiffSegment } from '../../../shared/types'
import { normalizeText } from '../lawText'

/** Above this many token pairs the word-level diff is skipped (O(n·m) memory). */
const MAX_DP_CELLS = 2_500_000

// ---------------------------------------------------------------------------
// Token diff (LCS)
// ---------------------------------------------------------------------------

function tokens(t: string): string[] {
  return normalizeText(t).split(' ').filter(Boolean)
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
// Numbers, letter-suffixed numbers, dates, BGBl numbers, roman numerals, and single letters (lit. a, lit. b).
const NUMBER_RE = /^\(?\d+[a-z]?\.?\)?$|^\d{1,2}\.\d{1,2}\.\d{4}$|^\d+\/\d+$|^[ivxlc]+\.?$|^[a-z]\)?\.?$/i
const PUNCT_RE = /^[\p{P}\p{S}]+$/u

type TokenClass = 'number' | 'placeholder' | 'citation' | 'connective' | 'punct' | 'word'

/** The quotes and brackets a token carries into the diff are not part of it. */
function bare(raw: string): string {
  return raw.replace(/^[„“"'(]+|[„“"'),;:]+$/g, '').toLowerCase()
}

/**
 * A value the draft left open for a later stage to fill in: "(xx)", "XX",
 * "20xx" — and "xxx/2025", the form a Fundstelle takes. Two x's or an x next
 * to digits; a lone "X" is either a roman numeral or a genuine blank ("X
 * Wochen"), where naming the number is a decision, not typesetting.
 *
 * DER SCHRÄGSTRICH KAM AM 19.09.2026 DAZU, und er fehlte an der teuersten
 * Stelle. Jedes Gesetz zitiert sich in seiner Inkrafttretens-Bestimmung
 * selbst — „in der Fassung des Bundesgesetzes BGBl. I Nr. xxx/2025" —, und
 * die Nummer steht erst mit der Kundmachung fest. Ohne den Schrägstrich fiel
 * „xxx/2025" durch jede Klasse bis auf `word`, und ein `word` beendet
 * `isEditorialChange` sofort: Der Vergleich Plenarfassung → Kundmachung
 * meldete daraufhin 136 von 626 Einheiten als inhaltlich geändert
 * (Budgetbegleitgesetz 2025), wo nur die eigene Fundstelle eingesetzt wurde.
 */
function isPlaceholder(raw: string): boolean {
  // Satzzeichen am Ende gehören dem Satz, nicht der Zahl: „xxx/2025." steht
  // am Ende einer Inkrafttretens-Bestimmung, und `bare` räumt zwar
  // Anführungszeichen weg, den Punkt davor aber nicht.
  const t = raw.replace(/[.,;:]+$/, '')
  if (!/^[x\d]+(?:\/[x\d]+)?$/i.test(t)) return false
  const xs = (t.match(/x/gi) ?? []).length
  return xs >= 2 || (xs === 1 && /\d/.test(t))
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
 * True when every inserted or removed piece is citation, number, date or
 * punctuation. A piece made of connectives alone ("und" → "oder") is a real
 * change; a piece with any ordinary word is a real change.
 */
export function isEditorialChange(segments: readonly LawDiffSegment[] | null): boolean {
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
    // A bare number is a reference only next to a citation word ("Abs. 6" → "Abs. 4");
    // "6 Wochen" → "4 Wochen" is a real change. Dates, and numbers that replace a
    // placeholder, are always formatting.
    if (classes.includes('number') && !classes.includes('citation')) {
      const isDate = tokens.some((t) => /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(t))
      if (!isDate && !citationAdjacent(segments, i) && !fillsPlaceholder(segments, i)) return false
    }
  }
  return sawChange
}

/** "(xx)" → "(69)": is the piece on the other side of this change the placeholder it replaces? */
function fillsPlaceholder(segments: readonly LawDiffSegment[], i: number): boolean {
  return [segments[i - 1], segments[i + 1]].some((s) => {
    if (!s || s.type === 'equal') return false
    return s.text.split(/\s+/).filter(Boolean).some((t) => classifyToken(t) === 'placeholder')
  })
}

/** Does the equal text around a changed piece end or start with a citation word? Looks past a sibling change ("6" removed, "4" inserted). */
function citationAdjacent(segments: readonly LawDiffSegment[], i: number): boolean {
  let before = i - 1
  while (before >= 0 && segments[before]!.type !== 'equal') before--
  let after = i + 1
  while (after < segments.length && segments[after]!.type !== 'equal') after++
  const lastBefore = before >= 0 ? segments[before]!.text.trim().split(/\s+/).slice(-2) : []
  const firstAfter = after < segments.length ? segments[after]!.text.trim().split(/\s+/).slice(0, 1) : []
  return [...lastBefore, ...firstAfter].some((t) => classifyToken(t) === 'citation')
}
