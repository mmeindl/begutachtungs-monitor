/**
 * GET /api/laender/:land/:number → LandDraftDetail: one Land's draft, running
 * or closed, by the Land's own number (Salzburg: the `/pub/get/<n>` of its
 * main document). 404 only when every source of that Land answered and none
 * knows the number; 503 when the Land could not be read.
 */
import type { LandDraftDetail } from '#shared/types'
import { landDraftParams, withLandDraft } from '../../../utils/laender/landRoute'

export default defineEventHandler(async (event): Promise<LandDraftDetail> => {
  const { land, number } = landDraftParams(event)
  // No label: the draft's own route has logged as `[laender] <land>/<number>`.
  return withLandDraft(land, number, '', (detail) => detail)
})
