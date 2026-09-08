/**
 * GET /api/consultations/:gp/:inr/diff → LawDiffResponse: what changed in
 * the law text between the Ministerialentwurf and the Regierungsvorlage,
 * § by §. `available: false` with a German reason when there is nothing to
 * compare yet or the texts are PDF-only (docs/ris-join.md §6).
 */
import type { LawDiffResponse } from '#shared/types'
import { validateGpInrParams } from '../../../../utils/params'

export default defineEventHandler(async (event): Promise<LawDiffResponse> => {
  const { gp, inr } = validateGpInrParams(event)
  return getLawDiff(gp, inr)
})
