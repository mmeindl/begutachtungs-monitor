/**
 * The EU map's facts on disk — one file per Gesetzgebungsperiode
 * (docs/architecture.md §12.66, Nachtrag 3).
 *
 * WHY THIS EXISTS: both production cache layers are memory, and every
 * restart and every deploy empties them (`cache/base.ts`). The map needs
 * the fact of every draft of the window — 156 Ministerialentwürfe, the RIS
 * records without a Gegenstand, 489 Länder drafts — and a cold fact costs a
 * Vorblatt PDF, a law text, the Erläuterungen, a Cellar query and a RIS
 * search per directive; a Land's costs its PDFs, at one request a second
 * where the Land's firewall blocks bursts. Reading all of that nightly and
 * again after every deploy is not acceptable. A draft's fact is stable once
 * its documents are published, so it is kept here and read once.
 *
 * KEPT FRESH BY THREE RULES (`isFresh`):
 *  - the file's `version` carries `EU_READER_VERSION`: a reader that
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
import type { EuPublisher, EuRechtResponse } from '../../../shared/types/eu'
import { GP_RE } from '../../../shared/utils/gp'
import { EU_READER_VERSION } from './readerVersion'

/**
 * Bumped when the FILE's shape changes; the reader version rides along, so
 * one number answers „is this file still what the code would write".
 */
const STORE_SHAPE_VERSION = 1
export const STORE_VERSION = STORE_SHAPE_VERSION * 1000 + EU_READER_VERSION

/** How long an open draft's fact is trusted. */
export const OPEN_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000

const STATE_SUBDIR = 'eu-recht'

/** One draft's stored fact. */
export interface EuStoreEntry {
  /** What the fact was read from (`fingerprintOf`); a different one means read again. */
  fingerprint: string
  /** When it was read, ISO. */
  readAt: string
  fact: EuRechtResponse
}

/** One period's file. */
export interface EuStoreFile {
  version: number
  /** When the last build finished, ISO — the act pages' „Stand". Null while the first build runs. */
  builtAt: string | null
  /** The window the build read (`gpWindow`). */
  window: { from: string; to: string | null } | null
  /** Publishers the last build could not read whole. */
  incomplete: EuPublisher[]
  /** `me:<gp>-<inr>`, `ris:<RIS id>`, `land:<land>-<number>`. */
  entries: Record<string, EuStoreEntry>
}

/** The map's key for a Ministerialentwurf. */
export const meKey = (gp: string, inr: number): string => `me:${gp}-${inr}`
/** The map's key for a RIS record without a Gegenstand. */
export const risKey = (id: string): string => `ris:${id}`
/** The map's key for a Land's draft, by the Land's own number (the id without `<land>-`). */
export const landKey = (land: string, number: string): string => `land:${land}-${number}`

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
export function isFresh(entry: EuStoreEntry | undefined, fingerprint: string, open: boolean, now: number = Date.now()): entry is EuStoreEntry {
  if (!entry || entry.fingerprint !== fingerprint) return false
  if (!open) return true
  const readAt = Date.parse(entry.readAt)
  return Number.isFinite(readAt) && now - readAt < OPEN_DRAFT_MAX_AGE_MS
}

/** An empty file for a period, as the first build starts it. */
export function emptyStore(): EuStoreFile {
  return { version: STORE_VERSION, builtAt: null, window: null, incomplete: [], entries: {} }
}

/**
 * Where files live — `BM_STATE_DIR`, then systemd's `STATE_DIRECTORY`, then
 * `./.data` (the order and the reasons are `parliament/lastgood.ts`'s).
 */
function stateDir(): string {
  const explicit = process.env.BM_STATE_DIR?.trim()
  if (explicit) return join(explicit, STATE_SUBDIR)
  const systemd = process.env.STATE_DIRECTORY?.split(':')[0]?.trim()
  if (systemd) return join(systemd, STATE_SUBDIR)
  return join(process.cwd(), '.data', STATE_SUBDIR)
}

/** The file of one period; VALIDATED, never sanitized — null for anything that is no GP code. */
function storePath(gp: string): string | null {
  if (!GP_RE.test(gp)) return null
  return join(stateDir(), `${gp}.json`)
}

const warned = new Set<string>()

/** A broken data directory is said once per process and operation, not at request rate. */
function warnOnce(operation: 'save' | 'load', err: unknown): void {
  if (warned.has(operation)) return
  warned.add(operation)
  console.warn(`[eu-karte] ${operation} failed — the EU map is read from scratch until fixed:`, err)
}

/**
 * The stored file of one period, or null: none yet, unreadable, or of
 * another version — a file the readers of today would not have written is
 * dropped whole, never half-trusted.
 */
export async function loadEuStore(gp: string): Promise<EuStoreFile | null> {
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
    const parsed = JSON.parse(raw) as Partial<EuStoreFile>
    if (parsed.version !== STORE_VERSION) return null
    if (!parsed.entries || typeof parsed.entries !== 'object' || Array.isArray(parsed.entries)) return null
    return {
      version: STORE_VERSION,
      builtAt: typeof parsed.builtAt === 'string' ? parsed.builtAt : null,
      window: parsed.window ?? null,
      incomplete: Array.isArray(parsed.incomplete) ? parsed.incomplete : [],
      entries: parsed.entries,
    }
  } catch {
    return null
  }
}

/** Distinguishes concurrent temp files of the same process. */
let tmpSeq = 0

/**
 * Writes one period's file: write-then-rename, so a crash mid-write leaves
 * the previous file and never a truncated one. Never throws — a failing disk
 * costs the next build its head start, not this build its answer.
 */
export async function saveEuStore(gp: string, store: EuStoreFile): Promise<boolean> {
  const file = storePath(gp)
  if (!file) return false
  const tmp = `${file}.${process.pid}-${++tmpSeq}.tmp`
  try {
    await mkdir(stateDir(), { recursive: true })
    await writeFile(tmp, JSON.stringify({ ...store, version: STORE_VERSION }), 'utf8')
    await rename(tmp, file)
    return true
  } catch (err) {
    warnOnce('save', err)
    await rm(tmp, { force: true }).catch(() => {})
    return false
  }
}
