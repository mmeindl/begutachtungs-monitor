/**
 * ME → RV comparison at § level (docs/ris-join.md §6).
 *
 * PURE MODULE — relative imports only.
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
 * Everything left is inserted (RV only) or removed (ME only).
 */
import type { LawDiffSegment, LawDiffUnit, LawPackageEntry, LawUnitChange } from '../../shared/types'
import { compareKey, normalizeText, type LawUnit } from './lawText'

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

// A Set, not a \b regex: JavaScript word boundaries are ASCII-only, "änderung" would survive.
const ARTICLE_BOILERPLATE = new Set(
  'bundesgesetz bundesverfassungsgesetz mit dem der das die des und sowie geändert geaendert wird werden änderung aenderung novelle artikel erlassen aufgehoben ein eine eines über ueber'.split(
    ' ',
  ),
)

/** Token set naming the law an article is about, stemmed, boilerplate removed. */
export function lawNameTokens(title: string | null): Set<string> {
  const t = normalizeText(title ?? '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[„“"'(),;:.\-–]/g, ' ')
  const out = new Set<string>()
  for (const raw of t.split(/\s+/)) {
    if (!raw || ARTICLE_BOILERPLATE.has(raw) || (raw.length < 3 && !/^\d+$/.test(raw))) continue
    out.add(raw.replace(/(gesetz|buch|ordnung|statut|vertrag)es$/, '$1').replace(/(gesetz|buch)s$/, '$1'))
  }
  return out
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

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

/**
 * ME article → RV article, so that differently titled articles about the
 * same law compare with each other. Returns the canonical (RV) article title
 * per ME article title.
 */
export function pairArticles(me: readonly LawUnit[], rv: readonly LawUnit[]): Map<string | null, string | null> {
  const meArts = distinctArticles(me)
  const rvArts = distinctArticles(rv)
  const map = new Map<string | null, string | null>()
  const usedRv = new Set<ArticleRef>()
  if (meArts.length === 1 && rvArts.length === 1) {
    map.set(meArts[0]!.article, rvArts[0]!.article)
    return map
  }
  const scored: { m: ArticleRef; r: ArticleRef; s: number }[] = []
  for (const m of meArts) {
    const mt = lawNameTokens(m.article)
    for (const r of rvArts) scored.push({ m, r, s: jaccard(mt, lawNameTokens(r.article)) })
  }
  scored.sort((x, y) => y.s - x.s)
  for (const { m, r, s } of scored) {
    if (s < 0.5 || map.has(m.article) || usedRv.has(r)) continue
    map.set(m.article, r.article)
    usedRv.add(r)
  }
  for (const m of meArts) {
    if (map.has(m.article) || !m.number) continue
    const r = rvArts.find((x) => !usedRv.has(x) && x.number === m.number)
    if (r) {
      map.set(m.article, r.article)
      usedRv.add(r)
    }
  }
  return map
}

// ---------------------------------------------------------------------------
// Alignment
// ---------------------------------------------------------------------------

/** Units keyed by the canonical article so both sides use the RV's title. */
function canonical(units: readonly LawUnit[], map: Map<string | null, string | null>, isMe: boolean): LawUnit[] {
  if (!isMe) return [...units]
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
  pairs: { me: LawUnit; rv: LawUnit }[]
  onlyMe: LawUnit[]
  onlyRv: LawUnit[]
}

