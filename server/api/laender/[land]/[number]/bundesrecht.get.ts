/**
 * GET /api/laender/:land/:number/bundesrecht → LandBundesrechtResponse:
 * whether a Land's draft carries out a Grundsatzgesetz of the Bund or
 * implements a Vereinbarung gemäß Art. 15a B-VG, and which act
 * (docs/architecture.md §12.67). Read from the same pages as the EU fact,
 * in one shared read (`laender/landDraftTexts.ts`); asked by the
 * ProcedureCard after first paint where the server does not have it fast.
 *
 * The number is checked against the Land's record before the cached
 * function, as for the EU fact: a made-up number must leave nothing in the
 * derived LRU. The rate rule is the Land drafts' (`RATE_RULES.landDraft`).
 *
 * The act's page is linked only where the Bund-zu-Land map has it — read
 * within a second, never built here.
 */
import type { LandBundesrechtResponse, LandCode } from '#shared/types'
import { LAND_CODES } from '#shared/utils/laender'
import { withinBudget } from '../../../../utils/http/budget'
import { isLandNumber, readLandDraft } from '../../../../utils/laender/sources'
import { relatedPeriodOf } from '../../../../utils/eu/euMap'
import { readLandAusfuehrung, viewOfFact } from '../../../../utils/bund-land/landBundesrechtService'
import { getBundLandMap } from '../../../../utils/bund-land/bundLandMapService'

/** How long the fact waits for the map before answering without act links. */
const MAP_BUDGET_MS = 1_000

export default defineEventHandler(async (event): Promise<LandBundesrechtResponse> => {
  const land = getRouterParam(event, 'land') ?? ''
  const number = getRouterParam(event, 'number') ?? ''
  if (!(LAND_CODES as readonly string[]).includes(land) || !isLandNumber(land as LandCode, number)) {
    throw createError({ statusCode: 404, statusMessage: 'Entwurf nicht gefunden' })
  }
  try {
    const detail = await readLandDraft(land as LandCode, number)
    if (!detail) throw createError({ statusCode: 404, statusMessage: 'Entwurf nicht gefunden' })
    const { value } = await readLandAusfuehrung(land as LandCode, number, detail)
    // The map of the period the Begutachtung began in, as the EU fact's `related`.
    const period = relatedPeriodOf(detail.draft.startedAt ?? null, await getCurrentGp())
    const map = period ? await withinBudget(getBundLandMap(period.gp), MAP_BUDGET_MS) : null
    return await viewOfFact(value, (key) => Boolean(map?.acts[key]))
  } catch (error) {
    if (isError(error)) throw error
    console.warn(`[laender] Bundesrecht ${land}/${number}:`, error instanceof Error ? error.message : error)
    throw createError({ statusCode: 503, statusMessage: 'Gerade nicht abrufbar' })
  }
})
