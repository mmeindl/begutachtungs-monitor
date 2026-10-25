/**
 * Reading a Land's texts: a PDF into units and plain text, a
 * Landesgesetzblatt's XML into the same — the one pair of readers every
 * comparison of a Land's draft goes through (`landLawDiffService`).
 */
import type { LandDocument, LandTextDocument } from '#shared/types'
import { safeExternalUrl } from '#shared/utils/safeExternalUrl'
import type { LawUnit } from '../../lawtext/lawUnits'
import { upstreamBytes, upstreamText, type UpstreamPolicy } from '../../upstream/fetch'
import { landDraftUnits, lgblUnits } from '../landLawDiff'
import { isTirolDocumentUrl, tirolDocumentBytes } from '../tirol'
import { styledPages, type StyledPages } from './styledPages'
import { fromMacRoman } from '../../annex/annexPdfPages'

export const TEXT_POLICY: UpstreamPolicy = { timeoutMs: 30_000, retries: 2, upstreamHostsOnly: true }
const PDF_MAX_BYTES = 30 * 1024 * 1024

/** A text read: its units, and the plain text they came from (the promulgation clause is checked on it). */
export interface ReadText {
  units: LawUnit[] | null
  text: string
}

/** One text of a draft: what it is, and how to read it. */
export interface TextSource {
  document: LandTextDocument
  read: () => Promise<ReadText>
}

/**
 * A Land's PDF, wherever it lives — the one door every reader of a Land's
 * documents goes through. Tirol's have no address of their own and are read
 * through their Gegenstand's page (`tirolDocumentBytes`).
 */
export async function landPdfBytes(url: string): Promise<Uint8Array> {
  if (isTirolDocumentUrl(url)) return tirolDocumentBytes(url)
  const { bytes } = await upstreamBytes(url, { ...TEXT_POLICY, maxBytes: PDF_MAX_BYTES })
  return new Uint8Array(bytes)
}

export async function pdfPages(url: string): Promise<string[]> {
  const bytes = await landPdfBytes(url)
  const { extractText } = await import('unpdf')
  // Bytes, not a proxy: a document unpdf opens itself it also destroys.
  const { text } = await extractText(bytes, { mergePages: false })
  return repairMacRoman(Array.isArray(text) ? text : [text])
}

/**
 * A text layer in Windows-1252 read as Mac Roman (`annexPdfPages.ts`,
 * `isMacRomanMisread`), repaired line by line: Tirol's 722/2026 came back
 * with „ß" for each of its 58 „§" (24.10.2026), and no § of it could be
 * found. Decided for the document, as there; a „ß" the reading turned into
 * „ﬂ" is lost to the normalisation here („Strafle") — what is restored is
 * every „§" and every umlaut.
 */
function repairMacRoman(pages: string[]): string[] {
  const text = pages.join('')
  const misread = (text.match(/[¸‰ˆ]/g) ?? []).length
  const real = (text.match(/[äöüÄÖÜ§]/g) ?? []).length
  // Or the one sign a law text cannot do without: 722's draft mixes a font
  // that reads right (8 umlauts, 5 „§") with one that does not (58 „ß 4").
  const paraSigns = (text.match(/ß\s*\d/g) ?? []).length
  const realParas = (text.match(/§/g) ?? []).length
  const byParas = paraSigns >= 10 && paraSigns >= 5 * realParas
  if (!byParas && (misread < 20 || misread < 20 * real)) return pages
  return pages.map((page) => page.split('\n').map(fromMacRoman).join('\n'))
}

/** `pdfPages`, with the weight of each line (`styledPages`) — for the headings of the Erläuterungen. */
export async function pdfStyledPages(url: string): Promise<StyledPages> {
  return styledPages(await landPdfBytes(url))
}

export async function readPdf(url: string): Promise<ReadText> {
  const pages = await pdfPages(url)
  return { units: landDraftUnits(pages), text: pages.join('\n') }
}

export async function readLgbl(xmlUrl: string | null): Promise<ReadText> {
  if (!xmlUrl) return { units: null, text: '' }
  const xml = await upstreamText(xmlUrl, TEXT_POLICY)
  return { units: lgblUnits(xml), text: xml.replace(/<[^>]+>/g, ' ') }
}

export function pdfSource(label: string, url: string, publisher: string): TextSource {
  return { document: { label, url, publisher }, read: () => readPdf(url) }
}

/** What a document's title says it is NOT: the draft's companions, filed as entries of their own. */
const COMPANION_RE = /gegenüberstellung|\btgü(?!\p{L})|erläuter|vorblatt|anlage|beilage|anhang|stellungnahme|folgenabschätzung|\bplan|lageplan|pläne|karte|planungsgebiet/iu

/**
 * The draft's own text among its documents. Salzburg files Erläuterungen,
 * the Textgegenüberstellung and plans as documents of their own; seven of
 * its drafts carry no draft at all, and until 23.10.2026 the first document
 * stood in for it — the comparison then read „Erläuterungen" as law text.
 */
export function draftDocument(documents: readonly LandDocument[]): LandDocument | null {
  return documents.find((d) => /entwurf/i.test(d.title) && !COMPANION_RE.test(d.title)) ??
    documents.find((d) => !COMPANION_RE.test(d.title)) ??
    null
}

export function draftSource(documents: readonly LandDocument[], publisher: string): TextSource | null {
  const doc = draftDocument(documents)
  const url = doc ? safeExternalUrl(doc.url) : null
  return doc && url ? pdfSource(doc.title, url, publisher) : null
}
