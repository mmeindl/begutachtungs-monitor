/**
 * The Länder's newest Kundmachungen and Landtag decisions, for the
 * homepage's track sections (30.10.2026). Which drafts qualify, and the
 * order: `shared/utils/landRecent.ts`.
 *
 * Read over the same window `/entwuerfe` lists the Länder in
 * (`readLaenderInWindow`), so a row here is a row behind the section's link,
 * with the same verdicts laid on. That read answers in 4 s warm and carries
 * 400 KB (30.10.2026) — not something the homepage may wait for or ship.
 * So the few rows are cut here and kept for a list's lifetime.
 */
import type { DashboardLaender, LandConsultation } from '#shared/types'
import { todayIso } from '#shared/utils/format'
import { gpWindow } from '#shared/utils/gp'
import { isDecidedLandLaw, isEnactedLandLaw, newestPerLand } from '#shared/utils/landRecent'
import { DERIVED_CACHE } from '../cache/base'
import { keepIncompleteFor, type Gathered } from '../cache/gathered'
import { UPSTREAM_LIST_TTL_S } from '../cache/ttl'
import { readLaenderInWindow } from './sources'

/** A Land that could not be read is retried after this, not after the list's TTL. */
const INCOMPLETE_TTL_MS = 5 * 60 * 1000

/** A row renders without its documents (`viewOfLand`); they were half the payload. */
const rowOnly = (d: LandConsultation): LandConsultation => ({ ...d, documents: [] })

/**
 * `enactedGp` is the period the Bund's half of „Zuletzt Gesetz geworden"
 * speaks about — the running one, or the one before while the running one
 * has promulgated nothing (§12.35). The decided rows always come from the
 * running period's window, like the Bund's (`DashboardDecided.gp`).
 */
const recentLandStations = defineCachedFunction(
  async (currentGp: string, enactedGp: string): Promise<Gathered<DashboardLaender>> => {
    const read = async (gp: string) => {
      const window = gpWindow(gp)
      return window ? readLaenderInWindow(window, 'closed') : { items: [], sources: [] }
    }
    const enactedRead = await read(enactedGp)
    const decidedRead = enactedGp === currentGp ? enactedRead : await read(currentGp)
    const today = todayIso()
    const decided = decidedRead.items.filter((d) => isDecidedLandLaw(d, today))
    const decidedTotal: DashboardLaender['decidedTotal'] = {}
    for (const d of decided) decidedTotal[d.land] = (decidedTotal[d.land] ?? 0) + 1
    // A Land unreadable in either read is unreadable for the page.
    const sources = enactedRead.sources.map((s) =>
      decidedRead.sources.find((o) => o.land === s.land)?.state === 'unavailable' ? { ...s, state: 'unavailable' as const } : s)
    return {
      value: {
        gp: enactedGp,
        enacted: newestPerLand(enactedRead.items.filter(isEnactedLandLaw)).map(rowOnly),
        decided: newestPerLand(decided).map(rowOnly),
        decidedTotal,
        sources,
      },
      complete: sources.every((s) => s.state === 'ok'),
    }
  },
  {
    name: 'dashboard-laender',
    base: DERIVED_CACHE,
    getKey: (currentGp: string, enactedGp: string) => `${currentGp}-${enactedGp}`,
    maxAge: UPSTREAM_LIST_TTL_S,
    swr: false,
    validate: keepIncompleteFor(INCOMPLETE_TTL_MS),
  },
)

export async function getRecentLandStations(currentGp: string, enactedGp: string): Promise<DashboardLaender> {
  return (await recentLandStations(currentGp, enactedGp)).value
}
