/**
 * GET /api/ris-drafts/:id/eu-recht → EuRechtResponse — the same reading as
 * for a Ministerialentwurf, straight from the Begutachtung's own RIS record
 * (docs/architecture.md §12.66). A Verordnungsentwurf has a Vorblatt too.
 */
import type { EuRechtResponse } from '#shared/types'
import { readRisId } from '../../../utils/http/params'

export default defineEventHandler(async (event): Promise<EuRechtResponse> => {
  const id = readRisId(event)
  return getRisEuRecht(id)
})
