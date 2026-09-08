/**
 * GET /api/consultations/:gp/:inr/gegenueberstellung → TextComparisonResponse:
 * the ressort's own comparison of current law against proposed law, when the
 * draft carries a machine-readable Textgegenüberstellung
 * (docs/api-exploration.md §2c). `available: false` with a German reason
 * otherwise.
 */
import type { TextComparisonResponse } from '#shared/types'
import { validateGpInrParams } from '../../../../utils/params'

export default defineEventHandler(async (event): Promise<TextComparisonResponse> => {
  const { gp, inr } = validateGpInrParams(event)
  return getTextComparison(gp, inr)
})
