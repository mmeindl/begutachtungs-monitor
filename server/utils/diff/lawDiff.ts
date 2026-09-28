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
import { compareKey, normalizeText } from '../lawtext/normalize'
import { articleNameTokens, jaccardSimilarity } from '../lawtext/lawNames'
import { bareParaId, leadingArticleKey } from '../text/designation'
import { addressedParagraph } from '../lawtext/instructionAddress'
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
  return new Map(articlePairs(from, to).map((p) => [p.from, p.to]))
}

/** Which rule made a pair — the measured surface of `pairArticles` (`scripts/corpus/aenderungsrate.ts --pairs`). */
export type ArticlePairVia = 'only' | 'title' | 'contained' | 'number' | 'addressed'

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
/** `pairArticles` with the rule behind each pair, in the order the pairs were made. */
export function articlePairs(from: readonly LawUnit[], to: readonly LawUnit[]): { from: string | null; to: string | null; via: ArticlePairVia }[] {
  const fromArts = distinctArticles(from)
  const toArts = distinctArticles(to)
  const map = new Map<string | null, string | null>()
  const via = new Map<string | null, ArticlePairVia>()
  const usedTo = new Set<ArticleRef>()
  const result = () => [...map].map(([f, t]) => ({ from: f, to: t, via: via.get(f)! }))
  if (fromArts.length === 1 && toArts.length === 1) {
    map.set(fromArts[0]!.article, toArts[0]!.article)
    via.set(fromArts[0]!.article, 'only')
    return result()
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
    via.set(m.article, 'title')
    usedTo.add(r)
  }
  // Second, the law named INSIDE the other title (27.09.2026). A draft without
  // Artikel carries its whole title — „Bundesgesetz, mit dem das
  // Einkommensteuergesetz 1988 geändert wird (Teuerungs-Entlastungspaket
  // Teil II)" — and the package name drags the similarity under 0,5 against
  // „Änderung des Einkommensteuergesetzes 1988" (XXVII 216/ME: 0,40). The
  // shorter name contained in the longer one is the evidence then, and only
  // where exactly one candidate has it: a draft naming two laws the Vorlage
  // splits into two Artikel („… das Fern- und Auswärtsgeschäfte-Gesetz und
  // das Konsumentenschutzgesetz …", 169/ME) is one text for two Artikel,
  // which no pairing of one to one describes. That case does not always show
  // as two candidates: 85/ME names its second law by its long title („… und
  // das Bundesgesetz über die äußeren Rechtsverhältnisse islamischer
  // Religionsgesellschaften geändert werden"), the Vorlage by its short one
  // („Islamgesetz 2015"), and the first attempt paired the whole draft with
  // the first law — the page would have called the second one „nur in der
  // Regierungsvorlage". So a title that names several laws, or units whose
  // numbering starts over, never pair this way.
  for (const m of fromArts) {
    if (map.has(m.article) || namesSeveralLaws(m.article, from)) continue
    const mt = articleNameTokens(m.article)
    if (mt.size === 0) continue
    const candidates = toArts.filter((r) => !usedTo.has(r) && containment(mt, articleNameTokens(r.article)) >= CONTAINED_AT)
    if (candidates.length !== 1) continue
    map.set(m.article, candidates[0]!.article)
    via.set(m.article, 'contained')
    usedTo.add(candidates[0]!)
  }
  // Third, the Artikel number — but only where the §§ agree (27.09.2026).
  // Measured over GP XXVI–XXVIII (`aenderungsrate.ts --pairs`): this rule made
  // 50 pairs, and half were two different laws that happened to share a
  // number after the Vorlage renumbered — Einkommensteuergesetz against
  // Freiberuflichen-Sozialversicherungsgesetz (XXVIII 103/ME), StGB against
  // Finanzstrafgesetz (XXVII 99/ME). What separates them is what the
  // Novellierungsanordnungen address: every one of the wrong pairs overlaps
  // 0–50 % in its §§, every right one (a law spelled differently — ABGB,
  // „Gewerbeordung", „Referenzwerte-Vollzugsgesetz" against
  // „ReferenzwerteVollzugsgesetz") 100 %; pairs the title made, 100 % at p10.
  // So the number counts only with the §§ behind it, or where neither side
  // addresses any (two new laws). It runs after the containment pass,
  // because it used to take the Artikel that pass needs (XXVI 76/ME: GSVG).
  for (const m of fromArts) {
    if (map.has(m.article) || !m.number) continue
    const r = toArts.find((x) => !usedTo.has(x) && x.number === m.number)
    if (r && numberHolds(m, r, addressesOf(from, m.article), addressesOf(to, r.article))) {
      map.set(m.article, r.article)
      via.set(m.article, 'number')
      usedTo.add(r)
    }
  }
  // Fourth, two signals at once, for what is still unpaired: the §§ agree
  // AND the law's name agrees as a string once spacing and hyphens are
  // ignored. Either alone is not enough — articles of parallel laws (ASVG,
  // GSVG, BSVG) share §§ by chance in 0,4–5 % of the measured cases, and a
  // name alone is what the title pass already asked. Together they catch a
  // title broken by a stray space („Einkommensteuergese tzes", 103/ME) and a
  // law under its long name („Bundesgesetz über Krankenanstalten und
  // Kuranstalten", 20/ME), which otherwise would be called absent from the
  // Vorlage while it stands there.
  for (const m of fromArts) {
    if (map.has(m.article) || namesSeveralLaws(m.article, from)) continue
    const mine = addressesOf(from, m.article)
    if (mine.size < 2) continue
    const candidates = toArts.filter((r) => {
      if (usedTo.has(r)) return false
      const theirs = addressesOf(to, r.article)
      return theirs.size >= 2 && overlapOf(mine, theirs) >= SAME_ADDRESSES_AT && sameCompactName(m.article, r.article)
    })
    if (candidates.length !== 1) continue
    map.set(m.article, candidates[0]!.article)
    via.set(m.article, 'addressed')
    usedTo.add(candidates[0]!)
  }
  return result()
}

