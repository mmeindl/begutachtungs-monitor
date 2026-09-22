/**
 * The ressort's Textgegenüberstellung for one consultation
 * (docs/api-exploration.md §2c, docs/architecture.md §12.12, §12.13).
 *
 * Nuxt-aware glue around the pure modules `textComparison.ts` and
 * `annexCheck.ts`. The rows are read from RIS, which is the only source that
 * carries the annex as a table, so this goes through the RIS↔ME map rather
 * than the Parliament document list the rest of the detail page uses.
 *
 * Unavailability is a normal answer, not an error: about four in ten drafts
 * carry no annex. Each case gets its own sentence, because "no comparison"
 * and "a comparison we cannot read" are different things to a reader — and
 * in the second case the PDF is still worth linking.
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
 *
 * **Two sources, one shape.** Where the RIS XML is a real table it is read
 * from there; where RIS rasterised the annex into images, the same document's
 * PDF still carries a full text layer and is read by geometry instead
 * (`annexPdfService.ts`). Both parsers emit `ComparisonRow`, so everything
 * after this point — the RIS check, the stats, the section — is identical.
 * The page says which document it read, because "the ministry's table" and
 * "the ministry's PDF, read by us" are not the same claim.
 *
 * **A failure is not an answer** (2026-09-10). This function is cached for a
 * day, and every upstream call in it used to end in `.catch(() => null)` —
 * so a timeout produced "Der Entwurf ließ sich keinem RIS-Dokument zuordnen",
 * "liegt nur als Scan vor" or a comparison with the gate quietly switched
 * off, and that answer was then served for twenty-four hours as if it were a
 * fact about the draft. The states below that return `available: false` are
 * the ones RIS really has (no record, no annex, a scan without a PDF, a
 * document no parser can read); everything else throws, nothing is cached,
 * and the section says it is unavailable right now.
 */
import type { TextComparisonResponse, TraceLink } from '#shared/types'
import { checkAnnexRows, notRunReason } from './annex/gateRows'
import { getAnnexVerification } from './annexGuardService'
import { annexFromPdf } from './annexPdfService'
import { fetchLawHtml } from './lawDiffService'
import type { DraftArticle } from './lawTitles'
import { getDraftArticles } from './lawtext/draftArticlesService'
import { mapDocuments } from './parliament/detailJson'
import { getGegenstand } from './parliament/drafts'
import { getRisMapForGp } from './ris/begutCorpus'
import type { RisDocumentUrls } from './ris/risRecord'
import { isScanned, parseTextComparison, type ComparisonParse } from './textComparison'
import { DERIVED_ANALYSIS_TTL_S } from './cache/ttl'

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
const RIS_CREDIT = 'Quelle (CC BY 4.0, RIS):'
const PARLIAMENT_CREDIT = 'Quelle (Dokument des Ressorts, veröffentlicht vom Parlament):'

/**
 * The annex on Parliament's own document list for this ME, in the formats it
 * offers — the second place the ressort's Textgegenüberstellung is published.
 *
 * Fetched only where RIS has nothing to show, because it is one more upstream
 * call and the RIS record answers for 109 of 132 drafts on its own. Failures
 * are not caught: a Parliament timeout is not a statement about the draft,
 * and this function's answer is cached for a day (§12.13).
 */
