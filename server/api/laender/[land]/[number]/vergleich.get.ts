/**
 * GET /api/laender/:land/:number/vergleich?von=entwurf&bis=rv →
 * LandLawDiffResponse: two texts of the draft, § by § (`landLawDiffService`).
 * Fetched lazily by the draft page's station sections: two documents and a
 * PDF parse, which the page must not wait for. Without parameters: the
 * draft against the Kundmachung.
 */
import type { LandLawDiffResponse, LandTextStation } from '#shared/types'
import { cachedLandComparison, LAND_TEXT_PAIRS } from '../../../../utils/laender/landLawDiffService'
import { landDraftParams, withLandDraft } from '../../../../utils/laender/landRoute'

export default defineEventHandler(async (event): Promise<LandLawDiffResponse> => {
  const { land, number } = landDraftParams(event)
  // The pair before the Land is read: an unknown pair costs no request.
  const query = getQuery(event)
  const pair = LAND_TEXT_PAIRS.find(([a, b]) => a === (query.von ?? 'entwurf') && b === (query.bis ?? 'lgbl'))
  if (!pair) throw createError({ statusCode: 400, statusMessage: 'Unbekanntes Textpaar' })
  const [from, to] = pair as [LandTextStation, LandTextStation]
  return withLandDraft(land, number, 'Vergleich', (detail) => cachedLandComparison(land, number, from, to, detail))
})
