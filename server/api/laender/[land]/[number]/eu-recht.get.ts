/**
 * GET /api/laender/:land/:number/eu-recht → EuRechtResponse: whether a
 * Land's draft implements EU law, which act, and the act's transposition
 * deadline (docs/architecture.md §12.66, Nachtrag 2) — the Bund's fact, read
 * from the Land's own documents (`eu/landEuService.ts`). Asked by the
 * ProcedureCard after first paint where the server does not have it fast.
 *
 * The number is checked against the Land's record before the cached
 * function (`readLandDraft` answers null for a made-up one), as for the
 * Erläuterungen: a made-up number must leave nothing in the derived LRU.
 * The rate rule is the Land drafts' (`RATE_RULES.landDraft`, by path).
 */
import type { EuRechtResponse, LandCode } from '#shared/types'
import { LAND_CODES } from '#shared/utils/laender'
import { getLandEuRecht } from '../../../../utils/eu/landEuService'
import { landKey } from '../../../../utils/eu/euMapStore'
import { isLandNumber, readLandDraft } from '../../../../utils/laender/sources'

export default defineEventHandler(async (event): Promise<EuRechtResponse> => {
  const land = getRouterParam(event, 'land') ?? ''
  const number = getRouterParam(event, 'number') ?? ''
  if (!(LAND_CODES as readonly string[]).includes(land) || !isLandNumber(land as LandCode, number)) {
    throw createError({ statusCode: 404, statusMessage: 'Entwurf nicht gefunden' })
  }
  try {
    const detail = await readLandDraft(land as LandCode, number)
    if (!detail) throw createError({ statusCode: 404, statusMessage: 'Entwurf nicht gefunden' })
    const fact = await getLandEuRecht(land as LandCode, number, detail)
    // `related` from the running period's EU map, never stored with the fact.
    return await withRelated(fact, await getCurrentGp(), landKey(land, number))
  } catch (error) {
    if (isError(error)) throw error
    console.warn(`[laender] EU-Recht ${land}/${number}:`, error instanceof Error ? error.message : error)
    throw createError({ statusCode: 503, statusMessage: 'Gerade nicht abrufbar' })
  }
})
