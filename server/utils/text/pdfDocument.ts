/**
 * The one door every PDF the server parses goes through (02.11.2026): the
 * Bund's annexes and documents, the Länder's drafts, comparisons and
 * Erläuterungen. The bytes are capped where they are fetched; what a
 * document costs once opened — pdf.js's objects, the operator lists, the
 * pages read so far — was capped nowhere, and four public routes open one
 * cold.
 *
 * - Two at a time. pdf.js parses on the one Node thread, so a third parse
 *   in parallel finishes no sooner; it only holds a third document in
 *   memory meanwhile, under the 384 MB heap (the OOM of 22.10.2026).
 * - At most `PDF_MAX_PAGES` pages. The longest of the 151 documents in the
 *   harness cache has 166 (Kärnten, 02.11.2026); the cap is for a file
 *   that is no document, not for a long one.
 * - Always ended, so nothing a caller forgets holds the document — `read`
 *   must return plain data, no pdf.js object.
 *
 * Deliberately free of Nitro globals: the harness scripts parse through it too.
 */
import { createSlots } from '../upstream/slots'

export type PdfDocument = Awaited<ReturnType<typeof import('unpdf').getDocumentProxy>>

export const PDF_MAX_PAGES = 1_000

const PARSING = createSlots(2)

export class PdfTooLongError extends Error {
  constructor(readonly pages: number) {
    super(`PDF mit ${pages} Seiten, mehr als ${PDF_MAX_PAGES}`)
    this.name = 'PdfTooLongError'
  }
}

/** Opens `bytes`, hands the document to `read`, and ends it on every way out. */
export async function withPdf<T>(
  bytes: Uint8Array,
  read: (doc: PdfDocument) => Promise<T>,
  options: Parameters<typeof import('unpdf').getDocumentProxy>[1] = {},
): Promise<T> {
  const release = await PARSING.acquire()
  try {
    const { getDocumentProxy } = await import('unpdf')
    const doc = await getDocumentProxy(bytes, options)
    try {
      if (doc.numPages > PDF_MAX_PAGES) throw new PdfTooLongError(doc.numPages)
      return await read(doc)
    } finally {
      // The proxy has no `destroy()` of its own in this pdf.js.
      await doc.loadingTask.destroy()
    }
  } finally {
    release()
  }
}
