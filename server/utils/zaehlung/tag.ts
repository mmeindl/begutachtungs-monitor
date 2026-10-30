/**
 * One UTC day of page-view counts, as kept in memory and on disk
 * (docs/architecture.md §12.65). Counts and host names, nothing else: no
 * address, no user agent, no time finer than the day.
 *
 * `aufrufe` counts readers, `bots` the requests `istBot` attributed to
 * programs — the two never overlap, so their sum is every counted request.
 */
import type { Klasse, Treffer } from './klassen'

export interface Zaehler {
  aufrufe: number
  bots: number
}

export interface Tagesstand {
  /** UTC day, `YYYY-MM-DD`. */
  tag: string
  seiten: Partial<Record<Klasse, Zaehler>> & Record<string, Zaehler>
  /** The `entwurf-land` requests again, by Land code. */
  laender: Record<string, Zaehler>
  /** Readers' visits by referring host; bots carry none. */
  herkunft: Record<string, number>
  /** When the day was last written, ISO; null while it has never been. */
  stand: string | null
}

/** Distinct referring hosts kept per day; the rest add up under `ANDERE`. */
export const HERKUNFT_HOECHSTENS = 300
export const ANDERE = 'andere'

const TAG_RE = /^\d{4}-\d{2}-\d{2}$/

export function utcTag(now: Date): string {
  return now.toISOString().slice(0, 10)
}

export function istTag(tag: string): boolean {
  return TAG_RE.test(tag) && !Number.isNaN(Date.parse(`${tag}T00:00:00Z`))
}

export function leererTag(tag: string): Tagesstand {
  return { tag, seiten: {}, laender: {}, herkunft: {}, stand: null }
}

export interface Erfassung extends Treffer {
  bot: boolean
  /** The referring host (`herkunftHost`), or null. Ignored for bots. */
  herkunft: string | null
}

function add(map: Record<string, Zaehler>, key: string, z: Zaehler): void {
  const cur = map[key] ?? { aufrufe: 0, bots: 0 }
  map[key] = { aufrufe: cur.aufrufe + z.aufrufe, bots: cur.bots + z.bots }
}

/** Adds `n` visits from `host`, under `ANDERE` once the day holds its cap of hosts. */
function addHerkunft(map: Record<string, number>, host: string, n: number): void {
  if (map[host] === undefined && host !== ANDERE) {
    const distinct = Object.keys(map).filter((h) => h !== ANDERE).length
    if (distinct >= HERKUNFT_HOECHSTENS) host = ANDERE
  }
  map[host] = (map[host] ?? 0) + n
}

/** Counts one request into `stand`, in place. */
export function erfasse(stand: Tagesstand, e: Erfassung): void {
  const z = e.bot ? { aufrufe: 0, bots: 1 } : { aufrufe: 1, bots: 0 }
  add(stand.seiten, e.klasse, z)
  if (e.land) add(stand.laender, e.land, z)
  if (!e.bot && e.herkunft) addHerkunft(stand.herkunft, e.herkunft, 1)
}

/**
 * The sum of two aggregates of the same day — the file a restart found and
 * what the new process counted since. The cap holds over the sum; `stand`
 * is the later of the two.
 */
export function verbinde(a: Tagesstand, b: Tagesstand): Tagesstand {
  const out = leererTag(a.tag)
  for (const src of [a, b]) {
    for (const [k, z] of Object.entries(src.seiten)) add(out.seiten, k, z)
    for (const [k, z] of Object.entries(src.laender)) add(out.laender, k, z)
  }
  // Largest first, so the cap keeps the hosts that matter and folds the tail.
  const hosts = new Map<string, number>()
  for (const src of [a, b]) for (const [h, n] of Object.entries(src.herkunft)) hosts.set(h, (hosts.get(h) ?? 0) + n)
  for (const [h, n] of [...hosts].sort((x, y) => y[1] - x[1])) addHerkunft(out.herkunft, h, n)
  const stands = [a.stand, b.stand].filter((s): s is string => s !== null).sort()
  out.stand = stands.at(-1) ?? null
  return out
}

export function serialisiere(stand: Tagesstand): string {
  return `${JSON.stringify(stand, null, 1)}\n`
}

function count(v: unknown): number | null {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null
}

function zaehlerMap(v: unknown): Record<string, Zaehler> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const out: Record<string, Zaehler> = {}
  for (const [k, z] of Object.entries(v)) {
    if (!z || typeof z !== 'object') return null
    const aufrufe = count((z as Zaehler).aufrufe)
    const bots = count((z as Zaehler).bots)
    if (aufrufe === null || bots === null) return null
    out[k] = { aufrufe, bots }
  }
  return out
}

/** A day read back from its file, or null when the file is not one — a corrupt file is skipped, not half-read. */
export function lies(text: string): Tagesstand | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.tag !== 'string' || !istTag(r.tag)) return null
  const seiten = zaehlerMap(r.seiten)
  const laender = zaehlerMap(r.laender ?? {})
  if (!seiten || !laender) return null
  const herkunft: Record<string, number> = {}
  if (r.herkunft !== undefined) {
    if (!r.herkunft || typeof r.herkunft !== 'object' || Array.isArray(r.herkunft)) return null
    for (const [h, n] of Object.entries(r.herkunft)) {
      const c = count(n)
      if (c === null) return null
      herkunft[h] = c
    }
  }
  const stand = typeof r.stand === 'string' ? r.stand : null
  return { tag: r.tag, seiten, laender, herkunft, stand }
}
