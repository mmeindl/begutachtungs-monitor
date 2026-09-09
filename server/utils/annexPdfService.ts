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
 * (`ris.ts`, `cacheBase.ts`). In dev the cache is the point: re-deriving a
 * comparison after a worker reload must not re-fetch a two-megabyte PDF. In
 * production the derived comparison above it holds for a day, so the PDF is
 * fetched at most once per draft per day — while keeping all 44 resident
 * would cost tens of megabytes on a one-gigabyte VPS for hits that would
 * hardly happen. The same arithmetic that took the raw RIS pages out of
 * production memory (133 MB against 90 MB, measured 2026-09-09).
 */
import { parseAnnexPdf, type AnnexParse } from './annexPdf'
import { pagesOf } from './annexPdfPages'
import type { DraftArticle } from './lawTitles'

/** A NOR-published annex never changes, so the bytes keep for a long time. */
const PDF_TTL_S = 60 * 60 * 24 * 30
const PDF_TIMEOUT_MS = 25_000
/**
 * The largest annex in GP XXVIII is 2,6 MB. The cap is well above that and
 * exists for the case the corpus has not shown yet: pdf.js holds the whole
 * document plus its decoded streams in memory, and one pathological file
 * must not take the process with it.
 */
const PDF_MAX_BYTES = 16 * 1024 * 1024

/**
 * The annex PDF as base64.
 *
 * Base64 rather than bytes because a cached value is serialised as JSON, and
 * a `Uint8Array` survives that as an object keyed "0", "1", "2" — bulkier
 * than the base64 and no longer a buffer on the way back.
 */
const fetchAnnexPdf = defineCachedFunction(
  async (url: string): Promise<string> => {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'begutachtungs-monitor/0.1 (+https://begutachtungs-monitor.at)' },
      signal: AbortSignal.timeout(PDF_TIMEOUT_MS),
    })
    if (!res.ok) throw createError({ statusCode: 502, statusMessage: `Beilage nicht abrufbar (Status ${res.status})` })
    const declared = Number(res.headers.get('content-length') ?? 0)
    if (declared > PDF_MAX_BYTES) throw createError({ statusCode: 502, statusMessage: 'Beilage zu groß zum Auslesen' })
    const buf = await res.arrayBuffer()
    if (buf.byteLength > PDF_MAX_BYTES) throw createError({ statusCode: 502, statusMessage: 'Beilage zu groß zum Auslesen' })
    return Buffer.from(buf).toString('base64')
  },
  {
    name: 'annex-pdf',
    getKey: (url: string) => url,
    maxAge: PDF_TTL_S,
    swr: false,
    shouldBypassCache: () => !import.meta.dev,
  },
)

/**
 * The comparison a rasterised annex still carries, or null when the PDF
 * cannot be read at all.
 *
 * Returns the same shape as `parseTextComparison`, so the caller treats the
 * two sources alike and the RIS check applies to both unchanged — which is
 * the whole reason the geometry was made to emit `ComparisonRow`.
 */
export async function annexFromPdf(url: string, articles: readonly DraftArticle[]): Promise<AnnexParse | null> {
  const base64 = await fetchAnnexPdf(url).catch(() => null)
  if (base64 === null) return null
  const pages = await pagesOf(new Uint8Array(Buffer.from(base64, 'base64'))).catch(() => null)
  // pdf.js reads a damaged file as an *empty* document rather than failing,
  // so "no pages" and "no text on any page" both have to count as unreadable
  // — a scored run against nothing looks like a result (`harness-cache.ts`).
  if (pages === null || pages.every((page) => page.items.length === 0)) return null
  return parseAnnexPdf(pages, articles)
}
