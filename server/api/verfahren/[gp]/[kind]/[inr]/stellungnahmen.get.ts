/**
 * The Stellungnahmen to the Nationalrat on a Vorlage or Antrag (§ 23b
 * GOG-NR) — list 142 with the item as parent, the same classifier and the
 * same privacy rule as on a draft's Vorlage (`getStatementsForItem`).
 */
import type { RvStatementsResponse } from '#shared/types'
import { parliamentItemUrl, rootCitation } from '#shared/utils/procedureRoot'
import { validateVorlageParams } from '../../../../../utils/http/params'
import { readCommitteeConsultation } from '../../../../../utils/parliament/detailJson'
import { requireVorlageItem } from '../../../../../utils/parliament/vorlageDetail'

export default defineEventHandler(async (event): Promise<RvStatementsResponse> => {
  const root = validateVorlageParams(event)
  await requireVorlageItem(root)
  const [{ total, items, unlisted }, committeeConsultation] = await Promise.all([
    getStatementsForItem(root.gp, root.ityp, root.inr),
    getGegenstand(root.gp, root.ityp, root.inr)
      .then((d) => readCommitteeConsultation(d.content?.phase))
      .catch(() => null),
  ])
  return {
    rvCitation: rootCitation(root),
    rvUrl: parliamentItemUrl(root),
    total,
    summary: items ? buildStatementsSummary(items) : null,
    items,
    unlisted,
    cap: STATEMENTS_CAP,
    committeeConsultation,
  }
})
