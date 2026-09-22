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

/** Was die Seite auf den Ausgang warten darf, bevor sie ohne ihn rendert. */
const OUTCOME_BUDGET_MS = 2_500

export default defineEventHandler(async (event): Promise<RisConsultationDetail> => {
  const id = readRisId(event)
  const detail = await getRisConsultation(id)
  if (!detail) {
    throw createError({ statusCode: 404, statusMessage: 'Begutachtung nicht gefunden' })
  }
  // Der Ausgang gehört in DIESE Antwort, weil die Überschrift der Karte ihn
  // braucht (§12.32) — eine Überschrift, die nach dem Laden ihre Aussage
  // wechselt („Begutachtung beendet" → „Kundgemacht"), ist schlechter als
  // eine, die wartet.
  //
  // Mit Budget, weil der Abgleich kalt drei Jahrgänge des
  // Bundesgesetzblatts holt: Der Prewarm hält sie warm, und wenn doch
  // einmal nicht, rendert die Seite lieber ohne Ausgang und der Abschnitt
  // holt ihn client-seitig nach. Dieselbe Abwägung wie beim Stationsbudget
  // der Liste.
  const outcome = await withinBudget(getBgblOutcome(id), OUTCOME_BUDGET_MS)
  return { ...detail, outcome }
})
