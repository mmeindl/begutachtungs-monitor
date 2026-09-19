/**
 * GET /api/ris-drafts/:id → RisConsultationDetail.
 *
 * `id` is the RIS document ID (`BEGUT_…`), which is the only stable identity
 * these records have — there is no Geschäftszahl, because there is no
 * parliamentary Gegenstand.
 */
import type { RisConsultationDetail } from '#shared/types'
/* Validated before the lookup so a malformed id is a 400 and never reaches
 * upstream — the same pattern the page route and the `.ics` route test. */
import { RIS_ID_RE } from '#shared/utils/risConsultations'

/** Was die Seite auf den Ausgang warten darf, bevor sie ohne ihn rendert. */
const OUTCOME_BUDGET_MS = 2_500

export default defineEventHandler(async (event): Promise<RisConsultationDetail> => {
  const id = getRouterParam(event, 'id') ?? ''
  if (!RIS_ID_RE.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Ungültige RIS-Dokumentnummer' })
  }
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
  const outcome = await Promise.race([
    getBgblOutcome(id).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), OUTCOME_BUDGET_MS)),
  ])
  return { ...detail, outcome }
})
