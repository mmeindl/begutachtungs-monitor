/**
 * The public summary of the day files (`/api/statistik`,
 * docs/architecture.md §12.65), pure so a test can hold it to its sums.
 */
import type { StatistikPayload, StatistikTag } from '#shared/types'
import { ANDERE, utcTag, type Tagesstand } from './tag'

export const STATISTIK_TAGE = 30
export const STATISTIK_HERKUNFT = 20

const FEED_KALENDER = new Set(['feed', 'kalender', 'frist-kalender'])

function zeile(tag: string, d: Tagesstand | undefined): StatistikTag {
  const row: StatistikTag = { tag, aufrufe: 0, entwurfBund: 0, entwurfLand: 0, feedKalender: 0, bots: 0 }
  for (const [klasse, z] of Object.entries(d?.seiten ?? {})) {
    row.aufrufe += z.aufrufe
    row.bots += z.bots
    if (klasse === 'entwurf-bund') row.entwurfBund += z.aufrufe
    if (klasse === 'entwurf-land') row.entwurfLand += z.aufrufe
    if (FEED_KALENDER.has(klasse)) row.feedKalender += z.aufrufe
  }
  return row
}

/** `days` in any order; `today` is the last day of the window. */
export function fasseZusammen(days: readonly Tagesstand[], today: Date): StatistikPayload {
  const byTag = new Map(days.map((d) => [d.tag, d]))
  const sorted = [...byTag.keys()].sort()

  const gesamt = { aufrufe: 0, bots: 0 }
  for (const d of byTag.values()) {
    const r = zeile(d.tag, d)
    gesamt.aufrufe += r.aufrufe
    gesamt.bots += r.bots
  }

  const tage: StatistikTag[] = []
  const hosts = new Map<string, number>()
  const seit = sorted[0] ?? null
  for (let i = 0; i < STATISTIK_TAGE; i++) {
    const tag = utcTag(new Date(today.getTime() - i * 86_400_000))
    // Days before counting began are not zero, they are unknown.
    if (seit === null || tag < seit) break
    const d = byTag.get(tag)
    tage.push(zeile(tag, d))
    for (const [h, n] of Object.entries(d?.herkunft ?? {})) hosts.set(h, (hosts.get(h) ?? 0) + n)
  }

  // `andere` is a bucket, not a host: it is not ranked.
  hosts.delete(ANDERE)
  const herkunft = [...hosts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, STATISTIK_HERKUNFT)
    .map(([host, aufrufe]) => ({ host, aufrufe }))

  const stand = days.map((d) => d.stand).filter((s): s is string => s !== null).sort().at(-1) ?? null
  return { seit, gesamt, tage, herkunft, stand }
}
