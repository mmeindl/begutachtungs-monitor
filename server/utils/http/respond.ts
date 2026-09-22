/**
 * The conditional answer the five public feed routes give.
 *
 * All five build a deterministic body and then repeated the same five
 * lines: strong ETag, 304 on a match, content type, body. The bodies are
 * what differ — a feed, a calendar, a sitemap — and a poller that gets an
 * unchanged one should pay for the headers only.
 *
 * Uncached on purpose (`docs/architecture.md` §5): the routes read cached
 * leaves and assemble per request, so the ETag says "nothing changed" about
 * the assembled document, not about the cache.
 */
import type { H3Event } from 'h3'
import { bodyEtag } from '../feeds'

export function respondWithEtag(event: H3Event, body: string, contentType: string): string {
  const etag = bodyEtag(body)
  setHeader(event, 'ETag', etag)
  if (getHeader(event, 'if-none-match') === etag) {
    setResponseStatus(event, 304)
    return ''
  }
  setHeader(event, 'Content-Type', contentType)
  return body
}
