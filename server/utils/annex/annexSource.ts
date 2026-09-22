/**
 * Which of the two published copies of the ressort's Textgegenüberstellung
 * the site reads — the one decision two sections depend on.
 *
 * **"Not in RIS" is not "does not exist" (2026-09-10, gelesen seit
 * 2026-09-19).** Parliament publishes the annex too, on the ME's own document
 * list, and for 11 of the 130 matched GP-XXVIII drafts it is there while the
 * RIS record has none — 8 of them with an HTML version. Saying "keine
 * Textgegenüberstellung" about a draft that has one, on a page whose whole
 * claim is that it traces documents, is the worst kind of wrong answer here.
 * Seit `textComparison.ts` auch das Gliederungssymbol der Word-Vorlage kennt
 * (`991GldSymbol`, §12.12 sechste Messung), wird die Parlamentskopie nicht nur
 * verlinkt, sondern **gelesen** — als Rückfall, nicht als erste Wahl.
 *
 * **Die Reihenfolge der beiden Quellen ist eine Lizenzentscheidung, keine
 * technische.** Gemessen ist die Parlamentskopie die vollständigere und die
 * feiner geschnittene. Aber das RIS veröffentlicht die Beilage als CC BY
 * (Bundeskanzleramt), während das Parlament die Begutachtungsverfahren
 * ausdrücklich von der Weiterverwendung als Open Data ausschließt (§13.1,
 * offene Frage E3). Wo beide dasselbe Dokument führen, liest die Seite die
 * geklärte Quelle; wo das RIS keine führt, liest sie die andere und sagt es,
 * statt eine Gegenüberstellung zu verschweigen, die es gibt. Die
 * Quellenangabe trägt deshalb ihre Lizenz mit sich (`credit`) und ist nicht
 * mehr im Abschnitt festverdrahtet.
 */
import type { TraceLink } from '#shared/types'
import type { DraftArticle } from '../lawtext/draftArticles'
import { mapDocuments } from '../parliament/detailJson'
import { getGegenstand } from '../parliament/drafts'
import type { RisDocumentUrls } from '../ris/risRecord'
import { fetchDocument } from '../upstream/fetchDocument'
import { annexFromPdf } from './annexPdfService'
import { parseTextComparison, type ComparisonParse } from './comparisonRows'
import { isScanned } from './tableCells'

/**
 * The same loose match `ris/begutCorpus.ts` uses on the RIS side: ressorts write
 * "Textgegenüberstellung", "TGÜ", "TGG" and a misspelt
 * "Textgegenbüberstellung" (docs/api-exploration.md §2c). Over GP XXVIII
 * every one of the 121 Parliament document groups it matches is titled
 * "Textgegenüberstellung" exactly, so the looseness costs nothing here and
 * keeps the two sides reading the same vocabulary.
 */
const ANNEX_NAME_RE = /gegen.?über|^TG(Ü|G|UE)$/i

