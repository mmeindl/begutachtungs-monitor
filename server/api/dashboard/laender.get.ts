/**
 * GET /api/dashboard/laender?gp=… → DashboardLaender: the Länder's rows for
 * „Beschlossen, noch nicht kundgemacht" and „Zuletzt Gesetz geworden"
 * (30.10.2026, `utils/laender/recent.ts`).
 *
 * `gp` is the period the Bund's half of „Zuletzt Gesetz geworden" answered
 * with: the running one, or the one before during its fallback (§12.35) —
 * and nothing else, so the cache holds two keys at most.
 */
import type { DashboardLaender } from '#shared/types'
import { previousGp } from '#shared/utils/gp'
import { firstQueryValue } from '#shared/utils/queryParams'
import { getRecentLandStations } from '../../utils/laender/recent'
import { getCurrentGp } from '../../utils/parliament/drafts'

export default defineEventHandler(async (event): Promise<DashboardLaender> => {
  const currentGp = await getCurrentGp()
  const gp = firstQueryValue(getQuery(event).gp) || currentGp
  if (gp !== currentGp && gp !== previousGp(currentGp)) {
    throw createError({ statusCode: 400, statusMessage: 'Ungültige Gesetzgebungsperiode' })
  }
  return getRecentLandStations(currentGp, gp)
})
