/**
 * Which page a counted request belongs to.
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
import { anliegenKindOfSegment } from '#shared/utils/anliegen'
import { itemKindOfSegment } from '#shared/utils/procedureRoot'

export const KLASSEN = [
  'start',
  'entwuerfe',
  'entwurf-bund',
  'entwurf-land',
  // The page of an item without a Ministerialentwurf,
  // `/entwuerfe/<gp>/<kind>/<nr>`, whatever the kind (vorlage, antrag,
  // ausschussantrag, …; decision 10 of 14.11.2026). The days before
  // 14.11.2026 counted these pages as `sonstige` and stay so.
  'vorlage-bund',
  // The list of Anliegen an das Parlament, `/anliegen`, and the page of
  // one, `/anliegen/<gp>/<kind>/<nr>`, whatever the kind (Petition,
  // Bürgerinitiative, Volksbegehren). The days before 15.11.2026 counted
  // these pages as `sonstige` and stay so.
  'anliegen',
  'anliegen-gegenstand',
  'frist-kalender',
  'eu-recht',
  // The page of an initiative of the Commission's portal,
  // `/eu-recht/initiative/<nr>` (step 3 of the EU cycle, 15.11.2026).
  'eu-initiative',
  // The page of a proposal of the Commission, `/eu-recht/vorschlag/<year>/<nr>`
  // (step 3 of the EU cycle, 15.11.2026). Four segments like an act's page,
  // so it is told apart by its path word before the act rule below.
  'eu-vorschlag',
  // The page of a European Citizens' Initiative,
  // `/eu-recht/buergerinitiative/<year>/<nr>` (step 5 of the EU cycle,
  // 15.11.2026). Four segments like an act's page, told apart by its path
  // word before the act rule below.
  'eu-buergerinitiative',
  'wege',
  'datenlage',
  // The register of sources and licences, a page of its own since
  // 16.11.2026; before, a section of `/impressum`.
  'quellen',
  // Dissolved on 14.11.2026 (301 to /wege); the class stays for the days
  // counted before.
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
  '/anliegen': 'anliegen',
  '/eu-recht': 'eu-recht',
  '/wege': 'wege',
  '/datenlage': 'datenlage',
  '/quellen': 'quellen',
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
    // `/entwuerfe/<gp>/<kind>/<nr>`: an item's own page, by the segments
    // the router knows (`itemKindOfSegment`) — the path is lowercased here.
    if (rest.length === 3 && itemKindOfSegment(rest[1]!) !== null) return { klasse: 'vorlage-bund' }
  }

  // `/anliegen/<gp>/<kind>/<nr>`: an Anliegen's page, by the kind segments
  // the router knows (`anliegenKindOfSegment`), as for `vorlage-bund` — a
  // Petition an den Bundesrat's too, `/anliegen/BR/petition-bundesrat/<nr>`.
  if (parts[0] === 'anliegen' && parts.length === 4 && anliegenKindOfSegment(parts[2]!) !== null) {
    return { klasse: 'anliegen-gegenstand' }
  }

  // A proposal of the Commission: `/eu-recht/vorschlag/<year>/<nr>`.
  if (parts[0] === 'eu-recht' && parts.length === 4 && parts[1] === 'vorschlag') return { klasse: 'eu-vorschlag' }
  // A European Citizens' Initiative: `/eu-recht/buergerinitiative/<year>/<nr>`.
  if (parts[0] === 'eu-recht' && parts.length === 4 && parts[1] === 'buergerinitiative') return { klasse: 'eu-buergerinitiative' }
  // The EU map: the overview above, one act's page `/eu-recht/<kind>/<year>/<number>` here.
  if (parts[0] === 'eu-recht' && parts.length === 4) return { klasse: 'eu-recht' }
  // An initiative of the Commission's portal: `/eu-recht/initiative/<nr>`.
  if (parts[0] === 'eu-recht' && parts.length === 3 && parts[1] === 'initiative') return { klasse: 'eu-initiative' }

  // Anything else with a file extension is a file, not a page.
  if (/\.[a-z0-9]{1,8}$/.test(p)) return null
  return contentType?.toLowerCase().startsWith('text/html') ? { klasse: 'sonstige' } : null
}
