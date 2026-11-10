/**
 * GET /api/laender/:land/lgbl/:year/:nr/vergleich?von=rv&bis=lgbl →
 * LandLawDiffResponse: what the Landtag changed in the Regierungsvorlage,
 * § by §, for a law without a draft in the register (docs/architecture.md
 * §12.70) — the draft page's comparison (`landLawDiffService`), on the
 * law's own texts. Only the pairs the law's page offers (`comparisons`).
 */
import type { LandCode, LandLawDiffResponse, LandTextStation } from '#shared/types'
import { LAND_CODES } from '#shared/utils/laender'
import { cachedLandComparison, LAND_TEXT_PAIRS } from '../../../../../../utils/laender/landLawDiffService'
import { lawAsDraftDetail, readLandLawPage } from '../../../../../../utils/laender/landLawsService'
import { lawParams } from '../../../../../../utils/laender/landLawParams'

export default defineEventHandler(async (event): Promise<LandLawDiffResponse> => {
  const p = lawParams(getRouterParam(event, 'land'), getRouterParam(event, 'year'), getRouterParam(event, 'nr'), LAND_CODES)
  if (!p) throw createError({ statusCode: 404, statusMessage: 'Gesetz nicht gefunden' })
  const query = getQuery(event)
  const pair = LAND_TEXT_PAIRS.find(([a, b]) => a === (query.von ?? 'rv') && b === (query.bis ?? 'lgbl'))
  if (!pair) throw createError({ statusCode: 400, statusMessage: 'Unbekanntes Textpaar' })
  const [from, to] = pair as [LandTextStation, LandTextStation]
  try {
    const detail = await readLandLawPage(p.land as LandCode, p.year, p.number)
    if (!detail) throw createError({ statusCode: 404, statusMessage: 'Gesetz nicht gefunden' })
    return await cachedLandComparison(p.land as LandCode, `lgbl/${p.year}/${p.number}`, from, to, lawAsDraftDetail(detail))
  } catch (error) {
    if (isError(error)) throw error
    console.warn(`[laender] Vergleich Gesetz ${p.land}/${p.year}/${p.number}:`, error instanceof Error ? error.message : error)
    throw createError({ statusCode: 503, statusMessage: 'Gerade nicht abrufbar' })
  }
})
