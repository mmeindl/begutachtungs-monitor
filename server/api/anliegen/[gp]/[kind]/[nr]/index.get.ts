/**
 * The page of one Anliegen an das Parlament — a Petition, a
 * Bürgerinitiative or a Volksbegehren (`/api/anliegen/XXVIII/buergerinitiative/5`).
 *
 * 400 for a malformed period, kind or number, 404 for a period that does not
 * exist yet (before any cache sees it), and 404 with Parliament's address
 * where Parliament's record is no such item (`getAnliegenDetail`).
 *
 * `periodEnded` is added here because the reader knows no running period:
 * a Petition is never carried over and simply stops at a period's end, so
 * „Gesetzgebungsperiode beendet" is said from the period, not from a field.
 */
import type { AnliegenDetail } from '#shared/types'
import { anliegenIsBundesrat } from '#shared/utils/anliegen'
import { gpHasEnded } from '#shared/utils/gp'
import { requirePlausibleGp, validateAnliegenParams } from '../../../../../utils/http/params'
import { getAnliegenDetail } from '../../../../../utils/parliament/anliegenService'

export default defineEventHandler(async (event): Promise<AnliegenDetail> => {
  const root = validateAnliegenParams(event)
  const currentGp = await getCurrentGp()
  // The Bundesrat has no period to check („BR").
  if (!anliegenIsBundesrat(root.kind)) requirePlausibleGp(root.gp, currentGp)
  const detail = await getAnliegenDetail(root, currentGp)
  return { ...detail, periodEnded: gpHasEnded(root.gp, currentGp) }
})
