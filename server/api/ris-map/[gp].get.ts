/**
 * GET /api/ris-map/{gp} → RisMapResponse: which RIS Begut record belongs to
 * which Ministerialentwurf of the GP (docs/ris-join.md). The consultation
 * detail reads the same map. `{gp}` may be `aktuell` or `vorperiode` — the
 * nightly prewarm timer calls those so no GP is hardcoded on the server.
 */
import type { RisMapResponse } from '#shared/types'
import { gpFromParam, readGpParam } from '../../utils/http/params'

// Prewarm-only: no page calls this; deploy/systemd/begutachtungs-monitor-prewarm.service does, to pay the cold build where nobody waits.
export default defineEventHandler(async (event): Promise<RisMapResponse> => {
  const gp = gpFromParam(readGpParam(event), await getCurrentGp())
  return getRisMapForGp(gp)
})
