/**
 * The reasoning comparison beside a comparison of a Vorlage or Antrag
 * without a Begutachtung — always empty: it compares a draft's Erläuterungen
 * with its Vorlage's (`getReasoningDiff`, draft → Regierungsvorlage only),
 * and this page has no draft. The endpoint exists because the comparison
 * section asks for it beside every pair (`useLawDiffStep`).
 */
import type { ReasoningDiffResponse } from '#shared/types'
import { itemLawScope } from '#shared/utils/lawStations'
import { readLawStationPair, validateVorlageParams } from '../../../../../utils/http/params'

export default defineEventHandler((event): ReasoningDiffResponse => {
  const root = validateVorlageParams(event)
  readLawStationPair(event, itemLawScope(root.ityp))
  return {
    gp: root.gp,
    inr: root.inr,
    available: false,
    unavailableReason: null,
    sources: [],
    units: {},
    entries: {},
    stats: { compared: 0, changed: 0, editorial: 0, uncompared: 0 },
  }
})
