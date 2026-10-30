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
 * - `service.salzburg.gv.at`: Salzburg's list of drafts in Begutachtung and
 *   its documents (`server/utils/laender/salzburg.ts`).
 * - `www.salzburg.gv.at`: the Salzburg Landtag's PDFs — the Regierungsvorlage
 *   RIS links each Landesgesetzblatt to (`RegierungsvorlageLink`), read to
 *   decide which Kundmachung is a draft's own (`laender/vorlageMatch.ts`).
 * - `www.wien.gv.at`: Wien's page of drafts and Stellungnahmen
 *   (`server/utils/laender/wien.ts`).
 * - `www.land-oberoesterreich.gv.at`, `www2.land-oberoesterreich.gv.at`:
 *   Oberösterreich's lists and its Landtag's pages of each draft
 *   (`server/utils/laender/oberoesterreich.ts`).
 * - `www.ktn.gv.at`: Kärnten's pages of drafts, Vorlagen and Beschlüsse
 *   and their PDFs (`server/utils/laender/kaernten.ts`).
 * - `www.tirol.gv.at`: Tirol's list of drafts in Begutachtung;
 *   `lte.tirol.gv.at`: its Landtag's record of each, and the documents
 *   read through it (`server/utils/laender/tirol.ts`).
 * - `www.data.gv.at`: the IFG-Informationsregister, where Tirol publishes
 *   its Verordnungsentwürfe; `dokumente.tirol.gv.at`: their documents
 *   (`server/utils/laender/tirol.ts`, „Verordnungen").
 * - `apps.bgld.gv.at`: Burgenland's lists and their attachments
 *   (`server/utils/laender/burgenland.ts`).
 * - `www.noe.gv.at`: Niederösterreich's list, draft pages and documents
 *   (`server/utils/laender/niederoesterreich.ts`).
 * - `pallast2.stmk.gv.at`: the Steiermark Landtag's PALLAST, where the
 *   Land files its drafts (`server/utils/laender/steiermark.ts`).
 * - `vorarlberg.at`: Vorarlberg's page and its document library — the page
 *   links bare-domain (`server/utils/laender/vorarlberg.ts`).
 *
 * A bare-domain variant is added only once upstream data is seen using it.
 */
export const UPSTREAM_HOSTS: ReadonlySet<string> = new Set([
  'www.parlament.gv.at',
  'www.ris.bka.gv.at',
  'ogd.ris.bka.gv.at',
  'data.bka.gv.at',
  'service.salzburg.gv.at',
  'www.salzburg.gv.at',
  'www.wien.gv.at',
  'www.land-oberoesterreich.gv.at',
  'www2.land-oberoesterreich.gv.at',
  'www.ktn.gv.at',
  'www.tirol.gv.at',
  'lte.tirol.gv.at',
  'www.data.gv.at',
  'dokumente.tirol.gv.at',
  'apps.bgld.gv.at',
  'www.noe.gv.at',
  'pallast2.stmk.gv.at',
  'vorarlberg.at',
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
