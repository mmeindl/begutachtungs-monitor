/**
 * What every harness record says about itself (20.11.2026): when it was
 * measured, on which code, and how much of the corpus it asked for it
 * reached.
 *
 * WHY. `scripts/harness/genauigkeit.ts` puts the figures of several records
 * on one page, and until 20.11.2026 it stamped them with the commit checked
 * out at the moment it wrote: the record of that day named one commit while
 * its parts were measured between 11:52 and 13:21 across three commits to
 * comparison code. A record that names its own code can be held against the
 * others; one that does not can only be trusted.
 *
 * And the corpus: a run that reaches a tenth of what it was asked for prints
 * a complete, plausible report (`kons.ts`, `--discover`, 22.09.2026). The
 * record carries both counts, so the builder can refuse a short one.
 */
import { execSync } from 'node:child_process'

/**
 * Where an uncommitted change moves what a harness measures: the server
 * modules, the shared ones, the harnesses themselves, and the page's own
 * pure functions `accounting.ts` puts the answers through (`app/utils`).
 */
export const MEASURED_PATHS = ['server', 'shared', 'scripts', 'app'] as const

/** The suffix a commit carries when the tree had changes under `MEASURED_PATHS`. */
export const DIRTY = '+dirty'

/** Stands for the commit where git could not say it: never equal to a real one. */
export const UNKNOWN_COMMIT = 'unbekannt'

/**
 * The fewest tries a floored fault class needs before its share says
 * anything: below 20, one miss is five points (`faultInjection.ts`,
 * `--mindestens`).
 */
export const FLOOR_MIN_TRIES = 20

export interface HarnessStamp {
  /** When the record was written, ISO 8601. */
  at: string
  /** `git rev-parse --short=8 HEAD`, with `+dirty` when `MEASURED_PATHS` held changes. */
  commit: string
}

/** How much of its corpus a run reached; `unreached` names the rest, with why. */
export interface CorpusReach {
  requested: number
  reached: number
  unreached: { id: string; cause: string }[]
}

/** The commit a record carries, from git's two answers (pure, for the test). */
export function commitStamp(head: string, porcelain: string): string {
  const hash = head.trim()
  if (!/^[0-9a-f]{7,40}$/.test(hash)) return UNKNOWN_COMMIT
  return porcelain.trim() ? `${hash}${DIRTY}` : hash
}

/** The stamp for a record written now, from the checkout the harness runs in. */
export function harnessStamp(cwd: string = process.cwd()): HarnessStamp {
  const at = new Date().toISOString()
  try {
    const head = execSync('git rev-parse --short=8 HEAD', { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    const porcelain = execSync(`git status --porcelain -- ${MEASURED_PATHS.join(' ')}`, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    return { at, commit: commitStamp(head, porcelain) }
  } catch {
    return { at, commit: UNKNOWN_COMMIT }
  }
}

/**
 * What the floor made of one class: held to it, below it, tried too seldom
 * to be held at all, or a class that cannot occur on this path.
 */
export type FloorStatus = 'gehalten' | 'verfehlt' | 'nicht gehalten' | 'nicht anwendbar'

/** The floor's outcome as a record carries it: `failed`, `unheld` and `notApplicable` by class key. */
export interface FloorResult {
  min: number
  passed: boolean
  failed: string[]
  unheld: string[]
  notApplicable: string[]
}

/**
 * A floor of `min` % over fault classes (`faultInjection.ts --mindestens`).
 * A class tried fewer than `FLOOR_MIN_TRIES` times is not failed — one miss
 * would be five points — and not passed either: it is „nicht gehalten", and
 * the record says so, where until 20.11.2026 the floor skipped it unsaid.
 *
 * „Nicht anwendbar" (21.11.2026) only where the class carries the reason it
 * cannot occur on this path (`notApplicable`) AND was tried not once: a
 * single site refutes the reason, and the class is then held like any other.
 */
export function floorOf(classes: readonly { key: string; tried: number; caught: number; notApplicable?: string }[], min: number): FloorResult & { status: Map<string, FloorStatus> } {
  const status = new Map<string, FloorStatus>()
  for (const c of classes) status.set(c.key, c.tried === 0 && c.notApplicable ? 'nicht anwendbar' : c.tried < FLOOR_MIN_TRIES ? 'nicht gehalten' : (100 * c.caught) / c.tried < min ? 'verfehlt' : 'gehalten')
  const keys = (s: FloorStatus) => [...status].filter(([, v]) => v === s).map(([k]) => k)
  return { min, passed: keys('verfehlt').length === 0, failed: keys('verfehlt'), unheld: keys('nicht gehalten'), notApplicable: keys('nicht anwendbar'), status }
}

/** A reach from what was asked for and what failed, each failure with its cause. */
export function corpusReach(requested: number, unreached: { id: string; cause: string }[]): CorpusReach {
  return { requested, reached: requested - unreached.length, unreached }
}

/** What a cached Länder list held for one Land, and when it was fetched. */
export interface LandListWindow {
  /** The latest Beginn and the latest Frist among its drafts; null where none carries one. */
  newestStart: string | null
  newestDeadline: string | null
  /** Drafts with neither: the window cannot speak for them. */
  undated: number
  /** When the list was fetched: the cache file's time, as `annexReport.ts` `windowOf` gives the Bund's. */
  listFetchedAt: string
}

/**
 * Per Land, the window of the cached Länder list a Länder harness reads
 * (21.11.2026). The harnesses read the list as `corpus:eu-laender` fetched
 * it, and a round's „gemessen am …" said nothing of that day: on
 * 21.11.2026 the list was the one of 04.11.2026, its newest Salzburg draft
 * begun that day.
 */
export function landListWindows(items: readonly { land: string; startedAt: string | null; deadline: string | null }[], fetchedAt: Date): Record<string, LandListWindow> {
  const out: Record<string, LandListWindow> = {}
  for (const i of [...items].sort((a, b) => a.land.localeCompare(b.land))) {
    const w = (out[i.land] ??= { newestStart: null, newestDeadline: null, undated: 0, listFetchedAt: fetchedAt.toISOString() })
    if (i.startedAt && (!w.newestStart || i.startedAt > w.newestStart)) w.newestStart = i.startedAt
    if (i.deadline && (!w.newestDeadline || i.deadline > w.newestDeadline)) w.newestDeadline = i.deadline
    if (!i.startedAt && !i.deadline) w.undated++
  }
  return out
}
