/**
 * GET /api/antraege?gp= → AntraegeResponse: every Initiativantrag on a
 * Bundesgesetz of a period with where it stands — the rows of the list's
 * option „Alle Initiativanträge" (`art=initiativantraege`, decision 1 of
 * 14.11.2026). The Anträge that carry a consulted draft's text are rows of
 * that draft and stay out (`antraegeService.ts`).
 *
 * A procedural state per row, sorted by participation and date — never by
 * outcome, never with a club or a count per club (the framing rule).
 *
 * `?gp=` accepts `aktuell` (the default), `vorperiode` or a period code.
 */
import type { AntraegeResponse } from '#shared/types'
import { gpFromParam, readGpQuery, requirePlausibleGp } from '../utils/http/params'
import { getAntraege } from '../utils/parliament/antraegeService'

export default defineEventHandler(async (event): Promise<AntraegeResponse> => {
  const currentGp = await getCurrentGp()
  const gp = requirePlausibleGp(gpFromParam(readGpQuery(event), currentGp), currentGp)
  return getAntraege(gp)
})
