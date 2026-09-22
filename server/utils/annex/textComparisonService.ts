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
import { annexSourceFor, parliamentAnnex, PARLIAMENT_CREDIT, READ_PARLIAMENT_COPY, RIS_CREDIT } from './annexSource'
import { checkAnnexRows, notRunReason } from './gateRows'
import { getAnnexVerification } from './annexGuardService'
import { getDraftArticles } from '../lawtext/draftArticlesService'
import { getRisMapForGp } from '../ris/begutCorpus'
import { DERIVED_ANALYSIS_TTL_S } from '../cache/ttl'

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
