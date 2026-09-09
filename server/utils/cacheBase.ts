/**
 * Two cache layers, split by who produced the value
 * (docs/architecture.md §5, cache rule 5).
 *
 * Nitro's dev cache is a directory: `defineCachedFunction` writes to
 * `.nuxt/cache/nitro/functions/<name>/`, and the entries outlive the dev
 * server — `maxAge` is a day, `swr` is false. Nitro does guard against stale
 * code, but only for the wrapped function's own body: the default integrity
 * is `hash([fn, opts])`, and `fn.toString()` says nothing about the parser
 * the closure calls in another module. So editing a parser leaves localhost
 * serving yesterday's parse, with nothing on screen to say so. That cost an
 * hour on 2026-09-09, and worse than the hour: the stale page read as
 * evidence that a fix had not worked.
 *
 * The fix is to split the caches by provenance rather than to remember which
 * ones to delete. A cache entry is either
 *
 *  - **a document we fetched** — a published RIS or Parliament document as
 *    it arrived. It cannot go stale against our code, because our code did
 *    not make it, and it is the expensive half. Stays in the default `cache`
 *    mount, on disk in dev, so a restart does not re-fetch half of RIS.
 *  - **something we computed** — a parse, a diff, a join. Stale the moment
 *    its parser changes, and the cheap half: milliseconds, off documents
 *    that are already local. Goes here. In dev this mount is memory, so it
 *    dies with the Nitro worker, which is to say with every edit to a
 *    server file.
 *
 * Production is unaffected either way: the `node-server` preset mounts no
 * storage, so both layers are memory there and `systemctl restart` empties
 * them (`deploy/deploy.sh`).
 *
 * A function that fetches *and* parses belongs to neither layer and cannot
 * be made correct while it stays one function — any invalidation that
 * catches the parse throws away the fetch with it. Split those in two, a
 * cached fetch under a fresh parse, as `paraTitleService.ts` and `ris.ts`
 * do; do not pick which half to get wrong. `tests/cacheLayers.test.ts`
 * holds every cached function to that choice.
 *
 * A third case decides itself: a response that may not be persisted at all.
 * List 142 names private persons, so it gets no cached fetch — only the
 * classified rows above it are kept, and those are derived, hence memory.
 * The rule that falls out is simpler than the exception it replaced: **the
 * directory on disk holds upstream payloads and nothing else.**
 */
export const DERIVED_CACHE = '/derived'
