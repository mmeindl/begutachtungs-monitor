/**
 * GET /api/eu-recht/karte?gp= → the EU map's build report.
 *
 * PREWARM-ONLY, like `/api/stations/:gp`: no page calls this. Cold it reads
 * every draft of the period's window — Vorblätter, law texts, Erläuterungen,
 * the Länder's PDFs at one request a second, the Cellar — and keeps each
 * fact on disk (`eu/euMapStore.ts`); warm it reads the store and only what
 * changed. Then it assembles the map against the station map, awaited in
 * full, and fills the `eu-karte` cache the lists read under their budget.
 *
 * `?gp=` accepts `aktuell` (the default), `vorperiode` or a period code.
 */
import { gpFromParam, readGpQuery, requirePlausibleGp } from '../../utils/http/params'

// Prewarm-only: `rateLimit.ts` answers 404 to anyone from outside.
export default defineEventHandler(async (event) => {
  const currentGp = await getCurrentGp()
  const gp = requirePlausibleGp(gpFromParam(readGpQuery(event), currentGp), currentGp)
  return buildEuMap(gp)
})
