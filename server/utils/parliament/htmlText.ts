/**
 * Parliament HTML → plain text: entity decoding, tag stripping, links, URLs.
 *
 * PURE MODULE — no Nuxt auto-imports, only relative imports,
 * so vitest can execute the module directly.
 */
import type { TraceLink } from '../../../shared/types'

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
  eacute: 'é',
  egrave: 'è',
  agrave: 'à',
  ndash: '–',
  mdash: '—',
  sect: '§',
  euro: '€',
  // Grad, Promille und das Ordnungszeichen: Die Gesetzestexte des Parlaments
  // führen sie als Entität, das RIS als Zeichen. Ohne diese drei Zeilen las
  // der Vergleich „&deg;C" gegen „°C" und meldete bei 4/ME drei Einheiten
  // des Nachhaltigkeitsberichtsgesetzes als inhaltlich geändert (§12.33).
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
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name] ?? match)
}

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
/** Make site-relative parliament links absolute; leave absolute ones untouched. */
export function absolutizeUrl(url: string): string {
  const trimmed = url.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (trimmed.startsWith('//')) return `https:${trimmed}`
  return `${PARLIAMENT_BASE}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`
}

/** HTML → single-line plain text (tags removed, entities decoded, whitespace collapsed). */
export function stripHtmlToText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim()
}

/** Extract all <a href> pairs from an HTML fragment, absolutizing the URLs. */
export function extractLinks(html: string): TraceLink[] {
  const links: TraceLink[] = []
  const re = /<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    const href = (match[1] ?? match[2] ?? '').trim()
    if (!href) continue
    const url = absolutizeUrl(href)
    const label = stripHtmlToText(match[3] ?? '') || url
    links.push({ label, url })
  }
  return links
}
