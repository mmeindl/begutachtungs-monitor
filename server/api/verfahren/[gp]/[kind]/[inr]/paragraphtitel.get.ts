/**
 * The § names of a comparison of a Vorlage or Antrag without a Begutachtung
 * (`getRootParagraphTitles`), as the draft's endpoint of the same name.
 */
import type { ParagraphTitlesResponse } from '#shared/types'
import { itemLawScope } from '#shared/utils/lawStations'
import { readLawStationPair, validateVorlageParams } from '../../../../../utils/http/params'
import { getRootParagraphTitles } from '../../../../../utils/diff/paraTitleService'
import { requireVorlageItem } from '../../../../../utils/parliament/vorlageDetail'

export default defineEventHandler(async (event): Promise<ParagraphTitlesResponse> => {
  const root = validateVorlageParams(event)
  const { from, to } = readLawStationPair(event, itemLawScope(root.ityp))
  await requireVorlageItem(root)
  return getRootParagraphTitles(root, from, to)
})
