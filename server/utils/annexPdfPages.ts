/**
 * An annex PDF's bytes → its positioned text runs (docs/api-exploration.md §2c).
 *
 * The one place pdf.js is called. `annexPdf.ts` deliberately never opens a
 * file — it reads the geometry, which is what makes it testable without a
 * fixture binary — so this is the seam between the two, and it is shared by
 * the request path and both harnesses rather than copied into each.
 *
 * No Nitro globals here on purpose: `vite-node` has to be able to import it
 * for the harnesses. The caching sits one layer up, in `annexPdfService.ts`.
 *
 * **pdf.js is imported dynamically**, and that is a memory decision rather
 * than a style one. It is 1,7 MB of the 7 MB server bundle, and only 44 of
 * the 132 GP-XXVIII drafts need it — a static import would parse and hold it
 * for every request to every page, on a one-gigabyte VPS whose warm baseline
 * is 90 MB.
 */
import type { AnnexPage } from './annexPdf'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Every text run of every page, in PDF user space (origin bottom-left).
 *
 * `transform[4]` and `transform[5]` are the run's x and y — the rest of the
 * matrix is scale and skew, which the row geometry does not use. A run
 * without a string `str` is a marked-content marker, not text.
 */
export async function pagesOf(bytes: Uint8Array): Promise<AnnexPage[]> {
  const { getDocumentProxy } = await import('unpdf')
  const doc = await getDocumentProxy(bytes)
  const pages: AnnexPage[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    pages.push({
      width: page.getViewport({ scale: 1 }).width,
      items: content.items
        .filter((i: any) => typeof i.str === 'string')
        .map((i: any) => ({ x: i.transform[4], y: i.transform[5], width: i.width ?? 0, text: i.str })),
    })
  }
  return pages
}
