/**
 * GET /api/staatsvertraege?gp= → StaatsvertraegeResponse: every treaty's
 * Vorlage of a period (`DOKTYP` „RVS": Staatsverträge and
 * Art.-15a-Vereinbarungen) with where it stands — the rows of the list's
 * option „Staatsverträge" (`art=staatsvertraege`, decision 3 of 14.11.2026).
 *
 * `?gp=` accepts `aktuell` (the default), `vorperiode` or a period code.
 */
import type { StaatsvertraegeResponse } from '#shared/types'
import { gpFromParam, readGpQuery, requirePlausibleGp } from '../utils/http/params'
import { getStaatsvertraege } from '../utils/parliament/staatsvertraegeService'

export default defineEventHandler(async (event): Promise<StaatsvertraegeResponse> => {
  const currentGp = await getCurrentGp()
  const gp = requirePlausibleGp(gpFromParam(readGpQuery(event), currentGp), currentGp)
  return getStaatsvertraege(gp)
})
