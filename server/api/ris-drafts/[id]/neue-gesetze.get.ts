/**
 * GET /api/ris-drafts/:id/neue-gesetze → EnactedLawsResponse, for a
 * Begutachtung RIS carries alone (`enactedLawsService.ts`).
 */
import type { EnactedLawsResponse } from '#shared/types'
import { readRisId } from '../../../utils/http/params'

export default defineEventHandler(async (event): Promise<EnactedLawsResponse> => {
  return getRisEnactedLaws(readRisId(event))
})