/**
 * Die Quellenzeile am Fuß des Abschnitts, je nach gelesener Kopie.
 *
 * Zwei verschiedene Sätze, weil zwei verschiedene Behauptungen: Das RIS
 * lizenziert die Beilage als CC BY 4.0, das Parlament tut das nicht. Eine
 * pauschale CC-BY-Angabe über einem Dokument des Parlaments wäre genau der
 * Fehler, den `CLAUDE.md` seit 16.09.2026 ausdrücklich verbietet.
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
  const group = mapDocuments(detail.content?.documents).find((d) => ANNEX_NAME_RE.test(d.title.trim()))
  const of = (type: 'pdf' | 'html'): string | null => group?.formats.find((f) => f.type === type)?.url ?? null
  const pdf = of('pdf')
  const html = of('html')
  return {
    pdf: pdf ? { label: 'Textgegenüberstellung des Ressorts beim Parlament (PDF)', url: pdf } : null,
    html: html ? { label: 'Textgegenüberstellung des Ressorts beim Parlament (HTML)', url: html } : null,
  }
}

/**
 * Führt dieser Entwurf überhaupt eine Gegenüberstellung — in einer der beiden
 * Kopien?
 *
 * Die **billige Hälfte** der Frage, und sie ist ausdrücklich nicht die ganze:
 * Ob sich das Dokument auch *lesen* lässt, weiß erst `annexSourceFor`, und
 * das kostet den Parser — gemessen am 19.09.2026 über 40 Entwürfe der GP
 * XXVIII liegt der Endpunkt kalt im Median bei 3,9 s und im Maximum bei 33 s,
 * weil bei zwei von fünf Entwürfen ein PDF geparst und jeder § gegen das RIS
 * geprüft wird. Wer nur wissen will, ob es die Beilage gibt, darf das nicht
 * bezahlen.
 *
 * Teuer ist hier nichts: Der RIS-Teil steht in der Join-Zeile, die der Aufrufer
 * ohnehin hat, und `getGegenstand` hat die Detailseite für denselben Entwurf
 * schon geholt.
 *
 * Gedacht für Abschnitte, die auf die Gegenüberstellung **zeigen** wollen
 * (§12.30) — nicht als Tor davor. Ein Zeiger auf einen Abschnitt, der gleich
 * selbst sagt, warum er nichts zeigen kann, ist ein billiger Irrtum; ein
 * Zeiger ins PDF, während die Stelle zwei Bildschirme tiefer steht, ist der
 * teure.
 */
export async function hasAnnexDocument(gp: string, inr: number, annex: RisDocumentUrls | null): Promise<boolean> {
  if (annex?.xml ?? annex?.pdf) return true
  // Die Kopie des Parlaments zählt nur, solange sie auch gelesen wird
  // (`READ_PARLIAMENT_COPY`). Sonst zeigte der Satz oben auf Paragraphen, die
  // dieser Abschnitt gar nicht rendert — derselbe Fehler wie vorher, nur
  // andersherum.
  if (!READ_PARLIAMENT_COPY) return false
  const parl = await parliamentAnnex(gp, inr)
  return Boolean(parl.html ?? parl.pdf)
}

/** Was gelesen wurde, woher — und unter welcher Lizenz das gesagt werden darf. */
export interface AnnexSource {
  parsed: ComparisonParse
  source: TraceLink
  credit: string
  readFrom: 'table' | 'pdf'
  droppedPages: number
}

/**
 * Das RIS: die Kopie, deren Lizenz geklärt ist.
 *
 * Gibt einen Satz zurück, wo es scheitert — „nur als Scan", „ließ sich nicht
 * auslesen" —, weil diese Sätze etwas über *dieses Dokument* sagen. Gedruckt
 * werden sie nur, wenn auch das Parlament nichts hat.
 */
