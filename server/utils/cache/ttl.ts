/**
 * The three cache lifetimes that mean something, with the argument for each
 * written down once (`base.ts` says in which LAYER a value belongs, this
 * says for how long).
 *
 * Sixteen `const TTL_S = 60 * 60 * 24` in ten files said the same thing
 * without saying why, and a number that appears sixteen times is no longer
 * a decision anyone can revise. A local name stays local wherever it
 * carries a DIFFERENT argument — `RIS_CORPUS_TTL_S` is 20 h and not 24 so
 * the daily prewarm never meets a still-valid cache, and that is a reason,
 * not a rounding.
 */

/**
 * One upstream list answer.
 *
 * `swr: false` is NOT redundant next to it: Nitro defaults to `swr: true`
 * (nitropack .../internal/cache.mjs, defaultCacheOptions). With SWR an
 * expired entry keeps serving the OLD value and only revalidates in the
 * background — and the storage entry is written without a TTL (`setOpts`
 * exists only for `maxAge && !swr`). In dev mode the cache lives on disk
 * (.nuxt/cache) and survives restarts: the first request after a pause used
 * to get days-old data this way. Price of `swr: false`: one upstream round
 * trip per TTL window lands on a single request's latency.
 */
export const UPSTREAM_LIST_TTL_S = 60 * 30

/**
 * Anything this code derived from a document it already has: a parse, a
 * diff, a join, a coverage verdict.
 *
 * A day, because the inputs are published documents that do not move and
 * the output is cheap to rebuild — and because the answer a reader gets
 * should not be older than the day they ask on. The layer underneath is
 * `DERIVED_CACHE`, so in dev these die with the worker anyway and the
 * number only matters in production.
 */
export const DERIVED_ANALYSIS_TTL_S = 60 * 60 * 24

/**
 * A document the ressort or RIS published, byte for byte.
 *
 * A month, because it is written once and never revised: a corrected draft
 * gets a new record, and a NOR version document is fixed by definition. It
 * cannot go stale against our code either, because our code did not make it
 * (`base.ts`).
 */
export const PUBLISHED_DOCUMENT_TTL_S = 60 * 60 * 24 * 30
