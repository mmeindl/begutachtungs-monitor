/**
 * GET /api/laender/:land/:number → LandDraftDetail: one Land's draft, running
 * or closed, by the Land's own number (Salzburg: the `/pub/get/<n>` of its
 * main document). 404 only when every source of that Land answered and none
 * knows the number; 503 when the Land could not be read.
 */
import type { LandCode, LandDraftDetail } from '#shared/types'
import { LAND_CODES } from '#shared/utils/laender'
import { isLandNumber, readLandDraft } from '../../../utils/laender/sources'

export default defineEventHandler(async (event): Promise<LandDraftDetail> => {
  const land = getRouterParam(event, 'land') ?? ''
  const number = getRouterParam(event, 'number') ?? ''
  if (!(LAND_CODES as readonly string[]).includes(land) || !isLandNumber(land as LandCode, number)) {
    throw createError({ statusCode: 404, statusMessage: 'Entwurf nicht gefunden' })
  }
  let detail: LandDraftDetail | null
  try {
    detail = await readLandDraft(land as LandCode, number)
  } catch (error) {
    // 404, 410 and 503 are answers; anything else is the Land's page
    // failing the gate or the fetch, and the reader sees „nicht abrufbar".
    if (isError(error)) throw error
    console.warn(`[laender] ${land}/${number}:`, error instanceof Error ? error.message : error)
    throw createError({ statusCode: 503, statusMessage: 'Gerade nicht abrufbar' })
  }
  if (!detail) throw createError({ statusCode: 404, statusMessage: 'Entwurf nicht gefunden' })
  return detail
})
