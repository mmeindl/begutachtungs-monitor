/**
 * GET /api/eu-recht/rueckmeldungen/:initiative/:publication →
 * EuRueckmeldungenResponse: who gave feedback in one window of an
 * initiative on the Commission's portal „Ihre Meinung zählt" (step 4 of the
 * EU cycle) — each contribution of an organisation the naming rule allows
 * (`namedOrganisationOf`) with its day, kind, country and link on the
 * portal, and counts for the rest; never a person's name, never a
 * contribution's text, and for a counted row no day, number or link. No
 * country parameter: the answer is the same for every member state's page.
 *
 * Asked only when the block „Wer Rückmeldung gegeben hat" comes near the
 * reader's viewport (`EuFeedbackBlock`), never with the page: at most five
 * paced requests per answer, 2.5 s apart.
 *
 * STEPS, ONE ROUTE (16.11.2026). `?teil=erste` asks for page one of the
 * portal's list alone (100 contributions, newest first): `teilweise` with
 * the reading of that page — `total` the portal's count, `read` the rows of
 * page one — or `gelesen` where page one is the whole list or the first
 * reading is already cached, so the block asks no second time. `?seiten=N`
 * asks for the reading of N pages, newest first: 5 (the default, also
 * without the parameter — the newest 500), and on a reader's „Weitere …
 * lesen" 10, 15, … up to 50 (5,000 rows). Each step starts from the step
 * before it in the cache and asks the portal only for the pages it lacks —
 * no page twice, at most five per answer (`feedbackOf`). Where the step
 * before is no longer cached, the answer begins again at page one and
 * holds what five requests reach; the block offers the next step from
 * there. `pages` in the answer is the step it answers. `teil` and `seiten`
 * together, any other `teil`, and a `seiten` that is no multiple of 5 from
 * 5 to 50 are a 400.
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
import { FEEDBACK_STEP_PAGES, isFeedbackStep } from '../../../../utils/eu/portalFeedback'
import { feedbackOf, type FeedbackStep } from '../../../../utils/eu/portalService'
import { withinBudget } from '../../../../utils/http/budget'

/**
 * How long the answer waits for the portal: five requests 2.5 s apart (one
 * step at most) are ten seconds of gaps alone, plus the answers and any
 * turn behind another reader's requests (the pacer gives up past twenty
 * seconds of queue).
 */
const FEEDBACK_BUDGET_MS = 30_000

export default defineEventHandler(async (event): Promise<EuRueckmeldungenResponse> => {
  const initiative = euInitiativeId(getRouterParam(event, 'initiative') ?? '')
  const publication = euInitiativeId(getRouterParam(event, 'publication') ?? '')
  if (initiative === null || publication === null) throw createError({ statusCode: 400, statusMessage: 'Ungültige Nummer' })
  const { teil, seiten } = getQuery(event)
  if (teil !== undefined && teil !== 'erste') throw createError({ statusCode: 400, statusMessage: 'Ungültiger Teil' })
  const pages = seiten === undefined ? FEEDBACK_STEP_PAGES : typeof seiten === 'string' && /^[1-9]\d{0,2}$/.test(seiten) ? Number(seiten) : Number.NaN
  if (!isFeedbackStep(pages) || (teil !== undefined && seiten !== undefined)) throw createError({ statusCode: 400, statusMessage: 'Ungültige Zahl der Seiten' })
  const step: FeedbackStep = teil === 'erste' ? 'erste' : pages
  setResponseHeader(event, 'cache-control', 'no-store')
  const read = (await withinBudget(feedbackOf(initiative, publication, step), FEEDBACK_BUDGET_MS)) ?? { state: 'ungelesen' as const }
  if (read.state === 'unbekannt') throw createError({ statusCode: 404, statusMessage: 'Keine Frist für Rückmeldungen mit dieser Nummer bei diesem Vorhaben' })
  if (read.state === 'ungelesen') return { state: 'ungelesen' }
  return { state: read.state, reading: read.reading, pages: read.pages }
})
