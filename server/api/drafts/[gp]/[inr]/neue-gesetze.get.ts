/**
 * GET /api/drafts/:gp/:inr/neue-gesetze → EnactedLawsResponse: the §§ of the
 * laws the draft enacts anew, which no Textgegenüberstellung covers
 * (`enactedLawsService.ts`). 404 for a number that is no draft, decided
 * before the read, as at `erlaeuterungen.get.ts`.
 */
import type { EnactedLawsResponse } from '#shared/types'
import { validateGpInrParams } from '../../../../utils/http/params'

export default defineEventHandler(async (event): Promise<EnactedLawsResponse> => {
  const { gp, inr } = validateGpInrParams(event)
  await requireDraft(gp, inr)
  return getEnactedLaws(gp, inr)
})
