/**
 * GET /api/drafts/:gp/:inr/geltendesrecht → AmendedLawsResponse:
 * the laws in force the draft would change, each linked to its consolidated
 * text in RIS as it stood when the draft was filed.
 */
import type { AmendedLawsResponse } from '#shared/types'
import { validateGpInrParams } from '../../../../utils/params'

export default defineEventHandler(async (event): Promise<AmendedLawsResponse> => {
  const { gp, inr } = validateGpInrParams(event)
  return getAmendedLaws(gp, inr)
})
