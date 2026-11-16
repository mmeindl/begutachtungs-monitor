/**
 * GET /api/eu-recht/buergerinitiative/:year/:number →
 * EuBuergerinitiativeResponse: one European Citizens' Initiative by its
 * register number — ECI(2022)000002 is `/api/eu-recht/buergerinitiative/
 * 2022/2` (step 5 of the EU cycle, 15.11.2026). An initiative in collection
 * from the list on `/eu-recht`, or one that ended long ago: every
 * initiative of the register has a page.
 *
 * The cached read and fixed list of fields of `eciByNumber` /
 * `parseEciDetails`: no organiser's or sponsor's name, no logo, none of the
 * organisers' texts reach this answer.
 *
 * 400 for a year that is no four digits between 2012 and next year, or a
 * number that is not one to six digits without a leading zero (the page
 * answers a padded number 301 to the canonical address before asking). 404
 * only where the register proves there is no such initiative; any other
 * failure, and a register that does not answer within the budget, is the
 * state `ungelesen` with the register's page of the initiative.
 */
import type { EuBuergerinitiativeResponse } from '#shared/types'
import { euCitizensInitiativeAddress, euCitizensInitiativeReference } from '#shared/utils/eu'
import { todayIso } from '#shared/utils/format'
import { eciPageUrl } from '../../../../utils/eu/eciRegister'
import { eciByNumber } from '../../../../utils/eu/eciService'
import { withinBudget } from '../../../../utils/http/budget'

/**
 * How long the page waits for the register, as an initiative's page of the
 * portal does: one request, but it may wait for its turn behind others, 2.5 s
 * apart. Past the budget the reading goes on and is cached, so the next view
 * has it.
 */
const ECI_BUDGET_MS = 9_000

export default defineEventHandler(async (event): Promise<EuBuergerinitiativeResponse> => {
  const address = euCitizensInitiativeAddress(getRouterParam(event, 'year') ?? '', getRouterParam(event, 'number') ?? '', todayIso())
  if (!address) throw createError({ statusCode: 400, statusMessage: 'Ungültige Nummer einer Bürgerinitiative' })
  const read = (await withinBudget(eciByNumber(address.year, address.number), ECI_BUDGET_MS)) ?? { state: 'ungelesen' as const }
  if (read.state === 'unbekannt') throw createError({ statusCode: 404, statusMessage: 'Keine Bürgerinitiative mit dieser Nummer im Register' })
  if (read.state === 'ungelesen') {
    return { state: 'ungelesen', year: address.year, number: address.number, reference: euCitizensInitiativeReference(address.year, address.number), url: eciPageUrl(address.year, address.number) }
  }
  return { state: 'gefunden', initiative: read.initiative }
})
