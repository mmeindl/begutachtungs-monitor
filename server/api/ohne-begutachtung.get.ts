/**
 * GET /api/ohne-begutachtung?gp= → LawsWithoutBegutachtung: the federal laws
 * of a period that reached the Bundesgesetzblatt without a Begutachtung —
 * the rows behind the chip „Ohne Begutachtung" on `/entwuerfe`.
 *
 * A procedural fact per row, never a ranking: no Ressort, no count of
 * Stellungnahmen, no total beside the list's own count line. Every class is
 * decided in `server/utils/ris/skippedLaws.ts`, gathered and cached in
 * `skippedLawsService.ts`; a period that cannot carry the claim answers
 * `available: false` with its reason instead of an empty list.
 *
 * `?gp=` accepts `aktuell` (the default), `vorperiode` or a period code.
 */
import type { LawsWithoutBegutachtung } from '#shared/types'
import { gpFromParam, readGpQuery, requirePlausibleGp } from '../utils/http/params'
import { getLawsWithoutBegutachtung } from '../utils/ris/skippedLawsService'

export default defineEventHandler(async (event): Promise<LawsWithoutBegutachtung> => {
  const currentGp = await getCurrentGp()
  const gp = requirePlausibleGp(gpFromParam(readGpQuery(event), currentGp), currentGp)
  return getLawsWithoutBegutachtung(gp)
})
