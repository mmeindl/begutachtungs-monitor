/**
 * Reading a Land's texts: a PDF into units and plain text, a
 * Landesgesetzblatt's XML into the same — the one pair of readers every
 * comparison of a Land's draft goes through (`landLawDiffService`).
 */
import { gapDe } from '#shared/utils/gaps'
import type { LandDocument, LandTextDocument } from '#shared/types'
import { safeExternalUrl } from '#shared/utils/safeExternalUrl'
import type { LawUnit } from '../../lawtext/lawUnits'
import { upstreamBytes, upstreamText, type UpstreamPolicy } from '../../upstream/fetch'
import { landDraftUnits, lgblUnits } from '../landLawDiff'
import { isStmkDocumentUrl, stmkDocumentBytes } from '../steiermark'
import { isTirolDocumentUrl, tirolDocumentBytes } from '../tirol'
import { styledPages, type StyledPages } from './styledPages'
import { withPdf } from '../../text/pdfDocument'
import { fromMacRoman } from '../../annex/annexPdfPages'

export const TEXT_POLICY: UpstreamPolicy = { timeoutMs: 30_000, retries: 2, upstreamHostsOnly: true }
const PDF_MAX_BYTES = 30 * 1024 * 1024

/** A text read: its units, and the plain text they came from (the promulgation clause is checked on it). */
export interface ReadText {
  units: LawUnit[] | null
  text: string
  /** A PDF's text per page, as `text` joins it: the draft reader drops a page's number only at the page's edge (`draftPdfLaw.ts`). */
  pages?: string[]
  /** The document the Land files as the draft is evidently none (`notADraft`). */
  notDraft?: true
  /** The document read, where its content chose another than the source names (`draftByContent`). */
  document?: LandTextDocument
}

/** What the page says where a comparison or the Erläuterungen would read a draft that is none (`notADraft`). */
export const NOT_A_DRAFT = gapDe('notPublished', 'Als Entwurf hat das Land ein anderes Dokument veröffentlicht; der Monitor liest es nicht als Entwurf.')

/** A letter's marks: what a Stellungnahme or a cover letter carries, and no law text does. */
const LETTER_RE = /Stellungnahme|Sehr geehrte|Mit freundlichen Grüßen|Hochachtungsvoll/

/**
 * A document the Land files as the draft that evidently is none (26.10.2026):
 * the reader finds no unit of law text in it, and it either opens as a
 * Textgegenüberstellung or reads as a letter — not one „§" in it, and a
 * Stellungnahme's or a letter's marks. Salzburg files as the „Entwurf" of
 * 23088 the Gemeindeverband's Stellungnahme, of 7365 its own covering
 * letter, and of 18099 and 18140 the Textgegenüberstellung — whose columns
 * the page showed as the Land's Erläuterungen. A draft the reader cannot
 * divide into units — a new law, „Gesetz vom …, mit dem …" — prints its
 * §§ and is not one of them.
 */
export function notADraft(read: ReadText): boolean {
  if (read.units?.length) return false
  const text = read.text.replace(/\s+/g, ' ').trim()
  if (!text) return false
  return /^.{0,300}Textgegenüberstellung/iu.test(text) || (!text.includes('§') && LETTER_RE.test(text))
}

/** One text of a draft: what it is, and how to read it. */
export interface TextSource {
  document: LandTextDocument
  read: () => Promise<ReadText>
}

/**
 * A Land's PDF, wherever it lives — the one door every reader of a Land's
 * documents goes through. Tirol's and Steiermark's have no address of their
 * own and are read through their Landtag page (`laender/session.ts`).
 */
export async function landPdfBytes(url: string): Promise<Uint8Array> {
  if (isTirolDocumentUrl(url)) return tirolDocumentBytes(url)
  if (isStmkDocumentUrl(url)) return stmkDocumentBytes(url)
  const { bytes } = await upstreamBytes(url, { ...TEXT_POLICY, maxBytes: PDF_MAX_BYTES })
  return new Uint8Array(bytes)
}

/** How a reader gets a PDF's text per page: `pdfPages`, or the server's cached read of it (`pdfPagesService.ts`). */
export type PagesReader = (url: string) => Promise<string[]>

/**
 * A Land PDF's text per page, fetched and parsed on every call. The draft
 * page's readers go through the cached read instead (`pdfPagesService.ts`),
 * which they are handed as a `PagesReader`; this module stays free of Nitro
 * for the corpus scripts and the tests.
 */
