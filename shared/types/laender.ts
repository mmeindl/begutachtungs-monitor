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
  /**
   * How far the draft got after its Begutachtung, where the Land records it
   * (Oberösterreich's Landtag, 22.10.2026). Absent: the monitor does not
   * follow this Land's drafts past the Begutachtung. `null`: it does, and
   * nothing came yet. `'unknown'`: it does, but this record could not be
   * read — such a row stays out of every station tab rather than be
   * claimed for the first one.
   */
  stage?: LandStage | null | 'unknown'
  /**
   * Why a closed draft the Land does not follow has no Kundmachung here
   * (`matchLgbl`; a find sets `stage` instead): `nicht-gefunden` — our
   * search found none, which is not „nicht kundgemacht"; `vor-ris` — begun
   * before RIS holds the Landesgesetzblatt (2015); `nicht-abrufbar` — the
   * Landesgesetzblatt could not be read just now.
   */
  lgblSearch?: 'nicht-gefunden' | 'vor-ris' | 'nicht-abrufbar'
}

/** A station a Land's draft reached, in the Bund's station vocabulary. */
export interface LandStage {
  station: 'rv' | 'parlament' | 'bgbl'
  /** The row's state line, e.g. „Im Landtag beschlossen". */
  label: string
  /** What pins it down, e.g. „LGBl. Nr. 45/2026". */
  detail: string | null
  /** ISO date the station was reached, for the „Neu" chip. */
  date: string | null
  /** The Kundmachung in RIS, where the station is `bgbl` (`lgblEliUrl`). */
  url?: string | null
  /**
   * `suche`: found by the monitor's own search of the Landesgesetzblatt
   * (`matchLgbl`), not recorded by the Land — the page says whose finding
   * it is. Absent: the Land's own record.
   */
  via?: 'suche'
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
  /** In period mode (`?gp`, `?status`): the period used as the time window. */
  gp?: string
  /** In period mode: the periods the select offers. */
  availableGps?: string[]
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
  /** The station this step is the record of, on the one step that counts
   *  for it (`ooeStationSteps`): where the bar's row lands. */
  station?: LandStage['station']
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
