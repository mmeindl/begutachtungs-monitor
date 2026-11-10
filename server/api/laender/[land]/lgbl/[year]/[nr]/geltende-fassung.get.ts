/**
 * GET /api/laender/:land/lgbl/:year/:nr/geltende-fassung → BgblLawsResponse:
 * the laws this Landesgesetzblatt changed, created or repealed, each at its
 * geltende Fassung in RIS (`landKonsLaws.ts`, §12.70) — the Bund's endpoint
 * of the same name, for a Landesgesetz. Fetched lazily by the law's page.
 */
import type { BgblLawsResponse, LandCode } from '#shared/types'
import { LAND_CODES } from '#shared/utils/laender'
import { readLandKonsLaws } from '../../../../../../utils/laender/landLawsService'
import { lawParams } from '../../../../../../utils/laender/landLawParams'

export default defineEventHandler(async (event): Promise<BgblLawsResponse> => {
  const p = lawParams(getRouterParam(event, 'land'), getRouterParam(event, 'year'), getRouterParam(event, 'nr'), LAND_CODES)
  if (!p) throw createError({ statusCode: 404, statusMessage: 'Gesetz nicht gefunden' })
  const nr = `LGBl. Nr. ${p.number}/${p.year}`
  try {
    const { laws, repealed } = await readLandKonsLaws(p.land as LandCode, nr)
    return { bgbl: nr, laws, repealed }
  } catch (error) {
    console.warn(`[laender] Geltende Fassung ${p.land}/${p.year}/${p.number}:`, error instanceof Error ? error.message : error)
    throw createError({ statusCode: 503, statusMessage: 'Gerade nicht abrufbar' })
  }
})
