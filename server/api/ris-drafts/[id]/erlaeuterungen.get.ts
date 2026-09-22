/**
 * GET /api/ris-drafts/:id/erlaeuterungen → ExplanationsResponse.
 *
 * The same reading as for a Ministerialentwurf, and it carries more weight
 * here: a Begutachtung without a parliamentary Gegenstand has no
 * Kurzinformation of Parliament's above it, so the Erläuterungen are the only
 * statement of purpose the procedure publishes at all.
 */
import type { ExplanationsResponse } from '#shared/types'
import { readRisId } from '../../../utils/http/params'

export default defineEventHandler(async (event): Promise<ExplanationsResponse> => {
  const id = readRisId(event)
  return getRisExplanations(id)
})
