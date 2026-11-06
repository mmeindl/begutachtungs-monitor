/**
 * The version of what the Bund-zu-Land reader says (docs/architecture.md
 * §12.67) — the EU reader's rule (`eu/readerVersion.ts`), for its own store.
 *
 * The Bund-zu-Land map keeps every Land draft's finding on disk
 * (`bundLandStore.ts`), and a finding on disk outlives the code that read
 * it. **Bump this number in the same commit as any change that changes what
 * a finding says** — `ausfuehrung.ts` (a signal, an exclusion, how the act
 * is read from the clause), or a reader it rests on: the Länder'
 * Erläuterungen (`laender/landExplanations*.ts`) and the draft's pages
 * (`laender/texts/read.ts`). The store is then dropped whole on its next
 * read and the next prewarm reads every Land draft again. A change that
 * only moves code, or adds a test, does not bump it. Independent of
 * `EU_READER_VERSION`: a change to the EU readers leaves this store alone.
 *
 * PURE MODULE — no imports at all.
 */
export const BUND_LAND_READER_VERSION = 2
