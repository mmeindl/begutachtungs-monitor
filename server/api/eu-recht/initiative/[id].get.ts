/**
 * GET /api/eu-recht/initiative/:id → EuInitiativeResponse: one initiative
 * of the Commission's portal „Ihre Meinung zählt", by the portal's number —
 * an open window of the list on `/eu-recht`, or one that closed long ago:
 * a closed window stays a page (step 3 of the EU cycle).
 *
 * The same cached read and fixed list of fields as the consultation behind
 * an act (`initiativeById`, `parseInitiative`): no official's name, address
 * or number reaches this answer.
 *
 * 400 for an id that is no portal number (digits, no leading zero, at most
 * nine). 404 only where the portal proves there is no such initiative; any
 * other failure, and a portal that does not answer within the budget, is
 * the state `ungelesen` with the portal's page of the initiative — the
 * page then says it could not be read, never that there is none.
 */
import type { EuInitiativeResponse } from '#shared/types'
import { euInitiativeId } from '#shared/utils/eu'
import { initiativePageUrl } from '../../../utils/eu/haveYourSay'
import { initiativeById } from '../../../utils/eu/portalService'
import { withinBudget } from '../../../utils/http/budget'

/**
 * How long the page waits for the portal, as an act's page does
 * (`PORTAL_BUDGET_MS` in `akte/[celex].get.ts`): one request here, but it
 * may wait for its turn behind others, 2.5 s apart. Past the budget the
 * reading goes on and is cached, so the next view has it.
 */
const PORTAL_BUDGET_MS = 9_000

export default defineEventHandler(async (event): Promise<EuInitiativeResponse> => {
  const id = euInitiativeId(getRouterParam(event, 'id') ?? '')
  if (id === null) throw createError({ statusCode: 400, statusMessage: 'Ungültige Nummer eines Vorhabens' })
  const read = (await withinBudget(initiativeById(id), PORTAL_BUDGET_MS)) ?? { state: 'ungelesen' as const }
  if (read.state === 'unbekannt') throw createError({ statusCode: 404, statusMessage: 'Kein Vorhaben mit dieser Nummer im Portal' })
  if (read.state === 'ungelesen') return { state: 'ungelesen', id, url: initiativePageUrl(id) }
  return { state: 'gefunden', initiative: read.initiative }
})
