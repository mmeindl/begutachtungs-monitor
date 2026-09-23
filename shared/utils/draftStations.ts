/**
 * The three inferences behind the station filter (docs/architecture.md
 * §12.26): which station a Vorlage puts its draft at, which of two chains
 * for the same draft survives, and whether the period may be spoken about
 * at all (§12.27).
 *
 * Pure module: no Nuxt auto-imports, so the server map
 * (`server/utils/parliament/stationMap.ts`) and vitest run the same
 * functions. Everything else in that file is fetching
 * and folding; this is the part that decides what the list CLAIMS about a
 * draft, and a claim belongs where it can be tested.
 */
import type { ChainCoverage, DraftChain, DraftStation } from '../types'

/** Upstream's list-101 `Status`: "done in the house" (`mapVorlageRow`,
 *  verified 117/117 on GP XXVIII). */
export const STATUS_FINISHED = '5'

/**
 * `Status` 3: „Zurückverwiesen an den … Ausschuss" (XXVII/2049 d.B., read
 * live 23.09.2026).
 *
 * It belongs at the Parlament station, not at `rv`. The Vorlage is not
 * merely lying before the Nationalrat — the house has taken a decision about
 * it and sent it back, which is parliament acting on the text, and the value
 * exists precisely to record that. Left at `rv` the row said „liegt vor"
 * about a Vorlage that had already been through a reading.
 */
export const STATUS_RECOMMITTED = '3'

/**
 * The four stations in procedural order — the one runtime list of them.
 *
 * It was spelled out three times: in both list endpoints, which validate the
 * `station` parameter against it, and in the page's filter, which builds the
 * chips from it. Three copies of a vocabulary that a fifth station would have
 * to be added to in three places.
 */
export const DRAFT_STATION_ORDER: readonly DraftStation[] = ['begutachtung', 'rv', 'parlament', 'bgbl']

/**
 * What the filter chips say. The label names the STATION, not the document
 * that stands there — „Bundesgesetzblatt" is where the draft got to, and the
 * text published there is the `LAW_STATION_LABEL` of the comparison.
 */
export const DRAFT_STATION_LABEL: Record<DraftStation, string> = {
  begutachtung: 'Begutachtung',
  rv: 'Regierungsvorlage',
  parlament: 'Parlament',
  bgbl: 'Bundesgesetzblatt',
}

/** Furthest wins when a draft produced more than one Vorlage (ME→RV is
 *  1:n, §13.4): the chain reached the Bundesgesetzblatt even if only one
 *  strand did. */
const REACH: Record<DraftStation, number> = { begutachtung: 0, rv: 1, parlament: 2, bgbl: 3 }

/**
 * A promulgated law is at the Bundesgesetzblatt whatever the list column
 * says; otherwise the house's own status decides between „liegt vor" and
 * „behandelt" — two of its values mean the house acted, `5` and `3`.
 *
 * An unknown status stays at `rv`, deliberately: that a Vorlage exists was
 * read from the draft's own stage record, while what parliament did with it
 * is exactly what we then failed to learn. The weakest claim the evidence
 * supports is the honest one.
 */
export function stationFor(bgblNumber: string | null, houseStatus: string | null): DraftStation {
  if (bgblNumber) return 'bgbl'
  return houseStatus === STATUS_FINISHED || houseStatus === STATUS_RECOMMITTED
    ? 'parlament'
    : 'rv'
}

/** Which of two chains for the same draft survives the fold. */
export function furtherChain(a: DraftChain | undefined, b: DraftChain): DraftChain {
  return !a || REACH[b.station] > REACH[a.station] ? b : a
}

/**
 * Whether a Gesetzgebungsperiode's ME→RV links exist at all — the guard
 * against the one claim this product must never invent (§12.27).
 *
 * „Bisher keine Regierungsvorlage" is read off the draft's own stage
 * record. In the older periods that record stops at the Begutachtung for
 * EVERY draft, and per draft that is indistinguishable from shelving —
 * measured 18.09.2026, a GP XVI draft and a genuinely lapsed GP XX draft
 * both carry exactly two stage entries. The period is the only level where
 * the two separate: no draft of GP XVI links to a Vorlage, while list 101
 * holds 270 Regierungsvorlagen from that same period. Nothing shelved 297
 * drafts — the link is missing.
 *
 * Derived, never a hardcoded year: it corrects itself if Parliament
 * backfills the archive, and needs no maintenance when a GP closes.
 *
 *  - `unlinked` — the period is over and not ONE of its drafts reached past
 *    the Begutachtung. No statement about outcomes is supportable.
 *  - `linked` — at least one did, so absence carries evidence again.
 *  - `unknown` — nothing to judge by (no map, or the budget cut it).
 *    Treated like `unlinked` wherever a claim would be made: silence is
 *    recoverable, a false accusation is not.
 *
 * A RUNNING period is never `unlinked`. Early in a GP every draft stands at
 * its Begutachtung legitimately — a fact about the calendar, not a gap in
 * the archive.
 */
export function chainCoverageOf(
  chains: Iterable<DraftChain> | null | undefined,
  gpEnded: boolean,
): ChainCoverage {
  if (!chains) return 'unknown'
  let seen = false
  for (const chain of chains) {
    seen = true
    if (chain.station !== 'begutachtung') return 'linked'
  }
  if (!seen) return 'unknown'
  return gpEnded ? 'unlinked' : 'linked'
}

/** May the UI state what became of a draft in this period? */
export function mayClaimOutcome(coverage: ChainCoverage): boolean {
  return coverage === 'linked'
}
