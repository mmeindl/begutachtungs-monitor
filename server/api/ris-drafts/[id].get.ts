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

export default defineEventHandler(async (event): Promise<RisConsultationDetail> => {
  const id = getRouterParam(event, 'id') ?? ''
  if (!RIS_ID_RE.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Ungültige RIS-Dokumentnummer' })
  }
  const detail = await getRisConsultation(id)
  if (!detail) {
    throw createError({ statusCode: 404, statusMessage: 'Begutachtung nicht gefunden' })
  }
  return detail
})
