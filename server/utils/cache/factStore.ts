/**
 * A period's facts on disk — one file per Gesetzgebungsperiode, one
 * directory per kind of fact: the EU map's (`eu/euMapStore.ts`) and the
 * Bund-zu-Land map's (`bund-land/bundLandStore.ts`).
 *
 * WHY THIS EXISTS: both production cache layers are memory, and every
 * restart and every deploy empties them (`cache/base.ts`). A map needs the
 * fact of every draft of the window, and a cold fact costs PDFs, law
 * texts and searches — a Land's at one request a second where its firewall
 * blocks bursts. A draft's fact is stable once its documents are
 * published, so it is kept here and read once.
 *
 * KEPT FRESH BY THREE RULES (`isFresh`):
 *  - the file's `version` carries the reader's version: a reader that
 *    changes what it says drops the whole file;
 *  - the entry's `fingerprint` is the draft's documents and dates: a
 *    document added or replaced, a Frist moved, means a new reading;
 *  - an OPEN draft's fact is read again after 24 h, because a Begutachtung
 *    that runs may still gain a document under the same address.
 *
 * NOTHING PERSONAL: a fact holds document URLs, markers, acts and dates —
 * no submitter, no name.
 *
 * PURE MODULE — only relative imports and node: builtins, so vitest can
 * execute it directly. The state directory is resolved exactly like the
 * last-good store's (`parliament/lastgood.ts`).
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { GP_RE } from '../../../shared/utils/gp'

/** How long an open draft's fact is trusted. */
export const OPEN_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000

/** One draft's stored fact. */
export interface StoreEntry<F> {
  /** What the fact was read from (`fingerprintOf`); a different one means read again. */
  fingerprint: string
  /** When it was read, ISO. */
  readAt: string
  fact: F
}

/** One period's file. `P` names the publishers a build could not read whole. */
export interface StoreFile<F, P extends string = string> {
  version: number
  /** When the last build finished, ISO — the act pages' „Stand". Null while the first build runs. */
  builtAt: string | null
  /** The window the build read (`gpWindow`). */
  window: { from: string; to: string | null } | null
  /** Publishers the last build could not read whole. */
  incomplete: P[]
  /** The map's keys (`me:`, `ris:`, `land:`) to each draft's fact. */
  entries: Record<string, StoreEntry<F>>
}

/**
 * The documents and dates a fact rests on, as one string. The URLs sorted,
 * so an order upstream happened to list them in is no change; empty and
 * missing ones dropped. The dates follow after a bar, named, so a URL can
 * never pose as a date.
 */
export function fingerprintOf(urls: readonly (string | null | undefined)[], dates: Record<string, string | null | undefined>): string {
  const docs = [...new Set(urls.filter((u): u is string => typeof u === 'string' && u.length > 0))].sort()
  const named = Object.keys(dates).sort().map((k) => `${k}=${dates[k] ?? ''}`)
  return `${docs.join(' ')}|${named.join(';')}`
}

/**
 * Whether a stored entry may stand in for a new reading: the same
 * fingerprint, and — for a draft whose Begutachtung still runs — read in
 * the last 24 hours. The version is the file's, checked on load.
 */
export function isFresh<F>(entry: StoreEntry<F> | undefined, fingerprint: string, open: boolean, now: number = Date.now()): entry is StoreEntry<F> {
  if (!entry || entry.fingerprint !== fingerprint) return false
  if (!open) return true
  const readAt = Date.parse(entry.readAt)
  return Number.isFinite(readAt) && now - readAt < OPEN_DRAFT_MAX_AGE_MS
}

/**
 * Where files live — `BM_STATE_DIR`, then systemd's `STATE_DIRECTORY`, then
 * `./.data` (the order and the reasons are `parliament/lastgood.ts`'s).
 */
function stateDir(subdir: string): string {
  const explicit = process.env.BM_STATE_DIR?.trim()
  if (explicit) return join(explicit, subdir)
  const systemd = process.env.STATE_DIRECTORY?.split(':')[0]?.trim()
  if (systemd) return join(systemd, subdir)
  return join(process.cwd(), '.data', subdir)
}

/** One kind of fact's store. */
export interface FactStore<F, P extends string = string> {
  /** The file version: shape × 1000 + the reader's version. */
  version: number
  /** An empty file for a period, as the first build starts it. */
  empty(): StoreFile<F, P>
  /**
   * The stored file of one period, or null: none yet, unreadable, or of
   * another version — a file the readers of today would not have written is
   * dropped whole, never half-trusted.
   */
  load(gp: string): Promise<StoreFile<F, P> | null>
  /**
   * Writes one period's file: write-then-rename, so a crash mid-write leaves
   * the previous file and never a truncated one. Never throws — a failing
   * disk costs the next build its head start, not this build its answer.
   */
  save(gp: string, store: StoreFile<F, P>): Promise<boolean>
}

/** Distinguishes concurrent temp files of the same process. */
let tmpSeq = 0

/**
 * A store under `<stateDir>/<subdir>/<GP>.json`. `shape` is bumped when the
 * FILE's shape changes; `readerVersion` rides along, so one number answers
 * „is this file still what the code would write". `label` names it in the
 * log.
 */
export function createFactStore<F, P extends string = string>(opts: { subdir: string; shape: number; readerVersion: number; label: string }): FactStore<F, P> {
  const version = opts.shape * 1000 + opts.readerVersion
  const warned = new Set<string>()
  /** A broken data directory is said once per process and operation, not at request rate. */
  const warnOnce = (operation: 'save' | 'load', err: unknown): void => {
    if (warned.has(operation)) return
    warned.add(operation)
    console.warn(`[${opts.label}] ${operation} failed — the map is read from scratch until fixed:`, err)
  }
  /** The file of one period; VALIDATED, never sanitized — null for anything that is no GP code. */
  const storePath = (gp: string): string | null => (GP_RE.test(gp) ? join(stateDir(opts.subdir), `${gp}.json`) : null)

  return {
    version,
    empty: () => ({ version, builtAt: null, window: null, incomplete: [], entries: {} }),
    async load(gp) {
      const file = storePath(gp)
      if (!file) return null
      let raw: string
      try {
        raw = await readFile(file, 'utf8')
      } catch (err) {
        if ((err as { code?: string }).code !== 'ENOENT') warnOnce('load', err)
        return null
      }
      try {
        const parsed = JSON.parse(raw) as Partial<StoreFile<F, P>>
        if (parsed.version !== version) return null
        if (!parsed.entries || typeof parsed.entries !== 'object' || Array.isArray(parsed.entries)) return null
        return {
          version,
          builtAt: typeof parsed.builtAt === 'string' ? parsed.builtAt : null,
          window: parsed.window ?? null,
          incomplete: Array.isArray(parsed.incomplete) ? parsed.incomplete : [],
          entries: parsed.entries,
        }
      } catch {
        return null
      }
    },
    async save(gp, store) {
      const file = storePath(gp)
      if (!file) return false
      const tmp = `${file}.${process.pid}-${++tmpSeq}.tmp`
      try {
        await mkdir(stateDir(opts.subdir), { recursive: true })
        await writeFile(tmp, JSON.stringify({ ...store, version }), 'utf8')
        await rename(tmp, file)
        return true
      } catch (err) {
        warnOnce('save', err)
        await rm(tmp, { force: true }).catch(() => {})
        return false
      }
    },
  }
}
