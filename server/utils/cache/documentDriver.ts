/**
 * The disk the published documents are kept on — the `documents` mount
 * (`nuxt.config.ts`, `nitro.storage`; `DOCUMENT_CACHE` in `base.ts`) in
 * production. Dev mounts `fs-lite` at `.data/documents` in its place — the
 * same files in the same layout; Nitro's builder process cannot import a
 * `#server/…` driver (`nitro.devStorage`, 12.11.2026).
 *
 * WHY. Both memory layers die with every deploy and every restart, and the
 * first reader of a draft's comparisons then paid for every law text and §
 * document again. Those documents are written once and never revised
 * (`ttl.ts`, `PUBLISHED_DOCUMENT_TTL_S`), so a copy on disk is as good a
 * month later as the minute it arrived.
 *
 * WHAT IT DOES NOT DO: shorten a cold comparison by much. `/api/drafts/
 * XXVIII/95/gegenueberstellung` took 7,6 s cold before this disk and 8,2 s
 * after a restart with its documents on it (12.11.2026): the wait was RIS's
 * query answers — a law's §§ on the draft's day, its version history —
 * which stay off the disk (`base.ts`), not the documents. Reading their pages
 * together shortened it (`upstream/pages.ts`).
 *
 * WHY OUR OWN DRIVER and not unstorage's `fs-lite`, which this is modelled
 * on (a file per key, no watcher):
 *
 *  1. THE PATH IS A RUNTIME FACT. `nitro.storage` reaches the bundle as JSON
 *     written at build time, on another machine; the server learns its
 *     directory from systemd's `STATE_DIRECTORY` only when it starts. This
 *     module is called with the mount's options when the bundle's storage is
 *     set up — at server start, before the first request, like the memory
 *     layers' driver beside it — and asks `stateDir` then.
 *  2. unstorage is not a dependency of this project, only of Nitro's; under
 *     pnpm the server code cannot import it (not resolvable from the project
 *     root, not typed), and a driver Nitro imports by our path is bundled
 *     the way `memoryDriver.ts` is.
 *  3. A WRITE IS ATOMIC: written beside the target and renamed over it, so a
 *     crash mid-write leaves the previous file or none — `fs-lite` writes in
 *     place. (Nitro would survive a torn file — a value that is no object
 *     counts as a miss — but would log it as malformed on every read.)
 *
 * WHAT IT IGNORES: the `ttl` Nitro passes with a write. Nitro checks
 * `maxAge` on every read against the entry's own `mtime` and computes an
 * expired entry again, overwriting the file, so no answer is ever older than
 * the cached function allows. What a TTL would also do — let go of an entry
 * nobody asks for again — is the nightly prewarm unit's `find … -mtime +31
 * -delete` (`deploy/systemd/begutachtungs-monitor-prewarm.service`).
 *
 * A WRITE IN FLIGHT IS READ FROM MEMORY (12.11.2026). Nitro lets go of a
 * pending call the moment its value is in and only then starts the write
 * (nitropack, runtime/internal/cache.mjs): a second caller that asks in
 * between finds neither the pending call nor the file, and fetches the
 * document again. In memory that window is a tick; on disk it is the write
 * — 95/ME's Regierungsvorlage was fetched twice in one request, the diff
 * and the § names a few milliseconds apart. So a value being written is
 * answered from the write itself until the file stands.
 *
 * A FAILING DISK costs the cache, never the answer: a read that fails is a
 * miss, a write that fails is dropped, and each is said once per process —
 * a read-only volume would otherwise fill the journal at request rate.
 *
 * Pure module, only node: builtins — vitest runs it as it is.
 */
import { existsSync, type Dirent } from 'node:fs'
import { mkdir, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { stateDir } from './stateDir'

/** The directory below the state directory; the prewarm unit's cleanup names the same one. */
export const DOCUMENTS_SUBDIR = 'documents'

/** What a write in flight is called until it is renamed into place — never a key. */
const TMP_SUFFIX = '.tmp'

/** Distinguishes concurrent temp files of the same process. */
let tmpSeq = 0

/**
 * The file of one key: its `:`-separated segments as directories below
 * `base`. unstorage refuses a key with a `.` or `..` segment before a driver
 * sees it (`cache/key.ts`); refused here once more, because this is the line
 * where a key becomes a path.
 */
export function documentPath(base: string, key: string): string {
  const segments = key.split(':')
  if (segments.some((s) => s === '' || s === '.' || s === '..' || s.includes('/') || s.includes('\\'))) {
    throw new Error(`[documents] refused key ${JSON.stringify(key)}`)
  }
  return join(base, ...segments)
}

async function walk(dir: string, prefix: string[]): Promise<string[]> {
  let entries: Dirent[]
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out: string[] = []
  for (const entry of entries) {
    if (entry.isDirectory()) out.push(...(await walk(join(dir, entry.name), [...prefix, entry.name])))
    else if (!entry.name.endsWith(TMP_SUFFIX)) out.push([...prefix, entry.name].join(':'))
  }
  return out
}

/**
 * The unstorage driver. `base` is for tests; the mount passes none, and the
 * directory is `<state directory>/documents`, resolved now — at mount time.
 */
export default function documentDriver(options: { base?: string } = {}) {
  const base = options.base ?? stateDir(DOCUMENTS_SUBDIR)
  const warned = new Set<string>()
  const warnOnce = (operation: 'read' | 'write', err: unknown): void => {
    if (warned.has(operation)) return
    warned.add(operation)
    console.warn(`[documents] ${operation} failed under ${base} — the documents are fetched again until fixed:`, err)
  }

  /** The values being written now, by key — read before the disk (see above). */
  const writing = new Map<string, string>()

  return {
    name: 'documents-fs',
    options: { base },
    hasItem: (key: string) => writing.has(key) || existsSync(documentPath(base, key)),
    async getItem(key: string): Promise<string | null> {
      const file = documentPath(base, key)
      const inFlight = writing.get(key)
      if (inFlight !== undefined) return inFlight
      try {
        return await readFile(file, 'utf8')
      } catch (err) {
        const code = (err as { code?: string }).code
        if (code !== 'ENOENT' && code !== 'EISDIR') warnOnce('read', err)
        // A write may have begun while the read was out.
        return writing.get(key) ?? null
      }
    },
    async setItem(key: string, value: string): Promise<void> {
      const file = documentPath(base, key)
      const tmp = `${file}.${process.pid}-${++tmpSeq}${TMP_SUFFIX}`
      writing.set(key, value)
      try {
        await mkdir(dirname(file), { recursive: true })
        await writeFile(tmp, value, 'utf8')
        await rename(tmp, file)
      } catch (err) {
        warnOnce('write', err)
        await rm(tmp, { force: true }).catch(() => {})
      } finally {
        // Only our own value: a later write of the same key keeps its entry.
        if (writing.get(key) === value) writing.delete(key)
      }
    },
    async removeItem(key: string): Promise<void> {
      await unlink(documentPath(base, key)).catch(() => {})
    },
    getKeys: () => walk(base, []),
  }
}
