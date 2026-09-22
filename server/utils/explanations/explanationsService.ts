/**
 * The Allgemeiner Teil of the Erläuterungen for one Begutachtung
 * (docs/architecture.md §12.29).
 *
 * Nuxt-aware glue around the pure module `explanations/risExplanations.ts`.
 * Two entry points, because the two kinds of draft reach their RIS document
 * by different roads:
 * a Ministerialentwurf through the RIS↔ME join (Parliament publishes the
 * document only as a PDF, so the readable copy is reachable no other way), a
 * Verordnungsentwurf straight from its own record, which is a RIS record to
 * begin with.
 *
 * WHY IT IS ITS OWN ENDPOINT. The document is fetched from RIS and parsed per
 * draft; putting it in `/api/drafts/:gp/:inr` would add an upstream call to
 * every detail render, including the visits that never scroll this far. The
 * page asks for it after first paint, like the Textgegenüberstellung.
 *
 * **A failure is not an answer** (the §12.13 rule, applied again). The
 * `available: false` states below are the ones RIS really has — no document,
 * a scan, a document without a general part. A timeout or a 500 throws and is
 * not cached, so a bad minute upstream cannot be served as "dieser Entwurf hat
 * keine Erläuterungen" for a day.
 *
 * **Two cache layers, split by provenance** (`cache/base.ts`): the document as
 * RIS sent it is persistent — it is expensive and our code did not make it —
 * while the reading of it is derived, because that parser is exactly the
 * kind of parser that keeps changing and must not leave a day-old parse on
 * screen after an edit.
 */
import type { ExplanationsResponse, TraceLink } from '#shared/types'
import { hasReadableText, parseExplanations, type ExplanationsDocument, type ExplanationsPart } from './risExplanations'
import { explanationsByParagraph } from './explanationsJoin'
import type { DraftArticle } from '../lawtext/draftArticles'
import { draftArticlesOfXml, getDraftArticles, type DraftText } from '../lawtext/draftArticlesService'
import { DERIVED_CACHE } from '../cache/base'
import { DERIVED_ANALYSIS_TTL_S, PUBLISHED_DOCUMENT_TTL_S } from '../cache/ttl'
import { getText } from '../ris/konsLaw'
import { getRisMapForGp } from '../ris/begutCorpus'
import { getRisConsultation } from '../ris/risOnly'
import { hasAnnexDocument } from '../annex/annexSource'

/** One Erläuterungen document as RIS sent it, keyed by URL — parsed fresh above. */
const fetchExplanationsXml = defineCachedFunction((url: string): Promise<string> => getText(url), {
  name: 'erlaeuterungen-xml',
  getKey: (url: string) => url,
  maxAge: PUBLISHED_DOCUMENT_TTL_S,
  swr: false,
})

/** RIS document URLs as the corpus mapper carries them. */
interface Formats {
  html: string | null
  xml: string | null
  pdf: string | null
}

/**
 * Without „(RIS)": both places that print this link name the source already —
 * the source line as „Quelle (CC BY 4.0, RIS)", the refusal in its own
 * sentence — and the label repeated it.
 */
const RIS_SOURCE = 'Erläuterungen des Ressorts'

function empty(reason: string, document: TraceLink | null = null): ExplanationsResponse {
  return {
    available: false,
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
  }
}

/** The document to open when we cannot print it: HTML where RIS has it, else the PDF. */
function documentLink(formats: Formats): TraceLink | null {
  const url = formats.html ?? formats.pdf
  return url ? { label: RIS_SOURCE, url } : null
}

function view(
  part: ExplanationsPart,
  formats: Formats,
  labelled: boolean,
  doc: ExplanationsDocument,
  paragraphs: ExplanationsResponse['paragraphs'],
  annex: boolean,
): ExplanationsResponse {
  return {
    available: true,
    unavailableReason: null,
    source: { label: RIS_SOURCE, url: formats.xml! },
    document: documentLink(formats),
    heading: part.heading,
    labelled,
    passages: part.passages.map((p) => ({ heading: p.heading, text: p.text })),
    chars: part.chars,
    dropped: part.dropped,
    hasSpecial: doc.special !== null,
    paragraphs,
    // The second condition — the join bound passages at all — already sits
    // inside `annex`: without it the question is never asked (see `read`).
    paragraphsAtAnnex: annex,
  }
}

/**
 * The draft's Artikel, for the join's key.
 *
 * Out of the draft's own text, because the Beilage's law key comes from there
 * (`draftArticles` → `segmentUnits` → `ComparisonRow.law`). Where the fetch
 * fails there simply is no attribution: the Erläuterungen themselves still
 * stand on the page, only without the passages at the Paragraph. A missing
 * draft text must not cost the whole section.
 */
async function articlesOf(read: () => Promise<DraftText>): Promise<DraftArticle[]> {
  try {
    return (await read()).articles
  } catch {
    return []
  }
}

