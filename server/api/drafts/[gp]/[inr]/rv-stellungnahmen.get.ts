/**
 * GET /api/drafts/:gp/:inr/rv-stellungnahmen → RvStatementsResponse: the
 * Stellungnahmen filed on the Regierungsvorlage the draft became (list 142,
 * item type SN) — count, GDPR-filtered breakdown and the organisations,
 * exactly as the Begutachtung's own panel has them. 404 while the draft has
 * no Regierungsvorlage; above STATEMENTS_CAP the organisations alone,
 * with `unlisted` naming what was left (`parliament/statements.ts`,
 * getStatementsForRv).
 *
 * `items` travels beside the summary so the panel can LIST the anonymous
 * rows rather than only count them. They carry no name — the classifier
 * nulls it for every private person before anything leaves the server
 * (`parliament/privacy.ts`) — but they do carry a date, a Geschäftszahl and
 * the link to a public document.
 *
 * The Vorlage is found the way the outcome finds it: from the draft's own
 * stage list, so a Vorlage in a later Gesetzgebungsperiode resolves too.
 */
import type { RvStatementsResponse } from '#shared/types'
import { validateGpInrParams } from '../../../../utils/http/params'
import { periodPredatesSecondRound, statementsPredateSecondRound } from '../../../../utils/parliament/detailJson'

export default defineEventHandler(async (event): Promise<RvStatementsResponse> => {
  const { gp, inr } = validateGpInrParams(event)
  const rv = await findRvForDraft(gp, inr)
  if (!rv) {
    throw createError({ statusCode: 404, statusMessage: 'Der Entwurf hat keine Regierungsvorlage' })
  }
  const [{ total, items, unlisted }, record] = await Promise.all([
    getStatementsForRv(rv.gp, rv.inr),
    // The Vorlage's own detail, already in the leaf cache for the page's
    // chain; an unreadable Verlauf claims no consultation rather than failing
    // the list, and no reason why none were possible.
    getGegenstand(rv.gp, 'I', rv.inr)
      .then((d) => ({ committeeConsultation: readCommitteeConsultation(d.content?.phase), predatesFiling: statementsPredateSecondRound(rv.gp, d.content) }))
      .catch(() => ({ committeeConsultation: null, predatesFiling: periodPredatesSecondRound(rv.gp) })),
  ])
  return {
    rvCitation: rv.label,
    rvUrl: rv.url,
    total,
    summary: items ? buildStatementsSummary(items) : null,
    items,
    unlisted,
    cap: STATEMENTS_CAP,
    committeeConsultation: record.committeeConsultation,
    predatesFiling: record.predatesFiling,
  }
})
