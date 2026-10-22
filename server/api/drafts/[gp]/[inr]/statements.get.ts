/**
 * GET /api/drafts/:gp/:inr/statements → StatementsResponse.
 * List 142, GDPR-filtered (names of private persons never leave the
 * server), date descending. 404 for an unknown item.
 *
 * On a failed list-142 fetch the persisted last-good aggregation is served
 * with `staleAsOf` — the same fallback the detail page's summary uses
 * (parliament/statements.ts, getStatementsWithFallback). Only without any record does
 * this route error, and then with the upstream reason.
 *
 * Above STATEMENTS_CAP the items are the institutions only and `unlisted`
 * counts the rest (since 22.10.2026) — never the first 100,000 rows of a
 * longer list presented as all of them.
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
  return { items: statements.items, unlisted: statements.unlisted, staleAsOf: statements.staleAsOf }
})
