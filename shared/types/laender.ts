import type { LawDiffUnit, ReasoningDiffEntry } from './lawDiff'

/**
 * Begutachtungen der Länder (22.10.2026).
 *
 * A separate shape, not `RisConsultation` with a Land field: RIS has no
 * Begutachtung for Landesrecht, so each Land is read from its own website,
 * and what those pages carry is a title, a Frist and documents. Nothing
 * here has a Gegenstand, a Stellungnahmen count or a chain, and a shared
 * type would grow those as empty fields (`app/utils/entryView.ts`).
 */

/** The Länder the monitor reads, by the usual abbreviation of their name (all nine since 30.10.2026). */
export type LandCode = 'bgld' | 'ktn' | 'noe' | 'ooe' | 'sbg' | 'stmk' | 't' | 'vbg' | 'w'

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
  /**
   * Where the Land dates neither the start nor the Frist of a closed
   * Begutachtung (Kärnten's archive, 23.10.2026): the first date its own
   * record holds after it — the Regierungsvorlage's. It places the draft in
   * a period (`landDraftDate`) and is shown nowhere as a date of the
   * Begutachtung.
   */
  placedAt?: string
  /**
   * The Begutachtung is the Landtag's, not the Landesregierung's: a
   * committee sent a bill before it — a Selbständiger Antrag, never a
   * Regierungsvorlage — out for comment (Kärnten, § 18a K-LTGO, 30.10.2026).
   * The draft then has no Vorlage to come, and the rows name the Landtag
   * where they name the Land. For such a draft `placedAt` is the day the
   * committee decided the Begutachtung.
   */
  runBy?: 'landtag'
  /**
   * Listed among the Land's RUNNING Begutachtungen without a Frist — a
   * Begutachtung of Kärnten's Landtag, whose six weeks stand only in the
   * letter and run from a day it cannot know (30.10.2026). Open while it
   * stands there, closed once it does not: the list is the evidence, the row
   * says „Frist läuft". Not `fristUnknown`, which is neither open nor closed.
   */
  listedRunning?: true
  /**
   * Where the Land sets no day for the Frist but a span from its cover
   * letter (Kärnten's Verordnungen: „innerhalb von vier Wochen ab
   * Zustellung", 23.10.2026): the letter's date and the span. `deadline` is
   * then the monitor's reckoning of it, and the page says so.
   */
  deadlineFrom?: { letterDate: string; weeks: number }
  /**
   * The Land publishes no Frist for this draft at all (Tirol's Verordnungen
   * in the IFG-Informationsregister, 24.10.2026). Neither open nor closed:
   * the lists show „Frist unbekannt", the draft stands under „Alle" only,
   * and `active` stays false without meaning „abgeschlossen".
   */
  fristUnknown?: true
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
   * Landesgesetzblatt could not be read just now; `widerlegt` — the search
   * found one, and its Regierungsvorlage does not hold the draft's text
   * (`texts/kundmachung.ts`, 23.10.2026; on the lists where the period's
   * map of the page's decisions is built, `laender/verdicts.ts`).
   */
  lgblSearch?: 'nicht-gefunden' | 'vor-ris' | 'nicht-abrufbar' | 'widerlegt'
  /** With `lgblSearch: 'widerlegt'`: what the search had found, „LGBl. Nr. 30/2026". */
  lgblRefuted?: string
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
  /**
   * The station is the monitor's own join of the Land's lists, not a record
   * of this draft (Kärnten: Vorlage and Beschluss joined by the
   * Geschäftszahl, `ktnChainOf`, 25.10.2026). A station after it is then not
   * known to be pending — the join or the search may simply have missed
   * it — so the page says „nicht gefunden", never „ausständig" or „in
   * Behandlung".
   */
  joined?: true
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
  /**
   * In period mode: per Land, the drafts it publishes that no period can
   * hold — no start, no Frist, no Regierungsvorlage to place them by
   * (Kärnten's archive, 24.10.2026). The list says how many are missing.
   */
  undated?: Partial<Record<LandCode, number>>
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
  /**
   * The Land's page names none; a document says where — the draft itself
   * (OÖ Verordnungen), or as `in` names it: „im Versendeschreiben"
   * (Steiermark, whose Landtag page names no address).
   */
  | { kind: 'document'; in?: string }

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
  /**
   * Why the page shows no Stellungnahmen although the Land may publish some
   * — elsewhere than the monitor reads (30.10.2026: Niederösterreich's go to
   * its Landtag's site, Vorarlberg's page carries none). Null where
   * `statements` says it all; with it, `statements` is null and the page
   * says this sentence instead of „keine veröffentlicht".
   */
  statementsGap: string | null
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
   * does not (`geltend → entwurf` only; empty elsewhere). Each under the law
   * it belongs to as far as the document says — its own heading, or the
   * confirmed § before it — so the list can count them where they stand, as
   * the Ministerialentwurf's „nicht gezeigt" (23.10.2026), and each with why
   * (`LandWithheldReason`): named so the list is never read as all the draft
   * changes. `fromId`: the number a § has in force where the draft renumbers
   * it (26.10.2026), named „§ 13 → § 9" as the comparison shows it.
   */
  withheld: { law: string | null; id: string; fromId?: string; reason?: LandWithheldReason }[]
  /**
   * Instructions of the Novelle that reach §§ they do not name — „Im V.
   * Abschnitt wird jeweils …", „Im ganzen Gesetz …" — quoted per law, so
   * the §§ listed are not read as all it changes (26.10.2026); and the
   * sentence that repeals a law whole, said for that law (26.10.2026;
   * `repeal`: nothing is left to compose). Only `geltend → entwurf`.
   */
  reaches?: { law: string | null; instruction: string; repeal?: true }[]
  /** Pages of the Land's document the reader did not read; said as the Bund's annex says it (`annexDroppedPagesNote`). */
  droppedPages?: number
  /**
   * Laws the draft enacts anew whose text the Textgegenüberstellung does
   * not print — Kärnten's Artikel without an instruction (26.10.2026). Each
   * named as a group of its own (`enactedNote`). Only `geltend → entwurf`.
   */
  enacted?: string[]
  /**
   * The renumberings the draft's own text orders — „Der bisherige § 17
   * erhält die Bezeichnung „§ 19"" — that the comparison could not pair old
   * → new, so that there it goes by number (26.10.2026; `renumberedNote`).
   * Only beside a list, and only `geltend → entwurf`.
   */
  renumbered?: string[]
  /**
   * Groups whose law the draft names otherwise than RIS does today — renamed
   * since (26.10.2026): `law` is the group, the law as RIS names it, under
   * which its §§ were checked; `printed` the name the draft prints, which
   * heads the group with „(heute: …)" after it. Only `geltend → entwurf`.
   */
  renamed?: { law: string; printed: string }[]
  /**
   * A law the draft puts in place of one in force of the same name, which
   * the Land's Textgegenüberstellung sets against it § by § by number —
   * Salzburg 18151, the Salzburger Objektivierungsgesetz 2016 for the
   * Salzburger Objektivierungsgesetz (26.10.2026): `law` is the group, the
   * law in force as RIS names it; `by` the new law as the draft names it.
   * Only `geltend → entwurf`.
   */
  replaced?: { law: string; by: string }[]
}

