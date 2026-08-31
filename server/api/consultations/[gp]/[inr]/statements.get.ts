/**
 * GET /api/consultations/:gp/:inr/statements → StatementsResponse.
 * List 142, GDPR-filtered (names of private persons never leave the
 * server), date descending. 404 for an unknown item.
 *
 * On a failed list-142 fetch the persisted last-good aggregation is served
 * with `staleAsOf` — the same fallback the detail page's summary uses
 * (parliament.ts, getStatementsWithFallback). Only without any record does
 * this route error, and then with the upstream reason.
 */
import type { StatementsResponse } from '#shared/types'
import { validateGpInrParams } from '../../../../utils/params'

export default defineEventHandler(async (event): Promise<StatementsResponse> => {
  const { gp, inr } = validateGpInrParams(event)

  // Existence check and list 142 are independent → parallel; for an unknown
  // item the 404 wins, the list then just returns zero rows.
  const [, statements] = await Promise.all([
    requireConsultation(gp, inr),
    getStatementsWithFallback(gp, inr),
  ])
  return { items: statements.items, staleAsOf: statements.staleAsOf }
})
