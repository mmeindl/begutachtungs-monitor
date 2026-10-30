/**
 * Which page a counted request belongs to (docs/architecture.md §12.65).
 *
 * The classes follow `app/pages/**` and `server/routes/**`, one per kind of
 * page rather than one per address: the count says which parts of the site
 * are read, never which draft someone opened. A Land's draft pages add the
 * Land code, nothing more.
 *
 * Classification is structural, not a second router: `/entwuerfe/foo/bar`
 * classifies as a Bund draft and is kept out of the count by its 404, since
 * only 2xx and 304 responses count (`server/plugins/zaehlung.ts`).
 */
import type { LandCode } from '#shared/types'
import { LAND_CODES, LAND_SLUG } from '#shared/utils/laender'

export const KLASSEN = [
  'start',
  'entwuerfe',
  'entwurf-bund',
  'entwurf-land',
  'frist-kalender',
  'so-funktionierts',
  'ueber',
  'impressum',
  'datenschutz',
  'statistik',
  'feed',
  'kalender',
  'sonstige',
] as const

export type Klasse = (typeof KLASSEN)[number]

export interface Treffer {
  klasse: Klasse
  /** Only for `entwurf-land`. */
  land?: LandCode
}

const FIXED: Record<string, Klasse> = {
  '/': 'start',
  '/entwuerfe': 'entwuerfe',
  '/so-funktionierts': 'so-funktionierts',
  '/ueber': 'ueber',
  '/impressum': 'impressum',
  '/datenschutz': 'datenschutz',
  '/statistik': 'statistik',
  '/feed.xml': 'feed',
  '/kalender.ics': 'kalender',
}

const LAND_BY_SLUG = new Map<string, LandCode>(LAND_CODES.map((code) => [LAND_SLUG[code], code]))

/**
 * Never a page: the API (a page's own calls and the browser's later ones),
 * Nuxt's bundle and error route, image transforms, fonts and the files under
 * `public/`. The sitemap is read by search engines alone.
 */
function isExcluded(path: string): boolean {
  return (
    path.startsWith('/api/') ||
    path === '/api' ||
    path.startsWith('/_nuxt/') ||
    path.startsWith('/__nuxt') ||
    path.startsWith('/_ipx/') ||
    path.startsWith('/fonts/') ||
    path.startsWith('/favicon') ||
    path === '/apple-touch-icon.png' ||
    path === '/robots.txt' ||
    path === '/og.png' ||
    path === '/sitemap.xml' ||
    path.endsWith('/_payload.json')
  )
}

/**
 * The class of a request path, or null when it is not counted at all.
 *
 * `path` is the normalised path (`normalisedPath`: decoded, lowercased, no
 * query). `contentType` decides only the remainder: an address no class
 * names counts as `sonstige` when it answered with an HTML page.
 */
export function klassifiziere(path: string, contentType?: string | null): Treffer | null {
  const p = path.length > 1 ? path.replace(/\/+$/, '') : path
  if (isExcluded(p)) return null

  const fixed = FIXED[p]
  if (fixed) return { klasse: fixed }

  const parts = p.split('/').slice(1)
  if (parts[0] === 'entwuerfe') {
    const rest = parts.slice(1)
    if (rest.at(-1) === 'frist.ics' && (rest.length === 2 || rest.length === 3)) return { klasse: 'frist-kalender' }
    // A Land's static directory wins over `[gp]/[inr]`, as in the router.
    if (rest.length === 2) {
      const land = LAND_BY_SLUG.get(rest[0]!)
      return land ? { klasse: 'entwurf-land', land } : { klasse: 'entwurf-bund' }
    }
    // `/entwuerfe/<id>`: a Bund draft without a Gegenstand at Parliament.
    if (rest.length === 1) return { klasse: 'entwurf-bund' }
  }

  // Anything else with a file extension is a file, not a page.
  if (/\.[a-z0-9]{1,8}$/.test(p)) return null
  return contentType?.toLowerCase().startsWith('text/html') ? { klasse: 'sonstige' } : null
}
