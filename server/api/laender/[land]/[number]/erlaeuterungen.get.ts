/**
 * GET /api/laender/:land/:number/erlaeuterungen → LandExplanationsResponse:
 * the Land's Erläuterungen of its draft (`landExplanationsService`). Fetched
 * lazily by „Was das Land begründet" and by the Textgegenüberstellung, which
 * shows the particular part at its §§ — one request for both.
 */
import type { LandCode, LandExplanationsResponse } from '#shared/types'
import { LAND_CODES } from '#shared/utils/laender'
import { cachedLandExplanations } from '../../../../utils/laender/landExplanationsService'
import { isLandNumber, readLandDraft } from '../../../../utils/laender/sources'

export default defineEventHandler(async (event): Promise<LandExplanationsResponse> => {
  const land = getRouterParam(event, 'land') ?? ''
  const number = getRouterParam(event, 'number') ?? ''
  if (!(LAND_CODES as readonly string[]).includes(land) || !isLandNumber(land as LandCode, number)) {
    throw createError({ statusCode: 404, statusMessage: 'Entwurf nicht gefunden' })
  }
  try {
    const detail = await readLandDraft(land as LandCode, number)
    if (!detail) throw createError({ statusCode: 404, statusMessage: 'Entwurf nicht gefunden' })
    return await cachedLandExplanations(land as LandCode, number, detail)
  } catch (error) {
    if (isError(error)) throw error
    console.warn(`[laender] Erläuterungen ${land}/${number}:`, error instanceof Error ? error.message : error)
    throw createError({ statusCode: 503, statusMessage: 'Gerade nicht abrufbar' })
  }
})
