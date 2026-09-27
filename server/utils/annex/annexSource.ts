/**
 * Which of the two published copies of the ressort's Textgegenüberstellung
 * the site reads — the one decision two sections depend on.
 *
 * **"Not in RIS" is not "does not exist" (2026-09-10).** Parliament publishes
 * the annex too, on the ME's own document list, and for 11 of the 130 matched
 * GP-XXVIII drafts it was there while the RIS record seemed to have none — 8
 * of them with an HTML version. **Measured again 27.09.2026: all eleven are
 * in RIS**, under names the anchored rule did not read („TGÜ Anpassung
 * QJF-G", „IFG-TGÜ (…)"); since `textComparisonNameRank` reads them, not one
 * GP-XXVIII draft is a Parliament-only case (docs/architecture.md §12.13). Saying „keine Textgegenüberstellung" about a draft that
 * has one, on a page whose whole claim is that it traces documents, is the
 * worst kind of wrong answer here. So the Parliament copy is always
 * **linked**. Whether its content is also **read** is `READ_PARLIAMENT_COPY`
 * below, and that switch is off since 19.09.2026: the reading path exists and
 * works — `annex/comparisonRows.ts` knows the Word template's
 * Gliederungssymbol (`991GldSymbol`, §12.12 sixth measurement) — it is simply
 * not taken.
 *
 * **The order of the two sources is a licence decision, not a technical
 * one.** Measured, the Parliament copy is the more complete and the more
 * finely cut. But RIS publishes the annex as CC BY (Bundeskanzleramt), while
 * Parliament explicitly excludes the Begutachtungsverfahren from reuse as
 * open data — the open licence question over that data
 * (docs/architecture.md §13.1). Where both hold the same document the
 * site reads the settled source; where RIS holds none, it says so instead of
 * keeping quiet about a Gegenüberstellung that exists. The credit line
 * therefore travels with the source (`credit`) and is no longer hard-wired
 * into the section.
 */
import type { TraceLink } from '#shared/types'
import type { DraftArticle } from '../lawtext/draftArticles'
import { mapDocuments } from '../parliament/detailJson'
import { getGegenstand } from '../parliament/drafts'
import { pickTextComparisons, type RisDocumentUrls } from '../ris/risRecord'
import { fetchDocument } from '../upstream/fetchDocument'
import { annexFromPdf } from './annexPdfService'
import { parseTextComparison, type ComparisonParse } from './comparisonRows'
import { isScanned } from './tableCells'

/**
 * The credit line at the foot of the section, one per copy that can be read.
 *
 * Two different sentences, because they are two different claims: RIS
 * licenses the annex as CC BY 4.0, Parliament does not. A blanket CC-BY note
 * over a Parliament document is exactly the mistake that has been ruled out
 * since 16.09.2026.
 */
export const RIS_CREDIT = 'Quelle (CC BY 4.0, RIS):'
export const PARLIAMENT_CREDIT = 'Quelle (Dokument des Ressorts, veröffentlicht vom Parlament):'

/**
 * The annex on Parliament's own document list for this ME, in the formats it
 * offers — the second place the ressort's Textgegenüberstellung is published.
 *
 * Fetched only where RIS has nothing to show, because it is one more upstream
 * call and the RIS record answers for 109 of 132 drafts on its own. Failures
 * are not caught: a Parliament timeout is not a statement about the draft,
 * and this function's answer is cached for a day (§12.13).
 */
export async function parliamentAnnex(gp: string, inr: number): Promise<{ pdf: TraceLink | null; html: TraceLink | null }> {
  const detail = await getGegenstand(gp, 'ME', inr)
  // The RIS side's rule, imported: over GP XXVIII every group it matches is
  // titled „Textgegenüberstellung" exactly, so it costs nothing here, and two
  // vocabularies that drift apart are the expensive kind of difference.
  const group = pickTextComparisons(mapDocuments(detail.content?.documents), (d) => d.title)[0]
  const of = (type: 'pdf' | 'html'): string | null => group?.formats.find((f) => f.type === type)?.url ?? null
  const pdf = of('pdf')
  const html = of('html')
  return {
    pdf: pdf ? { label: 'Textgegenüberstellung des Ressorts beim Parlament (PDF)', url: pdf } : null,
    html: html ? { label: 'Textgegenüberstellung des Ressorts beim Parlament (HTML)', url: html } : null,
  }
}

