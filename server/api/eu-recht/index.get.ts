/**
 * GET /api/eu-recht?gp= → EuActsResponse: every EU act a draft of the
 * period's window implements, the latest transposition deadline first
 * — and apart, `restatingOnly`,
 * the acts drafts only restate, so their pages are reachable.
 *
 * Read from the map only (`getEuMap`); where no build has finished, the
 * answer says so — `builtAt: null`, no acts — instead of an empty list
 * that would read as „no draft implements anything".
 */
import type { EuActsResponse } from '#shared/types'
import { gpWindow } from '#shared/utils/gp'
import { gpFromParam, readGpQuery, requirePlausibleGp } from '../../utils/http/params'
import { actSummariesOf, restatingOnlySummariesOf } from '../../utils/eu/euMap'

export default defineEventHandler(async (event): Promise<EuActsResponse> => {
  const currentGp = await getCurrentGp()
  const gp = requirePlausibleGp(gpFromParam(readGpQuery(event), currentGp), currentGp)
  const map = await getEuMap(gp)
  if (!map) {
    return { gp, window: gpWindow(gp) ?? { from: '', to: null }, builtAt: null, acts: [], restatingOnly: [], incomplete: [] }
  }
  return {
    gp,
    window: map.window,
    builtAt: map.builtAt,
    acts: actSummariesOf(map),
    restatingOnly: restatingOnlySummariesOf(map),
    incomplete: map.incomplete,
  }
})
