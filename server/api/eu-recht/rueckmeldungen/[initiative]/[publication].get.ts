/**
 * GET /api/eu-recht/rueckmeldungen/:initiative/:publication →
 * EuRueckmeldungenResponse: who gave feedback in one window of an
 * initiative on the Commission's portal „Ihre Meinung zählt" (step 4 of the
 * EU cycle) — counts per kind of sender and the organisations the naming
 * rule allows (`namedOrganisationOf`), never a person's name and never a
 * contribution's text.
 *
 * Asked only when a reader opens the fold „Wer Rückmeldung gegeben hat",
 * never with the page: up to five paced requests, 2.5 s apart.
 *
 * 400 for a number that is no portal number (digits, no leading zero, at
 * most nine). 404 where the portal proves the initiative unknown, or where
 * the publication is none of its windows — the endpoint reads only what
 * the monitor's own pages offer, and is no proxy for any number. Any other
 * failure, and a reading past the budget, is the state `ungelesen`; the
 * reading goes on behind it and is cached, so the next opening has it.
 *
 * `Cache-Control: no-store`: the answer holds organisations' names, which
 * the server keeps six hours in memory and no longer, because consent to
 * publication can be withdrawn. A browser or proxy keeping a copy would
 * outlive that.
 */
import type { EuRueckmeldungenResponse } from '#shared/types'
import { euInitiativeId } from '#shared/utils/eu'
import { feedbackOf } from '../../../../utils/eu/portalService'
import { withinBudget } from '../../../../utils/http/budget'

/**
 * How long the answer waits for the portal: five requests 2.5 s apart are
 * ten seconds of gaps alone, plus the answers and any turn behind another
 * reader's requests (the pacer gives up past twenty seconds of queue).
 */
const FEEDBACK_BUDGET_MS = 30_000

export default defineEventHandler(async (event): Promise<EuRueckmeldungenResponse> => {
  const initiative = euInitiativeId(getRouterParam(event, 'initiative') ?? '')
  const publication = euInitiativeId(getRouterParam(event, 'publication') ?? '')
  if (initiative === null || publication === null) throw createError({ statusCode: 400, statusMessage: 'Ungültige Nummer' })
  setResponseHeader(event, 'cache-control', 'no-store')
  const read = (await withinBudget(feedbackOf(initiative, publication), FEEDBACK_BUDGET_MS)) ?? { state: 'ungelesen' as const }
  if (read.state === 'unbekannt') throw createError({ statusCode: 404, statusMessage: 'Keine Frist für Rückmeldungen mit dieser Nummer bei diesem Vorhaben' })
  if (read.state === 'ungelesen') return { state: 'ungelesen' }
  return { state: 'gelesen', reading: read.reading }
})
