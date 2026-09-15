/**
 * GET /api/drafts/:gp/:inr → DraftDetail.
 * 400 for invalid params, 404 for an unknown item
 * (lookup via the GP's list-81 row, docs/architecture.md §5).
 */
import type { DraftDetail } from '#shared/types'
import { validateGpInrParams } from '../../../../utils/params'

export default defineEventHandler(async (event): Promise<DraftDetail> => {
  const { gp, inr } = validateGpInrParams(event)
  return getDraftDetail(gp, inr)
})
