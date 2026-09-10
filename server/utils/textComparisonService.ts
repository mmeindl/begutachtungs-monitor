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
 * **"Not in RIS" is not "does not exist" (2026-09-10).** Parliament publishes
 * the annex too, on the ME's own document list, and for 11 of the 130 matched
 * GP-XXVIII drafts it is there while the RIS record has none — 8 of them with
 * an HTML version. Saying "keine Textgegenüberstellung" about a draft that
 * has one, on a page whose whole claim is that it traces documents, is the
 * worst kind of wrong answer here. So before any such sentence is written the
 * Parliament document list is asked, and where it carries the annex the page
 * says so and links it. It is not read: Parliament's HTML is Word output in a
 * shape neither parser knows, and a parser for it is its own piece of work
 * (`TODO.md`).
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
import { checkAnnexRows, draftTextOf, notRunReason } from './annexCheck'
import { getAnnexVerification } from './annexGuardService'
import { annexFromPdf } from './annexPdfService'
import { fetchLawHtml } from './lawDiffService'
import { parseRisXml } from './lawText'
import { draftArticles } from './lawTitles'
import { mapDocuments } from './mappers'
import { getGegenstand } from './parliament'
import { getRisMapForGp } from './ris'
import { isScanned, parseTextComparison, type ComparisonParse } from './textComparison'

const TTL_S = 60 * 60 * 24

/**
 * The same loose match `ris.ts` uses on the RIS side: ressorts write
 * "Textgegenüberstellung", "TGÜ", "TGG" and a misspelt
 * "Textgegenbüberstellung" (docs/api-exploration.md §2c). Over GP XXVIII
 * every one of the 121 Parliament document groups it matches is titled
 * "Textgegenüberstellung" exactly, so the looseness costs nothing here and
 * keeps the two sides reading the same vocabulary.
 */
