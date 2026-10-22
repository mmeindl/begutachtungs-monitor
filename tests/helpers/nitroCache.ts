/**
 * Nitro's `defineCachedFunction` as a cache that KEEPS — for the tests of
 * the §12.13 rule (docs/architecture.md): a failure must never be stored as
 * an answer.
 *
 * `bgblService.test.ts` replaces the wrapper with a pass-through, which is
 * right for what that file reads (which cache NAME ran). A failure test
 * reads something else: whether the second call, after upstream recovered,
 * still gets the first call's answer. That needs a cache, and one that
 * decides the way Nitro's does — nitropack 2.13, runtime/internal/cache.mjs,
 * with `swr: false` as every cached function here sets it:
 *
 *  - a throw stores nothing;
 *  - a value is stored unless `validate` refuses it, and by default it
 *    refuses only `undefined`;
 *  - a stored entry is served while it is no older than `maxAge` and
 *    `validate` still accepts it — Nitro asks `validate` on every read, with
 *    the entry's `mtime` — else the function runs again;
 *  - what comes back out of the store went through JSON, as it does through
 *    Nitro's storage (a Map returns as `{}`, `ris/konsLaw.ts` learned that).
 *
 * Not modelled: SWR, the integrity hash, the in-flight dedup. None of them
 * decides whether a failure is kept.
 *
 * Install it before the module under test is imported — the wrapper runs at
 * module load:
 *
 *     vi.stubGlobal('defineCachedFunction', nitroCachedFunction)
 *     const { getX } = await import('../server/utils/…')
 */

interface Entry {
  value?: unknown
  mtime?: number
}

interface Options<A extends unknown[]> {
  name: string
  getKey?: (...args: A) => string
  maxAge?: number
  validate?: (entry: Entry) => boolean
  shouldBypassCache?: (...args: A) => boolean
}

/** Every stored entry, serialised, under `name:key`. */
const store = new Map<string, string>()

export function nitroCachedFunction<A extends unknown[], T>(
  fn: (...args: A) => Promise<T>,
  opts: Options<A>,
): (...args: A) => Promise<T> {
  const validate = opts.validate ?? ((entry: Entry) => entry.value !== undefined)
  // Nitro's default `maxAge` is one second (`defaultCacheOptions`).
  const ttlMs = (opts.maxAge ?? 1) * 1000
  return async (...args: A): Promise<T> => {
    if (opts.shouldBypassCache?.(...args)) return fn(...args)
    const key = `${opts.name}:${opts.getKey ? opts.getKey(...args) : JSON.stringify(args)}`
    const raw = store.get(key)
    const stored = raw === undefined ? undefined : (JSON.parse(raw) as Entry)
    if (stored && Date.now() - (stored.mtime ?? 0) <= ttlMs && validate(stored) !== false) {
      return stored.value as T
    }
    // A throw leaves here before anything is written.
    const entry: Entry = { value: await fn(...args), mtime: Date.now() }
    if (validate(entry) !== false) store.set(key, JSON.stringify(entry))
    return entry.value as T
  }
}

/** Empties the store — between tests, so no answer leaks from one into the next. */
export function clearNitroCache(): void {
  store.clear()
}

/** The `name:key` of every stored entry, for asserting what was — and was not — kept. */
export function nitroCacheKeys(): string[] {
  return [...store.keys()]
}
