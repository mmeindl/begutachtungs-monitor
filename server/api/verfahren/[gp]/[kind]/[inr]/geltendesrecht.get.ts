/**
 * The laws in force a Vorlage or Antrag without a Begutachtung would change,
 * read off its own first text (`getRootAmendedLaws`, asOf its Einlangen).
 */
import type { AmendedLawsResponse } from '#shared/types'
import { validateVorlageParams } from '../../../../../utils/http/params'
import { getRootAmendedLaws } from '../../../../../utils/lawtext/amendedLawsService'
import { requireVorlageItem } from '../../../../../utils/parliament/vorlageDetail'

export default defineEventHandler(async (event): Promise<AmendedLawsResponse> => {
  const root = validateVorlageParams(event)
  await requireVorlageItem(root)
  return getRootAmendedLaws(root)
})
