/**
 * GET /api/drafts/:gp/:inr/statements → StatementsResponse.
 * List 142, GDPR-filtered (names of private persons never leave the
 * server), date descending. 404 for an unknown item.
 *
 * On a failed list-142 fetch the persisted last-good aggregation is served
 * with `staleAsOf` — the same fallback the detail page's summary uses
 * (parliament/statements.ts, getStatementsWithFallback). Only without any record does
 * this route error, and then with the upstream reason.
 */
import type { StatementsResponse } from '#shared/types'
import { validateGpInrParams } from '../../../../utils/http/params'

export default defineEventHandler(async (event): Promise<StatementsResponse> => {
  const { gp, inr } = validateGpInrParams(event)

  // Existence check and list 142 run in parallel; for an unknown item both
  // answer 404, and nothing is cached for it.
  const [, statements] = await Promise.all([
    requireDraft(gp, inr),
    getStatementsWithFallback(gp, inr),
  ])
  return { items: statements.items, staleAsOf: statements.staleAsOf }
})
