/**
 * The cache lifetimes that mean something, with the argument for each
 * written down once (`base.ts` says in which LAYER a value belongs, this
 * says for how long).
 *
 * Sixteen `const TTL_S = 60 * 60 * 24` in ten files said the same thing
 * without saying why, and a number that appears sixteen times is no longer
 * a decision anyone can revise. A local name stays local wherever it
 * carries a DIFFERENT argument — `RIS_CORPUS_TTL_S` is 20 h and not 24 so
 * the daily prewarm never meets a still-valid cache, and that is a reason,
 * not a rounding. The stale limits below are each written down here, with
 * their argument, for the same reason.
 */

/**
 * One upstream list answer.
 *
 * NEVER NITRO'S PLAIN SWR. Nitro defaults to `swr: true` (nitropack
 * .../internal/cache.mjs, defaultCacheOptions): an expired entry keeps
 * serving the OLD value, whatever its age, and only revalidates in the
 * background — and the storage entry is written without a TTL (`setOpts`
 * exists only for `maxAge && !swr`). In dev mode the cache lives on disk
 * (.nuxt/cache) and survives restarts: the first request after a pause used
 * to get days-old data this way.
 *
 * So a cached function says `swr: false`, or takes SWR from `staleWithin`
 * (`stale.ts`, 12.11.2026), whose `validate` refuses an entry past a stated
 * limit — and a refused entry is the one thing Nitro's SWR does not serve:
 * the request waits for the fresh value, as with `swr: false`. The days-old
 * answer cannot come back; what remains is an answer at most as old as the
 * limits below. `tests/cacheLayers.test.ts` holds every cached function to
 * one of the two. And only visitors get a stale answer: a request that
 * reaches the server directly — prewarm, watchdog, archive, all of dev —
 * waits for the fresh value as with `swr: false`, so the prewarm's builds
 * still run one after another (`stale.ts`, „who gets the stale answer").
 *
 * Why SWR at all: `swr: false` put one upstream round trip per TTL window on
 * a single request's latency, and on a quiet site that request was nearly
 * always somebody's — 4 to 13 s cold against 0,1 s warm (12.11.2026).
 */
export const UPSTREAM_LIST_TTL_S = 60 * 30

/*
 * STALE LIMITS — the oldest an entry may be when a visitor gets it, while it
 * refreshes behind them (`staleWithin`); a direct request takes nothing
 * past the TTL. Two rules decide where one applies:
 *
 *  - Only where the rebuild pays upstream or a fan-out. A layer that merely
 *    recomputes cached inputs in milliseconds stays `swr: false`: SWR there
 *    buys nothing, and stacked on an SWR input it would add its own limit to
 *    the age of the data (`stale.ts`, „what it does not bound").
 *  - Never where a stale answer is a claim the page makes about now: the
 *    Stellungnahmen (list 142, a Land's page of them) stay `swr: false`.
 */

/** Lists and Gegenstand records — they move within a day, and three hours keep a quiet evening warm. */
export const LIST_STALE_S = 60 * 60 * 3

/** The RIS↔ME join and the RIS-only list: six hours bound how long a record a draft has since claimed can still read as one without a Gegenstand. */
export const RIS_JOIN_STALE_S = 60 * 60 * 6

/** The running Bundesgesetzblatt year — a Kundmachung missing from a stale volume reads „nicht kundgemacht", so twice its TTL and no more. */
export const BGBL_RUNNING_STALE_S = 60 * 60 * 12

/** What moves on the scale of days — a period's station map, a Land's register or gazette: a day past its six hours. */
export const DAY_STALE_S = 60 * 60 * 24

/** The RIS corpus, 46 pages that change a few times a week: two days, so one missed nightly prewarm never makes a visitor pay for it. */
export const RIS_CORPUS_STALE_S = 60 * 60 * 48

/** What does not move once read — a closed year or period, a letter, a decided Kundmachung: a fortnight, a week past its week. */
export const SETTLED_STALE_S = 60 * 60 * 24 * 14

/**
 * A law's §§ as RIS says they stood on a draft's day (`kons/konsCache.ts`,
 * `readKonsRecords`): that day is past, and the answer moves only where RIS
 * corrects a consolidation — three days, two past its day, so a quiet
 * weekend never makes a visitor wait out the pages. Only for a day at least
 * `KONS_RECENT_DAYS` back; a recent day is held to its TTL (12.11.2026).
 */
export const KONS_RECORDS_STALE_S = 60 * 60 * 24 * 3

/**
 * How far back a day must lie before RIS's law on it counts as settled: RIS
 * works an amendment in „days to weeks" after its Kundmachung
 * (`app/utils/geltendeFassung.ts`), so a month. Inside it, the law on that
 * day may still gain the version an amendment made, and is not served past
 * its TTL — a draft's first month, which since the pages come together
 * (`upstream/pages.ts`) costs a visitor a second or two once a day, not ten.
 */
export const KONS_RECENT_DAYS = 30

/**
 * A law's version history (`readParagraphHistory`), read only to bridge a §
 * RIS has no version of on a draft's day: the versions that decide that lie
 * before the day, and what RIS adds now is a later one — three days, as for
 * the §§ above; up to twenty pages a visitor no longer waits for.
 */
export const KONS_HISTORY_STALE_S = 60 * 60 * 24 * 3

/**
 * What moves on the scale of days — a period's map and what shows its stand,
 * a Land's register or gazette: six hours, then `DAY_STALE_S` while it
 * refreshes. An hours-old answer is right for everything but what arrived
 * this afternoon.
 */
export const DAY_SCALE_TTL_S = 60 * 60 * 6

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
 * What does not move once read, held as our reading of it — a closed year
 * or period, a decided Kundmachung, what a published Landtag document or a
 * law's text says: a week, the value six caches had each chosen on their own
 * (12.11.2026). Longer than `DERIVED_ANALYSIS_TTL_S` because nothing upstream
 * can change it; shorter than a document's month because it is still our
 * reading. `SETTLED_STALE_S` is a week past it.
 */
export const SETTLED_TTL_S = 60 * 60 * 24 * 7

/**
 * A document the ressort or RIS published, byte for byte.
 *
 * A month, because it is written once and never revised: a corrected draft
 * gets a new record, and a NOR version document is fixed by definition. It
 * cannot go stale against our code either, because our code did not make it
 * (`base.ts`). The lifetime of everything on the document disk
 * (`DOCUMENT_CACHE`), which the prewarm unit empties of files past 32 days.
 */
export const PUBLISHED_DOCUMENT_TTL_S = 60 * 60 * 24 * 30
