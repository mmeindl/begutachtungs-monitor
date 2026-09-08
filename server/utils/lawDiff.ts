/**
 * ME → RV comparison at § level (docs/ris-join.md §6).
 *
 * PURE MODULE — relative imports only.
 *
 * Alignment is the whole difficulty. Never by § number alone: in the EABG
 * chain the Regierungsvorlage inserted two paragraphs and a by-number diff
 * marked 41 of 45 shifted paragraphs as "changed". Order of alignment:
 *   1. same article + same § heading (unique on both sides)
 *   2. same article + same id, when at least one side has no heading
 *   3. remaining units of the same article by text similarity ≥ 0.6
 * Everything left is inserted (RV only) or removed (ME only).
 */
import type { LawDiffSegment, LawDiffUnit, LawUnitChange } from '../../shared/types'
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
// Alignment
// ---------------------------------------------------------------------------

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

export function alignUnits(me: readonly LawUnit[], rv: readonly LawUnit[]): Alignment {
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
    pairs,
    onlyMe: me.filter((u) => !pairedMe.has(u)),
    onlyRv: rv.filter((u) => !pairedRv.has(u)),
  }
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

export function summarizeDiff(units: readonly LawDiffUnit[]): Record<LawUnitChange, number> & { total: number } {
  const s = { total: units.length, unchanged: 0, changed: 0, inserted: 0, removed: 0 }
  for (const u of units) s[u.change]++
  return s
}
