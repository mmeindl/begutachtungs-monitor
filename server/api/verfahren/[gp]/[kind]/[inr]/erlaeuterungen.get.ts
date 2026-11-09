/**
 * A Regierungsvorlage's own Erläuterungen (`getVorlageExplanations`). 404 for
 * an Antrag: its Begründung stands inside the Antrag's document, and cutting
 * it out is not built (docs/architecture.md §12.69).
 */
import type { ExplanationsResponse } from '#shared/types'
import { validateVorlageParams } from '../../../../../utils/http/params'
import { requireVorlageItem } from '../../../../../utils/parliament/vorlageDetail'
import { getVorlageExplanations } from '../../../../../utils/parliament/vorlageTexts'

export default defineEventHandler(async (event): Promise<ExplanationsResponse> => {
  const root = validateVorlageParams(event)
  if (root.ityp !== 'I') throw createError({ statusCode: 404, statusMessage: 'Für einen Antrag nicht verfügbar' })
  await requireVorlageItem(root)
  return getVorlageExplanations(root)
})
