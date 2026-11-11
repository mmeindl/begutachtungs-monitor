/**
 * GET /api/drafts/:gp/:inr/eu-recht → EuRechtResponse: whether the draft
 * implements EU law (Vorblatt), which act (law text), and the act's
 * transposition deadline (EUR-Lex).
 *
 * 404 for a number that is no draft, decided BEFORE the cached function, as
 * for the Erläuterungen: a made-up number must not leave an entry in the
 * derived LRU.
 *
 * `related` names the other drafts of the EU map that implement the same
 * acts; absent where the map is not at hand within a second.
 */
import type { EuRechtResponse } from '#shared/types'
import { validateGpInrParams } from '../../../../utils/http/params'
import { meKey } from '../../../../utils/eu/euMapStore'

export default defineEventHandler(async (event): Promise<EuRechtResponse> => {
  const { gp, inr } = validateGpInrParams(event)
  await requireDraft(gp, inr)
  // `related` from the EU map, never stored with the fact.
  return withRelated(await getEuRecht(gp, inr), gp, meKey(gp, inr))
})
