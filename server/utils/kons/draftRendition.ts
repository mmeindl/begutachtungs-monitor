/**
 * The draft's PDF in RIS, as the second witness reads it
 * (`kons/draftWitness.ts`, 20.11.2026).
 *
 * The engine reads a draft's instructions from RIS's XML. The PDF beside it in
 * the same record is printed from the ressort's own document — 123 of the 163
 * PDFs of period XXVIII name Microsoft Word as their producer, the rest name
 * none we read — so neither RIS's XML nor our XML reader stands between the
 * two: where both readings carry the same words, our reading of them is not
 * ours alone. RIS's HTML of the record is no such witness; RIS renders it
 * from the very XML.
 *
 * Cost, measured on the largest draft PDFs of the period: 142 pages in 0.5 s
 * and about 50 MB held while pdf.js runs, through the two parse slots of
 * `text/pdfDocument.ts`; the pages are cached for the day.
 *
 * RIS open data (CC BY 4.0), the record the Lesefassung already reads; no
 * other source. Only read for a draft where a § is about to be withheld for
 * a contradiction, and only to check: nothing of it is shown.
 *
 * The two layers `cache/base.ts` prescribes: the bytes are a fetched
 * document, a Begut file never changes; the pages are derived (pdf.js), and
 * die with a parser change.
 */
import { upstreamBytes, type UpstreamPolicy } from '../upstream/fetch'
import { DERIVED_CACHE, DOCUMENT_CACHE } from '../cache/base'
import { storageKeyOf } from '../cache/key'
import { DERIVED_ANALYSIS_TTL_S, PUBLISHED_DOCUMENT_TTL_S } from '../cache/ttl'
import { withPdf } from '../text/pdfDocument'
import { renditionOfPages, type DraftRendition } from './draftWitness'

/** The largest draft PDF of period XXVIII is under 1 MB; a cap for a file that is no draft. */
const DRAFT_PDF_MAX_BYTES = 16 * 1024 * 1024
const DRAFT_PDF_POLICY: UpstreamPolicy = { timeoutMs: 30_000, retries: 1, maxBytes: DRAFT_PDF_MAX_BYTES, upstreamHostsOnly: true }

/** The draft's PDF as RIS sent it, base64. On disk (`DOCUMENT_CACHE`): a Begut file is written once. */
const fetchDraftPdf = defineCachedFunction(
  async (url: string): Promise<string> => {
    const { bytes } = await upstreamBytes(url, DRAFT_PDF_POLICY)
    return Buffer.from(bytes).toString('base64')
  },
  { name: 'entwurf-pdf', base: DOCUMENT_CACHE, getKey: (url: string) => storageKeyOf(url), maxAge: PUBLISHED_DOCUMENT_TTL_S, swr: false },
)

/** Its text, page by page. Derived. A failure throws through and is not stored. */
const readDraftPages = defineCachedFunction(
  async (url: string): Promise<string[]> => {
    const bytes = new Uint8Array(Buffer.from(await fetchDraftPdf(url), 'base64'))
    const { extractText } = await import('unpdf')
    const { text } = await withPdf(bytes, (doc) => extractText(doc, { mergePages: false }))
    return Array.isArray(text) ? text : [text]
  },
  { name: 'entwurf-pdf-seiten', base: DERIVED_CACHE, getKey: (url: string) => storageKeyOf(url), maxAge: DERIVED_ANALYSIS_TTL_S, swr: false },
)

/**
 * The rendition of the draft whose PDF is at `url`, or null — no PDF, or
 * none to be had right now.
 *
 * **A failure answers null here, and that is safe.** Without the witness a
 * contradicted § stays withheld as `anhang-widerspricht`, a sentence that
 * stays true; the Lesefassung's cache then holds it for its day, a release
 * lost, never a claim made. Throwing would cost the whole section for a
 * check that can only add.
 */
export async function draftRenditionOf(url: string | null | undefined): Promise<DraftRendition | null> {
  if (!url) return null
  try {
    return renditionOfPages(await readDraftPages(url))
  } catch {
    return null
  }
}
