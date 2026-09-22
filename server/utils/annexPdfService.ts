/**
 * The rasterised annex, read from its PDF (docs/api-exploration.md §2c).
 *
 * Nitro glue over `annexPdfPages.ts` (pdf.js) and `annexPdf.ts` (geometry).
 * It exists because of one measurement: `api-exploration.md` recorded that
 * about 40 % of annexes are "nur Scans" and unreadable, and that was a
 * property of the RIS *XML* rendering, which rasterises them into
 * `<binary datatype="gif">`. The **PDF of the same annex** is Word output
 * with a full text layer — across all 44 rasterised GP-XXVIII annexes not
 * one image XObject and 955 font references. The text was never lost; the
 * project was reading the format that had thrown it away.
 *
 * That is 44 more drafts, taking the readable share of GP XXVIII from 65 of
 * 132 to 109 of 132.
 *
 * **The bytes are cached in dev only**, the way the RIS result pages are
 * (`ris/begutCorpus.ts`, `cache/base.ts`). In dev the cache is the point: re-deriving a
 * comparison after a worker reload must not re-fetch a two-megabyte PDF.
 * Keeping all 44 resident in production would cost tens of megabytes on a
 * one-gigabyte VPS for hits that would hardly happen — the same arithmetic
 * that took the raw RIS pages out of production memory (133 MB against
 * 90 MB, measured 2026-09-09).
 *
 * **What is kept in production is the PARSE**, one layer up and derived: rows
 * are kilobytes where the document is megabytes, and without it the draft
 * page paid for the PDF twice, because two sections read the same annex
 * (`konsService.ts`, `textComparisonService.ts`).
 */
import { parseAnnexPdf, type AnnexParse } from './annexPdf'
import { pagesOf } from './annexPdfPages'
import { DERIVED_CACHE } from './cache/base'
import { DERIVED_ANALYSIS_TTL_S, PUBLISHED_DOCUMENT_TTL_S } from './cache/ttl'
import type { DraftArticle } from './lawTitles'
import { upstreamBytes, UpstreamHttpError, UpstreamTooLargeError, type UpstreamPolicy } from './upstream/fetch'

const PDF_TIMEOUT_MS = 25_000
/**
 * The largest annex in GP XXVIII is 2,6 MB. The cap is well above that and
 * exists for the case the corpus has not shown yet: pdf.js holds the whole
 * document plus its decoded streams in memory, and one pathological file
 * must not take the process with it.
 */
const PDF_MAX_BYTES = 16 * 1024 * 1024
/** No retry: this client never had one, and the bytes are fetched once per URL. */
const PDF_POLICY: UpstreamPolicy = { timeoutMs: PDF_TIMEOUT_MS, retries: 0, maxBytes: PDF_MAX_BYTES }

/**
 * The annex PDF as base64.
 *
 * Base64 rather than bytes because a cached value is serialised as JSON, and
 * a `Uint8Array` survives that as an object keyed "0", "1", "2" — bulkier
 * than the base64 and no longer a buffer on the way back.
 */
const fetchAnnexPdf = defineCachedFunction(
  async (url: string): Promise<string> => {
    try {
      const { bytes } = await upstreamBytes(url, PDF_POLICY)
      return Buffer.from(bytes).toString('base64')
    } catch (err) {
      if (err instanceof UpstreamTooLargeError) {
        throw createError({ statusCode: 502, statusMessage: 'Beilage zu groß zum Auslesen' })
      }
      if (err instanceof UpstreamHttpError) {
        throw createError({ statusCode: 502, statusMessage: `Beilage nicht abrufbar (Status ${err.status})` })
      }
      throw createError({ statusCode: 502, statusMessage: 'Beilage nicht abrufbar', cause: err })
    }
  },
  {
    name: 'annex-pdf',
    getKey: (url: string) => url,
    maxAge: PUBLISHED_DOCUMENT_TTL_S,
    swr: false,
    shouldBypassCache: () => !import.meta.dev,
  },
)

/**
 * The Artikel that decide the parse, as a key.
 *
 * `parseAnnexPdf` resolves the annex's law boundaries against the draft's own
 * Artikel list, and `resolveBoundaries` reads exactly these three fields
 * (`annexBoundaries.ts`). The object identity it also uses never leaves one
 * call, so it is no part of the answer. The same PDF held against a different
 * draft is a different answer, which is why this is in the key and not just
 * the URL.
 */
function articlesKey(articles: readonly DraftArticle[]): string {
  return articles.map((a) => `${a.numeral ?? ''}~${a.amends ? 'a' : ''}~${a.title ?? ''}`).join('/')
}

/**
 * The comparison a rasterised annex still carries, or null when the PDF
 * cannot be read at all.
 *
 * Returns the same shape as `parseTextComparison`, so the caller treats the
 * two sources alike and the RIS check applies to both unchanged — which is
 * the whole reason the geometry was made to emit `ComparisonRow`.
 *
 * **The PARSE is cached, because the bytes are not.** The byte cache above is
 * bypassed in production on purpose, so the two sections that read an annex —
 * the Textgegenüberstellung and the consolidated reading (`konsService.ts`) —
 * each fetched the PDF and ran pdf.js over it, on a draft page that shows
 * both. Derived, because every line of the answer is ours: pdf.js reads the
 * pages, our geometry makes rows of them (`cache/base.ts`). The value is plain
 * JSON — rows, counts and two strings — so it survives Nitro's serialisation;
 * `null` is a cacheable answer and does so too.
 *
 * A failure still is not an answer: the fetch is not caught, so a PDF RIS
 * would not hand over leaves this function and nothing is stored — a
 * swallowed timeout used to become "ließ sich auch aus dem PDF nicht
 * auslesen" as a fact about the draft (same rule as `textComparisonService`,
 * 2026-09-10). A document we did receive and pdf.js cannot open is a property
 * of that document, so that case stays null and is kept.
 */
export const annexFromPdf = defineCachedFunction(
  async (url: string, articles: readonly DraftArticle[]): Promise<AnnexParse | null> => {
    const base64 = await fetchAnnexPdf(url)
    const pages = await pagesOf(new Uint8Array(Buffer.from(base64, 'base64'))).catch(() => null)
    // pdf.js reads a damaged file as an *empty* document rather than failing,
    // so "no pages" and "no text on any page" both have to count as unreadable
    // — a scored run against nothing looks like a result (`harness-cache.ts`).
    if (pages === null || pages.every((page) => page.items.length === 0)) return null
    return parseAnnexPdf(pages, articles)
  },
  {
    name: 'annex-pdf-parse',
    base: DERIVED_CACHE,
    getKey: (url: string, articles: readonly DraftArticle[]) => `${url}|${articlesKey(articles)}`,
    maxAge: DERIVED_ANALYSIS_TTL_S,
    swr: false,
  },
)
