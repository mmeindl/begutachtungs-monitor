/**
 * GET /api/laender/:land/lgbl/:year/:nr/geltende-fassung → BgblLawsResponse:
 * the laws this Landesgesetzblatt changed, created or repealed, each at its
 * geltende Fassung in RIS (`landKonsLaws.ts`) — the Bund's endpoint
 * of the same name, for a Landesgesetz. Fetched lazily by the law's page.
 */
import type { BgblLawsResponse } from '#shared/types'
import { readLandKonsLaws } from '../../../../../../utils/laender/landLawsService'
import { landLawParams } from '../../../../../../utils/laender/landRoute'

/*
 * Not `withLandLaw`: this route never reads the law's page — it asks RIS's
 * consolidated Landesrecht by the number alone. Its catch is that helper's
 * rule all the same (12.11.2026; until then every failure became a 503,
 * H3 errors included): an H3 error passes as it is, anything else is 503.
 */
export default defineEventHandler(async (event): Promise<BgblLawsResponse> => {
  const p = landLawParams(event)
  const nr = `LGBl. Nr. ${p.number}/${p.year}`
  try {
    const { laws, repealed } = await readLandKonsLaws(p.land, nr)
    return { bgbl: nr, laws, repealed }
  } catch (error) {
    if (isError(error)) throw error
    console.warn(`[laender] Geltende Fassung ${p.land}/${p.year}/${p.number}:`, error instanceof Error ? error.message : error)
    throw createError({ statusCode: 503, statusMessage: 'Gerade nicht abrufbar' })
  }
})
