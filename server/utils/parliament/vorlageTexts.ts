/**
 * „Der Entwurf" on the page of a Regierungsvorlage without a Begutachtung: the Vorlage's own Textgegenüberstellung and
 * Erläuterungen, read from Parliament's copy.
 *
 * WHY PARLIAMENT'S COPY HERE, when a draft's annex is read from RIS first
 * (`annex/annexSource.ts`, `READ_PARLIAMENT_COPY`): that switch is about the
 * documents of a Ministerialentwurf, whose licence is the open question. A
 * Regierungsvorlage's documents are freie Werke by Parliament's own dataset
 * page, and RIS carries the Vorlage only under a RegV record this site does
 * not join. So the copy read is the settled one, and the credit line says
 * „freies Werk", never CC BY (`publisher: 'parlament'`).
 *
 * An Antrag gets the Textgegenüberstellung only: Parliament's own working
 * copy, turned into two columns (`parlDionAnnex.ts`, since 12.11.2026). Its
 * Begründung stands inside the Initiativantrag document and is not cut out
 * (the Erläuterungen route answers 404 for an Antrag).
 *
 * A document Parliament's list does not hold is one the monitor did not
 * find, never one Parliament did not publish: a list proves no absence
 * (21.11.2026; until then both sections said „nicht veröffentlicht").
 *
 * A VORLAGE'S TEXTGEGENÜBERSTELLUNG HELD AS A PDF ONLY IS READ FROM THAT PDF
 * (23.11.2026): the ministry's annex in the template the PDF reader knows,
 * under Parliament's margin stamps (`annex/parliamentPdfStamps.ts`), and a
 * freies Werk like its HTML. An Antrag's is Parliament's three-column working
 * copy, which the two-column reader does not fit. It stays „Nicht im Monitor",
 * as do a Vorlage's Erläuterungen held as a PDF only: no reading of them
 * failed, the monitor does not attempt one (`shared/utils/gaps.ts`,
 * `outOfScope`).
 */
import { gapDe } from '#shared/utils/gaps'
import type { ExplanationsResponse, TextComparisonResponse, TraceLink } from '#shared/types'
import { rootKey } from '#shared/utils/procedureRoot'
import { annexFromParliamentPdf } from '../annex/annexPdfService'
import { asGap, parliamentAnnex, type AnnexSource } from '../annex/annexSource'
import { parseTextComparison } from '../annex/comparisonRows'
import { emptyComparison, readAndCheck } from '../annex/textComparisonService'
import { DERIVED_CACHE } from '../cache/base'
import { DERIVED_ANALYSIS_TTL_S } from '../cache/ttl'
import { explanationsByParagraph } from '../explanations/explanationsJoin'
import { explanationsDocumentOfHtml, parseExplanationsHtml } from '../explanations/explanationsHtml'
import { getRootDraftArticles } from '../lawtext/draftArticlesService'
import type { DraftIdentity } from '../ris/draftIdentity'
import { fetchDocument } from '../upstream/fetchDocument'
import { isParlDionAnnex, parlDionTwoColumns } from '../annex/parlDionAnnex'
import { mapDocuments } from './detailJson'
import { getGegenstand } from './drafts'
import { stripHtmlToText } from './htmlText'
import { explanationsGroup, type VorlageDetailInputs } from './vorlageDetailAssembly'

/** `vorlageDetail.ts`'s VorlageRoot, by the pure module: importing that one pulls Nitro's auto-imports into the tools' typecheck. */
type VorlageRoot = VorlageDetailInputs['root']

/**
 * A Vorlage's annex from Parliament's PDF: what was read, or the sentence
 * that says why nothing was. A PDF that cannot be fetched throws and is not
 * cached (`annexFromParliamentPdf`); one that was received and yields no row
 * is a fact about the document.
 */
