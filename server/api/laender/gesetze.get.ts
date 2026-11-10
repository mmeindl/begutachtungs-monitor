/**
 * GET /api/laender/gesetze?gp= → LandLawsResponse: every Land's laws
 * kundgemacht in the period's window that no draft of the Land's register
 * is joined to — the Länder list's rows of kind `law` (docs/architecture.md
 * §12.70). Fetched by the list on the client, lazily: the drafts never wait
 * for it.
 *
 * Always every Land, as `/api/laender`: the reader's choice is applied on
 * the page, so one answer serves every choice.
 */
import type { LandLawsResponse } from '#shared/types'
import { gpWindow } from '#shared/utils/gp'
import { firstQueryValue } from '#shared/utils/queryParams'
import { readLandLaws } from '../../utils/laender/landLawsService'
import { requirePlausibleGp } from '../../utils/http/params'
import { getCurrentGp } from '../../utils/parliament/drafts'

export default defineEventHandler(async (event): Promise<LandLawsResponse> => {
  const currentGp = await getCurrentGp()
  const gp = requirePlausibleGp(firstQueryValue(getQuery(event).gp) || currentGp, currentGp)
  return readLandLaws(gp, gpWindow(gp))
})
