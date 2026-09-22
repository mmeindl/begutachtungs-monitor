/**
 * GET /api/drafts/:gp/:inr/rv-stellungnahmen → RvStatementsResponse: the
 * Stellungnahmen filed on the Regierungsvorlage the draft became (list 142,
 * item type SN) — count, GDPR-filtered breakdown and the organisations,
 * exactly as the Begutachtung's own panel has them. 404 while the draft has
 * no Regierungsvorlage; above RV_STATEMENTS_CAP the count without the
 * breakdown (`parliament.ts`, getStatementsForRv).
 *
 * The Vorlage is found the way the outcome finds it: from the draft's own
 * stage list, so a Vorlage in a later Gesetzgebungsperiode resolves too.
 */
import type { RvStatementsResponse } from '#shared/types'
import { validateGpInrParams } from '../../../../utils/http/params'

export default defineEventHandler(async (event): Promise<RvStatementsResponse> => {
  const { gp, inr } = validateGpInrParams(event)
  const rv = await findRvForDraft(gp, inr)
  if (!rv) {
    throw createError({ statusCode: 404, statusMessage: 'Der Entwurf hat keine Regierungsvorlage' })
  }
  const { total, items } = await getStatementsForRv(rv.gp, rv.inr)
  return {
    rvCitation: rv.label,
    rvUrl: rv.url,
    total,
    summary: items ? buildStatementsSummary(items) : null,
    cap: RV_STATEMENTS_CAP,
  }
})
