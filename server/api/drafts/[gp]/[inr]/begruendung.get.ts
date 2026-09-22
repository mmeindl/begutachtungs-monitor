/**
 * GET /api/drafts/:gp/:inr/begruendung?von=me&bis=rv → ReasoningDiffResponse:
 * whether the ressort's Begründung for each changed Paragraph changed
 * between Entwurf and Regierungsvorlage (docs/architecture.md §12.10b).
 *
 * Its own endpoint like `paragraphtitel`, and for the same reason: two more
 * documents from Parliament may neither hold the comparison up nor take it
 * down with them. The page mixes the entries in over `unitKey` once they
 * arrive.
 */
import type { ReasoningDiffResponse } from '#shared/types'
import { readLawStationPair, validateGpInrParams } from '../../../../utils/http/params'

export default defineEventHandler(async (event): Promise<ReasoningDiffResponse> => {
  const { gp, inr } = validateGpInrParams(event)
  const { from, to } = readLawStationPair(event)
  return getReasoningDiff(gp, inr, from, to)
})
