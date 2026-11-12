/**
 * GET /api/laender/:land/:number/eu-recht → EuRechtResponse: whether a
 * Land's draft implements EU law, which act, and the act's transposition
 * deadline — the Bund's fact, read
 * from the Land's own documents (`eu/landEuService.ts`). Asked by the
 * ProcedureCard after first paint where the server does not have it fast.
 *
 * The number is checked against the Land's record before the cached
 * function (`readLandDraft` answers null for a made-up one), as for the
 * Erläuterungen: a made-up number must leave nothing in the derived LRU.
 * The rate rule is the Land drafts' (`RATE_RULES.landDraft`, by path).
 */
import type { EuRechtResponse } from '#shared/types'
import { getLandEuRecht } from '../../../../utils/eu/landEuService'
import { landKey } from '../../../../utils/eu/euMapStore'
import { landDraftParams, withLandDraft } from '../../../../utils/laender/landRoute'

export default defineEventHandler(async (event): Promise<EuRechtResponse> => {
  const { land, number } = landDraftParams(event)
  return withLandDraft(land, number, 'EU-Recht', async (detail) => {
    const fact = await getLandEuRecht(land, number, detail)
    // `related` from the EU map of the period the Begutachtung began in, never stored with the fact.
    return await withRelatedOfOwnPeriod(fact, landKey(land, number), await getCurrentGp())
  })
})
