/**
 * One pair of station texts, made ready and compared — the decision the
 * page's § comparison (`lawDiffService.ts`) and its instrument
 * (`scripts/harness/station.ts`) share (21.11.2026).
 *
 * PURE MODULE — relative imports only.
 *
 * Until then the harness kept its own copy of this step: which pair is cut
 * to the draft's laws, which keeps the laws only one side carries, and which
 * pairs the page refuses. The copy skipped a refused pair without counting
 * it, and a change to the service could drift from what was measured. Both
 * now call this function; the service only words its refusals.
 */
import type { LawStationId, LawPackageEntry } from '../../../shared/types'
import type { LawUnit } from '../lawtext/lawUnits'
import { diffLawPackage, scopeToDraft, type LawPackageDiff } from './lawDiff'

/** What Parliament's record says about the draft, as the service reads it. */
export interface StationPairFacts {
  from: LawStationId
  to: LawStationId
  /** The Vorlage bundles this draft with others (`bundlesOtherDrafts`); null where no Vorlage was read. */
  bundled: boolean | null
  /** How many distinct Vorlagen the draft went into (`findRvLinks`); 0 where the stage record is unreadable. */
  rvCount: number
}

/**
 * Whether the pair is cut to the draft's laws: between two later stations of
 * a Vorlage that bundles this draft with others. Only then does the caller
 * need the draft's own units.
 */
export function cutsToDraft({ from, bundled }: Pick<StationPairFacts, 'from' | 'bundled'>): boolean {
  return from !== 'me' && bundled === true
}

/** Why the page shows no § list for a pair whose two texts it read. */
export type StationPairRefusal =
  /** One text, or both, parsed into no § at all (before any cut). */
  | { refused: 'unparsed'; side: 'from' | 'to' | 'both' }
  /** No Artikel of the one text could be matched to one of the other. */
  | { refused: 'unpaired' }
  /** Paired, and nothing left to show. */
  | { refused: 'empty' }

export interface StationPairComparison {
  refused: null
  /** The two texts as compared — cut to the draft's laws where `cutsToDraft`. */
  from: LawUnit[]
  to: LawUnit[]
  /** Laws of the earlier text cut as not the draft's (`scopeToDraft`). */
  outside: LawPackageEntry[]
  options: { keepAddedLaws: boolean; keepDroppedLaws: boolean; beyondCeiling: true }
  diff: LawPackageDiff
}

/**
 * The comparison of one pair, or why there is none.
 *
 * `draft` is the draft's own text, read only where `cutsToDraft`; null or
 * empty cuts nothing, and the counts stay those of the whole text.
 *
 * - A text that parses into no § is refused for that text, asked before the
 *   cut: a later pair cut to the draft's laws may rightly leave one side
 *   empty (the committee dropped the draft's law), and that is a finding.
 * - `keepAddedLaws` only for ME→RV of a Vorlage built from this draft alone:
 *   the laws it adds are the Ressort's own. A law that appears later may be
 *   a committee's.
 * - `keepDroppedLaws` besides only where the draft went into one Vorlage: a
 *   draft split into two (XXVII 21/ME, XXVIII 74/ME) can carry it in the other.
 * - `beyondCeiling`: a long § is shown with its changed words marked.
 */
export function compareStationPair(
  fromUnits: readonly LawUnit[],
  toUnits: readonly LawUnit[],
  facts: StationPairFacts,
  draft: readonly LawUnit[] | null,
): StationPairComparison | StationPairRefusal {
  if (!fromUnits.length || !toUnits.length) {
    return { refused: 'unparsed', side: !fromUnits.length && !toUnits.length ? 'both' : fromUnits.length ? 'to' : 'from' }
  }
  let from = [...fromUnits]
  let to = [...toUnits]
  let outside: LawPackageEntry[] = []
  if (cutsToDraft(facts) && draft?.length) {
    const scoped = scopeToDraft(draft, from, to)
    from = scoped.from
    to = scoped.to
    outside = scoped.outside
  }
  const keepAddedLaws = facts.from === 'me' && facts.to === 'rv' && facts.bundled === false
  const options = { keepAddedLaws, keepDroppedLaws: keepAddedLaws && facts.rvCount === 1, beyondCeiling: true as const }
  const diff = diffLawPackage(from, to, options)
  if (diff.unpaired) return { refused: 'unpaired' }
  if (diff.units.length === 0) return { refused: 'empty' }
  return { refused: null, from, to, outside, options, diff }
}
