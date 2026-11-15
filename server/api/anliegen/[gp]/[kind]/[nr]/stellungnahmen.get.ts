/**
 * The Stellungnahmen on one Anliegen an das Parlament
 * (`/api/anliegen/XXVIII/buergerinitiative/5/stellungnahmen`) — list 142
 * with the item as parent, the same classifier and the same privacy rule as
 * on a Regierungsvorlage (`getStatementsForItem`; the Vorlage's route is
 * `server/api/verfahren/[gp]/[kind]/[inr]/stellungnahmen.get.ts`).
 *
 * The parent is the kind's item type (`anliegenItemType`): `PET`, `BI`, or
 * `I` for a Volksbegehren. The item is checked first through its page's own
 * read (`getAnliegenDetail`, cached): a Volksbegehren before GP XXII and a
 * Beilage that is no Volksbegehren answer its 404 with Parliament's address,
 * so no Regierungsvorlage's Stellungnahmen are served under a Volksbegehren's
 * address.
 *
 * Two fields of the shared response stay empty on purpose. `committeeConsultation`
 * is null: the page shows the committee's requests in its course already
 * (`AnliegenCommittee.statementRequests`), and reading them here would take
 * the whole record through the shared Gegenstand leaf, which the Anliegen
 * avoid because it names the Erstunterzeichner. `predatesFiling` is false:
 * § 23b GOG-NR is the Vorlagen' rule, not the Anliegen's.
 */
import type { RvStatementsResponse } from '#shared/types'
import { anliegenCitation, anliegenIsBundesrat, anliegenItemType, anliegenParliamentUrl } from '#shared/utils/anliegen'
import { requirePlausibleGp, validateAnliegenParams } from '../../../../../utils/http/params'
import { getAnliegenDetail } from '../../../../../utils/parliament/anliegenService'

export default defineEventHandler(async (event): Promise<RvStatementsResponse> => {
  const root = validateAnliegenParams(event)
  const currentGp = await getCurrentGp()
  // The Bundesrat has no period to check („BR").
  if (!anliegenIsBundesrat(root.kind)) requirePlausibleGp(root.gp, currentGp)
  await getAnliegenDetail(root, currentGp)
  const { total, items, unlisted } = await getStatementsForItem(root.gp, anliegenItemType(root.kind), root.inr)
  return {
    rvCitation: anliegenCitation(root),
    rvUrl: anliegenParliamentUrl(root),
    total,
    summary: items ? buildStatementsSummary(items) : null,
    items,
    unlisted,
    cap: STATEMENTS_CAP,
    committeeConsultation: null,
    predatesFiling: false,
  }
})
