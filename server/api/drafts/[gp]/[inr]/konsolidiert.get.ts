/**
 * GET /api/drafts/:gp/:inr/konsolidiert → ConsolidatedTextResponse:
 * die Paragraphen dieses Entwurfs als nicht amtliche konsolidierte
 * Lesefassung — geltender Text aus dem RIS, Anweisungen des Entwurfs
 * angewendet, und nur das, was die Textgegenüberstellung des Ressorts
 * bestätigt (docs/architecture.md §12.12).
 *
 * Eigener Endpunkt wie `paragraphtitel`: Ein Entwurf kann Dutzende
 * §-Dokumente brauchen, und ein langsamer RIS-Abruf darf weder die Seite
 * noch die Gegenüberstellung über dieser Sektion aufhalten.
 */
import type { ConsolidatedTextResponse } from '#shared/types'
import { validateGpInrParams } from '../../../../utils/http/params'

export default defineEventHandler(async (event): Promise<ConsolidatedTextResponse> => {
  const { gp, inr } = validateGpInrParams(event)
  return getConsolidatedText(gp, inr)
})