export async function pdfPages(url: string): Promise<string[]> {
  return pagesOfBytes(await landPdfBytes(url))
}

/** A Land PDF's text per page, from bytes already read — `pdfPages` without the fetch. */
export async function pagesOfBytes(bytes: Uint8Array): Promise<string[]> {
  return repairMacRoman(await withPdf(bytes, async (doc) => {
    const pages: string[] = []
    for (let n = 1; n <= doc.numPages; n++) pages.push(pageText((await (await doc.getPage(n)).getTextContent()).items as TextRun[]))
    return pages
  }))
}

/** A text run as pdf.js gives it: its text, its matrix, its height. */
interface TextRun { str?: string; transform?: number[]; height?: number; hasEOL?: boolean }

/**
 * A page's runs joined as unpdf's `extractText` joins them — a line closed
 * where pdf.js marks its end — save one thing (20.11.2026): a footnote mark
 * set smaller and raised, right after a sign, is a word of its own, as the
 * Landesgesetzblatt's XML sets it in `<sup>` and so apart (`stripMarkup`).
 * Salzburg sets the mark after an amount at 6.5 points, 3.5 above the line,
 * and the text layer read „35,821)" where the Landesgesetzblatt has „35,82
 * 1)" (sbg-31419, sbg-33547, sbg-34444).
 *
 * Only the mark, not every raised run: of the 356 places in the 849 cached
 * Land PDFs where a run set so follows a letter or a digit, 26 are such a
 * mark, 276 an exponent („m2") and 44 a bare footnote number of the
 * Erläuterungen. A Land types „m2" in its draft where its Vorlage sets
 * „m²" raised (ktn-79014-2025-14, seven times), and split, the exponent
 * would stand as „m2 → m 2" in its Entwurf → Regierungsvorlage. And only
 * after a word or a number: „*1)" is one mark,
 * as the Landesgesetzblatt has it (sbg-34574). A lowered run, an index,
 * stays welded to its word, as `<sub>` is.
 */
function pageText(runs: readonly TextRun[]): string {
  let text = ''
  let before: TextRun | null = null
  for (const run of runs) {
    if (run.str == null) continue
    if (before && FOOTNOTE_MARK_RE.test(run.str) && /[\p{L}\d]$/u.test(text) && isRaised(run, before)) text += ' '
    text += run.str + (run.hasEOL ? '\n' : '')
    if (run.str.trim()) before = run
  }
  return text
}

/** A footnote mark as a run of its own: „1)", „1)2)". */
const FOOTNOTE_MARK_RE = /^(?:\d{1,2}\))+$/

/** Set upright, under four fifths of the run before it, and its baseline above that run's by a fifth of its height or more. */
function isRaised(run: TextRun, before: TextRun): boolean {
  const [a, b, c, , , y] = run.transform ?? []
  const [pa, pb, pc, , , py] = before.transform ?? []
  const h = run.height ?? 0
  const ph = before.height ?? 0
  if (b !== 0 || c !== 0 || pb !== 0 || pc !== 0 || !(a! > 0) || !(pa! > 0) || !(h > 0) || !(ph > 0)) return false
  return h < 0.8 * ph && y! - py! >= 0.2 * ph && y! - py! < ph
}

/**
 * A text layer in Windows-1252 read as Mac Roman (`annexPdfPages.ts`,
 * `isMacRomanMisread`), repaired line by line: Tirol's 722/2026 came back
 * with „ß" for each of its 58 „§" (24.10.2026), and no § of it could be
 * found. Decided for the document, as there; a „ß" the reading turned into
 * „ﬂ" is lost to the normalisation here („Strafle") — what is restored is
 * every „§" and every umlaut.
 *
 * And in every document, a „ß" standing alone before a number: no German
 * word is „ß", so it is a „§" set in the misread font — in a line the repair
 * leaves alone for a real „§" or umlaut beside it (21.11.2026). Tirol's
 * 575/2026 and 722/2026 set an instruction's address in the one font and
 * its quotes in the other, „15. Im ß 16b Abs. 1 wird das Zitat „§ 2 Abs.
 * 2a,“ aufgehoben.", and no instruction named § 16b. Over the 731 cached
 * Land PDFs, four carried such a „ß" after the repair, every one a „§".
 */
