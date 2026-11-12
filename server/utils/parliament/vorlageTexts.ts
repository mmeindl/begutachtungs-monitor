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
 * Not for an Antrag: its annex is Parliament's working copy in another
 * template (it parses to no rows), and its Begründung stands inside the
 * Initiativantrag document — both open experiments, not approximated.
 */
import type { ExplanationsResponse, TextComparisonResponse, TraceLink } from '#shared/types'
import { rootKey } from '#shared/utils/procedureRoot'
import { parliamentAnnex } from '../annex/annexSource'
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
import type { VorlageRoot } from './vorlageDetail'
import { explanationsGroup } from './vorlageDetailAssembly'

/**
 * The item's Textgegenüberstellung, with the same checks as a draft's
 * (`readAndCheck`): a Vorlage's from the ressort, an Antrag's Parliament's
 * own working copy (`parlDionAnnex.ts`, since 12.11.2026), turned into the
 * two-column form first. Where neither is there to read, one sentence.
 */
export const getVorlageTextComparison = defineCachedFunction(
  async (root: VorlageRoot): Promise<TextComparisonResponse> => {
    const who: DraftIdentity = { gp: root.gp, inr: root.inr, risId: null }
    const what = root.ityp === 'A' ? 'zu diesem Antrag' : 'zu dieser Regierungsvorlage'
    const annex = await parliamentAnnex(root.gp, root.inr, root.ityp)
    if (!annex.html) {
      return emptyComparison(
        who,
        annex.pdf
          ? `Die Textgegenüberstellung ${what} hat das Parlament nur als PDF veröffentlicht, nicht in lesbarer Form.`
          : `Eine Textgegenüberstellung ${what} hat das Parlament nicht in lesbarer Form veröffentlicht.`,
        null,
        annex.pdf,
      )
    }
    const [draft, detail, html] = await Promise.all([getRootDraftArticles(root), getGegenstand(root.gp, root.ityp, root.inr), fetchDocument(annex.html.url)])
    // Parliament's three-column working copy, as two columns; any other document as it is.
    const parlDion = isParlDionAnnex(html)
    const twoColumns = parlDion ? parlDionTwoColumns(html) : html
    const parsed = twoColumns ? parseTextComparison(twoColumns, draft.articles) : null
    if (!parsed || parsed.rows.length === 0) {
      return emptyComparison(who, `Die Textgegenüberstellung ${what} ließ sich nicht auslesen.`, null, annex.pdf)
    }
    const source = parlDion ? { label: 'Textgegenüberstellung (Arbeitsdokument ParlDion)', url: annex.html.url } : annex.html
    const asOf = detail.content?.einlangen?.slice(0, 10) ?? ''
    const out = await readAndCheck(
      who,
      [],
      asOf,
      draft,
      { parsed, source, publisher: 'parlament', readFrom: 'table', droppedPages: 0 },
      annex.pdf,
      // Its (GP, Nummer) is a draft's too: the verification is cached under the root.
      rootKey(root),
    )
    return typeof out === 'string' ? emptyComparison(who, out, null, annex.pdf) : out
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
        pdf ? 'Die Erläuterungen dieser Regierungsvorlage liegen nur als PDF vor.' : 'Zu dieser Regierungsvorlage sind keine Erläuterungen veröffentlicht.',
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
        'Die Erläuterungen dieser Regierungsvorlage heben keinen Allgemeinen Teil hervor. Was das Ressort schreibt, steht im Dokument selbst.',
        document,
      )
    }
    const articles = doc.special ? (await getRootDraftArticles(root)).articles : []
    const paragraphs = explanationsByParagraph(doc, articles)
    const annex = paragraphs.length > 0 && Boolean((await parliamentAnnex(root.gp, root.inr, 'I')).html)
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
