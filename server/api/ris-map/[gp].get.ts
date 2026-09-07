/**
 * GET /api/ris-map/{gp} → RisMapResponse: which RIS Begut record belongs to
 * which Ministerialentwurf of the GP (docs/ris-join.md). Read-only diagnostic
 * for now; the consultation detail will consume the same map.
 */
import type { RisMapResponse } from '#shared/types'
import { GP_RE } from '#shared/utils/gp'

export default defineEventHandler(async (event): Promise<RisMapResponse> => {
  const gp = (getRouterParam(event, 'gp') ?? '').toUpperCase()
  if (!GP_RE.test(gp)) {
    throw createError({ statusCode: 400, statusMessage: 'Ungültige Gesetzgebungsperiode (römische Ziffern erwartet)' })
  }
  return getRisMapForGp(gp)
})
