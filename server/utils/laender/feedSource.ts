/**
 * Which source a feed or calendar is for (25.10.2026): `?quelle=` names the
 * Bund or one Land, as the list's chips do (`SOURCE_CODES`), or `parlament`
 * (23.11.2026), the items taking Stellungnahmen in Parliament — a feed only,
 * since they publish no Frist. Without it, the Bund — the feed every
 * subscriber had before the Länder, unchanged. Never two together: a
 * subscriber follows one source, and a Land's drafts in the Bund's feed would
 * arrive unasked in every existing subscription.
 *
 * Also the Land's drafts of the current period, as the list shows them
 * („Alle"), plus any whose Frist still runs from before it: a feed announces
 * what arrived, a calendar keeps every Frist.
 */
import type { H3Event } from 'h3'
import type { LandCode, LandConsultation } from '#shared/types'
import { LAND_CODES } from '#shared/utils/laender'
import { gapDe } from '#shared/utils/gaps'
import { gpWindow } from '#shared/utils/gp'
import { firstQueryValue } from '#shared/utils/queryParams'

export type FeedSource = 'bund' | 'parlament' | LandCode

export function feedSourceOf(event: H3Event): FeedSource {
  const value = firstQueryValue(getQuery(event).quelle)
  if (value === undefined || value === 'bund') return 'bund'
  if (value === 'parlament') return 'parlament'
  if ((LAND_CODES as readonly string[]).includes(value)) return value as LandCode
  throw createError({ statusCode: 404, statusMessage: 'Unbekannte Quelle' })
}

export async function landFeedItems(land: LandCode, gp: string): Promise<LandConsultation[]> {
  const window = gpWindow(gp)
  if (!window) return []
  // Loaded here, not at the top: the Bund's feed must not pull in the Länder readers (and the route tests run without Nitro).
  const { readLaenderInWindow } = await import('./sources')
  const { items, sources } = await readLaenderInWindow(window, 'all', [land], true)
  // A Land that cannot be read is an error, never an empty feed: a reader would take „nothing new" for an answer.
  if (sources[0]?.state !== 'ok') throw createError({ statusCode: 503, statusMessage: 'Gerade nicht abrufbar' })
  return items
}

/** The gap a Land's RSS feed names while only its running drafts could be read. */
export const LAND_FEED_RUNNING_ONLY_GAP = gapDe('unavailable', 'die abgeschlossenen Entwürfe dieses Landes. Der Feed nennt derzeit nur die laufenden.')

/**
 * A Land's drafts for its RSS feed. Steiermark's whole list waits for a cold
 * read of some 210 archive pages, and its running drafts need none of them
 * (23.11.2026): while the whole list cannot be read, the feed carries the
 * running ones and says so. A feed may do that, since a reader keeps what it
 * has seen; a calendar may not (`landFeedItems` stays a 503 there), since
 * its app would delete every event missing from the answer. With nothing
 * running to show, it stays an error: an empty feed would read as „nothing new".
 */
export async function landRssItems(land: LandCode, gp: string): Promise<{ items: LandConsultation[]; gap: string | null }> {
  const window = gpWindow(gp)
  if (!window) return { items: [], gap: null }
  const { readLaenderInWindow } = await import('./sources')
  const whole = await readLaenderInWindow(window, 'all', [land], true)
  if (whole.sources[0]?.state === 'ok') return { items: whole.items, gap: null }
  const running = await readLaenderInWindow(window, 'open', [land], true)
  if (running.sources[0]?.state !== 'ok' || !running.items.length) {
    throw createError({ statusCode: 503, statusMessage: 'Gerade nicht abrufbar' })
  }
  return { items: running.items, gap: LAND_FEED_RUNNING_ONLY_GAP }
}
