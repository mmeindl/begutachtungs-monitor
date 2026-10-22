/**
 * GET /api/laender/:land/:number/vergleich?von=entwurf&bis=rv →
 * LandLawDiffResponse: two texts of the draft, § by § (`landLawDiffService`).
 * Fetched lazily by the draft page's station sections: two documents and a
 * PDF parse, which the page must not wait for. Without parameters: the
 * draft against the Kundmachung.
 */
import type { LandCode, LandLawDiffResponse, LandTextStation } from '#shared/types'
import { LAND_CODES } from '#shared/utils/laender'
import { cachedLandComparison, LAND_TEXT_PAIRS } from '../../../../utils/laender/landLawDiffService'
import { LAND_NUMBER_RE, readLandDraft } from '../../../../utils/laender/sources'

export default defineEventHandler(async (event): Promise<LandLawDiffResponse> => {
  const land = getRouterParam(event, 'land') ?? ''
  const number = getRouterParam(event, 'number') ?? ''
  if (!(LAND_CODES as readonly string[]).includes(land) || !LAND_NUMBER_RE.test(number)) {
    throw createError({ statusCode: 404, statusMessage: 'Entwurf nicht gefunden' })
  }
  const query = getQuery(event)
  const pair = LAND_TEXT_PAIRS.find(([a, b]) => a === (query.von ?? 'entwurf') && b === (query.bis ?? 'lgbl'))
  if (!pair) throw createError({ statusCode: 400, statusMessage: 'Unbekanntes Textpaar' })
  const [from, to] = pair as [LandTextStation, LandTextStation]
  try {
    const detail = await readLandDraft(land as LandCode, number)
    if (!detail) throw createError({ statusCode: 404, statusMessage: 'Entwurf nicht gefunden' })
    return await cachedLandComparison(land as LandCode, number, from, to, detail)
  } catch (error) {
    if (isError(error)) throw error
    console.warn(`[laender] Vergleich ${land}/${number}:`, error instanceof Error ? error.message : error)
    throw createError({ statusCode: 503, statusMessage: 'Gerade nicht abrufbar' })
  }
})