/**
 * One Artikel title that is really several: the plural of the template
 * („… geändert werden"), a second law joined by „und das/die/der", or a
 * Ziffer number that occurs twice among the article's units (the numbering
 * starts over at the next law, which `lawUnits` marks with `#dup`).
 */
function namesSeveralLaws(article: string | null, units: readonly LawUnit[]): boolean {
  const title = normalizeText(article ?? '')
  if (/\b(?:geändert|erlassen|aufgehoben)\s+werden\b/i.test(title) || /\bund\s+(?:das|die|der)\s+\S/i.test(title)) return true
  return units.some((u) => u.article === article && u.id.includes('#dup'))
}

/** The §§ an article's Novellierungsanordnungen address. */
function addressesOf(units: readonly LawUnit[], article: string | null): Set<string> {
  const out = new Set<string>()
  for (const u of units) {
    if (u.article !== article) continue
    const para = addressedParagraph(u.text)
    if (para) out.add(para)
  }
  return out
}

/** How much of the smaller set the other one carries. */
function overlapOf(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  if (small.size === 0) return 0
  let n = 0
  for (const x of small) if (large.has(x)) n++
  return n / small.size
}

/** 4 of 5 §§ — every title pair of three periods reached 100 %, the wrong number pairs at most 50 %. */
const SAME_ADDRESSES_AT = 0.8

/**
 * Whether a pair by number may stand: the §§ agree — or one title names no
 * law at all („Artikel 1", the RIS Artikel line without a name, XXVII 85/ME)
 * and the §§ do not speak against it. A nameless title cannot contradict the
 * number, and an Artikel that only inserts new §§ addresses none of the
 * standing ones (85/ME Artikel 1: „Nach § 11a wird folgender § 11b
 * eingefügt"), so absence of evidence is not evidence against it there.
 */
function numberHolds(m: ArticleRef, r: ArticleRef, a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (sameAddresses(a, b)) return true
  if (!namesNoLaw(m.article) && !namesNoLaw(r.article)) return false
  return a.size === 0 || b.size === 0 || overlapOf(a, b) >= SAME_ADDRESSES_AT
}

/** „Artikel 1", „Artikel II." — a title that is only its own number. */
function namesNoLaw(title: string | null): boolean {
  return /^Artikel\s+(?:[Xx]?\d+[a-z]?|[IVXL]+)\.?$/.test(normalizeText(title ?? '').trim())
}

/** The number pass's evidence: the §§ agree, or neither side addresses any (two new laws). */
function sameAddresses(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size === 0 && b.size === 0) return true
  if (a.size === 0 || b.size === 0) return false
  return overlapOf(a, b) >= SAME_ADDRESSES_AT
}

/**
 * The words of the title template, which say nothing about which law. Dropped
 * by word, not by `\b`: JavaScript's word boundary does not see one before
 * „ä" or „ü", so a regex left „Änderung" and „über" standing.
 */
const TEMPLATE_WORDS = new Set(['änderung', 'bundesgesetz', 'bundesgesetzes', 'mit', 'dem', 'über', 'des', 'der', 'die', 'das', 'den', 'geändert', 'wird', 'werden', 'und', 'artikel', 'zur', 'zum'])

