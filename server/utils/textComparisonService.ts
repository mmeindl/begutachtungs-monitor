/**
 * The ressort's Textgegenüberstellung for one consultation
 * (docs/api-exploration.md §2c, docs/architecture.md §12.12).
 *
 * Nuxt-aware glue around the pure module `textComparison.ts`. The annex is
 * only in RIS — Parliament publishes it as PDF — so this goes through the
 * RIS↔ME map rather than the Parliament document list the rest of the detail
 * page uses.
 *
 * Unavailability is a normal answer, not an error: about four in ten drafts
 * carry no annex, and of those that do, four in ten are scans. Each case
 * gets its own sentence, because "no comparison" and "a comparison we cannot
 * read" are different things to a reader — and in the second case the PDF is
 * still worth linking.
 */
import type { TextComparisonResponse, TraceLink } from '#shared/types'
import { fetchLawHtml } from './lawDiffService'
import { parseRisXml } from './lawText'
import { draftArticles } from './lawTitles'
import { getRisMapForGp } from './ris'
import { isScanned, parseTextComparison, summarizeComparison } from './textComparison'

const TTL_S = 60 * 60 * 24

export const getTextComparison = defineCachedFunction(
  async (gp: string, inr: number): Promise<TextComparisonResponse> => {
    const empty = (reason: string, source: TraceLink | null = null, pdf: TraceLink | null = null): TextComparisonResponse => ({
      gp,
      inr,
      available: false,
      unavailableReason: reason,
      source,
      pdf,
      boundaryNote: null,
      stats: { total: 0, unchanged: 0, changed: 0, editorial: 0, inserted: 0, removed: 0 },
      rows: [],
    })

    const row = (await getRisMapForGp(gp).catch(() => null))?.rows.find((r) => r.inr === inr) ?? null
    if (!row?.risId) return empty('Der Entwurf ließ sich keinem RIS-Dokument zuordnen; nur dort liegt die Textgegenüberstellung.')
    const annex = row.textComparison
    if (!annex) return empty('Keine Textgegenüberstellung: Sie ist nicht verpflichtend, und ein neues Gesetz hat nichts gegenüberzustellen.')

    const pdf: TraceLink | null = annex.pdf ? { label: 'Textgegenüberstellung des Ressorts (PDF)', url: annex.pdf } : null
    if (!annex.xml) return empty('Die Textgegenüberstellung liegt nur als PDF vor.', null, pdf)

    const xml = await fetchLawHtml(annex.xml)
    if (isScanned(xml)) {
      return empty('Die Textgegenüberstellung liegt nur als Scan vor, ohne auslesbaren Text.', null, pdf)
    }

    // The annex's Artikel headings mean nothing on their own — an internal
    // Roman division and a real law boundary are typeset alike. The draft's
    // own Artikel list decides, so it is fetched even though the annex is
    // what is being shown (`annexBoundaries.ts`).
    const draft = row.risDocument?.xml ? await fetchLawHtml(row.risDocument.xml).catch(() => null) : null
    const articles = draft ? draftArticles(parseRisXml(draft)) : []
    const { rows, refusal } = parseTextComparison(xml, articles)
    if (rows.length === 0) return empty('Die Textgegenüberstellung ließ sich nicht auslesen.', null, pdf)

    const source: TraceLink = { label: 'Textgegenüberstellung des Ressorts', url: annex.html ?? annex.xml }
    return { gp, inr, available: true, unavailableReason: null, source, pdf, boundaryNote: refusal, stats: summarizeComparison(rows), rows }
  },
  { name: 'text-comparison', base: DERIVED_CACHE, getKey: (gp: string, inr: number) => `${gp}-${inr}`, maxAge: TTL_S, swr: false },
)
