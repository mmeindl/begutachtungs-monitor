/**
 * An answer that may go out, but must not be kept — the third way between
 * throwing and catching (the §12.13 rule, docs/architecture.md: real states
 * answer, failures throw).
 *
 * Throwing is the rule, and it stays the rule wherever the failed read IS
 * the question: a comparison against the Kundmachung cannot be answered
 * without it, and „bisher nicht kundgemacht" out of a timeout is exactly the
 * false statement the rule exists for. But an answer can also rest on a read
 * that is only garnish for it — the Kundmachung beside a comparison of draft
 * and Vorlage, one § name among sixty, the Erläuterungen's passages at their
 * Paragraph under a general part that was read in full. Throwing there costs
 * the reader everything that did arrive, for the part that did not. Catching
 * costs more: the answer without the part is cached, for a day, as if it
 * were whole.
 *
 * So the answer goes out without the part that failed, and tells the cache
 * so. Nitro's `defineCachedFunction` stores every value that is not
 * `undefined` — unless its `validate` option refuses the entry; then the
 * value is still returned to the caller and written nowhere (nitropack,
 * runtime/internal/cache.mjs). The same `validate` decides on every read
 * whether a stored entry is still good. The gap lasts as long as the failure,
 * not as long as the TTL.
 *
 * WHAT MAY NEVER BE GATHERED: a part whose absence the page would state.
 * Where an answer would SAY something because a read failed — „nicht
 * kundgemacht", „im RIS nicht veröffentlicht", „Bisher keine
 * Regierungsvorlage" — the part is the answer, and the failure throws.
 *
 * Pure module, no Nitro globals: the cached functions pass these as their
 * `validate`, and vitest runs them as they are.
 */

/** A cached function's value, and whether every read it rests on answered. */
export interface Gathered<T> {
  value: T
  /** False where something optional failed: served as it is, not stored for the TTL. */
  complete: boolean
}

/** Nitro's cache entry, as far as `validate` reads it. */
interface Entry {
  value?: { complete: boolean }
  /** When the value was computed, ms — Nitro sets it before it asks `validate`. */
  mtime?: number
}

/** `validate` for a cached `Gathered`: only a complete value is stored. */
export function onlyComplete(entry: Entry): boolean {
  return entry.value?.complete === true
}

/**
 * `validate` for a cached `Gathered` whose rebuild is too expensive to run on
 * every request while something upstream keeps failing: an incomplete value
 * IS stored, and counts as expired after `ms` instead of the function's
 * `maxAge`. A complete one keeps the `maxAge`.
 */
export function keepIncompleteFor(ms: number): (entry: Entry) => boolean {
  return (entry) => entry.value !== undefined && (entry.value.complete || Date.now() - (entry.mtime ?? 0) < ms)
}
