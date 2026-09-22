/**
 * GET /api/drafts/:gp/:inr/begruendung?von=me&bis=rv → ReasoningDiffResponse:
 * ob sich die Begründung des Ressorts zu jedem geänderten Paragraphen
 * zwischen Entwurf und Regierungsvorlage geändert hat (§12.10b).
 *
 * Eigener Endpunkt wie `paragraphtitel`, aus demselben Grund: zwei weitere
 * Dokumente vom Parlament dürfen den Vergleich weder aufhalten noch mit sich
 * reißen. Die Seite mischt die Einträge über `unitKey` dazu, wenn sie da sind.
 */
import type { ReasoningDiffResponse } from '#shared/types'
import { readLawStationPair, validateGpInrParams } from '../../../../utils/http/params'

export default defineEventHandler(async (event): Promise<ReasoningDiffResponse> => {
  const { gp, inr } = validateGpInrParams(event)
  const { from, to } = readLawStationPair(event)
  return getReasoningDiff(gp, inr, from, to)
})
