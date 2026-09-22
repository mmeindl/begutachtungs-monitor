/**
 * Comparison of two versions of one law text at § level (docs/ris-join.md §6).
 *
 * PURE MODULE — relative imports only.
 *
 * Generic over two unit lists, `from` (the earlier version) and `to` (the
 * later one). It was written for Ministerialentwurf → Regierungsvorlage and
 * named after that pair until the station selector shipped
 * (docs/architecture.md §12.18); nothing in the algorithm ever depended on
 * which two stations they are, and the Ausschuss- and Plenarfassung come off
 * the same Word legistics template.
 *
 * Alignment is the whole difficulty. Never by § number alone: in the EABG
 * chain the Regierungsvorlage inserted two paragraphs and a by-number diff
 * marked 41 of 45 shifted paragraphs as "changed". Order of alignment:
 *   0. articles: by the law they name (draft "Änderung des UStG 1994" vs
 *      bill "Bundesgesetz, mit dem das UStG 1994 geändert wird"), then by
 *      article number; units only pair within paired articles
 *   1. same article + same heading (unique on both sides) — for a Ziffer the
 *      heading is its instruction line, so renumbered Ziffern pair too
 *   2. same article + same id, when at least one side has no heading
 *   3. remaining units of the same article by text similarity ≥ 0.6
 * Everything left is inserted (later side only) or removed (earlier side only).
 */
import type { LawDiffSegment, LawDiffUnit, LawPackageEntry, LawUnitChange } from '../../shared/types'
import { compareKey, normalizeText, type LawUnit } from './lawText'
import { articleNameTokens, jaccardSimilarity } from './lawtext/lawNames'

/** Above this many token pairs the word-level diff is skipped (O(n·m) memory). */
const MAX_DP_CELLS = 2_500_000

// ---------------------------------------------------------------------------
// Token diff (LCS)
// ---------------------------------------------------------------------------

function tokens(t: string): string[] {
  return normalizeText(t).split(' ').filter(Boolean)
}

interface TokenDiff {
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

function bagSimilarity(a: string[], b: string[]): number {
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
// Article pairing
// ---------------------------------------------------------------------------

interface ArticleRef {
  article: string | null
  number: string | null
}

function distinctArticles(units: readonly LawUnit[]): ArticleRef[] {
  const seen = new Set<string>()
  const out: ArticleRef[] = []
  for (const u of units) {
    const k = u.article ?? ''
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ article: u.article, number: u.articleNumber })
  }
  return out
}

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
/**
 * Earlier article → later article, so that differently titled articles about
 * the same law compare with each other. Returns the canonical (later) article
 * title per earlier article title.
 */
export function pairArticles(from: readonly LawUnit[], to: readonly LawUnit[]): Map<string | null, string | null> {
  const fromArts = distinctArticles(from)
  const toArts = distinctArticles(to)
  const map = new Map<string | null, string | null>()
  const usedTo = new Set<ArticleRef>()
  if (fromArts.length === 1 && toArts.length === 1) {
    map.set(fromArts[0]!.article, toArts[0]!.article)
    return map
  }
  const scored: { m: ArticleRef; r: ArticleRef; s: number }[] = []
  for (const m of fromArts) {
    const mt = articleNameTokens(m.article)
    for (const r of toArts) scored.push({ m, r, s: jaccardSimilarity(mt, articleNameTokens(r.article)) })
  }
  scored.sort((x, y) => y.s - x.s)
  for (const { m, r, s } of scored) {
    if (s < 0.5 || map.has(m.article) || usedTo.has(r)) continue
    map.set(m.article, r.article)
    usedTo.add(r)
  }
  for (const m of fromArts) {
    if (map.has(m.article) || !m.number) continue
    const r = toArts.find((x) => !usedTo.has(x) && x.number === m.number)
    if (r) {
      map.set(m.article, r.article)
      usedTo.add(r)
    }
  }
  return map
}

// ---------------------------------------------------------------------------
// Alignment
// ---------------------------------------------------------------------------

/** Units keyed by the canonical article so both sides use the later side's title. */
function canonical(units: readonly LawUnit[], map: Map<string | null, string | null>, isFrom: boolean): LawUnit[] {
  if (!isFrom) return [...units]
  return units.map((u) => {
    if (!map.has(u.article)) return { ...u, article: `${u.article ?? ''}\u0000unpaired` }
    return { ...u, article: map.get(u.article) ?? null }
  })
}

