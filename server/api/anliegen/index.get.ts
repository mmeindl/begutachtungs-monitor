/**
 * GET /api/anliegen?gp= → AnliegenListResponse: every Petition,
 * Bürgerinitiative and Volksbegehren of a period with where it stands (step 3
 * of `docs/research/umsetzungsplan-petitionen-volksbegehren.md`).
 *
 * A state per row, never ranked or counted by outcome (the framing rule);
 * the page sorts by the last step. A kind whose list could not be read is
 * named in `unread.kinds`, the others are still served.
 *
 * `?gp=` accepts `aktuell` (the default), `vorperiode` or a period code.
 */
import type { AnliegenListResponse } from '#shared/types'
import { gpFromParam, readGpQuery, requirePlausibleGp } from '../../utils/http/params'
import { getAnliegenRows } from '../../utils/parliament/anliegenService'

export default defineEventHandler(async (event): Promise<AnliegenListResponse> => {
  const currentGp = await getCurrentGp()
  const gp = requirePlausibleGp(gpFromParam(readGpQuery(event), currentGp), currentGp)
  return getAnliegenRows(gp, currentGp)
})
