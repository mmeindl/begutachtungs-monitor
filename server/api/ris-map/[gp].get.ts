/**
 * GET /api/ris-map/{gp} → RisMapResponse: which RIS Begut record belongs to
 * which Ministerialentwurf of the GP (docs/ris-join.md). The consultation
 * detail reads the same map. `{gp}` may be `aktuell` — the nightly prewarm
 * timer (deploy/bootstrap.sh) calls that so no GP is hardcoded on the server.
 */
import type { RisMapResponse } from '#shared/types'
import { GP_RE } from '#shared/utils/gp'

export default defineEventHandler(async (event): Promise<RisMapResponse> => {
  const param = (getRouterParam(event, 'gp') ?? '').toUpperCase()
  const gp = param === 'AKTUELL' ? await getCurrentGp() : param
  if (!GP_RE.test(gp)) {
    throw createError({ statusCode: 400, statusMessage: 'Ungültige Gesetzgebungsperiode (römische Ziffern erwartet)' })
  }
  return getRisMapForGp(gp)
})