export function repairMacRoman(pages: string[]): string[] {
  const text = pages.join('')
  const misread = (text.match(/[¸‰ˆ]/g) ?? []).length
  const real = (text.match(/[äöüÄÖÜ§]/g) ?? []).length
  // Or the one sign a law text cannot do without: 722's draft mixes a font
  // that reads right (8 umlauts, 5 „§") with one that does not (58 „ß 4").
  const paraSigns = (text.match(/ß\s*\d/g) ?? []).length
  const realParas = (text.match(/§/g) ?? []).length
  const byParas = paraSigns >= 10 && paraSigns >= 5 * realParas
  // Or a short text in which not one sign reads right: Tirol's 576/2026
  // draft, one page, 9 misread and not one umlaut or „§" (20.11.2026). Of
  // the 855 cached Land PDFs no other has misread signs and no right one.
  const noneRight = real === 0 && misread >= 5
  const repaired = !byParas && !noneRight && (misread < 20 || misread < 20 * real) ? pages : pages.map((page) => page.split('\n').map(fromMacRoman).join('\n'))
  return repaired.map((page) => page.replace(LOST_PARAGRAPH_SIGN_RE, '§'))
}

/** „ß" alone before a number (`repairMacRoman`). */
const LOST_PARAGRAPH_SIGN_RE = /(?<![\p{L}])ß(?=\s*\d)/gu

/** `pdfPages`, with the weight of each line (`styledPages`) — for the headings of the Erläuterungen. */
export async function pdfStyledPages(url: string): Promise<StyledPages> {
  return styledPages(await landPdfBytes(url))
}

/**
 * The pages of a PDF with no text on them between the first and the last
 * page that has some (20.11.2026): a scanned page in a document set in
 * Word, whose §§ read as removed or inserted. Said on the page as the
 * Textgegenüberstellung's dropped pages are (`compareReadTexts`). A
 * document with no text at all is said otherwise („Nicht lesbar", no
 * unit). Of the 849 cached Land PDFs one has such pages, a scanned letter
 * of the Kärntner Landtag in no station pair.
 */
export function textlessPages(pages: readonly string[] | undefined): number {
  const has = (pages ?? []).map((p) => p.trim().length > 0)
  const first = has.indexOf(true)
  return first < 0 ? 0 : has.slice(first, has.lastIndexOf(true)).filter((h) => !h).length
}

export async function readPdf(url: string, pagesOf: PagesReader = pdfPages): Promise<ReadText> {
  const pages = await pagesOf(url)
  return { units: landDraftUnits(pages), text: pages.join('\n'), pages }
}

export async function readLgbl(xmlUrl: string | null): Promise<ReadText> {
  if (!xmlUrl) return { units: null, text: '' }
  const xml = await upstreamText(xmlUrl, TEXT_POLICY)
  return { units: lgblUnits(xml), text: xml.replace(/<[^>]+>/g, ' ') }
}

export function pdfSource(label: string, url: string, publisher: string, pagesOf?: PagesReader): TextSource {
  return { document: { label, url, publisher }, read: () => readPdf(url, pagesOf) }
}

/**
 * What a document's title says it is NOT: the draft's companions, filed as
 * entries of their own — and the Land's letter that sends the draft out,
 * Kärnten's „Anschreiben" and „Begutachtung - Akt" (v1065, v1369), which
 * stood in for the Verordnung beside it until 26.10.2026, and Steiermark's
 * „Versendeschreiben".
 */
const COMPANION_RE = /gegenüberstellung|\btgü(?!\p{L})|erläuter|vorblatt|anlage|beilage|anhang|stellungnahme|folgenabschätzung|\bplan|lageplan|pläne|karte|planungsgebiet|anschreiben|versendeschreiben|(?<!\p{L})akt(?!\p{L})/iu

/**
 * A document that is the draft and its Erläuterungen in one, as Burgenland
 * titles every one of them (30.10.2026): a companion by its title, and the
 * draft's text all the same. Only this exact title — a looser rule would take
 * Salzburg's separate Erläuterungen for drafts.
 */
export function isDraftWithExplanations(title: string): boolean {
  return /^Entwurf und Erläuterungen$/i.test(title.trim())
}

/**
 * The draft's own Erläuterungen among its documents, where the Land files
 * them as a document of their own — never the Vorlage's. Kärnten and Tirol
 * list the Vorlage's documents in the same record, „Regierungsvorlage,
 * Erläuterungen" (`kaernten.ts`, `tirol.ts`); the Erläuterungen section took
 * the first title with „erläuter" in it and, where the draft has none of its
 * own, would have read the Vorlage's as the draft's (20.11.2026). The one
 * rule for the section and the Begründungsvergleich (`landReasoningService.ts`).
 */
