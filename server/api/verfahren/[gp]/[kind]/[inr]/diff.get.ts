/**
 * The § comparison of a Vorlage or Antrag without a Begutachtung — the
 * draft's endpoint of the same name over the item's own record
 * (`getRootLawDiff`), with the item's stations as the vocabulary.
 */
import type { LawDiffResponse } from '#shared/types'
import { itemLawScope } from '#shared/utils/lawStations'
import { readLawStationPair, validateVorlageParams } from '../../../../../utils/http/params'
import { getRootLawDiff } from '../../../../../utils/diff/lawDiffService'
import { requireVorlageItem } from '../../../../../utils/parliament/vorlageDetail'

export default defineEventHandler(async (event): Promise<LawDiffResponse> => {
  const root = validateVorlageParams(event)
  const { from, to } = readLawStationPair(event, itemLawScope(root.ityp))
  await requireVorlageItem(root)
  return getRootLawDiff(root, from, to)
})