/**
 * Does this draft carry a Gegenüberstellung at all — in either of the two
 * copies?
 *
 * The **cheap half** of the question, and expressly not the whole one:
 * whether the document can also be *read* is what `annexSourceFor` knows, and
 * that costs the parser. Measured on 19.09.2026 over 40 GP-XXVIII drafts, the
 * endpoint runs cold at a median of 3,9 s and a maximum of 33 s, because for
 * two drafts in five a PDF is parsed and every § is checked against RIS.
 * Someone who only wants to know whether the annex exists must not pay that.
 *
 * Nothing here is expensive: the RIS half stands in the join row the caller
 * holds anyway, and `getGegenstand` has already fetched the detail page for
 * the same draft.
 *
 * Meant for sections that want to **point** at the Gegenüberstellung
 * (docs/architecture.md §12.30), not as a gate in front of it. A pointer to a
 * section that then says itself why it can show nothing is a cheap mistake; a
 * pointer into the PDF while the passage sits two screens further down is the
 * expensive one.
 */
export async function hasAnnexDocument(gp: string, inr: number, annex: RisDocumentUrls | null): Promise<boolean> {
  if (annex?.xml ?? annex?.pdf) return true
  // The Parliament copy counts only as long as it is also read
  // (`READ_PARLIAMENT_COPY`). Otherwise the sentence above would point at §§
  // this section does not render at all — the same mistake as before, the
  // other way round.
  if (!READ_PARLIAMENT_COPY) return false
  const parl = await parliamentAnnex(gp, inr)
  return Boolean(parl.html ?? parl.pdf)
}

/** What was read, from where — and under which licence that may be said. */
export interface AnnexSource {
  parsed: ComparisonParse
  source: TraceLink
  credit: string
  readFrom: 'table' | 'pdf'
  droppedPages: number
}

/**
 * RIS: the copy whose licence is settled.
 *
 * Returns a sentence where it fails — „nur als Scan", „ließ sich nicht
 * auslesen" — because those sentences say something about *this document*.
 * They are printed only if Parliament has nothing either.
 */
async function readRis(parts: readonly RisDocumentUrls[], articles: readonly DraftArticle[]): Promise<AnnexSource | string> {
  const annex = parts[0]
  if (!annex) return 'Keine Textgegenüberstellung: Sie ist nicht verpflichtend, und ein neues Gesetz hat nichts gegenüberzustellen.'
  // **The parts of one annex are read as one annex.** 2 of the 240 records
  // with a Gegenüberstellung publish it in several documents (26.09.2026), and
  // the law boundaries are resolved against the draft's WHOLE Artikel list —
  // so a part read on its own is held against laws it never claimed to carry.
  // The Weinrecht-Sammelverordnung is the case that shows it: read alone,
  // „(Artikel1)" refuses with „Die Beilage überspringt ein Gesetz des
  // Entwurfs", and the reader is told the ressort's document is defective when
  // in truth we read half of it.
  //
  // Which format decides is still the FIRST part's, because the parts of one
  // annex are typeset together: RIS rasterises a document or it does not, and
  // no record in the corpus mixes the two within one annex.
  const xml = annex.xml ? await fetchDocument(annex.xml) : null
  const rasterised = xml === null || isScanned(xml)
  if (!rasterised) {
    const rest = await Promise.all(parts.slice(1).map((p) => (p.xml ? fetchDocument(p.xml) : null)))
    const parsed = parseTextComparison([xml!, ...rest.filter((x): x is string => x !== null && !isScanned(x))], articles)
    if (parsed.rows.length === 0) return parsed.unreadable ?? 'Die Textgegenüberstellung ließ sich nicht auslesen.'
    return {
      parsed,
      // The XML table is the ressort's own structure; the PDF below is the
      // ressort's text with our reading of its layout on top, and the
      // difference belongs on the page.
      source: { label: 'Textgegenüberstellung des Ressorts', url: annex.html ?? annex.xml! },
      credit: RIS_CREDIT,
      readFrom: 'table',
      droppedPages: 0,
    }
  }
  const pdfs = parts.map((p) => p.pdf).filter((u): u is string => u !== null)
  if (pdfs.length === 0) return 'Die Textgegenüberstellung liegt nur als Scan vor, ohne auslesbaren Text.'
  // The PDF parse is held under its own name because it answers one thing the
  // table parse cannot: how many pages it refused.
  const fromPdf = await annexFromPdf(pdfs, articles)
  if (fromPdf === null) return 'Die Textgegenüberstellung ließ sich auch aus dem PDF nicht auslesen.'
  if (fromPdf.rows.length === 0) return fromPdf.unreadable ?? 'Die Textgegenüberstellung ließ sich nicht auslesen.'
  return {
    parsed: fromPdf,
    source: { label: 'Textgegenüberstellung des Ressorts, aus dem PDF gelesen', url: pdfs[0]! },
    credit: RIS_CREDIT,
    readFrom: 'pdf',
    droppedPages: fromPdf.droppedPages,
  }
}

