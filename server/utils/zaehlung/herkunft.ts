/**
 * The referring site of a visit, reduced to its host name
 * (docs/architecture.md §12.65): no scheme, port, path or query, so a link
 * from a search result or a private document says „google.com“ or
 * „docs.example.org“ and nothing about what was searched or which document
 * it was. Browsers mostly send no more than the origin across sites anyway
 * (`strict-origin-when-cross-origin`); this holds for the ones that send
 * more.
 */
const SAME_SITE = new Set(['begutachtungs-monitor.at', 'www.begutachtungs-monitor.at', 'localhost', '127.0.0.1'])

const MAX_HOST_LENGTH = 100

/** A host name made of DNS labels, with at least one letter in its last label — no IP literal. */
const HOST_NAME = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$|^[a-z][a-z0-9-]*$/

/**
 * The host of a `Referer` header, or null when it names none worth
 * counting: absent, malformed, not http(s), this site itself, an IP address
 * (which may be someone's own machine), or longer than 100 characters.
 */
export function herkunftHost(referer: string | null | undefined): string | null {
  if (!referer) return null
  let url: URL
  try {
    url = new URL(referer.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!host || host.length > MAX_HOST_LENGTH) return null
  if (SAME_SITE.has(host) || host.endsWith('.localhost')) return null
  if (!HOST_NAME.test(host)) return null
  return host
}
