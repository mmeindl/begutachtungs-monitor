/**
 * Parliament HTML → plain text: entity decoding, tag stripping, links, URLs.
 *
 * PURE MODULE — no Nuxt auto-imports, only relative imports,
 * so vitest can execute the module directly.
 */
import type { TraceLink } from '../../../shared/types'
import { safeExternalUrl } from '../../../shared/utils/safeExternalUrl'

export const PARLIAMENT_BASE = 'https://www.parlament.gv.at'

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  shy: '',
  auml: 'ä',
  Auml: 'Ä',
  ouml: 'ö',
  Ouml: 'Ö',
  uuml: 'ü',
  Uuml: 'Ü',
  szlig: 'ß',
  ast: '*',
  eacute: 'é',
  egrave: 'è',
  agrave: 'à',
  ndash: '–',
  mdash: '—',
  sect: '§',
  euro: '€',
  // Degree, per mille and the ordinal sign: Parliament's Gesetzestexte
  // carry them as an entity, RIS as the character. Without these three
  // lines the comparison read „&deg;C" against „°C" and reported
  // three units of the Nachhaltigkeitsberichtsgesetz on 4/ME as changed
  // in substance.
  deg: '°',
  permil: '‰',
  ordm: 'º',
  hellip: '…',
  bdquo: '„',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  laquo: '«',
  raquo: '»',
  // The names Parliament's Gesetzestexte carry beyond the ones above,
  // measured over the 1.244 cached Parliament documents (19.11.2026): each
  // printed literally until then — „[m&sup2;]" against RIS's „[m²]" made
  // 116/ME's BVWG-Gesetz Z 5 „geändert" on ME → Kundmachung, „&plusmn;"
  // 71/ME's Z 32, and on ME → RV both columns read „100 &micro;T" (43/ME).
  // A few Latin-1 neighbours of the measured ones come along, so the next
  // ressort's „&Eacute;" is not the next defect.
  sup1: '¹',
  sup2: '²',
  sup3: '³',
  plusmn: '±',
  micro: 'µ',
  times: '×',
  divide: '÷',
  middot: '·',
  copy: '©',
  reg: '®',
  acute: '´',
  aacute: 'á',
  Aacute: 'Á',
  ccedil: 'ç',
  Ccedil: 'Ç',
  iacute: 'í',
  Iacute: 'Í',
  oacute: 'ó',
  Oacute: 'Ó',
  uacute: 'ú',
  Uacute: 'Ú',
  Eacute: 'É',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
}

/**
 * Only decode code points that are legal, non-control, non-surrogate text.
 * `String.fromCodePoint` THROWS a RangeError above 0x10FFFF (a crafted
 * `&#x110000;` would 500 the whole endpoint), and control characters from
 * refs like `&#8;` would make generated XML feeds not well-formed.
 */
function safeFromCodePoint(code: number): string {
  if (!Number.isInteger(code) || code > 0x10ffff) return ''
  if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) return ''
  if (code === 0x7f || (code >= 0xd800 && code <= 0xdfff)) return ''
  return String.fromCodePoint(code)
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeFromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => safeFromCodePoint(Number.parseInt(dec, 10)))
    // A digit after the first letter: „&sup2;" is a name too, and `[a-z]+`
    // never matched it, whatever the table held.
    .replace(/&([a-z][a-z0-9]*);/gi, (match, name: string) => NAMED_ENTITIES[name] ?? match)
}

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
/**
 * A link out of Parliament's data as an absolute URL the server may fetch
 * and the page may link — or null.
 *
 * Resolved against Parliament's site the way a browser on that site would
 * resolve it, then held to the upstream allowlist (`safeExternalUrl`): a
 * site-relative path always passes, an absolute link only to an allowlisted
 * host. Everything else — another host, `javascript:`, `mailto:` — is
 * dropped, and callers treat null as „no link".
 */
export function absolutizeUrl(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  let resolved: string
  try {
    resolved = new URL(trimmed, `${PARLIAMENT_BASE}/`).href
  } catch {
    return null
  }
  return safeExternalUrl(resolved)
}

/** HTML → single-line plain text (tags removed, entities decoded, whitespace collapsed). */
export function stripHtmlToText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim()
}

/**
 * Extract all <a href> pairs from an HTML fragment, absolutizing the URLs.
 * A link `absolutizeUrl` refuses is left out; its text stays in the stage's
 * plain text, which is read separately.
 */
export function extractLinks(html: string): TraceLink[] {
  const links: TraceLink[] = []
  const re = /<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    const href = (match[1] ?? match[2] ?? '').trim()
    if (!href) continue
    const url = absolutizeUrl(href)
    if (!url) continue
    const label = stripHtmlToText(match[3] ?? '') || url
    links.push({ label, url })
  }
  return links
}
