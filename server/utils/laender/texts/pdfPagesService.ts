/**
 * A Land PDF's text per page, read once for the readers of a draft's page.
 *
 * ONE DOCUMENT, FOUR READERS. A cold draft page asks for the Erläuterungen,
 * the comparison and the Begründungsvergleich at once, and each read the
 * draft's PDF on its own — the Begründungsvergleich twice, once for its
 * passages and once inside the comparison it joins them to, and the
 * Textgegenüberstellung's deletion guard once more. Each read fetched the
 * PDF and ran pdf.js over it, which holds the one event loop for as long as
 * the parse takes. Behind this cache the first reader fetches and parses,
 * the concurrent ones join its call in flight (Nitro dedupes identical
 * calls), and the later ones find the pages.
 *
 * DERIVED, not fetched: the pages are our parse of the document — pdf.js,
 * then the Mac-Roman repair (`texts/read.ts`) — and a change to either must
 * show at once (`cache/base.ts`). Memory in production, so an entry counts
 * against the derived LRU's 48 MB: a Land document's pages measured 9 kB at
 * the median and 0,6 MB at the largest (615 documents, 192 pages), and
 * nothing but `PDF_MAX_BYTES` bounds a longer one.
 *
 * OPT-IN, handed to the readers that serve a page (`PagesReader`) and to no
 * one else. The bulk readers — the prewarm's EU and Bund facts over every
 * draft of the window (`landDraftTexts.ts`, with its own memo), the
 * Kundmachung search over the list, the Landesgesetzblatt's document
 * signals — would fill the LRU with documents nobody opens and push out
 * what the pages need. Those read through `pdfPages` uncached, as before.
 *
 * A failed fetch or parse throws, and Nitro stores no throw: the next
 * reader asks again. A PDF that parses to empty pages is an answer about
 * the document and is kept.
 */
import { DERIVED_CACHE } from '../../cache/base'
import { storageKeyOf } from '../../cache/key'
import { DERIVED_ANALYSIS_TTL_S } from '../../cache/ttl'
import { pdfPages } from './read'

/**
 * Keyed by the URL through `storageKeyOf` (`cache/key.ts`): unstorage cuts a
 * key at its first „?" and reads „/" as a separator (`normalizeKey`), Land
 * documents differ in their query alone, and a long URL would pass the 255
 * bytes a key may take as a file name in dev.
 */
export const cachedPdfPages = defineCachedFunction(
  (url: string): Promise<string[]> => pdfPages(url),
  {
    name: 'land-pdf-pages',
    base: DERIVED_CACHE,
    getKey: storageKeyOf,
    maxAge: DERIVED_ANALYSIS_TTL_S,
    swr: false,
  },
)
