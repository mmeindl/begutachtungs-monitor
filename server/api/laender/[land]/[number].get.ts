/**
 * GET /api/laender/:land/:number → LandDraftDetail: one Land's draft, running
 * or closed, by the Land's own number (Salzburg: the `/pub/get/<n>` of its
 * main document). 404 only when every source of that Land answered and none
 * knows the number; 503 when the Land could not be read.
 */
import type { LandCode, LandDraftDetail } from '#shared/types'
import { LAND_CODES } from '#shared/utils/laender'
import { readLandDraft } from '../../../utils/laender/sources'

const NUMBER_RE = /^\d{1,9}$/

export default defineEventHandler(async (event): Promise<LandDraftDetail> => {
  const land = getRouterParam(event, 'land') ?? ''
  const number = getRouterParam(event, 'number') ?? ''
  if (!(LAND_CODES as readonly string[]).includes(land) || !NUMBER_RE.test(number)) {
    throw createError({ statusCode: 404, statusMessage: 'Entwurf nicht gefunden' })
  }
  const detail = await readLandDraft(land as LandCode, number)
  if (!detail) throw createError({ statusCode: 404, statusMessage: 'Entwurf nicht gefunden' })
  return detail
})
