/**
 * GET /api/ris-drafts/:id → RisConsultationDetail.
 *
 * `id` is the RIS document ID (`BEGUT_…`), which is the only stable identity
 * these records have — there is no Geschäftszahl, because there is no
 * parliamentary Gegenstand.
 */
import type { RisConsultationDetail } from '#shared/types'
/* Validated before the lookup so a malformed id never reaches upstream;
 * that it is a 400 here and a 404 on the page route is the rule stated in
 * `server/utils/http/params.ts`. */
import { readRisId } from '../../utils/http/params'

/** How long the page may wait for the outcome before rendering without it. */
const OUTCOME_BUDGET_MS = 2_500

export default defineEventHandler(async (event): Promise<RisConsultationDetail> => {
  const id = readRisId(event)
  const detail = await getRisConsultation(id)
  if (!detail) {
    throw createError({ statusCode: 404, statusMessage: 'Begutachtung nicht gefunden' })
  }
  // The outcome belongs in THIS response, because the card's heading needs
  // it (§12.32) — a heading that changes what it says after loading
  // („Begutachtung beendet" → „Kundgemacht") is worse than one that waits.
  //
  // With a budget, because cold the match fetches three years of the
  // Bundesgesetzblatt: the prewarm keeps them warm, and where it did not,
  // the page would rather render without the outcome and let the section
  // fetch it client-side. The same trade-off as the list's station budget.
  const outcome = await withinBudget(getBgblOutcome(id), OUTCOME_BUDGET_MS)
  return { ...detail, outcome }
})
