/**
 * The Länder the monitor reads, and how one request reads them (22.10.2026).
 *
 * Each Land is read on its own and fails on its own: one Land's relaunch
 * takes that Land's rows away and says so (`LandSourceState`), never the
 * others' and never the Bund's.
 *
 * Layers as `cache/base.ts` prescribes: the list PAGE is the fetched payload
 * and is cached for the list TTL; the parse is not cached, it runs on every
 * request and costs microseconds. A failed fetch throws and is therefore not
 * cached — the next request asks again.
 */
import type { LandCode, LandConsultation, LandSourceState, LaenderResponse } from '#shared/types'
import { LAND_CODES } from '#shared/utils/laender'
import { todayIso } from '#shared/utils/format'
import { type UpstreamPolicy, upstreamText } from '../upstream/fetch'
import { UPSTREAM_LIST_TTL_S } from '../cache/ttl'
import { SALZBURG_LISTS, parseSalzburgList, salzburgDrafts } from './salzburg'

const LAND_POLICY: UpstreamPolicy = {
  timeoutMs: 15_000,
  retries: 1,
  backoffMs: () => 2_000,
  accept: 'text/html',
  maxBytes: 4 * 1024 * 1024,
}

/** One list page as the Land served it. */
export const fetchLandPage = defineCachedFunction(
  (url: string): Promise<string> => upstreamText(url, LAND_POLICY),
  { name: 'land-list-page', getKey: (url: string) => url, maxAge: UPSTREAM_LIST_TTL_S, swr: false },
)

interface LandReader {
  /** The page a reader is sent to when the Land cannot be read. */
  listUrl: string
  read: () => Promise<LandConsultation[]>
}

const READERS: Record<LandCode, LandReader> = {
  sbg: {
    listUrl: SALZBURG_LISTS.gesetz,
    read: async () => {
      const [gesetze, verordnungen] = await Promise.all(
        (['gesetz', 'verordnung'] as const).map(async (kind) => {
          const url = SALZBURG_LISTS[kind]
          return salzburgDrafts(parseSalzburgList(await fetchLandPage(url), url), kind)
        }),
      )
      return [...gesetze!, ...verordnungen!]
    },
  },
}

/**
 * Whether a Frist runs on `day`: the Länder state no start, so only the end
 * decides. Decided per request, never inside a cache (`withRisActiveOn`).
 */
export function withLandActiveOn(items: LandConsultation[], day: string = todayIso()): LandConsultation[] {
  return items.map((item) => ({ ...item, active: item.deadline !== null && item.deadline >= day }))
}

/**
 * Every Land the monitor reads. Only RUNNING Begutachtungen leave here:
 * some Länder leave expired entries on their list, and the monitor has no
 * view for closed Länder drafts yet (`TODO.md` 5L).
 */
export async function readLaender(): Promise<LaenderResponse> {
  const results = await Promise.allSettled(LAND_CODES.map((land) => READERS[land].read()))
  const items: LandConsultation[] = []
  const sources: LandSourceState[] = LAND_CODES.map((land, i) => {
    const result = results[i]!
    if (result.status === 'fulfilled') items.push(...result.value)
    else console.warn(`[laender] ${land} nicht abrufbar:`, result.reason instanceof Error ? result.reason.message : result.reason)
    return { land, state: result.status === 'fulfilled' ? 'ok' : 'unavailable', listUrl: READERS[land].listUrl }
  })
  return {
    items: withLandActiveOn(items).filter((item) => item.active),
    sources,
  }
}
