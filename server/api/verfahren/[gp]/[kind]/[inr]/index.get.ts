/**
 * The page of a Regierungsvorlage or Antrag without a Begutachtung
 * (docs/architecture.md §12.69). 404 for any other item of those types.
 */
import type { VorlageDetail } from '#shared/types'
import { validateVorlageParams } from '../../../../../utils/http/params'
import { getVorlageDetail } from '../../../../../utils/parliament/vorlageDetail'

export default defineEventHandler(async (event): Promise<VorlageDetail> => {
  return getVorlageDetail(validateVorlageParams(event))
})
