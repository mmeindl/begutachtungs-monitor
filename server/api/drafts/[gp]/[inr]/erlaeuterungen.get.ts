/**
 * GET /api/drafts/:gp/:inr/erlaeuterungen → ExplanationsResponse: the
 * Allgemeiner Teil of the ministry's Erläuterungen, read from the RIS XML
 * (docs/architecture.md §12.29). `available: false` with a German reason where
 * the draft has none, where RIS holds only a scan, or where the document marks
 * no general part.
 */
import type { ExplanationsResponse } from '#shared/types'
import { validateGpInrParams } from '../../../../utils/http/params'

export default defineEventHandler(async (event): Promise<ExplanationsResponse> => {
  const { gp, inr } = validateGpInrParams(event)
  return getExplanations(gp, inr)
})
