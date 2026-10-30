/**
 * The cached read behind `/api/statistik`. Ten minutes, because the day
 * files are written every five: the page is at most one write behind
 * twice over, and a reload loop costs one directory read per ten minutes.
 * Derived, so it lives in memory and dies with the process.
 */
import type { StatistikPayload } from '#shared/types'
import { DERIVED_CACHE } from '../cache/base'
import { ladeAlleTage, zaehlVerzeichnis } from './speicher'
import { fasseZusammen } from './statistik'

export const getStatistik = defineCachedFunction(
  async (): Promise<StatistikPayload> => fasseZusammen(await ladeAlleTage(zaehlVerzeichnis()), new Date()),
  {
    name: 'zaehlung-statistik',
    base: DERIVED_CACHE,
    getKey: () => 'alle',
    maxAge: 60 * 10,
    swr: false,
  },
)
