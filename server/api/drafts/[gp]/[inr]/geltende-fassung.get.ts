/**
 * GET /api/drafts/:gp/:inr/geltende-fassung → BgblLawsResponse:
 * the laws the draft's Bundesgesetzblatt changed, each linked to its
 * geltende Fassung in RIS (21.10.2026). The BGBl is the Vorlage's own or,
 * where Parliament names one, its successor Antrag's — the number the
 * station shows.
 *
 * FROM THE OUTCOME, NOT FROM THE PAGE (22.10.2026). The endpoint needs one
 * number and assembled the whole detail page for it: list 142 with its
 * retries, the RIS map, the station map, the related drafts of up to three
 * periods. `getDraftOutcome` reads the same number in the same order —
 * Parliament's link, the successor's where the Beschluss was not
 * promulgated, RIS where neither stands — from the two Gegenstand records
 * alone, all of them leaf caches the page has filled already.
 *
 * The list row first: an INR the period does not hold is a 404 out of the
 * cached list 81, before a Gegenstand is fetched — or cached — for it.
 */
import type { BgblLawsResponse } from '#shared/types'
import { validateGpInrParams } from '../../../../utils/http/params'
import { bgblShortDe } from '../../../../../shared/utils/citations'
import { readBgblLaws } from '../../../../utils/kons/konsCache'

export default defineEventHandler(async (event): Promise<BgblLawsResponse> => {
  const { gp, inr } = validateGpInrParams(event)
  await requireDraft(gp, inr)
  const { bgblNumber } = await getDraftOutcome(gp, inr)
  if (!bgblNumber) return { bgbl: null, laws: [] }
  return { bgbl: bgblShortDe(bgblNumber) ?? bgblNumber, laws: await readBgblLaws(bgblNumber) }
})
