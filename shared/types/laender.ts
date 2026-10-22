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
export type LandCode = 'sbg' | 'w' | 'ooe'

/** What the Land's own list calls the draft — its list, not our classifier. */
export type LandDraftKind = 'gesetz' | 'verordnung'

export interface LandDocument {
  title: string
  url: string
  /** ISO date, where the Land dates the document (Wien's „Stand", OÖ). */
  date?: string | null
}

export interface LandConsultation {
  /** `<land>-<the Land's own id of the first document>`, stable across reads. */
  id: string
  land: LandCode
  kind: LandDraftKind
  title: string
  /**
   * ISO date; the start of the Begutachtung, from the Land's register.
   * Null when the register could not be read in time — the list never
   * waits for it (`readLaender`).
   */
  startedAt: string | null
  /** ISO date; the end of the Frist as the Land's current list states it.
   *  Null for a closed draft: the register does not keep the Frist. */
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

/**
 * A Stellungnahme the Land published on a draft. The Land publishes only
 * with the submitter's consent; the monitor still names only organisations
 * (`classifySubmitter`), and a private person's file is listed without a
 * name — linked, because the Land itself published it.
 */
export interface LandStatement {
  /** The organisation, as the Land names it; null where that is not
   *  certainly an organisation. */
  name: string | null
  url: string
  /** ISO date, where the Land dates it (OÖ). */
  date?: string | null
}

/** Where a Stellungnahme goes: an address, or the Land's own form. */
export type LandFiling =
  | { kind: 'email'; address: string; recipient: string | null }
  | { kind: 'form'; url: string }
  /** The Land's page names none; the draft itself says where (OÖ Verordnungen). */
  | { kind: 'document' }

/** One step after the Begutachtung, as the Land lists it (OÖ: „Im Landtag"). */
export interface LandProcedureStep {
  date: string | null
  label: string
  url: string | null
}

export interface LandDraftDetail {
  draft: LandConsultation
  /** Null when the Land's page of Stellungnahmen could not be read. */
  statements: LandStatement[] | null
  /** The Land's own page of them, for „beim Land ansehen". */
  statementsUrl: string | null
  /** Where a Stellungnahme goes, as the Land states it. */
  filing: LandFiling
  /** The Land's own summary, point by point (OÖ); null where it has none. */
  summary: string[] | null
  /** The Land's own record of what came after (OÖ); null where it keeps none. */
  procedure: LandProcedureStep[] | null
  /** How long the Land keeps the draft online, where it says (Wien: a year). */
  retentionNote: string | null
  /** The Land's list the draft stands on, for the credit line. */
  listUrl: string
}
