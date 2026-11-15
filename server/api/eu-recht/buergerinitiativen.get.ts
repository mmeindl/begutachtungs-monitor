/**
 * GET /api/eu-recht/buergerinitiativen → EuBuergerinitiativenResponse: the
 * European Citizens' Initiatives one can support today — every initiative
 * the register lists as ONGOING, each with the last day of its collection
 * (step 5 of the EU cycle, 15.11.2026) — and the register's own head counts.
 *
 * One request for the list a day, one per initiative in collection for its
 * day (`eciOpen`, cached; the details wait at most `ECI_OPEN_BUDGET_MS`
 * after the list, a row past it says its day is still being read). The
 * initiatives whose last day has passed since the register was read are
 * dropped by today's date. `initiatives` is null where the list could not be
 * read: the page says so with the link to the register, and never shows an
 * empty list for it — an empty list is the register's statement that
 * nothing is in collection.
 */
import type { EuBuergerinitiativenResponse } from '#shared/types'
import { todayIso } from '#shared/utils/format'
import { ECI_REGISTER_PAGE_URL, eciOpenOn } from '../../utils/eu/eciRegister'
import { eciOpen } from '../../utils/eu/eciService'

export default defineEventHandler(async (): Promise<EuBuergerinitiativenResponse> => {
  const read = await eciOpen()
  return {
    initiatives: read ? eciOpenOn(read.rows, todayIso()) : null,
    counts: read?.counts ?? null,
    registerUrl: ECI_REGISTER_PAGE_URL,
  }
})
