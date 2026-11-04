/**
 * GET /api/drafts/:gp/:inr/eu-recht → EuRechtResponse: whether the draft
 * implements EU law (Vorblatt), which act (law text), and the act's
 * transposition deadline (EUR-Lex) — docs/architecture.md §12.66.
 *
 * 404 for a number that is no draft, decided BEFORE the cached function, as
 * for the Erläuterungen: a made-up number must not leave an entry in the
 * derived LRU.
 */
import type { EuRechtResponse } from '#shared/types'
import { validateGpInrParams } from '../../../../utils/http/params'

export default defineEventHandler(async (event): Promise<EuRechtResponse> => {
  const { gp, inr } = validateGpInrParams(event)
  await requireDraft(gp, inr)
  return getEuRecht(gp, inr)
})
