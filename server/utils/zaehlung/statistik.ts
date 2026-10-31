/**
 * The public summary of the day files (`/api/statistik`,
 * docs/architecture.md §12.65), pure so a test can hold it to its sums.
 */
import type { StatistikPayload, StatistikSeite, StatistikTag } from '#shared/types'
import { KLASSEN, type Klasse } from './klassen'
import { ANDERE, utcTag, type Tagesstand } from './tag'

export const STATISTIK_TAGE = 30
export const STATISTIK_HERKUNFT = 20

/** Fetched by subscribed apps on a timer — counted apart from the pages, and listed in this order. */
const ABOS: readonly Klasse[] = ['feed', 'kalender', 'frist-kalender']
const FEED_KALENDER = new Set<string>(ABOS)

function zeile(tag: string, d: Tagesstand | undefined): StatistikTag {
  const row: StatistikTag = { tag, seiten: 0, feedKalender: 0, bots: 0 }
  for (const [klasse, z] of Object.entries(d?.seiten ?? {})) {
    row.bots += z.bots
    if (FEED_KALENDER.has(klasse)) row.feedKalender += z.aufrufe
    else row.seiten += z.aufrufe
  }
  return row
}

/** `days` in any order; `today` is the last day of the window. */
export function fasseZusammen(days: readonly Tagesstand[], today: Date): StatistikPayload {
  const byTag = new Map(days.map((d) => [d.tag, d]))
  const sorted = [...byTag.keys()].sort()

  const gesamt = { seiten: 0, feedKalender: 0, bots: 0 }
  for (const d of byTag.values()) {
    const r = zeile(d.tag, d)
    gesamt.seiten += r.seiten
    gesamt.feedKalender += r.feedKalender
    gesamt.bots += r.bots
  }

  const tage: StatistikTag[] = []
  const hosts = new Map<string, number>()
  const klassen = new Map<string, number>(KLASSEN.map((k) => [k, 0]))
  const seit = sorted[0] ?? null
  for (let i = 0; i < STATISTIK_TAGE; i++) {
    const tag = utcTag(new Date(today.getTime() - i * 86_400_000))
    // Days before counting began are not zero, they are unknown.
    if (seit === null || tag < seit) break
    const d = byTag.get(tag)
    tage.push(zeile(tag, d))
    for (const [h, n] of Object.entries(d?.herkunft ?? {})) hosts.set(h, (hosts.get(h) ?? 0) + n)
    // A class a later release dropped still has its count; it is not shown.
    for (const [k, z] of Object.entries(d?.seiten ?? {})) if (klassen.has(k)) klassen.set(k, klassen.get(k)! + z.aufrufe)
  }

  const nachSeite: StatistikSeite[] = KLASSEN.filter((k) => !FEED_KALENDER.has(k)).map((klasse) => ({ klasse, aufrufe: klassen.get(klasse)! }))
  const nachAbo: StatistikSeite[] = ABOS.map((klasse) => ({ klasse, aufrufe: klassen.get(klasse)! }))

  // `andere` is a bucket, not a host: it is not ranked.
  hosts.delete(ANDERE)
  const herkunft = [...hosts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, STATISTIK_HERKUNFT)
    .map(([host, aufrufe]) => ({ host, aufrufe }))

  const stand = days.map((d) => d.stand).filter((s): s is string => s !== null).sort().at(-1) ?? null
  return { seit, gesamt, tage, nachSeite, nachAbo, herkunft, stand }
}