async function readRis(annex: RisDocumentUrls | null, articles: readonly DraftArticle[]): Promise<AnnexSource | string> {
  if (!annex) return 'Keine Textgegenüberstellung: Sie ist nicht verpflichtend, und ein neues Gesetz hat nichts gegenüberzustellen.'
  const xml = annex.xml ? await fetchDocument(annex.xml) : null
  const rasterised = xml === null || isScanned(xml)
  if (!rasterised) {
    const parsed = parseTextComparison(xml!, articles)
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
  if (!annex.pdf) return 'Die Textgegenüberstellung liegt nur als Scan vor, ohne auslesbaren Text.'
  // The PDF parse is held under its own name because it answers one thing the
  // table parse cannot: how many pages it refused.
  const fromPdf = await annexFromPdf(annex.pdf, articles)
  if (fromPdf === null) return 'Die Textgegenüberstellung ließ sich auch aus dem PDF nicht auslesen.'
  if (fromPdf.rows.length === 0) return fromPdf.unreadable ?? 'Die Textgegenüberstellung ließ sich nicht auslesen.'
  return {
    parsed: fromPdf,
    source: { label: 'Textgegenüberstellung des Ressorts, aus dem PDF gelesen', url: annex.pdf },
    credit: RIS_CREDIT,
    readFrom: 'pdf',
    droppedPages: fromPdf.droppedPages,
  }
}

/**
 * DER SCHALTER: Wird die Kopie des Parlaments auch **gelesen**?
 *
 * Steht seit 19.09.2026 auf `false`, und der Grund ist kein technischer —
 * der Rückfall funktioniert, gemessen sind 3 Entwürfe der GP XXVIII, die
 * dadurch eine Gegenüberstellung bekämen (Obergrenze 8, bis 13:
 * `outreach/verfahrensfragen.md` E4a).
 *
 * Er ist aus: Das Parlament nimmt die Daten des Begutachtungsverfahrens
 * ausdrücklich von der Weiterverwendung aus (§13.1, offene Frage E3), und
 * `CLAUDE.md` zieht daraus die harte Linie „Stufe 1 bleibt metadaten-only".
 * Den Text einer Beilage aus einem Dokument von parlament.gv.at auszulesen
 * und anzuzeigen, ist keine Metadate. Für genau diese Entwürfe trägt auch
 * das übliche Argument nicht — „dasselbe Dokument steht im RIS unter CC BY" —,
 * denn sie sind ja gerade die, zu denen das RIS keines führt.
 *
 * **Verlinkt wird das Dokument weiter**, in jedem Zweig unten. Nicht gezeigt
 * wird sein Inhalt.
 *
 * WIEDER EINSCHALTEN, sobald E3 beantwortet ist (Brief an die
 * Parlamentsdirektion: `outreach/emails/info@parlament.gv.at.md`). Dann sind
 * es drei Handgriffe, und alle drei gehören zusammen:
 *  1. diese Konstante auf `true`,
 *  2. die Lizenzzeilen auf `/impressum` und `/ueber` — sie sagen heute
 *     „ausschließlich Metadaten", und das wäre dann nicht mehr wahr,
 *  3. den Satz in `chosen === 'string'` unten, der erklärt, warum hier
 *     nichts steht: „lesen wir nicht aus" wird wieder zu „ließ sich nicht
 *     auslesen".
 * Danach `pnpm test`, und die Deckungszahl in §12.12 neu messen.
 */
export const READ_PARLIAMENT_COPY = false

/**
 * Das Parlament: dasselbe Dokument, zweitveröffentlicht — der Rückfall.
 *
 * Der Scan-Fall gewinnt hier nichts: 41 von 42 Scans sind auch beim Parlament
 * nur PDF (§12.12, sechste Messung).
 */
async function readParliament(gp: string, inr: number, articles: readonly DraftArticle[]): Promise<AnnexSource | null> {
  const parl = await parliamentAnnex(gp, inr)
  if (!parl.html) return null
  const parsed = parseTextComparison(await fetchDocument(parl.html.url), articles)
  if (parsed.rows.length === 0) return null
  return { parsed, source: parl.html, credit: PARLIAMENT_CREDIT, readFrom: 'table', droppedPages: 0 }
}

/**
 * Welche der beiden Kopien der Beilage gelesen wird — die EINE Entscheidung,
 * und sie steht hier, weil zwei Abschnitte sie brauchen.
 *
 * Die Gegenüberstellung zeigt die Zeilen; die konsolidierte Lesefassung
 * (`konsService.ts`) lässt sich von denselben Zeilen bestätigen. Läsen die
 * beiden verschiedene Dokumente, könnte ein Paragraph durch ein Tor gehen,
 * dessen Beleg auf der Seite gar nicht steht.
 *
 * RIS zuerst, Parlament als Rückfall: nicht nach Qualität, sondern nach
 * Lizenz (siehe Kopf). Gemessen ist die Parlamentskopie die vollständigere.
 */
export async function annexSourceFor(
  gp: string,
  inr: number,
  annex: RisDocumentUrls | null,
  articles: readonly DraftArticle[],
): Promise<AnnexSource | string> {
  const ris = await readRis(annex, articles)
  if (typeof ris !== 'string') return ris
  if (!READ_PARLIAMENT_COPY) return ris
  return (await readParliament(gp, inr, articles)) ?? ris
}
