/**
 * The Allgemeiner Teil of the Erläuterungen for one Begutachtung
 * (docs/architecture.md §12.29).
 *
 * Nuxt-aware glue around the pure module `explanations.ts`. Two entry points,
 * because the two kinds of draft reach their RIS document by different roads:
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
 * while the reading of it is derived, because `explanations.ts` is exactly the
 * kind of parser that keeps changing and must not leave a day-old parse on
 * screen after an edit.
 */
import type { ExplanationsResponse, TraceLink } from '#shared/types'
import { hasReadableText, parseExplanations, type ExplanationsDocument, type ExplanationsPart } from './explanations'
import { explanationsByParagraph } from './explanationsJoin'
import { parseRisXml } from './lawText'
import { draftArticles } from './lawTitles'
import { DERIVED_CACHE } from './cache/base'
import { DERIVED_ANALYSIS_TTL_S, PUBLISHED_DOCUMENT_TTL_S } from './cache/ttl'
import { getText } from './risKons'
import { getRisMapForGp } from './ris'
import { getRisConsultation } from './risOnly'
import { hasAnnexDocument } from './textComparisonService'

/** One Erläuterungen document as RIS sent it, keyed by URL — parsed fresh above. */
const fetchExplanationsXml = defineCachedFunction((url: string): Promise<string> => getText(url), {
  name: 'erlaeuterungen-xml',
  getKey: (url: string) => url,
  maxAge: PUBLISHED_DOCUMENT_TTL_S,
  swr: false,
})

/**
 * The draft text as RIS sent it — the Artikel of the package are read from it.
 *
 * Its own cache entry rather than a second copy of the annex service's: both
 * want the same document, and one entry per URL is what the persistent layer
 * is for.
 */
const fetchDraftXml = defineCachedFunction((url: string): Promise<string> => getText(url), {
  name: 'entwurfstext-xml',
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
    // Die zweite Bedingung — der Join hat Passagen gebunden — steckt schon in
    // `annex`: Ohne sie wird gar nicht erst gefragt (siehe `read`).
    paragraphsAtAnnex: annex,
  }
}

/**
 * Die Artikel des Entwurfs, für den Schlüssel des Joins.
 *
 * Aus dem Entwurfstext, weil der Gesetzesschlüssel der Beilage von dort kommt
 * (`draftArticles` → `segmentUnits` → `ComparisonRow.law`). Scheitert der
 * Abruf, gibt es eben keine Zuordnung: Die Erläuterungen selbst stehen dann
 * trotzdem auf der Seite, nur ohne die Passagen am Paragraphen. Ein fehlender
 * Entwurfstext darf nicht den ganzen Abschnitt kosten.
 */
async function articlesOf(xmlUrl: string | null): Promise<ReturnType<typeof draftArticles>> {
  if (!xmlUrl) return []
  try {
    return draftArticles(parseRisXml(await fetchDraftXml(xmlUrl)))
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
  draftXml: string | null,
  /**
   * Gefragt wird erst, wenn es etwas zu zeigen gibt: Ohne Passagen am
   * Paragraphen hängt an der Antwort nichts, und die Frage kostet bei den
   * Entwürfen ohne RIS-Beilage einen Abruf beim Parlament.
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
  const articles = parsed.special ? await articlesOf(draftXml) : []
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
    // Ob die Passagen unten an einem Paragraphen stehen, beantwortet der
    // Abschnitt, der sie zeigt — `hasAnnexDocument` statt einer hier
    // nachgebauten Bedingung. Die nachgebaute gab es einen Tag lang, und sie
    // war schon am nächsten falsch: Seit die Kopie des Parlaments als Rückfall
    // gelesen wird, erscheint die Gegenüberstellung auch ohne RIS-Dokument
    // (gemessen 19.09.2026: 23/ME der GP XXVIII). Eine Bedingung, die eine
    // andere spiegelt, altert genau so.
    //
    // Was NICHT gefragt wird, weil es zu teuer ist: ob sich die Beilage auch
    // lesen lässt. Das weiß erst der Parser, und der Endpunkt braucht kalt im
    // Median 3,9 s (max. 33 s) — in einem SSR-Pfad mit 800-ms-Frist wäre das
    // der sichere Fristbruch, und der Preis dafür wäre der Text im HTML.
    // Die Asymmetrie ist ausgehalten, nicht übersehen: Ein Zeiger auf einen
    // Abschnitt, der selbst sagt, warum er nichts zeigt, kostet einen Blick;
    // ein Zeiger ins PDF, während die Stelle auf derselben Seite steht,
    // kostet den Weg zurück.
    return read(row.explanations, row.risDocument?.xml ?? null, async () =>
      row.status === 'matched' && (await hasAnnexDocument(gp, inr, row.textComparison)))
  },
  { name: 'erlaeuterungen-me', base: DERIVED_CACHE, getKey: (gp: string, inr: number) => `${gp}-${inr}`, maxAge: DERIVED_ANALYSIS_TTL_S, swr: false },
)

/** For a Begutachtung without a parliamentary Gegenstand: straight from its own record. */
export const getRisExplanations = defineCachedFunction(
  async (id: string): Promise<ExplanationsResponse> => {
    const detail = await getRisConsultation(id)
    if (!detail) throw createError({ statusCode: 404, statusMessage: 'Begutachtung nicht gefunden' })
    // Nie am Paragraphen: Die Seite einer Begutachtung ohne Gegenstand
    // rendert die Gegenüberstellung nicht, sie verlinkt sie (§12.30).
    return read(detail.explanations, detail.mainDocument.xml, async () => false)
  },
  { name: 'erlaeuterungen-ris', base: DERIVED_CACHE, getKey: (id: string) => id, maxAge: DERIVED_ANALYSIS_TTL_S, swr: false },
)
