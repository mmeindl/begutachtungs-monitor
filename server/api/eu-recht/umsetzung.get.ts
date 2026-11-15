/**
 * GET /api/eu-recht/umsetzung → EuUmsetzungResponse: the directives the
 * Member State has to transpose — every directive with a transposition date
 * within two years of today, whether or not anybody works on it — by
 * deadline, each with two observations: the drafts the monitor found and
 * the number of measures the country notified to the Commission (rule D6:
 * dates and observations, no verdict).
 *
 * Two small Cellar queries, each cached a day (`cellarService.ts`), joined
 * with the map of drafts. `rows` is null where the Cellar did not answer
 * for the directives; a row's `measures` is null where it did not answer
 * for the notifications; `drafts` is null while no map is built. Each is
 * „unknown", and the page says so.
 */
import type { EuUmsetzungResponse } from '#shared/types'
import { EU_MEMBER_STATE, euUmsetzungWindow } from '#shared/utils/eu'
import { todayIso } from '#shared/utils/format'
import { gpWindow } from '#shared/utils/gp'
import { directivesToTranspose, measureCountsOf } from '../../utils/eu/cellarService'
import { actSummariesOf } from '../../utils/eu/euMap'
import { umsetzungRows } from '../../utils/eu/umsetzung'

export default defineEventHandler(async (): Promise<EuUmsetzungResponse> => {
  const window = euUmsetzungWindow(todayIso())
  const gp = await getCurrentGp()
  const [directives, counts, map] = await Promise.all([
    directivesToTranspose(window.from, window.to),
    measureCountsOf(EU_MEMBER_STATE, window.from, window.to),
    getEuMap(gp),
  ])
  return {
    country: EU_MEMBER_STATE,
    window,
    rows: directives ? umsetzungRows(directives, counts, map ? actSummariesOf(map) : null) : null,
    draftsWindow: map?.window ?? gpWindow(gp) ?? { from: '', to: null },
    incomplete: map?.incomplete ?? [],
  }
})
