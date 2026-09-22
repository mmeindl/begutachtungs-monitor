/**
 * GET /api/drafts/:gp/:inr/diff?von&bis → LawDiffResponse: what changed in
 * the law text between two stations of the procedure, § by §
 * (docs/ris-join.md §6, docs/architecture.md §12.18).
 *
 * `available: false` with a German reason is a normal answer, and it
 * distinguishes three cases the reader can act on differently: the station
 * does not exist yet, its text is published only as a PDF, or the text did
 * not divide into paragraphs. The pair itself comes from
 * `readLawStationPair`, which the § title lookup shares — both must always
 * answer about the same two texts.
 */
import type { LawDiffResponse } from '#shared/types'
import { readLawStationPair, validateGpInrParams } from '../../../../utils/http/params'

export default defineEventHandler(async (event): Promise<LawDiffResponse> => {
  const { gp, inr } = validateGpInrParams(event)
  const { from, to } = readLawStationPair(event)
  return getLawDiff(gp, inr, from, to)
})
