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

/** A reach from what was asked for and what failed, each failure with its cause. */
export function corpusReach(requested: number, unreached: { id: string; cause: string }[]): CorpusReach {
  return { requested, reached: requested - unreached.length, unreached }
}
