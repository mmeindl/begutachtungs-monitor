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
  UpstreamRefusedError,
  UpstreamTooLargeError,
  type UpstreamPolicy,
} from './fetch'
import { storageKeyOf } from '../cache/key'
import { DOCUMENT_CACHE } from '../cache/base'
import { PUBLISHED_DOCUMENT_TTL_S } from '../cache/ttl'

/*
 * A month and on disk (`DOCUMENT_CACHE`) since 12.11.2026, a day in memory
 * before. Every URL its callers hand it is a published document's own
 * address — Parliament's `/dokument/<GP>/…` (a draft's, a Vorlage's or an
 * Antrag's Gesetzestext, Erläuterungen, Textgegenüberstellung), RIS's
 * `Dokumente/Begut/…` and `Dokumente/BgblAuth/…` — and such a document is
 * written once: a changed text is published as a document of its own
 * („Geändert im Ausschuss", a new Begut record). Read off the 1.788 URLs in
 * the dev cache that day, eight path shapes, all of them documents. No
 * Stellungnahme comes this way: those are read through
 * `parliament/statementDocument.ts`, uncached.
 */
const HTML_TIMEOUT_MS = 20_000
const HTML_MAX_BYTES = 8 * 1024 * 1024
/** Three attempts without a pause between them, as this client always had. */
const HTML_POLICY: UpstreamPolicy = {
  timeoutMs: HTML_TIMEOUT_MS,
  retries: 2,
  maxBytes: HTML_MAX_BYTES,
  // Every URL here comes out of upstream data (a document link, a RIS
  // `ContentUrl`): held to the upstream hosts, redirects included.
  upstreamHostsOnly: true,
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
      if (err instanceof UpstreamRefusedError) {
        throw createError({ statusCode: 502, statusMessage: 'Dokument nicht abrufbar (Adresse abgelehnt)' })
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
  { name: 'law-html', base: DOCUMENT_CACHE, getKey: (url: string) => storageKeyOf(url), maxAge: PUBLISHED_DOCUMENT_TTL_S, swr: false },
)

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
