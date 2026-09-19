/**
 * GET /api/ris-drafts/:id/erlaeuterungen → ExplanationsResponse.
 *
 * The same reading as for a Ministerialentwurf, and it carries more weight
 * here: a Begutachtung without a parliamentary Gegenstand has no
 * Kurzinformation of Parliament's above it, so the Erläuterungen are the only
 * statement of purpose the procedure publishes at all.
 */
import type { ExplanationsResponse } from '#shared/types'
import { RIS_ID_RE } from '#shared/utils/risConsultations'

export default defineEventHandler(async (event): Promise<ExplanationsResponse> => {
  const id = getRouterParam(event, 'id') ?? ''
  if (!RIS_ID_RE.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Ungültige RIS-Dokumentnummer' })
  }
  return getRisExplanations(id)
})
