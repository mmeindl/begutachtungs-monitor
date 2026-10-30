/**
 * A session with a Land's JSF or XPages site (30.10.2026): the cookies each
 * hop sets, kept across redirects and postbacks — what Tirol's Landtag
 * (`tirol.ts`), Steiermark's PALLAST (`steiermark.ts`) and Burgenland's
 * archive pager (`burgenland.ts`) need, and no plain GET gives.
 *
 * Every request goes through the one HTTP client (`upstreamExchange`), so a
 * session's requests take their host's slots, their byte cap and their
 * retries like every other — Tirol's documents were read past all three
 * until the session moved here. Each hop is held to the session's origin:
 * a redirect elsewhere ends the session, never follows it.
 *
 * Deliberately free of Nitro globals: the parsers' tests and the scripts run
 * it as it is.
 */
import { decodeEntities } from '../parliament/htmlText'
import { upstreamExchange, type UpstreamPolicy } from '../upstream/fetch'

export interface SessionPage {
  /** Where the last hop landed — postbacks go to the form's action resolved against it. */
  url: string
  contentType: string | null
  bytes: Uint8Array<ArrayBuffer>
}

const MAX_HOPS = 6

export class LandSession {
  private readonly jar = new Map<string, string>()

  constructor(
    /** `https://pallast2.stmk.gv.at` — every hop must stay on it. */
    private readonly origin: string,
    private readonly policy: UpstreamPolicy,
  ) {}

  private keep(cookies: string[]): void {
    for (const c of cookies) {
      const [pair] = c.split(';')
      const eq = pair!.indexOf('=')
      if (eq > 0) this.jar.set(pair!.slice(0, eq).trim(), pair!.slice(eq + 1).trim())
    }
  }

  /** One request and its redirects, by hand; a POST answered by a 3xx goes on as a GET. */
  async open(url: string, request: { form?: URLSearchParams; headers?: Record<string, string> } = {}): Promise<SessionPage> {
    let current = url
    let form = request.form
    let headers = request.headers
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      if (new URL(current).origin !== this.origin) throw new Error(`Weiterleitung außerhalb von ${this.origin}: ${current}`)
      const res = await upstreamExchange(current, {
        ...this.policy,
        upstreamHostsOnly: true,
        followRedirects: false,
        method: form ? 'POST' : 'GET',
        ...(form ? { form } : {}),
        headers: { ...headers, ...(this.jar.size ? { Cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}) },
      })
      this.keep(res.cookies)
      if (res.location === null) return { url: current, contentType: res.contentType, bytes: res.bytes }
      current = new URL(res.location, current).href
      form = undefined
      headers = undefined
    }
    throw new Error(`Zu viele Weiterleitungen: ${url}`)
  }

  async text(url: string, request: { form?: URLSearchParams; headers?: Record<string, string> } = {}): Promise<{ url: string; html: string }> {
    const page = await this.open(url, request)
    return { url: page.url, html: new TextDecoder().decode(page.bytes) }
  }
}

/** One attribute's value in a tag, whatever the attributes' order. */
export function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]
}

/** The hidden fields of a form's body, decoded — what every postback sends back. */
export function hiddenInputs(body: string): URLSearchParams {
  const form = new URLSearchParams()
  for (const [input] of body.matchAll(/<input\b[^>]*type="hidden"[^>]*>/g)) {
    const field = attr(input, 'name')
    if (field) form.set(decodeEntities(field), decodeEntities(attr(input, 'value') ?? ''))
  }
  return form
}

/** A form of the page: its name, its action and its body. */
export interface PageForm {
  name: string
  action: string
  body: string
}

export function pageForms(html: string): PageForm[] {
  const out: PageForm[] = []
  for (const [, open, body] of html.matchAll(/(<form\b[^>]*>)([\s\S]*?)<\/form>/g)) {
    const name = attr(open!, 'name') ?? attr(open!, 'id')
    const action = attr(open!, 'action')
    if (name && action) out.push({ name, action: decodeEntities(action), body: body! })
  }
  return out
}

/**
 * A document link of the monitor's own making for a document that has no
 * address: the page that offers it, and its name after `#dok=` (Tirol since
 * 23.10.2026, Steiermark since 30.10.2026). A reader's browser opens the
 * page; the server reads the document through it (`postbackDocument`).
 */
export function documentLink(pageUrl: string, label: string): string {
  return `${pageUrl}#dok=${encodeURIComponent(label)}`
}

/** The page and the label of a `documentLink`, or null for any other URL. */
export function documentLinkParts(url: string): { page: string; label: string } | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (!u.hash.startsWith('#dok=')) return null
  const label = decodeURIComponent(u.hash.slice('#dok='.length))
  u.hash = ''
  return { page: u.href, label }
}

/** A postback that answers with the document: the form it is sent with, and the field that names the link pressed. */
export interface Postback {
  form: PageForm
  param: string
}

/**
 * One document of a page, by its label: the page opened in a session of its
 * own, the link's postback sent, and the answer taken only if it is a PDF.
 * `find` knows the site's markup for a document link.
 */
export async function postbackDocument(
  session: LandSession,
  url: string,
  find: (html: string, label: string) => Postback | null,
): Promise<Uint8Array> {
  const parts = documentLinkParts(url)
  if (!parts) throw new Error(`Keine Dokumentadresse: ${url}`)
  const page = await session.text(parts.page)
  const html = page.html.replace(/<script\b[\s\S]*?<\/script>/g, '')
  const postback = find(html, parts.label)
  if (!postback) throw new Error(`Dokument „${parts.label}" nicht auf der Seite`)
  const form = hiddenInputs(postback.form.body)
  form.set(postback.form.name, postback.form.name)
  form.set(postback.param, postback.param)
  const res = await session.open(new URL(postback.form.action, page.url).href, { form })
  if (!/application\/pdf/.test(res.contentType ?? '')) throw new Error(`Dokument „${parts.label}" ist kein PDF (${res.contentType ?? '?'})`)
  return res.bytes
}
