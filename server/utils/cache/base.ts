/**
 * Two cache layers, split by who produced the value.
 *
 * Nitro's dev cache is a directory: `defineCachedFunction` writes to
 * `.nuxt/cache/nitro/functions/<name>/`, and the entries outlive the dev
 * server. Nitro does guard against stale
 * code, but only for the wrapped function's own body: the default integrity
 * is `hash([fn, opts])`, and `fn.toString()` says nothing about the parser
 * the closure calls in another module — and where a function takes SWR
 * (`stale.ts`), even a changed body only marks the entry expired: it is
 * served once more, within its stale limit, while the new code refreshes it.
 * So editing a parser leaves localhost
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
 *    mount, on disk in dev, so a restart does not re-fetch half of RIS —
 *    or, where it can never change, in `DOCUMENT_CACHE` below.
 *  - **something we computed** — a parse, a diff, a join. Stale the moment
 *    its parser changes, and the cheap half: milliseconds, off documents
 *    that are already local. Goes here. In dev this mount is memory, so it
 *    dies with the Nitro worker, which is to say with every edit to a
 *    server file.
 *
 * In production both layers are memory, each a size-bounded LRU
 * (`nuxt.config.ts`, `nitro.storage`, `memoryDriver.ts`), and `systemctl
 * restart` empties them (`deploy/deploy.sh`). The bound is the LRU's and
 * nothing else's: Nitro never deletes an expired entry itself, and the
 * driver lets one go once its `maxAge` has passed — but a TTL is no memory
 * limit, a burst of fresh entries meets only the budget, and an entry
 * evicted early is simply fetched again.
 *
 * ONE PART OF THE FETCHED HALF IS ON DISK IN PRODUCTION TOO (12.11.2026):
 * `DOCUMENT_CACHE`, a published document that never changes, kept for
 * `PUBLISHED_DOCUMENT_TTL_S` in the systemd StateDirectory
 * (`documentDriver.ts`), so a deploy no longer sends the first reader of a
 * draft's comparisons back to RIS and Parliament for every law text and §
 * document. That saves requests, not the wait: what a cold comparison waited
 * on was RIS's QUERY answers — a law's §§ on the draft's day, its history —
 * which stay off the disk (an answer read before RIS consolidated an
 * amendment would stand for a month). 95/ME's Gegenüberstellung took 7,6 s
 * cold before the disk and 8,2 s after a restart with its documents on it;
 * what shortened it was reading those answers' pages together
 * (`upstream/pages.ts`, 8,5 → 3,7 s). Only what cannot change goes there: a list, a
 * search answer, a Gegenstand record would be pinned for a month across
 * every restart, and a Stellungnahme — or anything a Stellungnahme passes
 * through — never goes to disk at all. `tests/cacheLayers.test.ts` holds the
 * names to a hard-coded list.
 *
 * A function that fetches *and* parses belongs to neither layer and cannot
 * be made correct while it stays one function — any invalidation that
 * catches the parse throws away the fetch with it. Split those in two, a
 * cached fetch under a fresh parse, as `diff/paraTitleService.ts` and `ris/begutCorpus.ts`
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

/** The disk mount for published documents that never change — see above, and `documentDriver.ts`. */
export const DOCUMENT_CACHE = '/documents'
