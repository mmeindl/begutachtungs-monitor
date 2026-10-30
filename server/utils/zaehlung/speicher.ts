/**
 * Where the day files live and how they get there (docs/architecture.md
 * §12.65): one JSON file per UTC day, `<dir>/YYYY-MM-DD.json`, written
 * whole and atomically every few minutes, at the change of day and at
 * shutdown.
 *
 * The counter is restart-safe by adding, not by trusting memory: a process
 * that finds today's file reads it and counts on top of it, so a deploy or
 * a crash loses at most what was counted since the last write.
 */
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { erfasse, istTag, leererTag, lies, serialisiere, utcTag, verbinde, type Erfassung, type Tagesstand } from './tag'

const SUBDIR = 'zaehlung'

/**
 * The directory of the day files, resolved like the last-good store's
 * (`parliament/lastgood.ts`): `BM_STATE_DIR`, then systemd's
 * `STATE_DIRECTORY` (`/var/lib/begutachtungs-monitor`, outside the app dir
 * that every deploy replaces), then `./.data` in dev.
 */
export function zaehlVerzeichnis(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): string {
  const explicit = env.BM_STATE_DIR?.trim()
  if (explicit) return join(explicit, SUBDIR)
  // systemd hands over a colon-separated list; the app's own is the first.
  const systemd = env.STATE_DIRECTORY?.split(':')[0]?.trim()
  if (systemd) return join(systemd, SUBDIR)
  return join(cwd, '.data', SUBDIR)
}

export function tagesDatei(dir: string, tag: string): string {
  return join(dir, `${tag}.json`)
}

/** The stored day, or null when there is none or it does not parse. */
export async function ladeTag(dir: string, tag: string): Promise<Tagesstand | null> {
  let text: string
  try {
    text = await readFile(tagesDatei(dir, tag), 'utf8')
  } catch {
    return null
  }
  const stand = lies(text)
  return stand?.tag === tag ? stand : null
}

/** Every stored day the directory holds, sorted, the unreadable ones skipped. */
export async function ladeAlleTage(dir: string): Promise<Tagesstand[]> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return []
  }
  const tags = names
    .filter((n) => n.endsWith('.json'))
    .map((n) => n.slice(0, -'.json'.length))
    .filter(istTag)
    .sort()
  const days = await Promise.all(tags.map((t) => ladeTag(dir, t)))
  return days.filter((d): d is Tagesstand => d !== null)
}

let tmpSeq = 0

/** Write-then-rename: a crash mid-write leaves the previous file, never a truncated one. */
export async function schreibeTag(dir: string, stand: Tagesstand): Promise<void> {
  const file = tagesDatei(dir, stand.tag)
  const tmp = `${file}.${process.pid}-${++tmpSeq}.tmp`
  try {
    await mkdir(dir, { recursive: true })
    await writeFile(tmp, serialisiere(stand), 'utf8')
    await rename(tmp, file)
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => {})
    throw err
  }
}

export interface Zaehlung {
  /** Counts one request into the day it arrived on. */
  erfasse(e: Erfassung): void
  /** Writes the current day if anything changed since the last write. */
  schreibe(): Promise<void>
}

interface OffenerTag {
  /** What this process counted on the day. */
  neu: Tagesstand
  /** The day's file as this process found it — what a previous process counted. */
  basis: Promise<Tagesstand | null>
  dirty: boolean
}

/**
 * The counter of one process. `now` and the error reporter are injected so
 * a test can change the day and see a failing disk.
 *
 * What is written is always the file as found plus everything counted
 * since, never a read-modify-write of the file: the process is the only
 * writer, so a write is a pure function of its own state and two writes of
 * the same day cannot add the same count twice.
 */
export function createZaehlung(
  dir: string,
  opts: { now?: () => Date; warn?: (err: unknown) => void } = {},
): Zaehlung {
  const now = opts.now ?? (() => new Date())
  const warn = opts.warn ?? (() => {})

  function open(tag: string): OffenerTag {
    return { neu: leererTag(tag), basis: ladeTag(dir, tag), dirty: false }
  }

  let current = open(utcTag(now()))
  // One write at a time, in order: two writes of the same file must not race.
  let writing: Promise<void> = Promise.resolve()

  function write(day: OffenerTag): Promise<void> {
    day.dirty = false
    writing = writing.then(async () => {
      try {
        const basis = await day.basis
        const stand = basis ? verbinde(basis, day.neu) : verbinde(day.neu, leererTag(day.neu.tag))
        stand.stand = now().toISOString()
        await schreibeTag(dir, stand)
      } catch (err) {
        day.dirty = true
        warn(err)
      }
    })
    return writing
  }

  /** On the first request or write of a new day: write the old one, open the new one. */
  function rollover(): void {
    const tag = utcTag(now())
    if (tag === current.neu.tag) return
    const previous = current
    current = open(tag)
    if (previous.dirty) void write(previous)
  }

  return {
    erfasse(e) {
      rollover()
      erfasse(current.neu, e)
      current.dirty = true
    },
    schreibe() {
      rollover()
      return current.dirty ? write(current) : writing
    },
  }
}
