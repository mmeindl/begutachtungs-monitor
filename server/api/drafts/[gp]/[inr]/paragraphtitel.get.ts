/**
 * GET /api/drafts/:gp/:inr/paragraphtitel?von&bis → ParagraphTitlesResponse:
 * the heading of each § a change amends, from the standing law in RIS
 * (docs/architecture.md §12.11). Unresolved paragraphs are absent from the
 * map rather than guessed.
 *
 * Takes the same pair as the comparison it names, for the same reason the
 * lookup exists at all: a Ziffer renumbered between two stations addresses a
 * different §, so a name looked up for another pair would be a wrong name —
 * the one thing this lookup refuses to produce.
 */
import type { ParagraphTitlesResponse } from '#shared/types'
import { readLawStationPair, validateGpInrParams } from '../../../../utils/params'

export default defineEventHandler(async (event): Promise<ParagraphTitlesResponse> => {
  const { gp, inr } = validateGpInrParams(event)
  const { from, to } = readLawStationPair(event)
  return getParagraphTitles(gp, inr, from, to)
})
