/**
 * The laws the item's Kundmachung changed, at their geltende Fassung in RIS
 * — the draft's endpoint of the same name, with the Fundstelle read off the
 * item's own record.
 */
import type { BgblLawsResponse } from '#shared/types'
import { bgblShortDe } from '#shared/utils/citations'
import { validateVorlageParams } from '../../../../../utils/http/params'
import { extractBgblLink } from '../../../../../utils/parliament/detailJson'
import { requireVorlageItem } from '../../../../../utils/parliament/vorlageDetail'
import { readBgblLaws } from '../../../../../utils/kons/konsCache'

export default defineEventHandler(async (event): Promise<BgblLawsResponse> => {
  const root = validateVorlageParams(event)
  await requireVorlageItem(root)
  const detail = await getGegenstand(root.gp, root.ityp, root.inr)
  const bgblNumber = extractBgblLink(detail.content?.status?.bgbllinks)?.number ?? null
  if (!bgblNumber) return { bgbl: null, laws: [] }
  const { laws, repealed } = await readBgblLaws(bgblNumber)
  return { bgbl: bgblShortDe(bgblNumber) ?? bgblNumber, laws, repealed }
})
