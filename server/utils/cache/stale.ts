/**
 * Stale-while-revalidate with a limit — Nitro's SWR, bounded.
 *
 * WHY. The request-path caches expire after 30 minutes to six hours, and the
 * site is quiet: the visitor after a pause was routinely the one whose
 * request paid the upstream fan-out of an expired entry — 4 to 13 s cold
 * against 0,1 s warm (measured 12.11.2026). `swr: false` was the price of a
 * guarantee: Nitro's own SWR serves an expired entry whatever its age, and
 * writes it without a TTL, so in dev, where that layer lives on disk, the
 * first request after a pause got days-old data (`ttl.ts`).
 *
 * HOW. Nitro (nitropack 2.13, runtime/internal/cache.mjs) counts an entry as
 * expired when it is older than `maxAge` OR `validate` refuses it, and serves
 * the stale entry at once — refreshing behind the request — only where `swr`
 * is on AND `validate` still accepts it; otherwise the caller awaits the
 * fresh value, exactly as with `swr: false`. So a `validate` that refuses an
 * entry older than `limitS` turns the one into the other at that age:
 *
 *  - younger than `maxAgeS`: fresh, served;
 *  - between the two: served to a visitor at once and refreshed in the
 *    background (a direct request waits, see below), one
 *    refresh per key (Nitro shares the pending call). A refresh that throws
 *    is logged and writes nothing, so the next request serves the same entry
 *    and tries again — never past `limitS`;
 *  - older than `limitS`: refused, and the request waits for the fresh value
 *    and gets its error, as without SWR.
 *
 * Nitro stamps `mtime` before it asks `validate` on a write, so a fresh value
 * always passes the limit; `inner` alone decides whether it is stored.
 *
 * WHAT IT DOES NOT BOUND: the age of what a value was BUILT FROM. A value
 * rebuilt over another SWR cache may rest on that cache's stale entry, and
 * then its data is as old as both limits together. Hence the rule in
 * `ttl.ts`: SWR on the layer that pays upstream or a fan-out; a layer that
 * only recomputes cached inputs in milliseconds stays `swr: false`.
 *
 * WHO GETS THE STALE ANSWER: visitors only. A request that reaches the
 * server directly — the prewarm unit, the page prewarm, the watchdog, the
 * Länder archive: curl against 127.0.0.1, no proxy in between — runs
 * `waitingForFresh` (`middleware/guard.ts`), and there `validate` refuses
 * whatever is older than `maxAgeS`, so the request awaits the refresh
 * exactly as with `swr: false`. The prewarm unit's ExecStart lines rely on
 * it: each returns once its build is done, and the next starts after it —
 * served stale, the RIS corpus, both station maps, the Länder and the EU
 * build (185 MB heap peak) would all rebuild behind one burst of curls, at
 * once, on a 320 MB heap.
 *
 * The context is Node's AsyncLocalStorage, so it follows the request into
 * everything it awaits: the resolver Nitro starts for it, the cached
 * functions that resolver calls, and a page's in-process API calls (Nitro's
 * `localFetch` runs them inside the render that made them) — a prewarmed
 * page waits all the way down, a visitor's page nowhere. A visitor who
 * arrives while a waiting request's refresh runs is not held by it: their
 * `validate` runs in their own context, accepts the entry, and Nitro serves
 * it (the refresh is shared, the wait is not). The other way round, a direct
 * request that finds a visitor's refresh running waits for that one; its
 * resolver runs in the visitor's context, so the inputs it reads may be
 * served stale within their limits — the one place a direct request can get
 * a value built on stale inputs, and then only one already in flight.
 *
 * In dev every request is direct (no proxy, no `x-forwarded-for`), so dev
 * behaves as before 12.11.2026, as with `swr: false` — which is what a
 * developer reloading after an edit wants anyway.
 *
 * Memory: an SWR entry is written without a TTL, so the production driver
 * holds one past its limit until the budget needs its room
 * (`memoryDriver.ts`) — held, never served.
 *
 * Pure module, no Nitro globals (`node:async_hooks` is Node's own): the
 * cached functions spread its result into their options, and vitest runs it
 * as it is.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

const waiting = new AsyncLocalStorage<true>()

/**
 * From here on, this request and everything it awaits waits for fresh
 * values (`staleWithin`). `enterWith`, not `run`: the caller is an h3
 * middleware, which returns before the route handler runs, and the context
 * has to outlive it. h3 runs the middleware after its own `onRequest` await,
 * so what is entered belongs to this request's async chain alone, never to
 * the connection (`tests/staleWithin.test.ts` runs that chain through h3).
 */
