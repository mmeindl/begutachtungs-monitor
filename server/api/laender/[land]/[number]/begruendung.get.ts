/**
 * GET /api/laender/:land/:number/begruendung → LandReasoningResponse: the
 * Land's reasoning, draft against Regierungsvorlage, at the changes of that
 * comparison (`landReasoningService`). Fetched lazily by its section.
 */
import type { LandReasoningResponse } from '#shared/types'
import { cachedLandReasoning } from '../../../../utils/laender/landReasoningService'
import { landDraftParams, withLandDraft } from '../../../../utils/laender/landRoute'

export default defineEventHandler(async (event): Promise<LandReasoningResponse> => {
  const { land, number } = landDraftParams(event)
  return withLandDraft(land, number, 'Begründung', (detail) => cachedLandReasoning(land, number, detail))
})
