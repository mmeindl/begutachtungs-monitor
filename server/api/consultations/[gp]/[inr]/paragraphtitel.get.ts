/**
 * GET /api/consultations/:gp/:inr/paragraphtitel → ParagraphTitlesResponse:
 * the heading of each § a change amends, from the standing law in RIS
 * (docs/architecture.md §12.11). Unresolved paragraphs are absent from the
 * map rather than guessed.
 */
import type { ParagraphTitlesResponse } from '#shared/types'
import { validateGpInrParams } from '../../../../utils/params'

export default defineEventHandler(async (event): Promise<ParagraphTitlesResponse> => {
  const { gp, inr } = validateGpInrParams(event)
  return getParagraphTitles(gp, inr)
})
