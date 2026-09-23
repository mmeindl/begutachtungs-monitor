/**
 * GET /api/bgbl/teil2 → how many Kundmachungen of Bundesgesetzblatt Teil II
 * exist per year (docs/architecture.md §12.32).
 *
 * THIS IS THE PREWARM, and that is why it exists. Matching one Verordnung
 * page reads up to three years, which is around 21 requests to RIS when
 * cold — and those must not land on a visitor
 * (`deploy/systemd/begutachtungs-monitor-prewarm.service`, the same
 * reasoning as for the RIS↔ME map). It is called nightly and after every
 * deploy, because the Nitro cache lives in memory in production.
 *
 * The numbers are not a garnish: a year that is suddenly empty is exactly
 * the silent failure that would produce a „nicht kundgemacht" on every
 * Verordnung page.
 */

import { todayIso } from '#shared/utils/format'

// Prewarm-only: no page calls this; deploy/systemd/begutachtungs-monitor-prewarm.service does, to pay the cold build where nobody waits.
export default defineEventHandler(async () => {
  // Vienna's year (`todayIso`), so the nightly prewarm on New Year's night
  // warms the Jahrgang the readers are in and not the one before it.
  const now = Number(todayIso().slice(0, 4))
  const years = [now - 2, now - 1, now]
  const counts = await Promise.all(
    years.map(async (year) => ({ year, records: (await getBgblTeil2Year(year)).length })),
  )
  return { years: counts }
})
