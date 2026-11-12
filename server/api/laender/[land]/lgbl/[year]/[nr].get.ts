/**
 * GET /api/laender/:land/lgbl/:year/:nr → LandLawDetail: one Landesgesetz's
 * page, from RIS. 404 where RIS holds no
 * Landesgesetz of that number in the Land; 503 where its index could not be
 * read.
 */
import type { LandLawDetail } from '#shared/types'
import { landLawParams, withLandLaw } from '../../../../../utils/laender/landRoute'

export default defineEventHandler(async (event): Promise<LandLawDetail> => {
  return withLandLaw(landLawParams(event), 'Gesetz', (detail) => detail)
})
