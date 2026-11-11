/**
 * GET /api/ris-drafts/:id/eu-recht → EuRechtResponse — the same reading as
 * for a Ministerialentwurf, straight from the Begutachtung's own RIS record.
 * A Verordnungsentwurf has a Vorblatt too.
 */
import type { EuRechtResponse } from '#shared/types'
import { readRisId } from '../../../utils/http/params'
import { risKey } from '../../../utils/eu/euMapStore'

export default defineEventHandler(async (event): Promise<EuRechtResponse> => {
  const id = readRisId(event)
  const fact = await getRisEuRecht(id)
  // A record has no period of its own: the map of the one whose window holds its Beginn.
  return withRelatedOfOwnPeriod(fact, risKey(id), await getCurrentGp())
})
