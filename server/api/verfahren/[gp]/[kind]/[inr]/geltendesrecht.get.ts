/**
 * The laws in force a Vorlage or Antrag without a Begutachtung would change,
 * read off its own first text (`getRootAmendedLaws`, asOf its Einlangen).
 *
 * A treaty publishes its text as the Staatsvertrag, not as a Gesetzestext,
 * so „no law text found" is no gap in following it: the question which law
 * text it amends is not one its record answers (14.11.2026, 119 d.B. XXVIII).
 * Its frame keeps the row off rather than saying „nicht lesbar".
 */
import type { AmendedLawsResponse } from '#shared/types'
import { validateVorlageParams } from '../../../../../utils/http/params'
import { getRootAmendedLaws } from '../../../../../utils/lawtext/amendedLawsService'
import { requireVorlageItem } from '../../../../../utils/parliament/vorlageDetail'
import { pageKindOf } from '../../../../../utils/parliament/vorlageDetailAssembly'

export default defineEventHandler(async (event): Promise<AmendedLawsResponse> => {
  const root = validateVorlageParams(event)
  const content = await requireVorlageItem(root)
  const laws = await getRootAmendedLaws(root)
  if (laws.unread === 'no-text' && pageKindOf(root.ityp, content.doktyp) === 'staatsvertrag') return { ...laws, unread: null }
  return laws
})
