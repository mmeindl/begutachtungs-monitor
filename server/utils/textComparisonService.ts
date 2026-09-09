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
 * carry no annex. Each case gets its own sentence, because "no comparison"
 * and "a comparison we cannot read" are different things to a reader — and
 * in the second case the PDF is still worth linking.
 *
 * **Two sources, one shape.** Where the RIS XML is a real table it is read
 * from there; where RIS rasterised the annex into images, the same document's
 * PDF still carries a full text layer and is read by geometry instead
 * (`annexPdfService.ts`). Both parsers emit `ComparisonRow`, so everything
 * after this point — the RIS check, the stats, the section — is identical.
 * The page says which document it read, because "the ministry's table" and
 * "the ministry's PDF, read by us" are not the same claim.
 */
import type { TextComparisonResponse, TextComparisonRow, TraceLink } from '#shared/types'
import { annexParagraphKey } from './annexCheck'
import { getAnnexVerification } from './annexGuardService'
import { annexFromPdf } from './annexPdfService'
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
      readFrom: null,
      boundaryNote: null,
      stats: { total: 0, unchanged: 0, changed: 0, editorial: 0, inserted: 0, removed: 0 },
      verification: null,
      rows: [],
    })

    const row = (await getRisMapForGp(gp).catch(() => null))?.rows.find((r) => r.inr === inr) ?? null
    if (!row?.risId) return empty('Der Entwurf ließ sich keinem RIS-Dokument zuordnen; nur dort liegt die Textgegenüberstellung.')
    const annex = row.textComparison
    if (!annex) return empty('Keine Textgegenüberstellung: Sie ist nicht verpflichtend, und ein neues Gesetz hat nichts gegenüberzustellen.')

    const pdf: TraceLink | null = annex.pdf ? { label: 'Textgegenüberstellung des Ressorts (PDF)', url: annex.pdf } : null

    // The annex's Artikel headings mean nothing on their own — an internal
    // Roman division and a real law boundary are typeset alike. The draft's
    // own Artikel list decides, so it is fetched even though the annex is
    // what is being shown (`annexBoundaries.ts`). Both parsers need it.
    const draft = row.risDocument?.xml ? await fetchLawHtml(row.risDocument.xml).catch(() => null) : null
    const articles = draft ? draftArticles(parseRisXml(draft)) : []

    const xml = annex.xml ? await fetchLawHtml(annex.xml).catch(() => null) : null
    const rasterised = xml === null || isScanned(xml)
    if (rasterised && !annex.pdf) {
      return empty('Die Textgegenüberstellung liegt nur als Scan vor, ohne auslesbaren Text.', null, pdf)
    }

    const parsed = rasterised ? await annexFromPdf(annex.pdf!, articles) : parseTextComparison(xml!, articles)
    if (parsed === null) {
      return empty('Die Textgegenüberstellung ließ sich auch aus dem PDF nicht auslesen.', null, pdf)
    }
    const { rows, refusal } = parsed
    if (rows.length === 0) return empty('Die Textgegenüberstellung ließ sich nicht auslesen.', null, pdf)

    // Which document was actually read. The XML table is the ressort's own
    // structure; the PDF is the ressort's text with our reading of its
    // layout on top, and the difference belongs on the page.
    const source: TraceLink = rasterised
      ? { label: 'Textgegenüberstellung des Ressorts, aus dem PDF gelesen', url: annex.pdf! }
      : { label: 'Textgegenüberstellung des Ressorts', url: annex.html ?? annex.xml! }

    // The annex's left column claims to be the standing law; RIS holds that
    // text independently, so the claim is checked before the rows are sent.
    // The reference date is RIS's own start of the Begutachtungsfrist — the
    // day the ministry wrote the annex, not today.
    const check = row.risBeginn ? await getAnnexVerification(gp, inr, row.risBeginn, rows, articles).catch(() => null) : null
    const withheld = new Set(check?.withheld ?? [])
    const unchecked = new Set(check?.unchecked ?? [])
    const checked: TextComparisonRow[] = rows.map((r) => {
      const key = r.kind === 'pair' ? annexParagraphKey(r.law, r.gld ?? r.para ?? '') : null
      if (key !== null && withheld.has(key)) {
        // Emptied here, not hidden in the component: a row the standing law
        // does not account for must not be renderable by any client.
        return { ...r, current: '', proposed: '', segments: null, check: 'withheld' as const }
      }
      return { ...r, check: key !== null && unchecked.has(key) ? ('unchecked' as const) : ('verified' as const) }
    })

    return {
      gp,
      inr,
      available: true,
      unavailableReason: null,
      source,
      pdf,
      readFrom: rasterised ? 'pdf' : 'table',
      boundaryNote: refusal,
      // Counted over the rows as sent, so the numbers on the page and the
      // rows on the page cannot disagree.
      stats: summarizeComparison(checked.filter((r) => r.check !== 'withheld')),
      verification: check
        ? {
            judged: check.judged,
            verified: check.verified,
            withheldParagraphs: check.withheld.length,
            doubtfulLaws: check.doubtfulLaws.map((l) => l.law).filter((l): l is string => l !== null),
            uncheckedParagraphs: check.unchecked.length,
          }
        : null,
      rows: checked,
    }
  },
  { name: 'text-comparison', base: DERIVED_CACHE, getKey: (gp: string, inr: number) => `${gp}-${inr}`, maxAge: TTL_S, swr: false },
)
