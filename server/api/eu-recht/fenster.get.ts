/**
 * GET /api/eu-recht/fenster → EuFensterResponse: every window in which the
 * Commission takes feedback on its portal „Ihre Meinung zählt" today —
 * calls for evidence, public consultations, feedback on adopted proposals,
 * drafts of its own acts (decision 2 of 14.11.2026: all of them, not only
 * the legislative ones). Step 3 of the EU cycle.
 *
 * One request to the portal a day (`openWindows`, cached), the windows that
 * closed since then dropped by today's date. `initiatives` is null where
 * the portal could not be read: the page says so with the link to the
 * portal, and never shows an empty list for it — an empty list is the
 * portal's statement that nothing is open.
 */
import type { EuFensterResponse } from '#shared/types'
import { todayIso } from '#shared/utils/format'
import { PORTAL_PAGE_URL, windowsOpenOn } from '../../utils/eu/haveYourSay'
import { openWindows } from '../../utils/eu/portalService'

export default defineEventHandler(async (): Promise<EuFensterResponse> => {
  const read = await openWindows()
  return {
    initiatives: read ? windowsOpenOn(read.initiatives, todayIso()) : null,
    cut: read?.cut ?? null,
    portalUrl: PORTAL_PAGE_URL,
  }
})