async function readVorlagePdf(pdf: TraceLink, articles: Parameters<typeof annexFromParliamentPdf>[1]): Promise<AnnexSource | string> {
  const parsed = await annexFromParliamentPdf(pdf.url, articles)
  if (parsed === null) return gapDe('unreadable', 'Das PDF der Textgegenüberstellung zu dieser Regierungsvorlage ließ sich nicht öffnen.')
  if (parsed.rows.length === 0) return asGap(parsed.unreadable) ?? gapDe('unreadable', 'Die Textgegenüberstellung zu dieser Regierungsvorlage ließ sich aus dem PDF nicht auslesen.')
  return { parsed, source: pdf, publisher: 'parlament', readFrom: 'pdf', droppedPages: parsed.droppedPages, frontMatterDiffers: parsed.frontMatterDiffers ?? [] }
}

/**
 * The item's Textgegenüberstellung, with the same checks as a draft's
 * (`readAndCheck`): a Vorlage's from the ressort, as HTML or else from the
 * PDF, an Antrag's Parliament's own working copy (`parlDionAnnex.ts`, since
 * 12.11.2026), turned into the two-column form first. Where neither is there
 * to read, one sentence.
 */
export const getVorlageTextComparison = defineCachedFunction(
  async (root: VorlageRoot): Promise<TextComparisonResponse> => {
    const who: DraftIdentity = { gp: root.gp, inr: root.inr, risId: null }
    const what = root.ityp === 'A' ? 'zu diesem Antrag' : 'zu dieser Regierungsvorlage'
    const annex = await parliamentAnnex(root.gp, root.inr, root.ityp)
    const pdfToRead = !annex.html && root.ityp !== 'A' ? annex.pdf : null
    if (!annex.html && !pdfToRead) {
      return emptyComparison(
        who,
        annex.pdf
          ? gapDe('outOfScope', `Die Textgegenüberstellung ${what} liegt beim Parlament nur als PDF vor; das PDF eines Antrags liest der Monitor nicht aus.`)
          : gapDe('unreadable', `Unter den Dokumenten des Parlaments ${what} fand der Monitor keine Textgegenüberstellung.`),
        null,
        annex.pdf,
      )
    }
    const [draft, detail, html] = await Promise.all([getRootDraftArticles(root), getGegenstand(root.gp, root.ityp, root.inr), annex.html ? fetchDocument(annex.html.url) : null])
    // Parliament's three-column working copy, as two columns; any other document as it is.
    const parlDion = html !== null && isParlDionAnnex(html)
    let chosen: AnnexSource | string
    if (html === null) {
      chosen = await readVorlagePdf(pdfToRead!, draft.articles)
    } else {
      const twoColumns = parlDion ? parlDionTwoColumns(html) : html
      const parsed = twoColumns ? parseTextComparison(twoColumns, draft.articles) : null
      if (!parsed || parsed.rows.length === 0) {
        return emptyComparison(who, gapDe('unreadable', `Die Textgegenüberstellung ${what} ließ sich nicht auslesen.`), null, annex.pdf)
      }
      const source = parlDion ? { label: 'Textgegenüberstellung (Arbeitsdokument ParlDion)', url: annex.html!.url } : annex.html!
      chosen = { parsed, source, publisher: 'parlament', readFrom: 'table', droppedPages: 0 }
    }
    const asOf = detail.content?.einlangen?.slice(0, 10) ?? ''
    const out = await readAndCheck(
      who,
      [],
      asOf,
      draft,
      chosen,
      annex.pdf,
      // No Lesefassung of a Vorlage's annex: the draft check stands alone.
      async () => null,
      // Its (GP, Nummer) is a draft's too: the verification is cached under the root.
      rootKey(root),
    )
    if (typeof out === 'string') return emptyComparison(who, out, null, annex.pdf)
    // Whose document it is, for the „Methode": by the document read, and
    // unsaid for an Antrag whose annex is not Parliament's working copy.
    const annexOf = parlDion ? 'parldion' : root.ityp === 'A' ? undefined : 'vorlage'
    return annexOf ? { ...out, annexOf } : out
  },
  { name: 'text-comparison-item', base: DERIVED_CACHE, getKey: (root: VorlageRoot) => rootKey(root), maxAge: DERIVED_ANALYSIS_TTL_S, swr: false },
)