const ANNEX_NAME_RE = /gegen.?über|^TG(Ü|G|UE)$/i

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
        'Die Textgegenüberstellung liegt beim Parlament vor. Im RIS, wo wir sie auslesen, lässt sie sich diesem Entwurf nicht sicher zuordnen — aus dem Dokument des Parlaments lesen wir sie noch nicht aus.',
        row?.status === 'ambiguous'
          ? 'Mehrere RIS-Datensätze kommen für diesen Entwurf infrage. Die Gegenüberstellung aus dem falschen zu zeigen wäre schlechter als keine.'
          : 'Der Entwurf ließ sich keinem RIS-Dokument zuordnen; nur dort lesen wir die Textgegenüberstellung aus.',
      )
    }
    const annex = row.textComparison

    // A weak join is dates and ministry only — the title played no part
    // (`risJoin.ts`, tier C). It is rare (1 of 132 drafts in GP XXVIII, 1 of
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
        'Die Zuordnung dieses Entwurfs zum RIS-Datensatz stützt sich nur auf Fristen und Ressort, nicht auf den Titel. '
        + 'Eine Gegenüberstellung, die zu einem anderen Entwurf gehören kann, wird deshalb nicht angezeigt.'
      const record: TraceLink | null = row.risUrl
        ? { label: `RIS-Datensatz, der infrage kommt${row.risKurztitel ? `: ${row.risKurztitel}` : ''}`, url: row.risUrl }
        : null
      const parl = await parliamentAnnex(gp, inr)
      if (parl.pdf ?? parl.html) return empty(`${doubt} Beim Parlament liegt sie unter der Nummer dieses Entwurfs.`, record, parl.pdf ?? parl.html)
      return empty(doubt, record, annex?.pdf ? { label: 'Textgegenüberstellung dieses RIS-Datensatzes (PDF)', url: annex.pdf } : null)
    }
    if (!annex) {
      return fromParliament(
        'Die Textgegenüberstellung liegt beim Parlament vor, im RIS aber nicht; von dort lesen wir sie noch nicht aus.',
        'Keine Textgegenüberstellung: Sie ist nicht verpflichtend, und ein neues Gesetz hat nichts gegenüberzustellen.',
      )
    }

    const pdf: TraceLink | null = annex.pdf ? { label: 'Textgegenüberstellung des Ressorts (PDF)', url: annex.pdf } : null

    // The annex's Artikel headings mean nothing on their own — an internal
    // Roman division and a real law boundary are typeset alike. The draft's
    // own Artikel list decides, so it is fetched even though the annex is
    // what is being shown (`annexBoundaries.ts`). Both parsers need it, and
    // so does the RIS check: without it every § is unattributable.
    //
    // Parsed once for two uses. The same blocks are also the check's second
    // reference: what the annex shows as *new* has to occur in the draft's
    // own Gesetzestext (`annexCheck.rightColumnCheck`).
    const draft = row.risDocument?.xml ? await fetchLawHtml(row.risDocument.xml) : null
    const draftBlocks = draft ? parseRisXml(draft) : []
    const articles = draftArticles(draftBlocks)

    const xml = annex.xml ? await fetchLawHtml(annex.xml) : null
    const rasterised = xml === null || isScanned(xml)
    if (rasterised && !annex.pdf) {
      return empty('Die Textgegenüberstellung liegt nur als Scan vor, ohne auslesbaren Text.', null, pdf)
    }

    // The PDF parse is held under its own name because it answers one thing
    // the table parse cannot: how many pages it refused. `'droppedPages' in
    // parsed` does not narrow a union whose other member simply lacks the
    // field — the property comes out `unknown` — and the path is known here
    // anyway.
    const fromPdf = rasterised ? await annexFromPdf(annex.pdf!, articles) : null
    if (rasterised && fromPdf === null) {
      return empty('Die Textgegenüberstellung ließ sich auch aus dem PDF nicht auslesen.', null, pdf)
    }
    const parsed: ComparisonParse = fromPdf ?? parseTextComparison(xml!, articles)
    const { rows, refusal } = parsed
    const droppedPages = fromPdf?.droppedPages ?? 0
    // The parsers say *which* way a document defeated them — "no header pair
    // on any line", "not a two-column comparison" — and that is a better
    // sentence than the generic one, because it is about this document rather
    // than about our luck. The generic one stays for the paths that have no
    // reason to give.
    if (rows.length === 0) return empty(parsed.unreadable ?? 'Die Textgegenüberstellung ließ sich nicht auslesen.', null, pdf)

    // Which document was actually read. The XML table is the ressort's own
    // structure; the PDF is the ressort's text with our reading of its
    // layout on top, and the difference belongs on the page.
    const source: TraceLink = rasterised
      ? { label: 'Textgegenüberstellung des Ressorts, aus dem PDF gelesen', url: annex.pdf! }
      : { label: 'Textgegenüberstellung des Ressorts', url: annex.html ?? annex.xml! }

    // Both columns are checked before the rows are sent. The left one claims
    // to be the standing law and RIS holds that text independently; the right
    // one must not show as new what already stands there, and must occur in
    // the draft's own Gesetzestext. The reference date is RIS's own start of
    // the Begutachtungsfrist — the day the ministry wrote the annex, not
    // today. Called even without one: `verifyAnnex` then reports why it could
    // check nothing, which the page needs to be able to say.
    const verification = await getAnnexVerification(gp, inr, row.risBeginn ?? '', rows, articles, draftTextOf(draftBlocks))
    const checked = checkAnnexRows(rows, verification)

    return {
      gp,
      inr,
      available: true,
      unavailableReason: null,
      source,
      pdf,
      readFrom: rasterised ? 'pdf' : 'table',
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
  { name: 'text-comparison', base: DERIVED_CACHE, getKey: (gp: string, inr: number) => `${gp}-${inr}`, maxAge: TTL_S, swr: false },
)