/**
 * Fetch and read one Erläuterungen document.
 *
 * The three refusals are worded for a reader rather than for a log: „liegt nur
 * als Scan vor" is a fact about the ministry's file, „hebt keinen Allgemeinen
 * Teil hervor" is a fact about its structure, and neither is an error of ours.
 */
async function read(
  formats: Formats | null,
  /** The draft's Artikel, asked for only where there is a Besonderer Teil to join. */
  draftText: () => Promise<DraftText>,
  /**
   * Asked only once there is something to show: without passages at a
   * Paragraph nothing hangs on the answer, and for the drafts without a RIS
   * Beilage the question costs a call to Parliament.
   */
  annexOf: () => Promise<boolean>,
): Promise<ExplanationsResponse> {
  if (!formats?.xml) {
    return empty(
      formats
        ? 'Die Erläuterungen liegen im RIS nur als Bilddatei vor; auslesen lassen sie sich daraus nicht.'
        : 'Zu diesem Entwurf sind im RIS keine Erläuterungen veröffentlicht.',
      formats ? documentLink(formats) : null,
    )
  }
  const parsed = parseExplanations(await fetchExplanationsXml(formats.xml))
  if (!hasReadableText(parsed)) {
    return empty('Die Erläuterungen liegen als Scan vor — im RIS-Dokument stehen Bilder statt Text.', documentLink(formats))
  }
  if (!parsed.general) {
    return empty(
      'Die Erläuterungen dieses Entwurfs heben keinen Allgemeinen Teil hervor. Was das Ressort schreibt, steht im Dokument selbst.',
      documentLink(formats),
    )
  }
  const articles = parsed.special ? await articlesOf(draftText) : []
  const paragraphs = explanationsByParagraph(parsed, articles)
  return view(parsed.general, formats, !parsed.generalInferred, parsed, paragraphs, paragraphs.length > 0 && (await annexOf()))
}

/** For a Ministerialentwurf: through the RIS↔ME join, like the Textgegenüberstellung. */
export const getExplanations = defineCachedFunction(
  async (gp: string, inr: number): Promise<ExplanationsResponse> => {
    const row = (await getRisMapForGp(gp)).rows.find((r) => r.inr === inr) ?? null
    if (!row?.risId) {
      return empty(
        row?.status === 'ambiguous'
          ? 'Mehrere RIS-Datensätze kommen für diesen Entwurf infrage. Die Erläuterungen aus dem falschen zu zeigen wäre schlechter als keine.'
          : 'Der Entwurf ließ sich keinem RIS-Dokument zuordnen; nur dort lesen wir die Erläuterungen aus.',
      )
    }
    // Whether the passages below stand at a Paragraph is answered by the
    // section that shows them — `hasAnnexDocument` rather than a condition
    // rebuilt here. The rebuilt one existed for a day and was wrong by the
    // next: whether the Gegenüberstellung appears without a RIS document
    // hangs on `READ_PARLIAMENT_COPY` (`annex/annexSource.ts`), which was on
    // for one day and is off since 19.09.2026 (measured that day: 23/ME of
    // GP XXVIII). A condition that mirrors another ages exactly that way.
    //
    // What is NOT asked, because it is too expensive: whether the Beilage can
    // also be *read*. Only the parser knows that, and the endpoint runs cold
    // at a median of 3,9 s (max. 33 s) — in an SSR path with an 800 ms
    // deadline that is the certain miss, and the price would be the text in
    // the HTML. The asymmetry is borne, not overlooked: a pointer to a
    // section that says itself why it shows nothing costs one glance; a
    // pointer into the PDF while the passage sits on the same page costs the
    // way back.
    return read(row.explanations, () => getDraftArticles(gp, inr, 'ris-xml'), async () =>
      row.status === 'matched' && (await hasAnnexDocument(gp, inr, row.textComparison)))
  },
  { name: 'erlaeuterungen-me', base: DERIVED_CACHE, getKey: (gp: string, inr: number) => `${gp}-${inr}`, maxAge: DERIVED_ANALYSIS_TTL_S, swr: false },
)

/** For a Begutachtung without a parliamentary Gegenstand: straight from its own record. */
export const getRisExplanations = defineCachedFunction(
  async (id: string): Promise<ExplanationsResponse> => {
    const detail = await getRisConsultation(id)
    if (!detail) throw createError({ statusCode: 404, statusMessage: 'Begutachtung nicht gefunden' })
    // Never at a Paragraph: the page of a Begutachtung without a Gegenstand
    // does not render the Gegenüberstellung, it links it (§12.30). Without a
    // Gegenstand there is no (GP, Nummer) for the shared cache to key on; the
    // document read is the same one.
    const xml = detail.mainDocument.xml
    return read(detail.explanations, () => (xml ? draftArticlesOfXml(xml) : Promise.resolve({ blocks: [], articles: [] })), async () => false)
  },
  { name: 'erlaeuterungen-ris', base: DERIVED_CACHE, getKey: (id: string) => id, maxAge: DERIVED_ANALYSIS_TTL_S, swr: false },
)