const EXPLANATIONS_LABEL = 'Erläuterungen der Regierungsvorlage'

function emptyExplanations(reason: string, document: TraceLink | null): ExplanationsResponse {
  return {
    available: false,
    publisher: 'parlament',
    unavailableReason: reason,
    source: null,
    document,
    heading: null,
    labelled: false,
    passages: [],
    chars: 0,
    dropped: 0,
    hasSpecial: false,
    paragraphs: [],
    paragraphsAtAnnex: false,
    enactedLaws: [],
  }
}

/**
 * The Vorlage's Erläuterungen: the Allgemeiner Teil for the section, the
 * Besonderer Teil at the Paragraphen of the Textgegenüberstellung — the
 * draft's section, fed from Parliament's HTML (`explanationsDocumentOfHtml`).
 */
export const getVorlageExplanations = defineCachedFunction(
  async (root: VorlageRoot): Promise<ExplanationsResponse> => {
    const detail = await getGegenstand(root.gp, 'I', root.inr)
    const group = explanationsGroup(mapDocuments(detail.content?.documents))
    const html = group?.formats.find((f) => f.type === 'html')?.url ?? null
    const pdf = group?.formats.find((f) => f.type === 'pdf')?.url ?? null
    const document = html || pdf ? { label: EXPLANATIONS_LABEL, url: (html ?? pdf)! } : null
    if (!html) {
      return emptyExplanations(
        pdf
          ? gapDe('outOfScope', 'Die Erläuterungen dieser Regierungsvorlage liegen beim Parlament nur als PDF vor; aus einem PDF des Parlaments liest der Monitor Erläuterungen nicht aus.')
          : gapDe('unreadable', 'Unter den Dokumenten des Parlaments zu dieser Regierungsvorlage fand der Monitor keine Erläuterungen.'),
        document,
      )
    }
    const text = await fetchDocument(html)
    // Whether the ressort headed an Allgemeiner Teil — the section says
    // whether it shows a named part or our reading of the document.
    const labelled = /Allgemeiner\s+Teil/i.test(stripHtmlToText(text))
    const doc = explanationsDocumentOfHtml(parseExplanationsHtml(text, { generalAsHeaded: true }), labelled)
    if (!doc.general) {
      return emptyExplanations(
        gapDe('unreadable', 'Die Erläuterungen dieser Regierungsvorlage heben keinen Allgemeinen Teil hervor. Was das Ministerium schreibt, steht im Dokument selbst.'),
        document,
      )
    }
    const articles = doc.special ? (await getRootDraftArticles(root)).articles : []
    const paragraphs = explanationsByParagraph(doc, articles)
    // The annex is read from either format (`getVorlageTextComparison`).
    const annexDocument = paragraphs.length > 0 ? await parliamentAnnex(root.gp, root.inr, 'I') : null
    const annex = Boolean(annexDocument?.html ?? annexDocument?.pdf)
    return {
      available: true,
      publisher: 'parlament',
      unavailableReason: null,
      source: { label: EXPLANATIONS_LABEL, url: html },
      document,
      heading: doc.general.heading,
      labelled,
      passages: doc.general.passages.map((p) => ({ heading: p.heading, text: p.text })),
      chars: doc.general.chars,
      dropped: 0,
      hasSpecial: doc.special !== null,
      paragraphs,
      paragraphsAtAnnex: annex,
      enactedLaws: articles.flatMap((a) => (!a.amends && a.key ? [a.key] : [])),
    }
  },
  { name: 'erlaeuterungen-item', base: DERIVED_CACHE, getKey: (root: VorlageRoot) => rootKey(root), maxAge: DERIVED_ANALYSIS_TTL_S, swr: false },
)