/**
 * Why a § of the Land's Textgegenüberstellung is not shown — each worded on
 * the page in a sentence of its own (`app/utils/landWithheld.ts`), which
 * must be true of every § it follows (25.10.2026: one sentence stood for
 * several causes). None: RIS refused it — its text in force, as the
 * document prints it, is not RIS's word for word.
 *
 *  - `unread`: the reader does not compose its new text from the Novelle's
 *    instructions (Kärnten, 24.10.2026);
 *  - `wording`: the same, where an instruction changes words, sentences or
 *    Ziffern below a whole Absatz;
 *  - `unsure`: its text, or the marks in it, the reader could not read with
 *    certainty — Tirol's unsure lines, a § printed without text;
 *  - `inserted`: printed as new, and RIS did not confirm that the law has
 *    no such § yet;
 *  - `elided`: its text in force printed only as „…", and RIS has no such §
 *    under that law;
 *  - `twice`: printed more than once under one law, other than as its old
 *    and its new text;
 *  - `deletion`: no new text found for it, and no repeal of it in the
 *    draft's own text;
 *  - `unchecked`: a read it rests on failed — RIS, or the draft's own text
 *    for the deletion guard; such an answer is not cached (`gathered.ts`);
 *  - `division`: a § of a division the Novelle replaces, inserts or repeals
 *    as a whole, which the reader does not take apart (26.10.2026);
 *  - `gap`: a § of a law whose instructions the reader did not all find in
 *    the document (its numbering skips);
 *  - `annex`: an Anlage or Anhang — the RIS check is for §§ and articles;
 *  - `title`: the law's title, which the draft changes (id `Titel`) — RIS
 *    keeps no title to check it against (26.10.2026).
 */
