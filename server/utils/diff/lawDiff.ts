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
import type { LawDiffUnit, LawPackageEntry, LawUnitChange } from '../../../shared/types'
import type { LawUnit } from '../lawtext/lawUnits'
import { compareKey } from '../lawtext/normalize'
import { articleNameTokens, jaccardSimilarity } from '../lawtext/lawNames'
import { bareParaId } from '../text/designation'
import { diffTokens, isAddressOnlyDifference, isEditorialChange, tokenSimilarity, type TokenDiff } from './wordDiff'

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

/**
 * A Novellierungsanordnung, by the id `lawUnits.ts` builds for one (`Z${n}`).
 *
 * Not by `heading === null`, which would select the opposite set: an
 * instruction unit always carries a heading, because its heading IS its
 * instruction line („§ 6 Abs. 1 Z 9 lautet"), while a § of a Stammgesetz is
 * the thing that can come without one. Measured on 74/ME: 0 of 521 units on
 * the draft side and 0 of 483 on the bill side have a null heading.
 */
function isInstruction(u: LawUnit): boolean {
  return /^Z\d/.test(u.id)
}

/**
 * Two instructions off the same template whose ONLY difference is the
 * provision they address are not the same instruction.
 *
 * 74/ME is the shape: „§ 63 entfällt samt Überschrift." (ME Z127) and „§ 4a
 * entfällt samt Überschrift." (RV Z50) share every word, so step 3 paired
 * them at similarity 0,86 and the comparison then reported the two § numbers
 * as a changed reference — a Regierungsvorlage that deleted a different
 * paragraph, shown as an editorial touch-up of one that it deleted too.
 *
 * Refused for instructions only, and only in the two steps that decide
 * WITHOUT the heading: step 1 pairs on the instruction line itself and is
 * therefore already right. A refused pair costs one removed plus one
 * inserted unit, which is what the documents say.
 */
function addressOnlyPair(a: LawUnit, b: LawUnit): boolean {
  if (!isInstruction(a) || !isInstruction(b)) return false
  return isAddressOnlyDifference(diffTokens(a.text, b.text).segments)
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
    // Units the heading could not decide renumber too: the same id must also
    // look alike, else step 3 decides by similarity.
    if (tokenSimilarity(u.text, partner.text, 0.5) < 0.5) continue
    if (addressOnlyPair(u, partner)) continue
    pair(u, partner)
  }

  // 3. similarity within the article
  const restFrom = from.filter((u) => !pairedFrom.has(u))
  const restTo = to.filter((u) => !pairedTo.has(u))
  const candidates: { from: LawUnit; to: LawUnit; s: number }[] = []
  for (const a of restFrom) {
    for (const b of restTo) {
      if ((a.article ?? '') !== (b.article ?? '')) continue
      const s = tokenSimilarity(a.text, b.text, 0.6)
      if (s >= 0.6) candidates.push({ from: a, to: b, s })
    }
  }
  candidates.sort((x, y) => y.s - x.s)
  for (const c of candidates) {
    if (pairedFrom.has(c.from) || pairedTo.has(c.to)) continue
    // Checked here and not while scoring: the word diff is the expensive
    // half, and only a candidate that is about to be taken needs it. A
    // refused one leaves both units free for a later candidate.
    if (addressOnlyPair(c.from, c.to)) continue
    pair(c.from, c.to)
  }

  return {
    pairs: pairs.map((p) => ({ from: original.get(p.from)!, to: p.to })),
    onlyFrom: from.filter((u) => !pairedFrom.has(u)).map((u) => original.get(u)!),
    onlyTo: to.filter((u) => !pairedTo.has(u)),
  }
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

/**
 * Which § of the earlier version is which § of the later one, per article —
 * the renumbering THIS comparison established, and the only kind
 * `isEditorialChange` may credit a moved reference to.
 *
 * Paragraphs only. A Novellierungsanordnung renumbers too (74/ME moves 394 of
 * 399 instructions), but no reference in a law text points at the instruction
 * list, so putting „Z 5 → Z 6" in the map would explain a changed „Abs. 5"
 * with a coincidence. Keyed by the LATER article, because that is the article
 * a paired unit reports (`toUnit`).
 */
function renumberedParagraphs(pairs: readonly { from: LawUnit; to: LawUnit }[]): Map<string, ReadonlyMap<string, string>> {
  const byArticle = new Map<string, Map<string, string>>()
  for (const p of pairs) {
    if (!p.from.id.startsWith('§') || !p.to.id.startsWith('§')) continue
    const before = bareParaId(p.from.id)
    const after = bareParaId(p.to.id)
    if (!before || !after || before === after) continue
    const key = p.to.article ?? ''
    let map = byArticle.get(key)
    if (!map) byArticle.set(key, (map = new Map()))
    map.set(before, after)
  }
  return byArticle
}

function toUnit(change: LawUnitChange, from: LawUnit | null, to: LawUnit | null, diff: TokenDiff | null, renumbered?: ReadonlyMap<string, string>): LawDiffUnit {
  const ref = to ?? from!
  return {
    article: ref.article,
    id: ref.id,
    fromId: from?.id ?? null,
    heading: to?.heading ?? from?.heading ?? null,
    quotedHeading: quotedHeadingOf(to) ?? quotedHeadingOf(from),
    change,
    editorial: change === 'changed' && isEditorialChange(diff?.segments ?? null, { renumbered }),
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
  const renumbered = renumberedParagraphs(pairs)
  const removedSet = new Set(onlyFrom)
  const insertedSet = new Set(onlyTo)
  const out: LawDiffUnit[] = []
  let fromCursor = 0
  // The position of every earlier unit, looked up once instead of scanned per
  // paired unit. First occurrence wins, exactly as `indexOf` decided.
  const fromIndex = new Map<LawUnit, number>()
  for (const [i, u] of from.entries()) if (!fromIndex.has(u)) fromIndex.set(u, i)

  const flushRemovedBefore = (fromUnit: LawUnit | null) => {
    const stop = fromUnit ? (fromIndex.get(fromUnit) ?? -1) : from.length
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
      out.push(toUnit('changed', m, r, diffTokens(m.text, r.text), renumbered.get(r.article ?? '')))
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
