/**
 * Which drafts the homepage's „Im Nationalrat beschlossen" section shows,
 * and in which order (docs/architecture.md §12.21, Nachtrag 03.10.2026).
 *
 * PURE MODULE — no Nuxt auto-imports, only relative imports, so vitest can
 * execute it directly, like `enactedOrder.ts` beside it. The section claims
 * something about every row it shows — decided, and not yet promulgated —
 * and a claim belongs where it can be tested.
 */
import type { ClosedOutcome, DraftChain, DraftSummary } from '../../../shared/types'
import { HOME_LIST_LENGTH } from '../../../shared/utils/draftOrder'
import { spanInDays } from '../../../shared/utils/format'
import { promulgationState } from '../../../shared/utils/promulgation'

/*
 * WHAT KEEPS A ROW OUT besides a Kundmachung (03.10.2026): the two signals
 * of `promulgationState`, so the section and the rows' own Stand cannot
 * disagree. Parliament's stage „Keine Kundmachung …" (80 d.B., 2/ME: a
 * Formalfehler, brought in again as 416/A) — and a Beschluss older than
 * `PROMULGATION_WINDOW_DAYS` (XXVII/1435 d.B., decided in both chambers in
 * June 2022 and never promulgated, with nothing in its record to say so).
 * „Noch nicht kundgemacht" would promise either a Kundmachung that is not
 * coming. The RIS fallback for a missing link (`findBgblIForVorlage`)
 * reaches neither — it covers the days between a Kundmachung and
 * Parliament's link to it.
 */

/**
 * The drafts the Nationalrat has decided and the Bundesgesetzblatt has not
 * yet carried — newest Beschluss first, at most `HOME_LIST_LENGTH`.
 *
 * Rows are the list-81 summaries with their chain attached, in the shape
 * the other outcome sections use (`ClosedOutcome`), so the homepage renders
 * them with the same row; the Stand reads „Im Nationalrat beschlossen" off
 * the chain (`entryView.chainState`). An open draft never qualifies, and a
 * Beschluss dated in the future is a misread, not a row.
 *
 * NOR A PROCEDURE WHOSE WINDOW IS STILL OPEN (03.10.2026). A procedure
 * appears once per page: in the act half while Stellungnahmen can still be
 * filed — its Vorlage under „Regierungsvorlage: Stellungnahme im Parlament
 * möglich", which runs to the Bundesrat's Beschluss — and here, in the track
 * half, only afterwards. The same rule the Stand box follows: one question
 * at a time, and what can still be done goes first (§12.26).
 *
 * Ties are the normal case — one plenary day decides several Vorlagen, four
 * of these on 23.09.2026 — and break by the draft's number, newest first:
 * an order nobody chose, like the BGBl number beside it (`pickEnacted`).
 */
export function pickDecided(
  drafts: readonly DraftSummary[],
  chains: Readonly<Record<number, DraftChain>>,
  today: string,
): ClosedOutcome[] {
  const decided: { row: ClosedOutcome; decidedAt: string }[] = []
  for (const draft of drafts) {
    const chain = chains[draft.inr]
    const decidedAt = chain?.decidedAt
    if (!chain || !decidedAt || chain.bgblNumber || draft.active || chain.filingOpen) continue
    const age = spanInDays(decidedAt, today)
    if (age === null || age < 0) continue
    if (promulgationState(chain, today)) continue
    decided.push({
      decidedAt,
      row: { ...draft, chain, rvCitation: chain.rvCitation, bgblNumber: null, rvDate: chain.rvDate },
    })
  }
  return decided
    .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt) || b.row.inr - a.row.inr)
    .slice(0, HOME_LIST_LENGTH)
    .map((d) => d.row)
}
