/**
 * GET /api/drafts/:gp/:inr/bundesrecht → { line }: on a Ministerialentwurf
 * whose Grundsatzgesetz is kundgemacht, how many Land drafts of the window
 * carry it out, and the Frist clause of the act.
 * `line: null` for every other draft — one still in Begutachtung
 * or in Parliament, one whose Kundmachung is no Grundsatzgesetz, one the act
 * does not name as its origin (`meCarriesGrundsatz`) — and where the maps
 * are not at hand within their budget.
 */
import type { MeBundesrechtLine } from '#shared/types'
import { validateGpInrParams } from '../../../../utils/http/params'
import { meLineOf } from '../../../../utils/bund-land/bundLandMapService'

export default defineEventHandler(async (event): Promise<{ line: MeBundesrechtLine | null }> => {
  const { gp, inr } = validateGpInrParams(event)
  await requireDraft(gp, inr)
  return { line: await meLineOf(gp, inr) }
})