export function alignUnits(meUnits: readonly LawUnit[], rv: readonly LawUnit[]): Alignment {
  const articleMap = pairArticles(meUnits, rv)
  const meCanonical = canonical(meUnits, articleMap, true)
  // Alignment works on canonical copies; results are mapped back to the originals.
  const original = new Map(meCanonical.map((c, i) => [c, meUnits[i]!]))
  const me = meCanonical
  const pairs: { me: LawUnit; rv: LawUnit }[] = []
  const pairedMe = new Set<LawUnit>()
  const pairedRv = new Set<LawUnit>()
  const pair = (a: LawUnit, b: LawUnit) => {
    pairs.push({ me: a, rv: b })
    pairedMe.add(a)
    pairedRv.add(b)
  }

  // 1. heading
  const rvByHeading = uniqueIndex(rv, headingKey)
  const meByHeading = uniqueIndex(me, headingKey)
  for (const u of me) {
    const k = headingKey(u)
    if (!k || !meByHeading.has(k)) continue
    const partner = rvByHeading.get(k)
    if (partner && !pairedRv.has(partner)) pair(u, partner)
  }

  // 2. id, only when a heading could not decide
  const rvById = uniqueIndex(rv, idKey)
  for (const u of me) {
    if (pairedMe.has(u)) continue
    const partner = rvById.get(idKey(u))
    if (!partner || pairedRv.has(partner)) continue
    if (u.heading && partner.heading) continue // both headed, headings differ → not the same §
    // Unheaded units (Novellierungsanordnungen) renumber too: the same Z
    // number must also look alike, else step 3 decides by similarity.
    if (diffTokens(u.text, partner.text).similarity < 0.5) continue
    pair(u, partner)
  }

  // 3. similarity within the article
  const restMe = me.filter((u) => !pairedMe.has(u))
  const restRv = rv.filter((u) => !pairedRv.has(u))
  const candidates: { me: LawUnit; rv: LawUnit; s: number }[] = []
  for (const a of restMe) {
    for (const b of restRv) {
      if ((a.article ?? '') !== (b.article ?? '')) continue
      const s = diffTokens(a.text, b.text).similarity
      if (s >= 0.6) candidates.push({ me: a, rv: b, s })
    }
  }
  candidates.sort((x, y) => y.s - x.s)
  for (const c of candidates) {
    if (pairedMe.has(c.me) || pairedRv.has(c.rv)) continue
    pair(c.me, c.rv)
  }

  return {
    pairs: pairs.map((p) => ({ me: original.get(p.me)!, rv: p.rv })),
    onlyMe: me.filter((u) => !pairedMe.has(u)).map((u) => original.get(u)!),
    onlyRv: rv.filter((u) => !pairedRv.has(u)),
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
 * A value the draft left open for the Regierungsvorlage to fill in: "(xx)", "XX",
 * "20xx". Two x's or an x next to digits — a lone "X" is either a roman numeral or
 * a genuine blank ("X Wochen"), where naming the number is a decision, not typesetting.
 */
function isPlaceholder(t: string): boolean {
  if (!/^[x\d]+$/i.test(t)) return false
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

function toUnit(change: LawUnitChange, me: LawUnit | null, rv: LawUnit | null, diff: TokenDiff | null): LawDiffUnit {
  const ref = rv ?? me!
  return {
    article: ref.article,
    id: ref.id,
    meId: me?.id ?? null,
    heading: rv?.heading ?? me?.heading ?? null,
    change,
    editorial: change === 'changed' && isEditorialChange(diff?.segments ?? null),
    similarity: diff ? Math.round(diff.similarity * 1000) / 1000 : null,
    meText: me?.text ?? null,
    rvText: rv?.text ?? null,
    segments: diff?.segments ?? null,
  }
}

/**
 * Units of both texts → one list in reading order of the Regierungsvorlage,
 * with removed units placed where they stood in the draft.
 */
export function diffLawUnits(me: readonly LawUnit[], rv: readonly LawUnit[]): LawDiffUnit[] {
  const { pairs, onlyMe, onlyRv } = alignUnits(me, rv)
  const rvPartner = new Map(pairs.map((p) => [p.rv, p.me]))
  const removedSet = new Set(onlyMe)
  const insertedSet = new Set(onlyRv)
  const out: LawDiffUnit[] = []
  let meCursor = 0

  const flushRemovedBefore = (meUnit: LawUnit | null) => {
    const stop = meUnit ? me.indexOf(meUnit) : me.length
    while (meCursor < stop) {
      const u = me[meCursor++]!
      if (removedSet.has(u)) out.push(toUnit('removed', u, null, null))
    }
    if (meUnit) meCursor = Math.max(meCursor, stop + 1)
  }

  for (const r of rv) {
    if (insertedSet.has(r)) {
      out.push(toUnit('inserted', null, r, null))
      continue
    }
    const m = rvPartner.get(r)!
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
  lawsOnlyInRv: LawPackageEntry[]
  lawsOnlyInMe: LawPackageEntry[]
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
 *
 * So laws only one side carries leave the § list and are named as what they
 * are: a package that grew or shrank. That keeps the fact (the bill added or
 * dropped a law) and drops the false precision (600 paragraphs "new").
 * Units without an article always stay in the comparison, and when no article
 * pairs at all the scoping is skipped — an empty comparison helps nobody.
 */
export function diffLawPackage(me: readonly LawUnit[], rv: readonly LawUnit[]): LawPackageDiff {
  const map = pairArticles(me, rv)
  if (map.size === 0) return { units: diffLawUnits(me, rv), lawsOnlyInRv: [], lawsOnlyInMe: [] }
  const pairedMe = new Set(map.keys())
  const pairedRv = new Set(map.values())
  const keepMe = (u: LawUnit) => u.article === null || pairedMe.has(u.article)
  const keepRv = (u: LawUnit) => u.article === null || pairedRv.has(u.article)
  return {
    units: diffLawUnits(me.filter(keepMe), rv.filter(keepRv)),
    lawsOnlyInRv: lawsOf(rv, (a) => pairedRv.has(a)),
    lawsOnlyInMe: lawsOf(me, (a) => pairedMe.has(a)),
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
