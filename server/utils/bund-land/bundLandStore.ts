/**
 * The Bund-zu-Land map's findings on disk — one file per
 * Gesetzgebungsperiode under `<stateDir>/bund-land/`, the EU map's store (`cache/factStore.ts`) with its own reader
 * version (`BUND_LAND_READER_VERSION`). Keyed like the EU map's Länder
 * entries (`landKey`), fingerprinted the same way, so one build reads both
 * facts of a changed draft from one read of its PDFs.
 *
 * PURE MODULE — only relative imports, so vitest can execute it directly.
 */
import type { LandCode, TraceLink } from '../../../shared/types'
import { createFactStore, type StoreEntry, type StoreFile } from '../cache/factStore'
import type { Ausfuehrung } from './ausfuehrung'
import { BUND_LAND_READER_VERSION } from './readerVersion'

/** One Land draft's stored finding: what the reader found, without the evidence sentence, and the documents it read. */
export interface LandAusfuehrungFact {
  findings: Omit<Ausfuehrung, 'sentence'>[]
  sources: TraceLink[]
}

export type BundLandStoreEntry = StoreEntry<LandAusfuehrungFact>
export type BundLandStoreFile = StoreFile<LandAusfuehrungFact, LandCode>

export const bundLandStore = createFactStore<LandAusfuehrungFact, LandCode>({ subdir: 'bund-land', shape: 1, readerVersion: BUND_LAND_READER_VERSION, label: 'bund-land' })
