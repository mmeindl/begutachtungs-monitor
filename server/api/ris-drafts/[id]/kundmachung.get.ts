/**
 * GET /api/ris-drafts/:id/kundmachung → BgblOutcome: ob aus diesem
 * Verordnungsentwurf eine Kundmachung im BGBl II geworden ist
 * (docs/architecture.md §12.32).
 *
 * Eigener Endpunkt und nicht Teil der Detailantwort: Die Auskunft kostet den
 * Jahrgang des Bundesgesetzblatts, und die Seite soll rendern, bevor der da
 * ist — dieselbe Aufteilung wie bei den Erläuterungen und den Vergleichen.
 *
 * Die Zustände, die zurückkommen, sind in `shared/types/bgbl.ts` benannt. Der
 * wichtigste ist `ausstehend`: Eine Frist, die vor sechs Wochen endete, ist
 * keine Auskunft über das Ressort, sondern über die Uhr.
 */
import type { BgblOutcome } from '#shared/types'
import { RIS_ID_RE } from '#shared/utils/risConsultations'

export default defineEventHandler(async (event): Promise<BgblOutcome> => {
  const id = getRouterParam(event, 'id') ?? ''
  if (!RIS_ID_RE.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Ungültige RIS-Dokumentnummer' })
  }
  return getBgblOutcome(id)
})
