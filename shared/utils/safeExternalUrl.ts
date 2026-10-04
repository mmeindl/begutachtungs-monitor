/**
 * The guard for every URL that arrives inside upstream data — document
 * links, BGBl links, RIS `ContentUrl` values. Those strings are the
 * upstream's, not ours: the server re-fetches some of them and hands all of
 * them to the browser as an `href`, so a compromised or malformed upstream
 * must not be able to point the server at an internal address or the page
 * at a `javascript:` URL.
 *
 * Applied where the URL is extracted (server), plus `isSafeLinkHref` as a
 * thin second check where a component binds an `href` (client).
 *
 * Pure module (auto-imported; vitest imports it relatively).
 */

/**
 * The hosts upstream data may point at, matched exactly — never by suffix,
 * so `www.parlament.gv.at.evil.example` is a different host.
 *
 * - `www.parlament.gv.at`: Parliament's site and API; every relative link in
 *   its detail JSON is absolutized onto it.
 * - `www.ris.bka.gv.at`: RIS pages — the BGBl links in a Vorlage's
 *   `status.bgbllinks` (sent as `http://`), and the pages built here.
 * - `ogd.ris.bka.gv.at`: RIS OGD document files (`ContentUrl.Url`).
 * - `data.bka.gv.at`: the RIS OGD API itself.
 *
 * A bare-domain variant is added only once upstream data is seen using it.
 */
export const UPSTREAM_HOSTS: ReadonlySet<string> = new Set([
  'www.parlament.gv.at',
  'www.ris.bka.gv.at',
  'ogd.ris.bka.gv.at',
  'data.bka.gv.at',
])

/** Parliament's host — the one `/gegenstand/…` paths are read from. */
export const PARLIAMENT_HOST = 'www.parlament.gv.at'

/**
 * `url` as a normalized `https://` href on an allowlisted host, or null.
 *
 * `http://` is upgraded (every allowlisted host serves https; RIS's own BGBl
 * links still say http). Refused: any other scheme, userinfo
 * (`https://www.parlament.gv.at@evil.example/`), an explicit port, a host
 * off the list. Parsing is WHATWG's, so a backslash after a special scheme
 * (`https:\\evil.example`) reads as the slash a browser would read.
 */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null
  const trimmed = url.trim()
  if (!trimmed) return null
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
  if (parsed.username || parsed.password) return null
  if (parsed.port) return null
  if (!UPSTREAM_HOSTS.has(parsed.hostname)) return null
  parsed.protocol = 'https:'
  return parsed.href
}

/**
 * The path of a Parliament URL, or null for any URL that is not on
 * Parliament's host — so a `/gegenstand/…` pattern matched against it cannot
 * be satisfied by the same path on another host.
 */
export function parliamentPathname(url: string | null | undefined): string | null {
  const safe = safeExternalUrl(url)
  if (!safe) return null
  const parsed = new URL(safe)
  return parsed.hostname === PARLIAMENT_HOST ? parsed.pathname : null
}

/**
 * Whether an `href` may be bound to an `<a>` — the client's second line,
 * behind the server-side `safeExternalUrl`.
 *
 * Scheme-only on purpose: the components that call it also link to pages
 * the site names itself (licence, repository, partners), which no upstream
 * allowlist covers. Accepted: a same-site path (`/feed.xml`, never `//` or
 * `/\`, which a browser reads as another host) and an absolute `http(s)`
 * URL without userinfo.
 */
export function isSafeLinkHref(href: string | null | undefined): boolean {
  if (typeof href !== 'string') return false
  // A browser drops tabs and newlines inside a URL before it parses it, so
  // „/\t/evil.example" is „//evil.example" to it — and must be to this check.
  const trimmed = href.replace(/[\t\n\r]/g, '').trim()
  if (!trimmed) return false
  if (trimmed.startsWith('/')) return !/^\/[/\\]/.test(trimmed)
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
  return !parsed.username && !parsed.password
}
