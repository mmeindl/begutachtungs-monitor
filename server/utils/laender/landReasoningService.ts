/**
 * The Land's reasoning between its draft and the Regierungsvorlage, at the
 * changes of that comparison (23.10.2026) — the Ministerialentwurf's
 * Begründungsvergleich for a Land's draft. Both documents carry
 * their Erläuterungen (`landExplanations.ts`); each side's passages per §
 * go to the Bund's § join (`compareReasoningByParagraph`), which compares
 * only where BOTH sides have one.
 */
import { gapDe } from '#shared/utils/gaps'
import type { LandCode, LandDraftDetail, LandLawDiffResponse, LandReasoningResponse } from '#shared/types'
import { safeExternalUrl } from '#shared/utils/safeExternalUrl'
import { DERIVED_CACHE } from '../cache/base'
import { DERIVED_ANALYSIS_TTL_S } from '../cache/ttl'
import { compareReasoningByParagraph } from '../explanations/reasoningDiff'
import { landDraftUnits } from './landLawDiff'
import { cachedLandComparison } from './landLawDiffService'
import { parseLandExplanations } from './landExplanations'
import { explainedParagraphs } from './landExplanationsRead'
import { amendedLawsOf } from './landTgu'
import { draftExplanationsDocument, NOT_A_DRAFT, type PagesReader } from './texts/read'
import { cachedPdfPages } from './texts/pdfPagesService'
import { textSources } from './texts/stations'

const emptyStats = { compared: 0, changed: 0, editorial: 0, uncompared: 0 }
const unavailable = (reason: string): LandReasoningResponse => ({ available: false, unavailableReason: reason, sources: [], units: {}, entries: {}, stats: emptyStats })

/**
 * One text's reasoning per § number, its passages joined in order. The
 * Erläuterungen stand in the law's own PDF (Oberösterreich, Salzburg's
 * Vorlagen) or in one of their own (Kärnten, Tirol: `explanationsUrl`) —
 * then the Ziffern a „Zu Z 3:" names are read off the law's PDF. Both
 * through the cached read: the comparison beside it reads the same two
 * PDFs, the Erläuterungen section the draft's (`pdfPagesService.ts`).
 */
async function reasonsByParagraph(lawUrl: string, explanationsUrl: string | null, laws: readonly string[], pagesOf: PagesReader): Promise<Map<string, string>> {
  const [pages, lawPages] = await Promise.all([pagesOf(explanationsUrl ?? lawUrl), explanationsUrl ? pagesOf(lawUrl) : null])
  const parse = parseLandExplanations(pages)
  const out = new Map<string, string>()
  if (!parse) return out
  for (const e of explainedParagraphs(parse, landDraftUnits(lawPages ?? pages), laws)) {
    for (const p of e.paras) out.set(p.toLowerCase(), [out.get(p.toLowerCase()), ...e.text].filter(Boolean).join(' '))
  }
  return out
}

/**
 * `read`: how the PDFs and the comparison are had — the server's cached
 * reads; the census of the Land's Begründungen (`scripts/corpus/landBegruendung.ts`)
 * hands in its disk cache, so what it measures is this function.
 */
export async function compareLandReasoning(
  land: LandCode,
  number: string,
  detail: LandDraftDetail,
  read: { pagesOf: PagesReader; comparison: () => Promise<LandLawDiffResponse> } = { pagesOf: cachedPdfPages, comparison: () => cachedLandComparison(land, number, 'entwurf', 'rv', detail) },
): Promise<LandReasoningResponse> {
  if (!detail.comparisons.some(([a, b]) => a === 'entwurf' && b === 'rv')) return unavailable('Zu diesem Entwurf gibt es keine Regierungsvorlage.')
  const sources = textSources(land, detail)
  const draftUrl = sources.entwurf?.document.url
  const rvUrl = sources.rv?.document.url
  if (!draftUrl || !rvUrl) return unavailable(gapDe('notPublished', 'Einen der beiden Texte hat das Land nicht veröffentlicht.'))
  const laws = amendedLawsOf(detail.draft.title)
  // Their own documents, where the Land files them so: the draft's „Erläuterungen", the Vorlage's „Regierungsvorlage, Erläuterungen".
  const docs = detail.draft.documents
  const urlOf = (doc: { url: string } | null | undefined) => (doc ? safeExternalUrl(doc.url) : null)
  const [before, after, comparison] = await Promise.all([
    reasonsByParagraph(draftUrl, urlOf(draftExplanationsDocument(docs)), laws, read.pagesOf),
    reasonsByParagraph(rvUrl, urlOf(docs.find((d) => /^Regierungsvorlage, Erläuterungen$/.test(d.title))), laws, read.pagesOf),
    read.comparison(),
  ])
  // What the Land filed as the draft and evidently is none: said as the comparison says it (`notADraft`).
  if (comparison.unavailableReason === NOT_A_DRAFT) return unavailable(NOT_A_DRAFT)
  if (!before.size || !after.size) return unavailable(gapDe('unreadable', 'In einem der beiden Texte fand der Monitor keine Erläuterungen zu einzelnen Paragraphen.'))
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
  { name: 'land-reasoning', base: DERIVED_CACHE, getKey: (land: LandCode, number: string) => `${land}-${number}`, maxAge: DERIVED_ANALYSIS_TTL_S, swr: false },
)
