/**
 * GET /api/laender/:land/lgbl/:year/:nr/vergleich?von=rv&bis=lgbl →
 * LandLawDiffResponse: what the Landtag changed in the Regierungsvorlage,
 * § by §, for a law without a draft in the register — the draft page's comparison (`landLawDiffService`), on the
 * law's own texts. Only the pairs the law's page offers (`comparisons`).
 */
import type { LandLawDiffResponse, LandTextStation } from '#shared/types'
import { cachedLandComparison, LAND_TEXT_PAIRS } from '../../../../../../utils/laender/landLawDiffService'
import { lawAsDraftDetail } from '../../../../../../utils/laender/landLawsService'
import { landLawParams, withLandLaw } from '../../../../../../utils/laender/landRoute'
import { readLandLawChanges } from '../../../../../../utils/laender/landLawChangesService'
import { lgblRecord } from '../../../../../../utils/laender/lgblIndex'

export default defineEventHandler(async (event): Promise<LandLawDiffResponse> => {
  const p = landLawParams(event)
  // The pair before RIS is read: an unknown pair costs no request.
  const query = getQuery(event)
  const pair = LAND_TEXT_PAIRS.find(([a, b]) => a === (query.von ?? 'rv') && b === (query.bis ?? 'lgbl'))
  if (!pair) throw createError({ statusCode: 400, statusMessage: 'Unbekanntes Textpaar' })
  const [from, to] = pair as [LandTextStation, LandTextStation]
  return withLandLaw(p, 'Vergleich Gesetz', async (detail) => {
    // What the law changed, from RIS's consolidated Landesrecht (`landLawChangesService.ts`).
    if (from === 'vorher' && to === 'nachher') {
      const record = await lgblRecord(p.land, detail.law.nr)
      return (await readLandLawChanges(p.land, detail.law.nr, record?.xmlUrl ?? null, detail.law.url, record?.datum?.slice(0, 10) ?? null)).value
    }
    return await cachedLandComparison(p.land, `lgbl/${p.year}/${p.number}`, from, to, lawAsDraftDetail(detail))
  })
})
