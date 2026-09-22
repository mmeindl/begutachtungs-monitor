/**
 * GET /api/ris-drafts/:id/kundmachung → BgblOutcome: whether this
 * Verordnungsentwurf became a Kundmachung in BGBl II
 * (docs/architecture.md §12.32).
 *
 * Its own endpoint and not part of the detail response: the answer costs a
 * whole year of the Bundesgesetzblatt, and the page should render before it
 * arrives — the same split as for the Erläuterungen and the comparisons.
 *
 * The states that come back are named in `shared/types/bgbl.ts`. The most
 * important one is `ausstehend`: a Frist that ended six weeks ago is not an
 * answer about the Ressort but about the clock.
 */
import type { BgblOutcome } from '#shared/types'
import { readRisId } from '../../../utils/http/params'

export default defineEventHandler(async (event): Promise<BgblOutcome> => {
  const id = readRisId(event)
  return getBgblOutcome(id)
})