/** The name part of an Artikel title as one string: no template words, no spacing, no hyphens, no numbers. */
function compactName(title: string | null): string {
  return normalizeText(title ?? '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .split(/[^a-zäöü]+/)
    .filter((w) => w && !TEMPLATE_WORDS.has(w))
    .join('')
}

/**
 * The name both titles START with, against the shorter one:
 * „einkommensteuergese tzes" and „einkommensteuergesetzes 1988" share all of
 * the first; „krankenanstalten- und kuranstaltengesetzes" and „über
 * krankenanstalten und kuranstalten" all of the second. A shared run
 * anywhere was the first version and it paired the GSVG with the BSVG —
 * parallel laws differ at the front („gewerblichen…", „bauern…") and share
 * the whole rest („sozialversicherungsgesetzes"), 27 of 39 letters.
 */
function sameCompactName(a: string | null, b: string | null): boolean {
  const x = compactName(a)
  const y = compactName(b)
  if (abbreviates(a, y) || abbreviates(b, x)) return true
  if (x.length < 6 || y.length < 6) return false
  let n = 0
  while (n < x.length && n < y.length && x[n] === y[n]) n++
  return n / Math.min(x.length, y.length) >= SAME_NAME_AT
}

/**
 * Does the title carry an abbreviation of the other name — „StGB" for
 * „Strafgesetzbuches", „ARHG" for „Auslieferungs- und Rechtshilfegesetzes"
 * (XXVII 99/ME, XXVI 162/ME)? The abbreviation's letters must appear in the
 * other name in order, starting at its first letter: the parallel-law case
 * („GSVG" against „bauernsozialversicherungsgesetzes") fails on the first.
 */
function abbreviates(title: string | null, otherCompact: string): boolean {
  if (otherCompact.length < 6) return false
  for (const token of normalizeText(title ?? '').split(/[\s,;:()„“"]+/)) {
    const letters = token.replace(/[^A-Za-zÄÖÜäöü]/g, '')
    if (letters.length < 3 || letters.length > 8 || (letters.match(/[A-ZÄÖÜ]/g) ?? []).length < 2) continue
    const abbr = letters.toLowerCase()
    if (abbr[0] !== otherCompact[0]) continue
    let i = 0
    for (const ch of otherCompact) if (ch === abbr[i]) i++
    if (i === abbr.length) return true
  }
  return false
}

const SAME_NAME_AT = 0.8

/** How much of the smaller name the larger one carries. */
function containment(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  if (small.size === 0) return 0
  let shared = 0
  for (const t of small) if (large.has(t)) shared++
  return shared / small.size
}

/** 4 of 5 words: 85/ME's „Bundesgesetz über die Rechtspersönlichkeit von religiösen Bekenntnisgemeinschaften" against its Artikel title. */
const CONTAINED_AT = 0.8

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
    articleKey: leadingArticleKey(ref.articleNumber),
    fromArticleKey: from ? leadingArticleKey(from.articleNumber) : null,
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
  /**
   * No Artikel of the one document could be matched to one of the other.
   * The units are then every unit removed and every unit inserted — not a
   * weak comparison but none, measured on all ten such drafts of GP XXVII
   * and XXVI (0 changed, 0 unchanged each; XXVI 9/ME: 1.119 „neu"). The
   * caller must say so instead of showing them.
   */
  unpaired: boolean
}

/**
 * An Artikel that enters no law but the package's own commencement —
 * „Inkrafttreten", „Inkrafttreten des Art. 119", „Inkrafttretens- und
 * Übergangsbestimmungen". Measured over GP XXVI–XXVIII: 20 of 2.260
 * one-sided package entries were these, every one a single unit, and the
 * note counted each as „ein Gesetz, das in diesem Entwurf nicht vorkommt".
 */
const COMMENCEMENT_ARTICLE = /^(?:artikel\s+\S+\s+)?(?:inkrafttreten|inkrafttretens-|schlussbestimmung|übergangsbestimmung)/i

/** Units of articles the other side does not have, counted per law. */
function lawsOf(units: readonly LawUnit[], keep: (article: string) => boolean): LawPackageEntry[] {
  const counts = new Map<string, number>()
  for (const u of units) {
    if (u.article === null || keep(u.article) || COMMENCEMENT_ARTICLE.test(normalizeText(u.article).trim())) continue
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
 * Units without an article always stay in the comparison. When no article
 * pairs at all, there is no scoping to do — and no comparison either, only
 * every unit on both sides; `unpaired` says so.
 */
export function diffLawPackage(from: readonly LawUnit[], to: readonly LawUnit[]): LawPackageDiff {
  const map = pairArticles(from, to)
  if (map.size === 0) return { units: diffLawUnits(from, to), lawsOnlyInTo: [], lawsOnlyInFrom: [], unpaired: from.length > 0 && to.length > 0 }
  const pairedFrom = new Set(map.keys())
  const pairedTo = new Set(map.values())
  const keepFrom = (u: LawUnit) => u.article === null || pairedFrom.has(u.article)
  const keepTo = (u: LawUnit) => u.article === null || pairedTo.has(u.article)
  return {
    units: diffLawUnits(from.filter(keepFrom), to.filter(keepTo)),
    lawsOnlyInTo: lawsOf(to, (a) => pairedTo.has(a)),
    lawsOnlyInFrom: lawsOf(from, (a) => pairedFrom.has(a)),
    unpaired: false,
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