const headingKey = (u: LawUnit) => (u.heading ? `${u.article ?? ''}|${compareKey(u.heading).toLowerCase()}` : null)
const idKey = (u: LawUnit) => `${u.article ?? ''}|${u.id}`

function uniqueIndex<T>(items: readonly T[], keyOf: (t: T) => string | null): Map<string, T> {
  const seen = new Map<string, T | null>()
  for (const it of items) {
    const k = keyOf(it)
    if (k === null) continue
    seen.set(k, seen.has(k) ? null : it)
  }
  const out = new Map<string, T>()
  for (const [k, v] of seen) if (v) out.set(k, v)
  return out
}

export interface Alignment {
  pairs: { from: LawUnit; to: LawUnit }[]
  onlyFrom: LawUnit[]
  onlyTo: LawUnit[]
}

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
export function alignUnits(fromUnits: readonly LawUnit[], to: readonly LawUnit[]): Alignment {
  const articleMap = pairArticles(fromUnits, to)
  const fromCanonical = canonical(fromUnits, articleMap, true)
  // Alignment works on canonical copies; results are mapped back to the originals.
  const original = new Map(fromCanonical.map((c, i) => [c, fromUnits[i]!]))
  const from = fromCanonical
  const pairs: { from: LawUnit; to: LawUnit }[] = []
  const pairedFrom = new Set<LawUnit>()
  const pairedTo = new Set<LawUnit>()
  const pair = (a: LawUnit, b: LawUnit) => {
    pairs.push({ from: a, to: b })
    pairedFrom.add(a)
    pairedTo.add(b)
  }

  // 1. heading
  const toByHeading = uniqueIndex(to, headingKey)
  const fromByHeading = uniqueIndex(from, headingKey)
  for (const u of from) {
    const k = headingKey(u)
    if (!k || !fromByHeading.has(k)) continue
    const partner = toByHeading.get(k)
    if (partner && !pairedTo.has(partner)) pair(u, partner)
  }

  // 2. id, only when a heading could not decide
  const toById = uniqueIndex(to, idKey)
  for (const u of from) {
    if (pairedFrom.has(u)) continue
    const partner = toById.get(idKey(u))
    if (!partner || pairedTo.has(partner)) continue
    if (u.heading && partner.heading) continue // both headed, headings differ → not the same §
    // Unheaded units (Novellierungsanordnungen) renumber too: the same Z
    // number must also look alike, else step 3 decides by similarity.
    if (diffTokens(u.text, partner.text).similarity < 0.5) continue
    pair(u, partner)
  }

  // 3. similarity within the article
  const restFrom = from.filter((u) => !pairedFrom.has(u))
  const restTo = to.filter((u) => !pairedTo.has(u))
  const candidates: { from: LawUnit; to: LawUnit; s: number }[] = []
  for (const a of restFrom) {
    for (const b of restTo) {
      if ((a.article ?? '') !== (b.article ?? '')) continue
      const s = diffTokens(a.text, b.text).similarity
      if (s >= 0.6) candidates.push({ from: a, to: b, s })
    }
  }
  candidates.sort((x, y) => y.s - x.s)
  for (const c of candidates) {
    if (pairedFrom.has(c.from) || pairedTo.has(c.to)) continue
    pair(c.from, c.to)
  }

  return {
    pairs: pairs.map((p) => ({ from: original.get(p.from)!, to: p.to })),
    onlyFrom: from.filter((u) => !pairedFrom.has(u)).map((u) => original.get(u)!),
    onlyTo: to.filter((u) => !pairedTo.has(u)),
  }
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

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

/** The quoted § headings as one label; three is already a mouthful. */
function quotedHeadingOf(u: LawUnit | null): string | null {
  const heads = u?.quotedHeadings ?? []
  if (!heads.length) return null
  return heads.length > 2 ? `${heads.slice(0, 2).join(' · ')} · …` : heads.join(' · ')
}

function toUnit(change: LawUnitChange, from: LawUnit | null, to: LawUnit | null, diff: TokenDiff | null): LawDiffUnit {
  const ref = to ?? from!
  return {
    article: ref.article,
    id: ref.id,
    fromId: from?.id ?? null,
    heading: to?.heading ?? from?.heading ?? null,
    quotedHeading: quotedHeadingOf(to) ?? quotedHeadingOf(from),
    change,
    editorial: change === 'changed' && isEditorialChange(diff?.segments ?? null),
    fromText: from?.text ?? null,
    toText: to?.text ?? null,
    segments: diff?.segments ?? null,
  }
}

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
/**
 * Units of both texts → one list in reading order of the LATER version, with
 * removed units placed where they stood in the earlier one.
 */
export function diffLawUnits(from: readonly LawUnit[], to: readonly LawUnit[]): LawDiffUnit[] {
  const { pairs, onlyFrom, onlyTo } = alignUnits(from, to)
  const toPartner = new Map(pairs.map((p) => [p.to, p.from]))
  const removedSet = new Set(onlyFrom)
  const insertedSet = new Set(onlyTo)
  const out: LawDiffUnit[] = []
  let fromCursor = 0

  const flushRemovedBefore = (fromUnit: LawUnit | null) => {
    const stop = fromUnit ? from.indexOf(fromUnit) : from.length
    while (fromCursor < stop) {
      const u = from[fromCursor++]!
      if (removedSet.has(u)) out.push(toUnit('removed', u, null, null))
    }
    if (fromUnit) fromCursor = Math.max(fromCursor, stop + 1)
  }

  for (const r of to) {
    if (insertedSet.has(r)) {
      out.push(toUnit('inserted', null, r, null))
      continue
    }
    const m = toPartner.get(r)!
    flushRemovedBefore(m)
    if (compareKey(m.text) === compareKey(r.text)) {
      out.push(toUnit('unchanged', m, r, null))
    } else {
      out.push(toUnit('changed', m, r, diffTokens(m.text, r.text)))
    }
  }
  flushRemovedBefore(null)
  return out
}

export interface LawPackageDiff {
  units: LawDiffUnit[]
  lawsOnlyInTo: LawPackageEntry[]
  lawsOnlyInFrom: LawPackageEntry[]
}

/** Units of articles the other side does not have, counted per law. */
function lawsOf(units: readonly LawUnit[], keep: (article: string) => boolean): LawPackageEntry[] {
  const counts = new Map<string, number>()
  for (const u of units) {
    if (u.article === null || keep(u.article)) continue
    counts.set(u.article, (counts.get(u.article) ?? 0) + 1)
  }
  return [...counts].map(([article, n]) => ({ article, units: n }))
}

/**
 * The comparison, scoped to the laws both documents carry.
 *
 * A Sammelgesetz breaks the unit-by-unit reading: 22/ME is the Bundeskanzleramt's
 * three articles, its Regierungsvorlage merges every ministry's IFG draft into
 * 138. Diffed unit by unit that reports 98 % of the bill as new — true of the
 * bill, false of the ministry, and read as a verdict on the draft it is simply
 * wrong. Ten of the 90 comparable GP XXVIII drafts sit above 83 % that way.
 * The same applies to the later stations, where a committee can merge one
 * Vorlage into another.
 *
 * So laws only one side carries leave the § list and are named as what they
 * are: a package that grew or shrank. That keeps the fact (the bill added or
 * dropped a law) and drops the false precision (600 paragraphs "new").
 * Units without an article always stay in the comparison, and when no article
 * pairs at all the scoping is skipped — an empty comparison helps nobody.
 */
export function diffLawPackage(from: readonly LawUnit[], to: readonly LawUnit[]): LawPackageDiff {
  const map = pairArticles(from, to)
  if (map.size === 0) return { units: diffLawUnits(from, to), lawsOnlyInTo: [], lawsOnlyInFrom: [] }
  const pairedFrom = new Set(map.keys())
  const pairedTo = new Set(map.values())
  const keepFrom = (u: LawUnit) => u.article === null || pairedFrom.has(u.article)
  const keepTo = (u: LawUnit) => u.article === null || pairedTo.has(u.article)
  return {
    units: diffLawUnits(from.filter(keepFrom), to.filter(keepTo)),
    lawsOnlyInTo: lawsOf(to, (a) => pairedTo.has(a)),
    lawsOnlyInFrom: lawsOf(from, (a) => pairedFrom.has(a)),
  }
}

export function summarizeDiff(units: readonly LawDiffUnit[]): Record<LawUnitChange, number> & { total: number; editorial: number } {
  const s = { total: units.length, unchanged: 0, changed: 0, editorial: 0, inserted: 0, removed: 0 }
  for (const u of units) {
    s[u.change]++
    if (u.editorial) s.editorial++
  }
  return s
}
