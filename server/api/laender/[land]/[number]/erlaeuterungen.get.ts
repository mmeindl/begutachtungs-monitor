/**
 * GET /api/laender/:land/:number/erlaeuterungen → LandExplanationsResponse:
 * the Land's Erläuterungen of its draft (`landExplanationsService`). Fetched
 * lazily by „Was das Land begründet" and by the Textgegenüberstellung, which
 * shows the particular part at its §§ — one request for both.
 */
import type { LandExplanationsResponse } from '#shared/types'
import { cachedLandExplanations } from '../../../../utils/laender/landExplanationsService'
import { landDraftParams, withLandDraft } from '../../../../utils/laender/landRoute'

export default defineEventHandler(async (event): Promise<LandExplanationsResponse> => {
  const { land, number } = landDraftParams(event)
  return withLandDraft(land, number, 'Erläuterungen', (detail) => cachedLandExplanations(land, number, detail))
})