export function waitForFresh(): void {
  waiting.enterWith(true)
}

/** `fn`, and everything it awaits, waiting for fresh values — the scoped form of `waitForFresh`. */
export function waitingForFresh<T>(fn: () => T): T {
  return waiting.run(true, fn)
}

/** Whether the running request waits for fresh values rather than taking a stale one. */
export function isWaitingForFresh(): boolean {
  return waiting.getStore() === true
}

/** Nitro's cache entry, as far as the limit reads it. */
export interface StaleEntry {
  value?: unknown
  /** When the value was computed, ms — Nitro sets it before it asks `validate`. */
  mtime?: number
}

/** The cache options `staleWithin` sets: spread them into `defineCachedFunction`'s. */
export interface StaleOptions<E extends StaleEntry> {
  maxAge: number
  swr: true
  validate: (entry: E) => boolean
}

/**
 * Fresh for `maxAgeS`, served stale while it refreshes until `limitS` — the
 * oldest an entry may be when a reader gets it. `inner` is the function's own
 * `validate` (`onlyComplete`, `keepIncompleteFor`, a rebuild mark): what it
 * refuses is refused whatever its age, so an incomplete value is never served
 * stale past its own short window.
 */
export function staleWithin<E extends StaleEntry = StaleEntry>(
  maxAgeS: number,
  limitS: number,
  inner?: (entry: E) => boolean,
): StaleOptions<E> {
  // A limit at or below the TTL would be `swr: false` under another name.
  if (!(limitS > maxAgeS)) throw new Error(`staleWithin: the limit (${limitS} s) must exceed maxAge (${maxAgeS} s)`)
  return {
    maxAge: maxAgeS,
    swr: true,
    validate: (entry) => {
      // Nitro's default `validate` refuses `undefined`; replacing it must not lose that.
      if (entry.value === undefined) return false
      if (inner && inner(entry) === false) return false
      // A direct request takes nothing past `maxAgeS`: refused, Nitro makes
      // it await the refresh. Nitro asks `validate` in the caller's own
      // async context — before the resolve and again on the write, where
      // `mtime` is now and the fresh value passes either bound.
      return Date.now() - (entry.mtime ?? 0) <= (isWaitingForFresh() ? maxAgeS : limitS) * 1000
    },
  }
}

/**
 * A mark a build sets after it replaced what a cached function assembles
 * from (the EU map's store, the Bund-zu-Land store): every entry written
 * before the mark is refused, so the next read — the build's own — waits for
 * a fresh assembly.
 *
 * Not `shouldInvalidateCache`, which these maps used before SWR: that only
 * counts the entry as expired, and under SWR Nitro then serves it anyway and
 * refreshes behind the request — the build would read back the map it had
 * just replaced. A refusal from `validate` is the one thing SWR does not
 * serve past.
 *
 * One mark per function, not per key: `validate` sees the entry, not its
 * key. A build therefore also refuses the other periods' maps once — each
 * reassembles on its next read, as on any expiry.
 */
export function rebuildMark(): { set: () => void; accepts: (entry: StaleEntry) => boolean } {
  let at = 0
  return {
    set: () => {
      at = Date.now()
    },
    // Strictly after: an assembly finished in the very millisecond of the
    // mark may have read the old store; refusing it costs one reassembly.
    accepts: (entry) => (entry.mtime ?? 0) > at,
  }
}
