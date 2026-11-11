/**
 * A Regierungsvorlage's own Textgegenüberstellung (`getVorlageTextComparison`).
 * 404 for an Antrag: its annex is Parliament's working copy in a template
 * this site does not read.
 */
import type { TextComparisonResponse } from '#shared/types'
import { validateVorlageParams } from '../../../../../utils/http/params'
import { requireVorlageItem } from '../../../../../utils/parliament/vorlageDetail'
import { getVorlageTextComparison } from '../../../../../utils/parliament/vorlageTexts'

export default defineEventHandler(async (event): Promise<TextComparisonResponse> => {
  const root = validateVorlageParams(event)
  if (root.ityp !== 'I') throw createError({ statusCode: 404, statusMessage: 'Für einen Antrag nicht verfügbar' })
  await requireVorlageItem(root)
  return getVorlageTextComparison(root)
})
