/**
 * GET /api/weitere-entwuerfe/:id → RisConsultationDetail.
 *
 * `id` is the RIS document ID (`BEGUT_…`), which is the only stable identity
 * these records have — there is no Geschäftszahl, because there is no
 * parliamentary Gegenstand.
 */
import type { RisConsultationDetail } from '#shared/types'

/**
 * Two shapes occur in the corpus: `BEGUT_COO_2026_100_2_1836568` and the
 * GUID form `BEGUT_C769778C_3342_41D1_A1DF_931D7F4BBF1B`. Validated before
 * the lookup so a malformed id is a 400 and never reaches upstream.
 */
const RIS_ID_RE = /^BEGUT_[A-Za-z0-9_]{1,120}$/

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
