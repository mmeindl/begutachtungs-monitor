/**
 * GET /api/ris-drafts/:id/eu-recht → EuRechtResponse — the same reading as
 * for a Ministerialentwurf, straight from the Begutachtung's own RIS record
 * (docs/architecture.md §12.66). A Verordnungsentwurf has a Vorblatt too.
 */
import type { EuRechtResponse } from '#shared/types'
import { readRisId } from '../../../utils/http/params'
import { risKey } from '../../../utils/eu/euMapStore'

export default defineEventHandler(async (event): Promise<EuRechtResponse> => {
  const id = readRisId(event)
  const fact = await getRisEuRecht(id)
  // The running period's map: a record has no period of its own but its window.
  return withRelated(fact, await getCurrentGp(), risKey(id))
})
