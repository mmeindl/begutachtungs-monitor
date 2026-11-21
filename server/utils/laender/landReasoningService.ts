/**
 * The Land's reasoning between its draft and the Regierungsvorlage, at the
 * changes of that comparison (23.10.2026) — the Ministerialentwurf's
 * Begründungsvergleich for a Land's draft. Both documents carry
 * their Erläuterungen (`landExplanations.ts`); each side's passages per §
 * go to the Bund's § join (`compareReasoningByParagraph`), which compares
 * only where BOTH sides have one — and, for the § of a law enacted anew,
 * the passages titled by its own designation (`ownPassages`, 21.11.2026).
 */
import { gapDe } from '#shared/utils/gaps'
import type { LandCode, LandDraftDetail, LandExplanationsResponse, LandLawDiffResponse, LandReasoningResponse, LandTextDocument, LawDiffUnit } from '#shared/types'
import { safeExternalUrl } from '#shared/utils/safeExternalUrl'
import { isParagraphUnit } from '#shared/utils/unitName'
import { DERIVED_CACHE } from '../cache/base'
import { DERIVED_ANALYSIS_TTL_S } from '../cache/ttl'
import type { HtmlExplanations } from '../explanations/explanationsHtml'
import { compareReasoningByParagraph } from '../explanations/reasoningDiff'
import { ziffernOf } from '../explanations/risExplanations'
import { articleNumberKey } from '../text/designation'
import { landDraftUnits } from './landLawDiff'
import { cachedLandComparison } from './landLawDiffService'
import { parseLandExplanations } from './landExplanations'
import { explainedParagraphs } from './landExplanationsRead'
import { draftExplanationsDocument, NOT_A_DRAFT, type PagesReader } from './texts/read'
import { cachedPdfPages } from './texts/pdfPagesService'
import { textSources } from './texts/stations'

const emptyStats = { compared: 0, changed: 0, editorial: 0, uncompared: 0 }
const unavailable = (reason: string): LandReasoningResponse => ({ available: false, unavailableReason: reason, sources: [], units: {}, entries: {}, stats: emptyStats })

/**
 * One text's Erläuterungen, entry by entry (`explainedParagraphs`), each
 * with the Artikel its heading or the Artikel heading above it names
 * (`ParticularExplanation.article`). The Erläuterungen stand in the law's
 * own PDF (Oberösterreich, Salzburg's Vorlagen) or in one of their own
 * (Kärnten, Tirol: `explanationsUrl`) — then the Ziffern a „Zu Z 3:" names
 * are read off the law's PDF. Both through the cached read: the comparison
 * beside it reads the same two PDFs, the Erläuterungen section the draft's
 * (`pdfPagesService.ts`).
 */
async function reasonsOf(lawUrl: string, explanationsUrl: string | null, title: string, pagesOf: PagesReader): Promise<LandReasoningEntry[]> {
  const [pages, lawPages] = await Promise.all([pagesOf(explanationsUrl ?? lawUrl), explanationsUrl ? pagesOf(lawUrl) : null])
  const parse = parseLandExplanations(pages)
  if (!parse) return []
  // `explainedParagraphs` keeps the parse's entries in order, one for one.
  return explainedParagraphs(parse, landDraftUnits(lawPages ?? pages), title, (lawPages ?? pages).join('\n')).map((e, i) => ({ ...e, article: parse.particular[i]!.article }))
}

/** One text's reasoning per § number, its entries joined in order — the § join's input. */
function reasonsByParagraph(entries: readonly LandReasoningEntry[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const e of entries) {
    for (const p of e.paras) out.set(p.toLowerCase(), [out.get(p.toLowerCase()), ...e.text].filter(Boolean).join(' '))
  }
  return out
}

/**
 * One text's entries as the passages of the join by a new law's own §
 * (`joinOwnParagraph`, the Bund's since 01.10.2026), read the Land's way
 * (21.11.2026). The Bund's rules hold: a § present on both sides takes the
 * passages titled by its own designation on each, compared only where both
 * sides' passages cover the same §§, and in a package only under its own
 * Artikel. Three readings are the Land's:
 *
 *  - The Artikel is the entry's own or the one of the „Zu Art I (…)" heading
 *    above it (`ParticularExplanation.article`), keyed as the units key
 *    theirs („I" → „1"), never the title's list of laws: a law the draft
 *    enacts has no place there (`explainedParagraphs`).
 *  - A „Zu Z 1 („Drittstaat mit hohem Risiko“):" is an instruction's passage
 *    only under an Artikel whose units on this side include instructions. In
 *    a law enacted anew it is a numbered item of the § above it — Salzburg's
 *    31605 explains § 3's definitions so —, and read as an instruction's, it
 *    was left out of that §'s Begründung, which then compared its first lines
 *    alone.
 *  - In a package (the side's units carry two Artikel or more) an entry
 *    under no Artikel joins nothing, whatever its § (the Bund takes one whose
 *    number no other law of the draft carries): its law is not certain, and
 *    one law's Begründung at another law's § is worse than none.
 */
