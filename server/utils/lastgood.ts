/**
 * On-disk store for the last-good Stellungnahmen aggregation of one ME
 * (docs/architecture.md §5, cache rule 4).
 *
 * WHY THIS EXISTS: list 142 does not merely hiccup, it loses whole
 * Ministerialentwürfe for days. Measured 2026-08-31 for GP XXVIII: list 81
 * claims 5,969 Stellungnahmen, list 142 delivers 2,908 — 47 of 132 MEs are
 * absent from the index entirely, among them 88/ME with all 707. The
 * in-memory last-good that used to be the only fallback died on every
 * restart and every deploy, so a page that had already lost its live data
 * lost the fallback too.
 *
 * NOT a history layer: exactly one record per ME, overwritten by the next
 * successful fetch. Snapshots over time (deadline extensions, statement
 * growth) are NLnet work package 3 and need a real store, not this.
 *
 * GDPR: what lands here is exactly what the API hands the client —
 * `mapStatementRow` has already dropped the names of private persons
 * (privacy.ts, architecture.md §3). No new class of personal data on disk.
 *
 * PURE MODULE — only relative imports and node: builtins, so vitest can
 * execute it directly.
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { StatementMeta } from '../../shared/types'
import { GP_RE } from '../../shared/utils/gp'

export interface LastGoodStatements {
  items: StatementMeta[]
  /** ISO timestamp of the upstream fetch these items came from. */
  fetchedAt: string
}

/**
 * Bumped whenever the shape of a stored record changes. A record from an
 * older version is dropped, not migrated — it is a fallback, the next
 * successful fetch rewrites it within the cache window.
 */
const RECORD_VERSION = 1

const STATE_SUBDIR = 'statements'

/**
 * Where records live. Resolution order:
 * 1. `BM_STATE_DIR` — explicit override (tests, unusual deployments).
 * 2. `STATE_DIRECTORY` — set by systemd from `StateDirectory=` in the unit
 *    (bootstrap.sh) → `/var/lib/begutachtungs-monitor`. Deliberately
 *    OUTSIDE the app dir: deploy.sh rsyncs `.output/` with `--delete`, so
 *    anything under /srv is gone on the next deploy.
 * 3. `./.data` — dev default (gitignored). Also what a production unit
 *    predating `StateDirectory=` falls back to: the store then survives
 *    restarts but not deploys. Degraded, not broken.
 */
function stateDir(): string {
  const explicit = process.env.BM_STATE_DIR?.trim()
  if (explicit) return join(explicit, STATE_SUBDIR)
  // systemd hands over a colon-separated list; ours is the only entry.
  const systemd = process.env.STATE_DIRECTORY?.split(':')[0]?.trim()
  if (systemd) return join(systemd, STATE_SUBDIR)
  return join(process.cwd(), '.data', STATE_SUBDIR)
}

/**
 * File name for one ME. The name is built from request input, so it is
 * VALIDATED, never sanitized: anything that is not a GP code plus a
 * positive integer has no business producing a path here.
 */
function recordPath(gp: string, inr: number): string | null {
  if (!GP_RE.test(gp)) return null
  if (!Number.isInteger(inr) || inr < 1) return null
  return join(stateDir(), `${gp}-${inr}.json`)
}

const warned = new Set<string>()

/**
 * A broken data directory must be visible in `journalctl` — but once per
 * process and operation, not once per request: a read-only volume would
 * otherwise fill the journal at request rate.
 */
function warnOnce(operation: 'save' | 'load', err: unknown): void {
  if (warned.has(operation)) return
  warned.add(operation)
  console.warn(
    `[last-good] ${operation} failed — the statements fallback is degraded until fixed:`,
    err,
  )
}

/** Distinguishes concurrent temp files of the same process. */
let tmpSeq = 0

/**
 * Writes the record for one ME. Never throws: persistence is a fallback,
 * and a failing disk must not take down a request whose live data was fine.
 */
export async function saveLastGoodStatements(
  gp: string,
  inr: number,
  record: LastGoodStatements,
): Promise<void> {
  const file = recordPath(gp, inr)
  if (!file) return
  // Write-then-rename: a crash mid-write must not leave a truncated record
  // where a valid one was. The temp file is a sibling, so the rename stays
  // inside one filesystem and is atomic.
  const tmp = `${file}.${process.pid}-${++tmpSeq}.tmp`
  try {
    await mkdir(stateDir(), { recursive: true })
    await writeFile(tmp, JSON.stringify({ version: RECORD_VERSION, ...record }), 'utf8')
    await rename(tmp, file)
  } catch (err) {
    warnOnce('save', err)
    await rm(tmp, { force: true }).catch(() => {})
  }
}

/**
 * Reads the record for one ME, or null when there is none, it is
 * unreadable, from an older version, or empty. Anything unexpected is
 * treated as "nothing stored" — the caller's degraded path is a valid
 * answer, a half-parsed record is not.
 */
export async function loadLastGoodStatements(
  gp: string,
  inr: number,
): Promise<LastGoodStatements | null> {
  const file = recordPath(gp, inr)
  if (!file) return null

  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch (err) {
    // No record yet is the normal case on a fresh server — not a warning.
    if ((err as { code?: string }).code !== 'ENOENT') warnOnce('load', err)
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LastGoodStatements> & { version?: unknown }
    if (parsed.version !== RECORD_VERSION) return null
    if (typeof parsed.fetchedAt !== 'string' || !parsed.fetchedAt) return null
    // An empty list carries no information and is exactly the shape the
    // list-142 outage takes — never serve it as a last-good.
    if (!Array.isArray(parsed.items) || parsed.items.length === 0) return null
    return { items: parsed.items, fetchedAt: parsed.fetchedAt }
  } catch {
    return null
  }
}
