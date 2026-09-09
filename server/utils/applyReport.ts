/**
 * Scoring an engine run against the law that actually exists
 * (docs/architecture.md §12.12).
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * This lived inside `scripts/kons-harness.ts` for one afternoon and produced
 * a wrong answer the whole time: it filtered diff segments for the types
 * `insert` and `delete`, while `LawDiffSegment` uses `inserted` and
 * `removed`. Both sets came out empty, every divergence looked harmless, and
 * the harness reported 0,9 % dangerous instead of 23,9 %. `scripts/` is
 * outside the typecheck, so nothing caught it.
 *
 * The lesson is structural, not clerical: the part of a harness that renders
 * a verdict is exactly as load-bearing as the code it judges, and belongs
 * where tests and the compiler can reach it. Only the I/O stays in a script.
 */
import { diffTokens } from './lawDiff'
import { plainText, type LawNode } from './lawStructure'
import type { LawDiffSegment } from '../../shared/types'

/** How an engine result relates to the version RIS actually holds. */
export type ApplyVerdict =
  /** Character-for-character the law that exists */
  | 'identisch'
  /** The engine left the paragraph alone; RIS changed it */
  | 'unverändert'
  /** Every change the engine made, RIS made too — it did less, not something else */
  | 'unvollständig'
  /** The engine wrote something RIS did not: the only dangerous outcome */
  | 'abweichend'

function changedTokens(a: string, b: string, type: LawDiffSegment['type']): string[] | null {
  const { segments } = diffTokens(a, b)
  // `null` means the word diff was skipped as too long. Reading that as "no
  // changes" would wave a large paragraph through unchecked.
  if (segments === null) return null
  return segments
    .filter((seg) => seg.type === type)
    .flatMap((seg) => seg.text.split(/\s+/))
    .filter(Boolean)
}

/** The tokens the engine changed that RIS did not — the diagnostic for a divergence. */
export function extraTokens(before: string, got: string, expected: string): { inserted: string[]; removed: string[]; comparable: boolean } {
  const out = { inserted: [] as string[], removed: [] as string[], comparable: true }
  for (const type of ['inserted', 'removed'] as const) {
    const byEngine = changedTokens(before, got, type)
    const byRis = changedTokens(before, expected, type)
    if (byEngine === null || byRis === null) return { ...out, comparable: false }
    const risSet = new Set(byRis)
    out[type] = byEngine.filter((token) => !risSet.has(token))
  }
  return out
}

/**
 * Both directions matter: a word the engine deleted on its own is as wrong as
 * one it invented. An incomparable diff counts as a divergence, never as a
 * pass — the harness must not be more forgiving than it can justify.
 */
export function isSubsetOfRis(before: string, got: string, expected: string): boolean {
  const extra = extraTokens(before, got, expected)
  return extra.comparable && extra.inserted.length === 0 && extra.removed.length === 0
}

/**
 * The verdict for one paragraph.
 *
 * A paragraph the Novelle *creates* has no earlier version, and `before` is
 * null. Falling straight through to `abweichend` there counted every created
 * § as dangerous even when the engine had invented nothing — the subset test
 * still means something against an empty base: it asks whether every token
 * the engine wrote also appears in the text RIS published. Only `unverändert`
 * genuinely needs a predecessor (2026-09-09).
 */
export function verdictFor(before: string | null, got: string, expected: string): ApplyVerdict {
  if (got === expected) return 'identisch'
  if (before !== null && got === before) return 'unverändert'
  if (isSubsetOfRis(before ?? '', got, expected)) return 'unvollständig'
  return 'abweichend'
}

/**
 * The verdict for a paragraph given as trees. Equal to `verdictFor` on the
 * plain texts, except where the word diff of the whole § is too long to
 * compute (`lawDiff` MAX_DP_CELLS): then the children are compared one by
 * one, by level and id, and the worst child verdict is the paragraph's. A
 * child the engine has and RIS does not, or the other way round, is a
 * divergence. Three §§ of the 446-paragraph corpus — Übergangsbestimmungen
 * with dozens of Absätze — were "nicht prüfbar" as a whole and are decidable
 * this way (2026-09-09). Nothing here is more forgiving than the whole-text
 * comparison: a child still too long stays incomparable, which is a
 * divergence.
 */
export function verdictForTrees(before: LawNode | null, got: LawNode, expected: LawNode): ApplyVerdict {
  const gotText = plainText(got)
  const expectedText = plainText(expected)
  const beforeText = before ? plainText(before) : null
  if (gotText === expectedText) return 'identisch'
  if (beforeText !== null && gotText === beforeText) return 'unverändert'
  if (extraTokens(beforeText ?? '', gotText, expectedText).comparable) return verdictFor(beforeText, gotText, expectedText)

  const key = (n: LawNode): string => `${n.level}|${n.id}`
  const byKey = (n: LawNode): Map<string, LawNode> => new Map(n.children.map((c) => [key(c), c]))
  const g = byKey(got)
  const e = byKey(expected)
  const b = before ? byKey(before) : new Map<string, LawNode>()
  if ([...g.keys()].some((k) => !e.has(k))) return 'abweichend'
  const rank: Record<ApplyVerdict, number> = { identisch: 0, 'unvollständig': 1, 'unverändert': 2, abweichend: 3 }
  let worst: ApplyVerdict = 'identisch'
  for (const [k, child] of e) {
    const mine = g.get(k)
    const was = b.get(k)
    // RIS has a child the engine lacks: the engine did less, unless it
    // deleted something that stood there before.
    const v: ApplyVerdict = mine ? verdictFor(was ? plainText(was) : null, plainText(mine), plainText(child)) : was ? 'abweichend' : 'unvollständig'
    if (rank[v] > rank[worst]) worst = v
  }
  // Heading and own text of the § itself.
  const own = (n: LawNode | null): string => (n ? `${n.heading ?? ''} ${n.text}`.trim() : '')
  const ownVerdict = own(got) === own(expected) ? 'identisch' : verdictFor(before ? own(before) : null, own(got), own(expected))
  if (rank[ownVerdict] > rank[worst]) worst = ownVerdict
  return worst
}
