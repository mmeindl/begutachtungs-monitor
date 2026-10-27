/**
 * The Land's reasoning between its draft and the Regierungsvorlage, at the
 * changes of that comparison (23.10.2026) — the Ministerialentwurf's
 * Begründungsvergleich (§12.10b) for a Land's draft. Both documents carry
 * their Erläuterungen (`landExplanations.ts`); each side's passages per §
 * go to the Bund's § join (`compareReasoningByParagraph`), which compares
 * only where BOTH sides have one.
 */
import type { LandCode, LandDraftDetail, LandReasoningResponse } from '#shared/types'
import { safeExternalUrl } from '#shared/utils/safeExternalUrl'
import { DERIVED_CACHE } from '../cache/base'
import { compareReasoningByParagraph } from '../explanations/reasoningDiff'
import { landDraftUnits } from './landLawDiff'
import { cachedLandComparison } from './landLawDiffService'
import { parseLandExplanations } from './landExplanations'
import { explainedParagraphs } from './landExplanationsService'
import { amendedLawsOf } from './landTgu'
import { NOT_A_DRAFT, pdfPages } from './texts/read'
import { textSources } from './texts/stations'

const emptyStats = { compared: 0, changed: 0, editorial: 0, uncompared: 0 }
const unavailable = (reason: string): LandReasoningResponse => ({ available: false, unavailableReason: reason, sources: [], units: {}, entries: {}, stats: emptyStats })

/**
 * One text's reasoning per § number, its passages joined in order. The
 * Erläuterungen stand in the law's own PDF (Oberösterreich, Salzburg's
 * Vorlagen) or in one of their own (Kärnten, Tirol: `explanationsUrl`) —
 * then the Ziffern a „Zu Z 3:" names are read off the law's PDF.
 */
async function reasonsByParagraph(lawUrl: string, explanationsUrl: string | null, laws: readonly string[]): Promise<Map<string, string>> {
  const [pages, lawPages] = await Promise.all([pdfPages(explanationsUrl ?? lawUrl), explanationsUrl ? pdfPages(lawUrl) : null])
  const parse = parseLandExplanations(pages)
  const out = new Map<string, string>()
  if (!parse) return out
  for (const e of explainedParagraphs(parse, landDraftUnits(lawPages ?? pages), laws)) {
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
  // Their own documents, where the Land files them so: the draft's „Erläuterungen", the Vorlage's „Regierungsvorlage, Erläuterungen".
  const docs = detail.draft.documents
  const ownUrl = (re: RegExp) => {
    const doc = docs.find((d) => re.test(d.title))
    return doc ? safeExternalUrl(doc.url) : null
  }
  const [before, after, comparison] = await Promise.all([
    reasonsByParagraph(draftUrl, ownUrl(/^(?!Regierungsvorlage).*erläuter/i), laws),
    reasonsByParagraph(rvUrl, ownUrl(/^Regierungsvorlage, Erläuterungen$/), laws),
    cachedLandComparison(land, number, 'entwurf', 'rv', detail),
  ])
  // What the Land filed as the draft and evidently is none: said as the comparison says it (`notADraft`).
  if (comparison.unavailableReason === NOT_A_DRAFT) return unavailable(NOT_A_DRAFT)
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
