/**
 * The Content-Security-Policy for rendered HTML (`server/plugins/csp.ts`).
 *
 * Scripts: the bundle is same-origin, so `'self'` covers every external
 * script, module preload and dynamic import. The only inline scripts a page
 * executes are the ones Nuxt writes itself — the import map and the
 * `window.__NUXT__` config — and they are admitted by their SHA-256, taken
 * from the response that carries them. Hashes rather than a nonce: the HTML
 * is not rewritten, nothing random is involved, and the policy stays right if
 * a page is ever cached, because hash and script travel in the same response.
 * The JSON payload (`#__NUXT_DATA__`) and JSON-LD are data blocks the browser
 * never executes, so they need no allowance.
 *
 * Only the framework-written sections are hashed (`head`, `bodyAppend`), never
 * the rendered app body: hashing whatever `<script>` appears there would
 * allow exactly the injected script the policy exists to stop.
 *
 * Styles need `'unsafe-inline'`: server-rendered `style` attributes (Vue
 * `:style` bindings, Nuxt's loading indicator) and the per-page `<style>`
 * Nuxt Icon emits for the icons in use cannot be hashed ahead of time —
 * attribute hashes would need `'unsafe-hashes'`, and the icon CSS varies by
 * page and is also injected on client navigation.
 *
 * `img-src data:`: the icons are CSS masks on `data:image/svg+xml` URLs.
 * `form-action` does not fall back to `default-src`, so it is stated.
 */

import { createHash } from 'node:crypto'

/**
 * Script types the browser executes or interprets under `script-src`:
 * classic (no type, or a JavaScript MIME type), module, import map and
 * speculation rules. Any other type is a data block.
 */
const JS_MIME = new Set([
  'application/ecmascript',
  'application/javascript',
  'application/x-ecmascript',
  'application/x-javascript',
  'text/ecmascript',
  'text/javascript',
  'text/javascript1.0',
  'text/javascript1.1',
  'text/javascript1.2',
  'text/javascript1.3',
  'text/javascript1.4',
  'text/javascript1.5',
  'text/jscript',
  'text/livescript',
  'text/x-ecmascript',
  'text/x-javascript',
])
const OTHER_EXECUTABLE = new Set(['module', 'importmap', 'speculationrules'])

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi
const ATTR_RE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

function parseAttrs(source: string): Map<string, string> {
  const attrs = new Map<string, string>()
  for (const m of source.matchAll(ATTR_RE)) {
    const name = m[1]!.toLowerCase()
    if (!attrs.has(name)) attrs.set(name, m[2] ?? m[3] ?? m[4] ?? '')
  }
  return attrs
}

/** Whether a `<script>` with these attributes runs under `script-src`. */
export function isExecutableScriptType(type: string | undefined): boolean {
  if (type === undefined) return true
  const t = type.trim().toLowerCase()
  return t === '' || JS_MIME.has(t) || OTHER_EXECUTABLE.has(t)
}

/**
 * The text of every inline script in `html` that the browser would execute:
 * no `src`, executable type. Text is returned exactly as written between the
 * tags — that is what the browser hashes.
 */
export function inlineExecutableScripts(html: string): string[] {
  const out: string[] = []
  for (const m of html.matchAll(SCRIPT_RE)) {
    const attrs = parseAttrs(m[1]!)
    if (attrs.has('src')) continue
    if (!isExecutableScriptType(attrs.get('type'))) continue
    out.push(m[2]!)
  }
  return out
}

/** A CSP hash source for `text`, hashed as UTF-8. */
export function sha256Source(text: string): string {
  return `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`
}

/** The full policy, admitting exactly the given inline scripts. */
export function buildCsp(inlineScripts: readonly string[]): string {
  const hashes = [...new Set(inlineScripts.map(sha256Source))]
  return [
    `default-src 'self'`,
    ['script-src', `'self'`, ...hashes].join(' '),
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data:`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ].join('; ')
}
