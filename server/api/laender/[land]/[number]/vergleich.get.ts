/**
 * GET /api/laender/:land/:number/vergleich → LandLawDiffResponse: the draft
 * against its Kundmachung, § by § (`landLawDiffService`). Fetched lazily by
 * the draft page's „Im Landesgesetzblatt": two documents and a PDF parse,
 * which the page must not wait for.
 */
import type { LandCode, LandLawDiffResponse } from '#shared/types'
import { LAND_CODES } from '#shared/utils/laender'
import { cachedLandComparison } from '../../../../utils/laender/landLawDiffService'
import { LAND_NUMBER_RE, readLandDraft } from '../../../../utils/laender/sources'

export default defineEventHandler(async (event): Promise<LandLawDiffResponse> => {
  const land = getRouterParam(event, 'land') ?? ''
  const number = getRouterParam(event, 'number') ?? ''
  if (!(LAND_CODES as readonly string[]).includes(land) || !LAND_NUMBER_RE.test(number)) {
    throw createError({ statusCode: 404, statusMessage: 'Entwurf nicht gefunden' })
  }
  try {
    const detail = await readLandDraft(land as LandCode, number)
    if (!detail) throw createError({ statusCode: 404, statusMessage: 'Entwurf nicht gefunden' })
    return await cachedLandComparison(land as LandCode, number, detail)
  } catch (error) {
    if (isError(error)) throw error
    console.warn(`[laender] Vergleich ${land}/${number}:`, error instanceof Error ? error.message : error)
    throw createError({ statusCode: 503, statusMessage: 'Gerade nicht abrufbar' })
  }
})
