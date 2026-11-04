/**
 * The version of what the EU readers say (docs/architecture.md §12.66,
 * Nachtrag 3).
 *
 * The EU map keeps every draft's fact on disk (`euMapStore.ts`), and a fact
 * on disk outlives the code that read it: a reader that learns a new
 * Vorblatt sentence, a new citation form or a sharper D4 changes what a
 * stored fact would say today, and nothing in the stored fact shows it.
 *
 * **Bump this number in the same commit as any change under
 * `server/utils/eu/` (or a reader they call: the Länder' Erläuterungen,
 * the draft's law-text parse) that changes what a fact says** — a marker,
 * an act, `isNew`, a date. The store is then dropped whole on its next read
 * and the next prewarm reads every draft again. A change that only moves
 * code, or adds a test, does not bump it.
 *
 * PURE MODULE — no imports at all.
 */
export const EU_READER_VERSION = 1
