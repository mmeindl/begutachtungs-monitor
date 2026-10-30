/**
 * GET /api/laender/:land/:number/begruendung → LandReasoningResponse: the
 * Land's reasoning, draft against Regierungsvorlage, at the changes of that
 * comparison (`landReasoningService`). Fetched lazily by its section.
 */
import type { LandCode, LandReasoningResponse } from '#shared/types'
import { LAND_CODES } from '#shared/utils/laender'
import { cachedLandReasoning } from '../../../../utils/laender/landReasoningService'
import { isLandNumber, readLandDraft } from '../../../../utils/laender/sources'

export default defineEventHandler(async (event): Promise<LandReasoningResponse> => {
  const land = getRouterParam(event, 'land') ?? ''
  const number = getRouterParam(event, 'number') ?? ''
  if (!(LAND_CODES as readonly string[]).includes(land) || !isLandNumber(land as LandCode, number)) {
    throw createError({ statusCode: 404, statusMessage: 'Entwurf nicht gefunden' })
  }
  try {
    const detail = await readLandDraft(land as LandCode, number)
    if (!detail) throw createError({ statusCode: 404, statusMessage: 'Entwurf nicht gefunden' })
    return await cachedLandReasoning(land as LandCode, number, detail)
  } catch (error) {
    if (isError(error)) throw error
    console.warn(`[laender] Begründung ${land}/${number}:`, error instanceof Error ? error.message : error)
    throw createError({ statusCode: 503, statusMessage: 'Gerade nicht abrufbar' })
  }
})