export type LandWithheldReason = 'unread' | 'wording' | 'unsure' | 'inserted' | 'elided' | 'twice' | 'deletion' | 'unchecked' | 'division' | 'gap' | 'annex' | 'title'

/**
 * How a Kundmachung became certain: named by the Land; the Regierungsvorlage
 * RIS links it to holds the draft's text; the Landesgesetzblatt itself holds
 * it (a Verordnung); both texts name the same last amendment of the law; the
 * search's single candidate, with nothing in the texts against it
 * (§12.47–50); or — Kärnten, 23.10.2026 — the one Landesgesetzblatt whose
 * title carries the date of the Landtag's Beschluss the Land records for the
 * draft, and the draft's words (`ktnKundmachung`).
 */
export type LandKundmachungCertainty = 'land' | 'vorlage' | 'wortlaut' | 'kette' | 'treffer' | 'beschluss'

export interface LandTextDocument {
  label: string
  url: string | null
  /** „Land Oberösterreich", „Oö. Landtag", „RIS (CC BY 4.0)". */
  publisher: string
}

/**
 * What a Land gives as its reasons — the Erläuterungen of its draft
 * (`laender/landExplanations.ts`, docs/architecture.md §12.53): the general
 * part for „Was das Land begründet", the particular part at the §§ of the
 * comparison.
 */
export interface LandExplanationsResponse {
  available: boolean
  unavailableReason: string | null
  /** The PDF they were read from. */
  document: { label: string; url: string } | null
  /** „Land Oberösterreich". */
  publisher: string
  /** Whether the Land headed a general part itself („Allgemeiner Teil", „Allgemeines"). */
  labelled: boolean
  general: { heading: string | null; text: string[] }[]
  /** One per „Zu …" heading; `paras` from its brackets, or from the draft's own instructions where it names only Ziffern. */
  particular: { law: string | null; paras: string[]; heading: string; text: string[] }[]
}

/**
 * The Land's reasoning between its draft and the Regierungsvorlage, at the
 * changes of that comparison (`laender/landReasoningService.ts`,
 * docs/architecture.md §12.54) — the Ministerialentwurf's
 * Begründungsvergleich (`ReasoningDiffResponse`), keyed the same way.
 */
export interface LandReasoningResponse {
  available: boolean
  unavailableReason: string | null
  /** The two documents read, for the credit line. */
  sources: LandTextDocument[]
  /** `diffUnitKey` of a change → its entry's key. */
  units: Record<string, string>
  entries: Record<string, ReasoningDiffEntry>
  stats: { compared: number; changed: number; editorial: number; uncompared: number }
}
