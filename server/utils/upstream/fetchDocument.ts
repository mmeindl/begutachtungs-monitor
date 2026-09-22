/**
 * One published document, by URL — the leaf cache five services share.
 *
 * Named for what it fetches rather than for its first caller: Parliament's
 * Word HTML and RIS's legistic XML come down the same way, and the annex,
 * the Erläuterungen, the § names and both comparisons all ask for one.
 */
import {
  upstreamBytes,
  UpstreamHttpError,
  UpstreamTooLargeError,
  type UpstreamPolicy,
} from './fetch'

/**
 * Its own name, because neither shared one describes it: the value is a
 * published document, but kept for a day and not for a month. Whether it
 * could take `PUBLISHED_DOCUMENT_TTL_S` is a question nobody has measured,
 * and this refactor does not answer it.
 */
const HTML_TTL_S = 60 * 60 * 24
const HTML_TIMEOUT_MS = 20_000
const HTML_MAX_BYTES = 8 * 1024 * 1024
/** Three attempts without a pause between them, as this client always had. */
const HTML_POLICY: UpstreamPolicy = {
  timeoutMs: HTML_TIMEOUT_MS,
  retries: 2,
  maxBytes: HTML_MAX_BYTES,
}

/** One published Gesetzestext HTML, by URL. Leaf cache. */
export const fetchDocument = defineCachedFunction(
  async (url: string): Promise<string> => {
    let body: Awaited<ReturnType<typeof upstreamBytes>>
    try {
      body = await upstreamBytes(url, HTML_POLICY)
    } catch (err) {
      if (err instanceof UpstreamTooLargeError) {
        throw createError({ statusCode: 502, statusMessage: 'Dokument zu groß für den Vergleich' })
      }
      if (err instanceof UpstreamHttpError) {
        throw createError({ statusCode: 502, statusMessage: `Dokument nicht abrufbar (Status ${err.status})` })
      }
      throw createError({ statusCode: 502, statusMessage: 'Dokument nicht abrufbar', cause: err })
    }
    // Parliament serves Word HTML as windows-1252 or utf-8; the header says which.
    const charset = /charset=([\w-]+)/i.exec(body.contentType ?? '')?.[1]
    return decodeHtml(body.bytes, charset)
  },
  { name: 'law-html', getKey: (url: string) => url, maxAge: HTML_TTL_S, swr: false },
)

/** Honour the header charset, else the <meta charset>, else utf-8. */
function decodeHtml(buf: ArrayBuffer, headerCharset: string | undefined): string {
  let charset = headerCharset
  if (!charset) {
    const head = new TextDecoder('latin1').decode(buf.slice(0, 2048))
    charset = /charset=["']?([\w-]+)/i.exec(head)?.[1]
  }
  try {
    return new TextDecoder(charset ?? 'utf-8').decode(buf)
  } catch {
    return new TextDecoder('utf-8').decode(buf)
  }
}
