/**
 * GET /api/ris-drafts/:id/geltende-fassung → BgblLawsResponse: the laws a
 * Verordnungsentwurf's Kundmachung in BGBl II changed, each at its
 * geltende Fassung in RIS (21.10.2026) — the Verordnung's counterpart of
 * `/api/drafts/:gp/:inr/geltende-fassung`. Empty with `bgbl` null while no
 * Kundmachung is known; `repealed` names what the Kundmachung repealed whole
 * (`ris/bgblLaws.ts`).
 */
import type { BgblLawsResponse } from '#shared/types'
import { readRisId } from '../../../utils/http/params'
import { bgblShortDe } from '../../../../shared/utils/citations'
import { readBgblLaws } from '../../../utils/kons/konsCache'

export default defineEventHandler(async (event): Promise<BgblLawsResponse> => {
  const id = readRisId(event)
  const o = await getBgblOutcome(id)
  if (o.state !== 'kundgemacht' || !o.nummer) return { bgbl: null, laws: [] }
  const { laws, repealed } = await readBgblLaws(o.nummer)
  return { bgbl: bgblShortDe(o.nummer) ?? o.nummer, laws, repealed }
})
