/**
 * The Land's reasoning between its draft and the Regierungsvorlage, at the
 * changes of that comparison (23.10.2026) — the Ministerialentwurf's
 * Begründungsvergleich (§12.10b) for a Land's draft. Both documents carry
 * their Erläuterungen (`landExplanations.ts`); each side's passages per §
 * go to the Bund's § join (`compareReasoningByParagraph`), which compares
 * only where BOTH sides have one.
 */
import type { LandCode, LandDraftDetail, LandReasoningResponse } from '#shared/types'
import { DERIVED_CACHE } from '../cache/base'
import { compareReasoningByParagraph } from '../explanations/reasoningDiff'
import { landDraftUnits } from './landLawDiff'
import { cachedLandComparison } from './landLawDiffService'
import { parseLandExplanations } from './landExplanations'
import { explainedParagraphs } from './landExplanationsService'
import { amendedLawsOf } from './landTgu'
import { pdfPages } from './texts/read'
import { textSources } from './texts/stations'

const emptyStats = { compared: 0, changed: 0, editorial: 0, uncompared: 0 }
const unavailable = (reason: string): LandReasoningResponse => ({ available: false, unavailableReason: reason, sources: [], units: {}, entries: {}, stats: emptyStats })

/** One document's reasoning per § number, its passages joined in order. */
async function reasonsByParagraph(url: string, laws: readonly string[]): Promise<Map<string, string>> {
  const pages = await pdfPages(url)
  const parse = parseLandExplanations(pages)
  const out = new Map<string, string>()
  if (!parse) return out
  for (const e of explainedParagraphs(parse, landDraftUnits(pages), laws)) {
    for (const p of e.paras) out.set(p.toLowerCase(), [out.get(p.toLowerCase()), ...e.text].filter(Boolean).join(' '))
  }
  return out
}

export async function compareLandReasoning(land: LandCode, number: string, detail: LandDraftDetail): Promise<LandReasoningResponse> {
  if (!detail.comparisons.some(([a, b]) => a === 'entwurf' && b === 'rv')) return unavailable('Zu diesem Entwurf gibt es keine Regierungsvorlage.')
  const sources = textSources(land, detail)
  const draftUrl = sources.entwurf?.document.url
  const rvUrl = sources.rv?.document.url
  if (!draftUrl || !rvUrl) return unavailable('Das Land hat einen der beiden Texte nicht veröffentlicht.')
  const laws = amendedLawsOf(detail.draft.title)
  const [before, after, comparison] = await Promise.all([
    reasonsByParagraph(draftUrl, laws),
    reasonsByParagraph(rvUrl, laws),
    cachedLandComparison(land, number, 'entwurf', 'rv', detail),
  ])
  if (!before.size || !after.size) return unavailable('In einem der beiden Texte fand der Monitor keine Erläuterungen zu einzelnen Paragraphen.')
  const result = compareReasoningByParagraph(comparison.units, before, after)
  return {
    available: true,
    unavailableReason: null,
    sources: [sources.entwurf!.document, sources.rv!.document],
    units: result.units,
    entries: result.entries,
    stats: result.stats,
  }
}

/** Held a day in the derived layer, like the comparison it reads. */
export const cachedLandReasoning = defineCachedFunction(
  (land: LandCode, number: string, detail: LandDraftDetail): Promise<LandReasoningResponse> => compareLandReasoning(land, number, detail),
  { name: 'land-reasoning', base: DERIVED_CACHE, getKey: (land: LandCode, number: string) => `${land}-${number}`, maxAge: 60 * 60 * 24, swr: false },
)
