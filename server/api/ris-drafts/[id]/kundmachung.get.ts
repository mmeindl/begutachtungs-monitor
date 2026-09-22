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
import { readRisId } from '../../../utils/http/params'

export default defineEventHandler(async (event): Promise<BgblOutcome> => {
  const id = readRisId(event)
  return getBgblOutcome(id)
})
