/**
 * The item's own Textgegenüberstellung (`getVorlageTextComparison`): a
 * Regierungsvorlage's, or an Antrag's working copy from Parliament
 * (`parlDionAnnex.ts`).
 */
import type { TextComparisonResponse } from '#shared/types'
import { validateVorlageParams } from '../../../../../utils/http/params'
import { requireVorlageItem } from '../../../../../utils/parliament/vorlageDetail'
import { getVorlageTextComparison } from '../../../../../utils/parliament/vorlageTexts'

export default defineEventHandler(async (event): Promise<TextComparisonResponse> => {
  const root = validateVorlageParams(event)
  await requireVorlageItem(root)
  return getVorlageTextComparison(root)
})
