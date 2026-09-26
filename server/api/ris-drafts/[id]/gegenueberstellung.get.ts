/**
 * GET /api/ris-drafts/:id/gegenueberstellung → TextComparisonResponse.
 *
 * The same section as for a Ministerialentwurf, for a Begutachtung that RIS
 * carries alone (docs/architecture.md §12.16). Two thirds of the corpus are
 * these, Verordnungsentwürfe above all, and for them the ressort's
 * Gegenüberstellung is the only place the procedure says what would change:
 * there is no parliamentary Kurzinformation above it and no
 * Regierungsvorlage to compare against later.
 */
import type { TextComparisonResponse } from '#shared/types'
import { readRisId } from '../../../utils/http/params'

export default defineEventHandler(async (event): Promise<TextComparisonResponse> => {
  return getRisTextComparison(readRisId(event))
})
