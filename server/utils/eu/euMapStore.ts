/**
 * The EU map's facts on disk — one file per Gesetzgebungsperiode under
 * `<stateDir>/eu-recht/`. The
 * store itself, its freshness rules and why it exists are `cache/
 * factStore.ts`'s, shared since 06.11.2026 with the Bund-zu-Land map;
 * this file names the EU's instance and the map's keys.
 *
 * PURE MODULE — only relative imports, so vitest can execute it directly.
 */
import type { EuPublisher, EuRechtResponse } from '../../../shared/types/eu'
import { createFactStore, type StoreEntry, type StoreFile } from '../cache/factStore'
import { EU_READER_VERSION } from './readerVersion'

/** One draft's stored EU fact. */
export type EuStoreEntry = StoreEntry<EuRechtResponse>
/** One period's EU file. */
export type EuStoreFile = StoreFile<EuRechtResponse, EuPublisher>

const store = createFactStore<EuRechtResponse, EuPublisher>({ subdir: 'eu-recht', shape: 1, readerVersion: EU_READER_VERSION, label: 'eu-karte' })

/** The file version: shape 1, the EU reader's version beside it. */
export const STORE_VERSION = store.version

/** The map's key for a Ministerialentwurf. */
export const meKey = (gp: string, inr: number): string => `me:${gp}-${inr}`
/** The map's key for a RIS record without a Gegenstand. */
export const risKey = (id: string): string => `ris:${id}`
/** The map's key for a Land's draft, by the Land's own number (the id without `<land>-`). */
export const landKey = (land: string, number: string): string => `land:${land}-${number}`

/** An empty file for a period, as the first build starts it. */
export const emptyStore = (): EuStoreFile => store.empty()
/** The stored EU file of one period, or null (`FactStore.load`). */
export const loadEuStore = (gp: string): Promise<EuStoreFile | null> => store.load(gp)
/** Writes one period's EU file (`FactStore.save`). */
export const saveEuStore = (gp: string, file: EuStoreFile): Promise<boolean> => store.save(gp, file)