export function draftExplanationsDocument(documents: readonly LandDocument[]): LandDocument | null {
  return documents.find((d) => /^(?!Regierungsvorlage).*erläuter/i.test(d.title)) ?? null
}

/**
 * The draft's own text among its documents. Salzburg files Erläuterungen,
 * the Textgegenüberstellung and plans as documents of their own; seven of
 * its drafts carry no draft at all, and until 23.10.2026 the first document
 * stood in for it — the comparison then read „Erläuterungen" as law text.
 */
export function draftDocument(documents: readonly LandDocument[]): LandDocument | null {
  return draftCandidates(documents)[0] ?? null
}

/**
 * A document of another station, or none of law text, that a Land lists in
 * the draft's record (20.11.2026): Kärnten and Tirol add the Vorlage's
 * documents to it, titled „Regierungsvorlage" (`kaernten.ts`, `tirol.ts`),
 * and Tirol its „Leicht Lesen". Where the Entwurf read no unit, the choice
 * by content went on to them, and Entwurf → Regierungsvorlage held Tirol's
 * 576/2026 Vorlage against itself. Never a candidate: where the Entwurf
 * cannot be read, the page says so.
 */
const NOT_THE_DRAFT_RE = /^Regierungsvorlage\b|^Leicht Lesen$/i

/** Every document that may be the draft's own text, in the order `draftDocument` takes them: titled „Entwurf" first. */
export function draftCandidates(documents: readonly LandDocument[]): LandDocument[] {
  const candidates = documents.filter((d) => !NOT_THE_DRAFT_RE.test(d.title.trim()) && (!COMPANION_RE.test(d.title) || isDraftWithExplanations(d.title)))
  return [...candidates.filter((d) => /entwurf/i.test(d.title)), ...candidates.filter((d) => !/entwurf/i.test(d.title))]
}

/** How many of a draft's candidates are read, at most, to find the one with law text in it (`draftByContent`). */
export const CONTENT_CANDIDATES = 8

/**
 * The draft among several candidates, by what it holds (14.11.2026): where
 * the reader finds no law text in the first, the first of the next that
 * holds some — read in order, at most `CONTENT_CANDIDATES`. Where none
 * does, the first stays, as before. Tirol files its covering letter as
 * „Entwurf einer Verordnung …; Begutachtung", or as the first of seven
 * „Dokument", beside the Verordnung („FS ÖRK FV Sillian VO Begutachtung",
 * „Roppen VO"); of the 17 Tirol Verordnungen of GP XXVIII with several
 * candidates, 10 read the letter or the Erläuterungen until then. The title
 * cannot decide: the letter carries the draft's name, the Verordnung an
 * abbreviation or none. A candidate that fails to be read fails the choice
 * — a document not read is not one without law text.
 */
export async function draftByContent(
  candidates: readonly LandDocument[],
  pagesOf: PagesReader = pdfPages,
): Promise<{ doc: LandDocument; url: string; pages: string[] } | null> {
  let first: { doc: LandDocument; url: string; pages: string[] } | null = null
  for (const doc of candidates.slice(0, CONTENT_CANDIDATES)) {
    const url = safeExternalUrl(doc.url)
    if (!url) continue
    const pages = await pagesOf(url)
    if (landDraftUnits(pages)?.length) return { doc, url, pages }
    first ??= { doc, url, pages }
  }
  return first
}

/**
 * The draft's own text, read (`draftByContent`) — and marked where the
 * document is evidently none (`notADraft`), if it is the only one that
 * could be the draft: the Land filed nothing else as it. Beside others,
 * none of which holds law text, the monitor cannot tell which is the
 * draft, and the page's sentence would not be true.
 */
export function draftSource(documents: readonly LandDocument[], publisher: string, pagesOf?: PagesReader): TextSource | null {
  const candidates = draftCandidates(documents)
  const doc = candidates[0]
  const url = doc ? safeExternalUrl(doc.url) : null
  if (!doc || !url) return null
  const document = { label: doc.title, url, publisher }
  return {
    document,
    read: async () => {
      if (candidates.length === 1) {
        const read = await readPdf(url, pagesOf)
        return notADraft(read) ? { ...read, notDraft: true } : read
      }
      const chosen = (await draftByContent(candidates, pagesOf))!
      const read: ReadText = { units: landDraftUnits(chosen.pages), text: chosen.pages.join('\n'), pages: chosen.pages }
      return chosen.url === url ? read : { ...read, document: { label: chosen.doc.title, url: chosen.url, publisher } }
    },
  }
}
