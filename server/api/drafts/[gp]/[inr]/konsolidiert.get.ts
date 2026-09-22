/**
 * GET /api/drafts/:gp/:inr/konsolidiert → ConsolidatedTextResponse:
 * this draft's Paragraphen as a non-official consolidated reading version —
 * the text in force from RIS, the draft's instructions applied, and only
 * what the ressort's own Textgegenüberstellung confirms
 * (docs/architecture.md §12.12).
 *
 * Its own endpoint like `paragraphtitel`: one draft can need dozens of §
 * documents, and a slow RIS fetch may hold up neither the page nor the
 * Gegenüberstellung above this section.
 */
import type { ConsolidatedTextResponse } from '#shared/types'
import { validateGpInrParams } from '../../../../utils/http/params'

export default defineEventHandler(async (event): Promise<ConsolidatedTextResponse> => {
  const { gp, inr } = validateGpInrParams(event)
  return getConsolidatedText(gp, inr)
})
