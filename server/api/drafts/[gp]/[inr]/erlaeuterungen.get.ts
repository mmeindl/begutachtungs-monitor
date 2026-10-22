/**
 * GET /api/drafts/:gp/:inr/erlaeuterungen → ExplanationsResponse: the
 * Allgemeiner Teil of the ministry's Erläuterungen, read from the RIS XML
 * (docs/architecture.md §12.29). `available: false` with a German reason where
 * the draft has none, where RIS holds only a scan, or where the document marks
 * no general part.
 *
 * 404 for a number that is no draft, decided BEFORE the cached function:
 * `getExplanations` answers every number with „ließ sich keinem
 * RIS-Dokument zuordnen", and Nitro keeps any answer — so each made-up
 * number left an entry of ~450 B in the derived LRU, and 20.000 of them
 * evicted the station maps and the RIS corpus every page reads (22.10.2026).
 * Awaited, not run beside it as in `statements.get.ts`: a cached function
 * running in parallel stores its answer even when the request 404s.
 */
import type { ExplanationsResponse } from '#shared/types'
import { validateGpInrParams } from '../../../../utils/http/params'

export default defineEventHandler(async (event): Promise<ExplanationsResponse> => {
  const { gp, inr } = validateGpInrParams(event)
  await requireDraft(gp, inr)
  return getExplanations(gp, inr)
})
