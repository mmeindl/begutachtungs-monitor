/**
 * GET /api/consultations/:gp/:inr → ConsultationDetail.
 * 400 for invalid params, 404 for an unknown item
 * (lookup via the GP's list-81 row, docs/architecture.md §5).
 */
import type { ConsultationDetail } from '#shared/types'
import { validateGpInrParams } from '../../../../utils/params'

export default defineEventHandler(async (event): Promise<ConsultationDetail> => {
  const { gp, inr } = validateGpInrParams(event)
  return getConsultationDetail(gp, inr)
})