/**
 * THE SWITCH: is the Parliament copy also **read**?
 *
 * `false` since 19.09.2026, and the reason is not a technical one — the
 * fallback works; measured, 3 GP-XXVIII drafts would gain a Gegenüberstellung
 * through it (upper bound 8, up to 13, depending on a procedural question
 * that is still open).
 *
 * It is off because Parliament expressly excludes the data of the
 * Begutachtungsverfahren from reuse — the open licence question over that
 * data (docs/architecture.md §13.1) — and the hard
 * line drawn from that is „Stufe 1 bleibt metadaten-only". Reading the text
 * of an annex out of a parlament.gv.at document and displaying it is not a
 * metadatum. For exactly these drafts the usual argument does not hold
 * either — „the same document is in RIS under CC BY" — because they are
 * precisely the ones RIS carries no copy of.
 *
 * **The document stays linked**, in every branch below. What is not shown is
 * its content.
 *
 * TURN IT BACK ON as soon as that licence question is answered
 * (docs/architecture.md §13.1). It is then three moves, and all three belong
 * together:
 *  1. this constant to `true`,
 *  2. the licence lines on `/impressum` and `/ueber` — they say
 *     „ausschließlich Metadaten" today, and that would no longer be true,
 *  3. the sentence under `typeof chosen === 'string'` in
 *     `annex/textComparisonService.ts` that explains why nothing stands here:
 *     „lesen wir nicht aus" becomes „ließ sich nicht auslesen" again.
 * Then `pnpm test`, and re-measure the coverage figure in §12.12.
 */
export const READ_PARLIAMENT_COPY = false

/**
 * Parliament: the same document, published a second time — the fallback.
 *
 * The scan case gains nothing here: 41 of 42 scans are PDF-only at Parliament
 * as well (§12.12, sixth measurement).
 */
async function readParliament(gp: string, inr: number, articles: readonly DraftArticle[]): Promise<AnnexSource | null> {
  const parl = await parliamentAnnex(gp, inr)
  if (!parl.html) return null
  const parsed = parseTextComparison(await fetchDocument(parl.html.url), articles)
  if (parsed.rows.length === 0) return null
  return { parsed, source: parl.html, credit: PARLIAMENT_CREDIT, readFrom: 'table', droppedPages: 0 }
}

/**
 * Which of the two copies of the annex is read — the ONE decision, and it
 * lives here because two sections need it.
 *
 * The Gegenüberstellung shows the rows; the konsolidierte Lesefassung
 * (`kons/konsService.ts`) has itself confirmed by those same rows. If the two
 * read different documents, a § could pass a gate whose evidence is nowhere
 * on the page.
 *
 * RIS first, Parliament as the fallback: by licence, not by quality (see the
 * file header). Measured, the Parliament copy is the more complete one.
 */
export async function annexSourceFor(
  parts: readonly RisDocumentUrls[],
  articles: readonly DraftArticle[],
  /**
   * The second copy, for a draft that HAS a Gegenstand — null where there is
   * none. A Begutachtung that Parliament does not carry cannot have a copy
   * there, and asking would be one upstream call for a document that cannot
   * exist (`ris/risOnly.ts`, §12.16).
   */
  atParliament: (() => Promise<AnnexSource | null>) | null = null,
): Promise<AnnexSource | string> {
  const ris = await readRis(parts, articles)
  if (typeof ris !== 'string') return ris
  if (!READ_PARLIAMENT_COPY || !atParliament) return ris
  return (await atParliament()) ?? ris
}

/** The same decision for a Ministerialentwurf, with Parliament's copy wired in. */
export async function annexSourceForDraft(
  gp: string,
  inr: number,
  parts: readonly RisDocumentUrls[],
  articles: readonly DraftArticle[],
): Promise<AnnexSource | string> {
  return annexSourceFor(parts, articles, () => readParliament(gp, inr, articles))
}