function ownPassages(entries: readonly LandReasoningEntry[], units: readonly LawDiffUnit[], side: 'before' | 'after'): HtmlExplanations {
  const present = units.filter((u) => (side === 'after' ? u.change !== 'removed' : u.change !== 'inserted'))
  const articleOf = (u: LawDiffUnit) => (side === 'after' ? u.articleKey : u.fromArticleKey)
  const instructed = new Set(present.filter((u) => !isParagraphUnit(u)).map((u) => articleOf(u) ?? ''))
  const several = new Set(present.flatMap((u) => articleOf(u) ?? [])).size > 1
  const special = entries.flatMap((e) => {
    const article = e.article ? articleNumberKey(e.article) : null
    if (several && !article) return []
    const instructions = instructed.has(article ?? '') || (article === null ? instructed.size > 0 : instructed.has(''))
    const ziffern = instructions ? ziffernOf(e.heading).map((z) => ({ article: z.article ?? article, ziffer: z.ziffer })) : []
    return [{ heading: e.heading, paragraphs: e.paras.map((p) => `§ ${p}`), text: e.text, article, ziffern, section: null, law: e.law }]
  })
  return { general: [], special }
}

/** An entry of a text's Erläuterungen as the Begründungsvergleich reads it: the page's entry and its Artikel („I", „2"), null under none. */
export type LandReasoningEntry = LandExplanationsResponse['particular'][number] & { article: string | null }

/** What the Begründungsvergleich reads: both texts' entries and the comparison beside them — or why it cannot. */
export type LandReasoningInputs =
  | { unavailable: string }
  | { sources: LandTextDocument[]; before: LandReasoningEntry[]; after: LandReasoningEntry[]; comparison: LandLawDiffResponse }

/** How the PDFs and the comparison are had. */
export interface LandReasoningReads { pagesOf: PagesReader; comparison: () => Promise<LandLawDiffResponse> }

/**
 * Everything `compareLandReasoning` reads, read as it reads it — exported
 * for the census of the Land's Begründungen (`scripts/corpus/landBegruendung.ts`),
 * which counts the entries of both texts beside what the comparison made
 * of them.
 */
export async function readLandReasoning(land: LandCode, detail: LandDraftDetail, read: LandReasoningReads): Promise<LandReasoningInputs> {
  if (!detail.comparisons.some(([a, b]) => a === 'entwurf' && b === 'rv')) return { unavailable: 'Zu diesem Entwurf gibt es keine Regierungsvorlage.' }
  const sources = textSources(land, detail)
  const draftUrl = sources.entwurf?.document.url
  const rvUrl = sources.rv?.document.url
  if (!draftUrl || !rvUrl) return { unavailable: gapDe('unreadable', 'Einen der beiden Texte fand der Monitor unter den Dokumenten des Landes nicht.') }
  // Their own documents, where the Land files them so: the draft's „Erläuterungen", the Vorlage's „Regierungsvorlage, Erläuterungen".
  const docs = detail.draft.documents
  const urlOf = (doc: { url: string } | null | undefined) => (doc ? safeExternalUrl(doc.url) : null)
  const [before, after, comparison] = await Promise.all([
    reasonsOf(draftUrl, urlOf(draftExplanationsDocument(docs)), detail.draft.title, read.pagesOf),
    reasonsOf(rvUrl, urlOf(docs.find((d) => /^Regierungsvorlage, Erläuterungen$/.test(d.title))), detail.draft.title, read.pagesOf),
    read.comparison(),
  ])
  // What the Land filed as the draft and evidently is none: said as the comparison says it (`notADraft`).
  if (comparison.unavailableReason === NOT_A_DRAFT) return { unavailable: NOT_A_DRAFT }
  return { sources: [sources.entwurf!.document, sources.rv!.document], before, after, comparison }
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
  read: LandReasoningReads = { pagesOf: cachedPdfPages, comparison: () => cachedLandComparison(land, number, 'entwurf', 'rv', detail) },
): Promise<LandReasoningResponse> {
  const inputs = await readLandReasoning(land, detail, read)
  if ('unavailable' in inputs) return unavailable(inputs.unavailable)
  const before = reasonsByParagraph(inputs.before)
  const after = reasonsByParagraph(inputs.after)
  if (!before.size || !after.size) return unavailable(gapDe('unreadable', 'In einem der beiden Texte fand der Monitor keine Erläuterungen zu einzelnen Paragraphen.'))
  const units = inputs.comparison.units
  const result = compareReasoningByParagraph(units, before, after, null, { before: ownPassages(inputs.before, units, 'before'), after: ownPassages(inputs.after, units, 'after') })
  return {
    available: true,
    unavailableReason: null,
    sources: inputs.sources,
    units: result.units,
    entries: result.entries,
    stats: result.stats,
    // A line at each change only beside Begründungen compared: where none
    // was, one sentence above the list says so (`landReasoningGapNote`), and
    // the same line at every change would repeat it.
    gaps: result.stats.compared ? result.gaps : {},
  }
}

/** Held a day in the derived layer, like the comparison it reads. */
export const cachedLandReasoning = defineCachedFunction(
  (land: LandCode, number: string, detail: LandDraftDetail): Promise<LandReasoningResponse> => compareLandReasoning(land, number, detail),
  { name: 'land-reasoning', base: DERIVED_CACHE, getKey: (land: LandCode, number: string) => `${land}-${number}`, maxAge: DERIVED_ANALYSIS_TTL_S, swr: false },
)
