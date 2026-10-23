import type { LawDiffUnit } from './lawDiff'

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
  /**
   * With `via: 'suche'`: the search had exactly one candidate in its
   * window. Over Oberösterreich's oracle (§12.44, Nachtrag 6) 57 of 57 such
   * finds were right — and still not certain: Salzburg holds a 2022 draft
   * matched to the 2024 amendment of the same law (sbg-27156). Recorded, not
   * yet used to compare (`landLawDiffService`).
   */
  unique?: boolean
  /**
   * With `via: 'suche'`: how the find became certain — decided by text on
   * the draft's page (`laender/texts/kundmachung.ts`, §12.47–50). Absent:
   * not decided, and nothing is compared against it.
   */
  certainBy?: LandKundmachungCertainty
  /** The title search's find, where the text decided on another (§12.48). */
  searched?: string
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
  /**
   * The part of `label` the link covers, where it covers only its end:
   * „Eingang in der 45. Sitzung … XXIX. GP" + „Wortprotokolle des Oö.
   * Landtags". `label` stays the whole text, which the station matcher
   * reads.
   */
  linkText?: string
}

/**
 * What the Landtag did with the Vorlage, read from its record (OÖ,
 * `ooeLandtagOf`) — the facts the Ministerialentwurf's „Im Parlament" gives
 * for Parliament: the committee and its report, the motions, the vote. Each
 * part in the Landtag's own words; null or empty where the record has none.
 */
export interface LandLandtag {
  /** „Ausschuss für Bauen und Naturschutz" */
  committee: string | null
  /** The committee set up a Unterausschuss. */
  subcommittee: boolean
  /** „Ausschussbericht Beilage 1420/2026", with its link. */
  report: LandProcedureStep | null
  /** Abänderungs- and Zusatzanträge, each with its vote. */
  motions: LandProcedureStep[]
  /** The Beschluss: its date and the vote, the record's text after „Antrag angenommen". */
  decision: { date: string | null; vote: string | null } | null
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
  /** The Landtag's handling, read from that record (OÖ); null where it keeps none. */
  landtag: LandLandtag | null
  /** How long the Land keeps the draft online, where it says (Wien: a year). */
  retentionNote: string | null
  /** The Land's list the draft stands on, for the credit line. */
  listUrl: string
  /**
   * The comparisons this draft's texts allow, in the page's order
   * (`laender/texts/stations.ts`): the page renders these and no other.
   */
  comparisons: [LandTextStation, LandTextStation][]
}

/**
 * The texts a Land's draft can be compared at (`landLawDiffService`).
 * `geltend` is the law in force as the Land's Textgegenüberstellung prints
 * it, held against RIS (`landTgu.ts`) — compared only with `entwurf`.
 */
export type LandTextStation = 'geltend' | 'entwurf' | 'rv' | 'ausschuss' | 'lgbl'

/**
 * Two texts of a Land's draft, § by § (`landLawDiffService`,
 * docs/architecture.md §12.44): the Begutachtungsentwurf and the
 * Regierungsvorlage and the committee's text from the Land's PDFs, the
 * Kundmachung from the Landesgesetzblatt in RIS.
 */
export interface LandLawDiffResponse {
  from: LandTextStation
  to: LandTextStation
  available: boolean
  /** Why there is no comparison, in a sentence; null when there is one. */
  unavailableReason: string | null
  units: LawDiffUnit[]
  stats: { total: number; unchanged: number; changed: number; editorial: number; inserted: number; removed: number }
  /** The two documents, for the credit line: what, where, from whom. */
  fromDocument: LandTextDocument | null
  toDocument: LandTextDocument | null
  /** Artikel (laws) only the later text has — added on the way. */
  addedLaws: string[]
  /** Artikel only the earlier text has — no longer in the later one. */
  droppedLaws: string[]
  /**
   * Other drafts the Land's record sends into the same Kundmachung: what
   * reads as new here may come from them (`draftsSharingKundmachung`).
   * Only where the later text is the Kundmachung.
   */
  sharedWith: { title: string; path: string; deadline: string | null; startedAt: string | null }[]
  /**
   * Paragraphen the Land's Textgegenüberstellung shows and this comparison
   * does not, because RIS did not confirm their text in force
   * (`geltend → entwurf` only; 0 elsewhere).
   */
  withheld: number
}

/**
 * How a Kundmachung became certain: named by the Land; the Regierungsvorlage
 * RIS links it to holds the draft's text; the Landesgesetzblatt itself holds
 * it (a Verordnung); both texts name the same last amendment of the law; or
 * the search's single candidate, with nothing in the texts against it
 * (§12.47–50).
 */
export type LandKundmachungCertainty = 'land' | 'vorlage' | 'wortlaut' | 'kette' | 'treffer'

export interface LandTextDocument {
  label: string
  url: string | null
  /** „Land Oberösterreich", „Oö. Landtag", „RIS (CC BY 4.0)". */
  publisher: string
}
