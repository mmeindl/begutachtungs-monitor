/**
 * The Länder's newest Kundmachungen, for the homepage's „Zuletzt Gesetz
 * geworden" (30.10.2026). Which drafts qualify, and the order:
 * `shared/utils/landRecent.ts`. Until 16.11.2026 also the Landtag decisions
 * not yet promulgated, read over the running period, for „Beschlossen, noch
 * nicht kundgemacht"; that list left the homepage and its half went with it.
 *
 * Read over the same window `/entwuerfe` lists the Länder in
 * (`readLaenderInWindow`), so a row here is a row behind the section's link,
 * with the same verdicts laid on. That read answers in 4 s warm and carries
 * 400 KB (30.10.2026) — not something the homepage may wait for or ship.
 * So the few rows are cut here and kept for a list's lifetime.
 */
import type { DashboardLaender, LandConsultation } from '#shared/types'
import { gpWindow } from '#shared/utils/gp'
import { isEnactedLandLaw, newestPerLand } from '#shared/utils/landRecent'
import { DERIVED_CACHE } from '../cache/base'
import { keepIncompleteFor, type Gathered } from '../cache/gathered'
import { LIST_STALE_S, UPSTREAM_LIST_TTL_S } from '../cache/ttl'
import { staleWithin } from '../cache/stale'
import { readLaenderInWindow } from './sources'

/** A Land that could not be read is retried after this, not after the list's TTL. */
const INCOMPLETE_TTL_MS = 5 * 60 * 1000

/** A row renders without its documents (`viewOfLand`); they were half the payload. */
const rowOnly = (d: LandConsultation): LandConsultation => ({ ...d, documents: [] })

/**
 * `enactedGp` is the period the Bund's half of „Zuletzt Gesetz geworden"
 * speaks about — the running one, or the one before while the running one
 * has promulgated nothing.
 */
const recentLandStations = defineCachedFunction(
  async (enactedGp: string): Promise<Gathered<DashboardLaender>> => {
    const window = gpWindow(enactedGp)
    const read = window ? await readLaenderInWindow(window, 'closed') : { items: [], sources: [] }
    return {
      value: {
        gp: enactedGp,
        enacted: newestPerLand(read.items.filter(isEnactedLandLaw)).map(rowOnly),
        sources: read.sources,
      },
      complete: read.sources.every((s) => s.state === 'ok'),
    }
  },
  {
    // One period in the key since 16.11.2026 (two before, for the decided
    // half): an older entry is never read again.
    name: 'dashboard-laender',
    base: DERIVED_CACHE,
    getKey: (enactedGp: string) => enactedGp,
    // Complete: served up to three hours old while it rebuilds. With a Land
    // unreadable: its own short window, never stale past it.
    ...staleWithin(UPSTREAM_LIST_TTL_S, LIST_STALE_S, keepIncompleteFor(INCOMPLETE_TTL_MS)),
  },
)

export async function getRecentLandStations(enactedGp: string): Promise<DashboardLaender> {
  return (await recentLandStations(enactedGp)).value
}
