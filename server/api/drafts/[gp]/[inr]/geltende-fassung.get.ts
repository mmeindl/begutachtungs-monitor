/**
 * GET /api/drafts/:gp/:inr/geltende-fassung → BgblLawsResponse:
 * the laws the draft's Bundesgesetzblatt changed, each linked to its
 * geltende Fassung in RIS (21.10.2026). The BGBl is the Vorlage's own or,
 * where Parliament names one, its successor Antrag's — the number the
 * station shows.
 */
import type { BgblLawsResponse } from '#shared/types'
import { validateGpInrParams } from '../../../../utils/http/params'
import { bgblShortDe } from '../../../../../shared/utils/citations'
import { readBgblLaws } from '../../../../utils/kons/konsCache'

export default defineEventHandler(async (event): Promise<BgblLawsResponse> => {
  const { gp, inr } = validateGpInrParams(event)
  const e = (await getDraftDetail(gp, inr)).enactment
  const number = e?.bgblNumber ?? e?.successor?.bgblNumber ?? null
  if (!number) return { bgbl: null, laws: [] }
  return { bgbl: bgblShortDe(number) ?? number, laws: await readBgblLaws(number) }
})
