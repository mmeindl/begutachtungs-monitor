/**
 * GET /api/laender/:land/lgbl/:year/:nr → LandLawDetail: one Landesgesetz's
 * page, from RIS. 404 where RIS holds no
 * Landesgesetz of that number in the Land; 503 where its index could not be
 * read.
 */
import type { LandCode, LandLawDetail } from '#shared/types'
import { LAND_CODES } from '#shared/utils/laender'
import { readLandLawPage } from '../../../../../utils/laender/landLawsService'
import { lawParams } from '../../../../../utils/laender/landLawParams'

export default defineEventHandler(async (event): Promise<LandLawDetail> => {
  const p = lawParams(getRouterParam(event, 'land'), getRouterParam(event, 'year'), getRouterParam(event, 'nr'), LAND_CODES)
  if (!p) throw createError({ statusCode: 404, statusMessage: 'Gesetz nicht gefunden' })
  let detail: LandLawDetail | null
  try {
    detail = await readLandLawPage(p.land as LandCode, p.year, p.number)
  } catch (error) {
    if (isError(error)) throw error
    console.warn(`[laender] Gesetz ${p.land}/${p.year}/${p.number}:`, error instanceof Error ? error.message : error)
    throw createError({ statusCode: 503, statusMessage: 'Gerade nicht abrufbar' })
  }
  if (!detail) throw createError({ statusCode: 404, statusMessage: 'Gesetz nicht gefunden' })
  return detail
})
