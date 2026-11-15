/**
 * Which source a feed or calendar is for (25.10.2026; `eu` since
 * 15.11.2026): `?quelle=` names the
 * Bund or one Land, as the list's chips do (`SOURCE_CODES`). Without it, the
 * Bund — the feed every subscriber had before the Länder, unchanged. Never
 * the two together: a subscriber follows one source, and a Land's drafts in
 * the Bund's feed would arrive unasked in every existing subscription.
 *
 * Also the Land's drafts of the current period, as the list shows them
 * („Alle"): a feed announces what arrived, a calendar keeps every Frist.
 */
import type { H3Event } from 'h3'
import type { EuOpenInitiative, LandCode, LandConsultation } from '#shared/types'
import { todayIso } from '#shared/utils/format'
import { LAND_CODES } from '#shared/utils/laender'
import { gpWindow } from '#shared/utils/gp'

export function feedSourceOf(event: H3Event): 'bund' | 'eu' | LandCode {
  const value = firstQueryValue(getQuery(event).quelle)
  if (value === undefined || value === 'bund') return 'bund'
  // The Commission's open windows (15.11.2026): a source of its own, never part of the Bund's.
  if (value === 'eu') return 'eu'
  if ((LAND_CODES as readonly string[]).includes(value)) return value as LandCode
  throw createError({ statusCode: 404, statusMessage: 'Unbekannte Quelle' })
}

export async function landFeedItems(land: LandCode, gp: string): Promise<LandConsultation[]> {
  const window = gpWindow(gp)
  if (!window) return []
  // Loaded here, not at the top: the Bund's feed must not pull in the Länder readers (and the route tests run without Nitro).
  const { readLaenderInWindow } = await import('./sources')
  const { items, sources } = await readLaenderInWindow(window, 'all', [land])
  // A Land that cannot be read is an error, never an empty feed: a reader would take „nothing new" for an answer.
  if (sources[0]?.state !== 'ok') throw createError({ statusCode: 503, statusMessage: 'Gerade nicht abrufbar' })
  return items
}

/**
 * The windows open on the Commission's portal today (`?quelle=eu`). A
 * portal that could not be read is an error, never an empty feed — as for
 * a Land: a reader would take „nothing open" for the portal's answer.
 */
export async function euFeedItems(): Promise<EuOpenInitiative[]> {
  // Loaded here, not at the top: the Bund's feed must not pull in the portal's service (and the route tests run without Nitro).
  const [{ openWindows }, { windowsOpenOn }] = await Promise.all([import('../eu/portalService'), import('../eu/haveYourSay')])
  const read = await openWindows()
  if (!read) throw createError({ statusCode: 503, statusMessage: 'Gerade nicht abrufbar' })
  return windowsOpenOn(read.initiatives, todayIso())
}
