/**
 * GET /api/ris-drafts/:id/konsolidiert → ConsolidatedTextResponse.
 *
 * The konsolidierte Lesefassung for a Begutachtung without a Gegenstand
 * (docs/architecture.md §12.12a, §12.16). Its own endpoint for the same
 * reason as the Ministerialentwurf's: one draft can need dozens of §
 * documents, and a slow RIS fetch may hold up neither the page nor the
 * Gegenüberstellung above it.
 */
import type { ConsolidatedTextResponse } from '#shared/types'
import { readRisId } from '../../../utils/http/params'

export default defineEventHandler(async (event): Promise<ConsolidatedTextResponse> => {
  return getRisConsolidatedText(readRisId(event))
})