async function parliamentAnnex(gp: string, inr: number): Promise<{ pdf: TraceLink | null; html: TraceLink | null }> {
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
  const xml = annex.xml ? await fetchLawHtml(annex.xml) : null
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
const READ_PARLIAMENT_COPY = false

/**
 * Das Parlament: dasselbe Dokument, zweitveröffentlicht — der Rückfall.
 *
 * Der Scan-Fall gewinnt hier nichts: 41 von 42 Scans sind auch beim Parlament
 * nur PDF (§12.12, sechste Messung).
 */
async function readParliament(gp: string, inr: number, articles: readonly DraftArticle[]): Promise<AnnexSource | null> {
  const parl = await parliamentAnnex(gp, inr)
  if (!parl.html) return null
  const parsed = parseTextComparison(await fetchLawHtml(parl.html.url), articles)
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

export const getTextComparison = defineCachedFunction(
  async (gp: string, inr: number): Promise<TextComparisonResponse> => {
    const empty = (reason: string, source: TraceLink | null = null, pdf: TraceLink | null = null): TextComparisonResponse => ({
      gp,
      inr,
      available: false,
      unavailableReason: reason,
      source,
      credit: RIS_CREDIT,
      pdf,
      readFrom: null,
      droppedPages: 0,
      boundaryNote: null,
      stats: { total: 0, unchanged: 0, changed: 0, editorial: 0, inserted: 0, removed: 0 },
      verification: null,
      rows: [],
    })

    /** What Parliament publishes, and the sentence that follows from it. */
    const fromParliament = async (
      whenPresent: string,
      whenAbsent: string,
      source: TraceLink | null = null,
    ): Promise<TextComparisonResponse> => {
      const parl = await parliamentAnnex(gp, inr)
      const document = parl.pdf ?? parl.html
      if (!document) return empty(whenAbsent, source)
      // `source` and `pdf` are rendered side by side, so the same URL must
      // not land in both: the HTML twin only goes into `source` when the PDF
      // is the document being linked.
      return empty(whenPresent, source ?? (document === parl.pdf ? parl.html : null), document)
    }

    const row = (await getRisMapForGp(gp)).rows.find((r) => r.inr === inr) ?? null
    if (!row?.risId) {
      return fromParliament(
        // One sentence for both states below: with no RIS record and with
        // several possible ones, the outcome for the reader is the same —
        // the annex exists, and we cannot say which RIS document is its twin.
        // Nicht mehr „wir lesen das Parlamentsdokument nicht" — das tun wir
        // seit 19.09.2026. Der Grund ist jetzt der wahre: Ohne den
        // RIS-Datensatz fehlt der geltende Text, gegen den die linke Spalte
        // geprüft wird, und eine ungeprüfte Gegenüberstellung zeigt diese
        // Seite nicht (§12.13, das Tor).
        'Die Textgegenüberstellung liegt beim Parlament vor. Ohne den zugehörigen RIS-Datensatz fehlt uns der geltende Gesetzestext, gegen den wir ihre linke Spalte prüfen — ungeprüft zeigen wir sie nicht.',
        row?.status === 'ambiguous'
          ? 'Mehrere RIS-Datensätze kommen für diesen Entwurf infrage. Die Gegenüberstellung aus dem falschen zu zeigen wäre schlechter als keine.'
          : 'Der Entwurf ließ sich keinem RIS-Dokument zuordnen; nur dort lesen wir die Textgegenüberstellung aus.',
      )
    }
    const annex = row.textComparison

    // A weak join is dates and ministry only — the title played no part
    // (`ris/risJoin.ts`, tier C). It is rare (1 of 132 drafts in GP XXVIII, 1 of
    // 350 in GP XXVII), and it is the one error the RIS check cannot catch:
    // another draft's annex quotes the standing law just as faithfully as
    // this one's would, so every § of it verifies and the page presents a
    // comparison belonging to a different bill. The document is linked
    // instead, and the doubt is stated.
    //
    // Parliament's copy carries no such doubt — it is addressed by this
    // draft's own number — so where it exists it is the one to link, and the
    // RIS record stays beside it for the reader who wants to judge the join.
    if (row.status !== 'matched') {
      const doubt =
        'Die Zuordnung dieses Entwurfs zum RIS-Datensatz stützt sich nur auf Fristen und Ressort, nicht auf den Titel. ' +
        'Eine Gegenüberstellung, die zu einem anderen Entwurf gehören kann, wird deshalb nicht angezeigt.'
      const record: TraceLink | null = row.risUrl
        ? { label: `RIS-Datensatz, der infrage kommt${row.risKurztitel ? `: ${row.risKurztitel}` : ''}`, url: row.risUrl }
        : null
      const parl = await parliamentAnnex(gp, inr)
      if (parl.pdf ?? parl.html) return empty(`${doubt} Beim Parlament liegt sie unter der Nummer dieses Entwurfs.`, record, parl.pdf ?? parl.html)
      return empty(doubt, record, annex?.pdf ? { label: 'Textgegenüberstellung dieses RIS-Datensatzes (PDF)', url: annex.pdf } : null)
    }
    const pdf: TraceLink | null = annex?.pdf ? { label: 'Textgegenüberstellung des Ressorts (PDF)', url: annex.pdf } : null

    // The annex's Artikel headings mean nothing on their own — an internal
    // Roman division and a real law boundary are typeset alike. The draft's
    // own Artikel list decides, so it is fetched even though the annex is
    // what is being shown (`annexBoundaries.ts`). Both parsers need it, and
    // so does the RIS check: without it every § is unattributable.
    //
    // Parsed once for two uses. The same blocks are also the check's second
    // reference: what the annex shows as *new* has to occur in the draft's
    // own Gesetzestext (`annexCheck.rightColumnCheck`). Fetched before the
    // source is chosen, because every parse path below needs it.
    const { blocks: draftBlocks, articles } = await getDraftArticles(gp, inr, 'ris-xml')

    const chosen = await annexSourceFor(gp, inr, annex, articles)
    if (typeof chosen === 'string') {
      const parl = await parliamentAnnex(gp, inr)
      const atParliament = parl.pdf ?? parl.html
      // „Keine Textgegenüberstellung" über einem Entwurf, der eine hat, ist
      // der schlimmste Satz, den diese Seite drucken kann (Kopf, 10.09.2026).
      // Er darf also nur stehen, wenn auch das Parlament keine führt. Liegt
      // sie dort nur als PDF, sagt die Seite genau das: Es gibt sie, gelesen
      // haben wir sie nicht — aus dem PDF des Parlaments lesen wir nicht, und
      // 41 von 42 Scans sind auf beiden Seiten dieselben (§12.12).
      if (!annex && atParliament) {
        return empty(
          parl.html
            // HTML da, und trotzdem nichts gelesen — der Satz muss sagen,
            // WARUM, und die beiden Gründe sind verschieden: Bei
            // ausgeschaltetem Schalter haben wir es nicht versucht, und „ließ
            // sich nicht auslesen" wäre dann eine Aussage über das Dokument,
            // die wir gar nicht geprüft haben.
            ? (READ_PARLIAMENT_COPY
                ? 'Die Textgegenüberstellung liegt beim Parlament vor, im RIS aber nicht — auslesen ließ sie sich nicht.'
                : 'Die Textgegenüberstellung liegt beim Parlament vor, im RIS aber nicht. Aus dem Dokument des Parlaments lesen wir sie nicht aus: Das Parlament nimmt die Daten des Begutachtungsverfahrens von der Weiterverwendung aus, und solange das ungeklärt ist, verlinken wir sie, statt sie abzudrucken.')
            : 'Die Textgegenüberstellung liegt beim Parlament vor, im RIS aber nicht. Dort gibt es sie nur als PDF, und aus dem PDF des Parlaments lesen wir sie nicht aus.',
          null,
          atParliament,
        )
      }
      // Sonst der Satz des RIS-Pfades: Er sagt, woran es lag. Das Dokument
      // bleibt verlinkt, auch wo wir es nicht lesen konnten.
      return empty(chosen, null, pdf ?? atParliament)
    }

    const { parsed, source, credit, readFrom, droppedPages } = chosen
    const { rows, refusal } = parsed
    // Wurde die Kopie des Parlaments gelesen, führt das RIS zu diesem Entwurf
    // in der Regel gar kein Dokument — dann ist das PDF des Parlaments das
    // einzige, das ein Leser aufschlagen kann.
    const pdfLink = pdf ?? (credit === PARLIAMENT_CREDIT ? (await parliamentAnnex(gp, inr)).pdf : null)

    // Both columns are checked before the rows are sent. The left one claims
    // to be the standing law and RIS holds that text independently; the right
    // one must not show as new what already stands there, and must occur in
    // the draft's own Gesetzestext. The reference date is RIS's own start of
    // the Begutachtungsfrist — the day the ministry wrote the annex, not
    // today. Called even without one: `verifyAnnex` then reports why it could
    // check nothing, which the page needs to be able to say.
    const verification = await getAnnexVerification(gp, inr, row.risBeginn ?? '', rows, articles, draftBlocks)
    const checked = checkAnnexRows(rows, verification)

    return {
      gp,
      inr,
      available: true,
      unavailableReason: null,
      source,
      credit,
      pdf: pdfLink,
      readFrom,
      droppedPages,
      boundaryNote: refusal,
      // Counted over the rows as sent, so the numbers on the page and the
      // rows on the page cannot disagree.
      stats: checked.stats,
      verification: {
        ran: verification.ran,
        notRunReason: notRunReason(verification),
        // The day the ministry wrote the annex, so the page can name the
        // version of the law its left column was held against instead of
        // leaving the reader to assume "today".
        asOf: row.risBeginn ?? null,
        judged: verification.judged,
        verified: verification.verified,
        withheldParagraphs: checked.withheldParagraphs,
        withheldByCause: checked.withheldByCause,
        doubtfulLaws: verification.doubtfulLaws.map((l) => l.law).filter((l): l is string => l !== null),
        uncheckedParagraphs: checked.uncheckedParagraphs,
        rowsWithoutParagraph: checked.rowsWithoutParagraph,
      },
      rows: checked.rows,
    }
  },
  { name: 'text-comparison', base: DERIVED_CACHE, getKey: (gp: string, inr: number) => `${gp}-${inr}`, maxAge: DERIVED_ANALYSIS_TTL_S, swr: false },
)
