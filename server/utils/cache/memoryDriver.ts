/**
 * The memory both cache layers live in, in production (`nuxt.config.ts`,
 * `nitro.storage`): least recently used goes first, bounded by what the
 * entries cost on the heap, and an entry goes once its lifetime is over.
 *
 * It replaces unstorage's `lru-cache` driver, which fell short twice
 * (measured 26.10.2026, the deploy's prewarm and every open draft under the
 * production heap):
 *
 * 1. IT COUNTED A DIFFERENT UNIT THAN THE HEAP PAYS. It weighs an entry as
 *    the UTF-8 length of its JSON, and V8 keeps a string that holds a single
 *    character above U+00FF — „“, –, … in every German document — at two
 *    bytes per character. Every large entry here is such a string: 1,84 heap
 *    bytes per counted byte in `cache`, 1,86 in `derived`, so the budget of
 *    64 + 48 MB stood for ~207 MB of a 384 MB heap. Here a value is kept as
 *    its UTF-8 bytes, one per character of a one-byte string (`pack`): what
 *    the driver counts is what the entry holds, and a German document costs
 *    half of what it did. From about 1 MB on, Node keeps such a string
 *    beside the heap rather than in it (the RIS corpus, 10 MB); counted all
 *    the same. The price is paid on a hit, which decodes the bytes back
 *    before Nitro parses the JSON — about as long again as the parse.
 * 2. IT KEPT WHAT NITRO NEVER SERVES AGAIN. Nitro hands a cached function's
 *    `maxAge` to every write as `ttl`, where `swr` is off (nitropack 2.13,
 *    runtime/internal/cache.mjs, `setOpts`); the old driver dropped it, so an
 *    expired entry held its place until the budget pushed it out — the 878
 *    Parliament records a station map reads stayed for hours past their 30
 *    minutes. Here it goes once its `ttl` has passed. No answer changes:
 *    Nitro stamps `mtime` a moment before the write, so by then it counts
 *    the entry as expired itself, and an expired `swr: false` entry is never
 *    served, only computed again. An `swr` entry carries no `ttl` and stays
 *    until the budget needs its room, as before.
 *
 * Pure module, no Nitro globals — vitest runs it as it is. Nitro imports the
 * default export by path and calls it with the mount's options, which pass
 * through JSON: numbers only.
 */

export interface MemoryDriverOptions {
  /** Heap bytes all entries may take together, keys and bookkeeping included. */
  maxSize: number
  /** How many entries at most, whatever their size. */
  max: number
}

/**
 * What an entry costs beside its key and its value: the map's slot, the
 * record below, the two string headers and the expiry. An estimate of V8's
 * layout, not a measurement; it matters only where entries are tiny —
 * `statement-document` writes one per Stellungnahme, hundreds per draft.
 */
export const ENTRY_OVERHEAD = 128

interface Entry {
  /** The value's UTF-8 bytes, one per character (`pack`). */
  packed: string
  /** What the entry counts against `maxSize`. */
  size: number
  /** Epoch ms after which the entry is gone; `Infinity` without a `ttl`. */
  expires: number
}

/** The UTF-8 bytes of `text`, one per character of a one-byte string. */
export function pack(text: string): string {
  return Buffer.from(text, 'utf8').toString('latin1')
}

/** The text `pack` was given, exactly: UTF-8 round-trips every string `JSON.stringify` writes. */
export function unpack(packed: string): string {
  return Buffer.from(packed, 'latin1').toString('utf8')
}

/** A sweep for expired entries runs at most this often, on a read or a write — never on a timer. */
const SWEEP_EVERY_MS = 60_000

export interface MemoryLru {
  get(key: string): string | null
  has(key: string): boolean
  /** `ttlSeconds` as Nitro passes it; absent or 0, the entry stays until the budget needs its room. */
  set(key: string, value: string, ttlSeconds?: number): void
  delete(key: string): void
  keys(): string[]
  clear(): void
  /** Entries and counted bytes — what a test or a measurement reads. */
  readonly size: number
  readonly calculatedSize: number
}

export function createMemoryLru({ maxSize, max }: MemoryDriverOptions, now: () => number = Date.now): MemoryLru {
  // A Map iterates in insertion order, and a read moves its entry to the
  // end: the first key is always the one used longest ago.
  const entries = new Map<string, Entry>()
  let counted = 0
  let lastSweep = now()

  function drop(key: string, entry: Entry): void {
    entries.delete(key)
    counted -= entry.size
  }

  function sweep(): void {
    const t = now()
    if (t - lastSweep < SWEEP_EVERY_MS) return
    lastSweep = t
    for (const [key, entry] of entries) if (entry.expires < t) drop(key, entry)
  }

  /** The entry, unless its lifetime is over — then it is dropped on the spot. */
  function live(key: string): Entry | undefined {
    const entry = entries.get(key)
    if (entry && entry.expires < now()) {
      drop(key, entry)
      return undefined
    }
    return entry
  }

  return {
    get(key) {
      sweep()
      const entry = live(key)
      if (!entry) return null
      entries.delete(key)
      entries.set(key, entry)
      return unpack(entry.packed)
    },
    has(key) {
      return live(key) !== undefined
    },
    set(key, value, ttlSeconds) {
      sweep()
      const old = entries.get(key)
      if (old) drop(key, old)
      const packed = pack(value)
      const size = key.length + packed.length + ENTRY_OVERHEAD
      // Larger than the whole budget: not kept, as `lru-cache` did with it.
      if (size > maxSize) return
      entries.set(key, { packed, size, expires: ttlSeconds ? now() + ttlSeconds * 1000 : Infinity })
      counted += size
      for (const [k, entry] of entries) {
        if (counted <= maxSize && entries.size <= max) break
        drop(k, entry)
      }
    },
    delete(key) {
      const entry = entries.get(key)
      if (entry) drop(key, entry)
    },
    keys() {
      sweep()
      return [...entries.keys()].filter((key) => live(key) !== undefined)
    },
    clear() {
      entries.clear()
      counted = 0
    },
    get size() {
      return entries.size
    },
    get calculatedSize() {
      return counted
    },
  }
}

/**
 * The unstorage driver around it — the shape `lru-cache`'s had, so Nitro and
 * a measurement read it the same way (`getInstance().calculatedSize`).
 * unstorage hands `setItem` the value already serialised, and parses what
 * `getItem` returns.
 */
export default function memoryDriver(options: MemoryDriverOptions) {
  const lru = createMemoryLru(options)
  return {
    name: 'memory-lru',
    options,
    getInstance: () => lru,
    hasItem: (key: string) => lru.has(key),
    getItem: (key: string) => lru.get(key),
    setItem: (key: string, value: string, opts?: { ttl?: number }) => lru.set(key, value, opts?.ttl),
    removeItem: (key: string) => lru.delete(key),
    getKeys: () => lru.keys(),
    clear: () => lru.clear(),
    dispose: () => lru.clear(),
  }
}
