/**
 * Begutachtungen der Länder (22.10.2026).
 *
 * A separate shape, not `RisConsultation` with a Land field: RIS has no
 * Begutachtung for Landesrecht, so each Land is read from its own website,
 * and what those pages carry is a title, a Frist and documents. Nothing
 * here has a Gegenstand, a Stellungnahmen count or a chain, and a shared
 * type would grow those as empty fields (`app/utils/entryView.ts`).
 */

/** The Länder the monitor reads, by the RIS abbreviation of their name. */
export type LandCode = 'sbg'

/** What the Land's own list calls the draft — its list, not our classifier. */
export type LandDraftKind = 'gesetz' | 'verordnung'

export interface LandDocument {
  title: string
  url: string
}

export interface LandConsultation {
  /** `<land>-<the Land's own id of the first document>`, stable across reads. */
  id: string
  land: LandCode
  kind: LandDraftKind
  title: string
  /** ISO date; the end of the Frist as the Land states it. */
  deadline: string | null
  /** Where the draft is read: the Land's own page, or its first document. */
  url: string
  /** Every document the list names for this draft, the main text first. */
  documents: LandDocument[]
  /** PLACEHOLDER until the request decides it (`withLandActiveOn`). */
  active: boolean
}

/**
 * Whether a Land could be read.
 *
 * `unavailable` covers the source failing AND the source answering with
 * something the parser does not recognise: a maintenance page served with
 * HTTP 200 must never read as „keine Begutachtung offen".
 */
export interface LandSourceState {
  land: LandCode
  state: 'ok' | 'unavailable'
  /** The Land's own list, for „dort nachsehen". */
  listUrl: string
}

export interface LaenderResponse {
  items: LandConsultation[]
  /** Every Land the monitor reads, in display order, readable or not. */
  sources: LandSourceState[]
}
