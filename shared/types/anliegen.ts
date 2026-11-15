/**
 * An Anliegen an das Parlament: a Petition, a parlamentarische
 * Bürgerinitiative or a Volksbegehren in the Nationalrat, and since
 * 15.11.2026 a Petition an den Bundesrat.
 *
 * A different object from a draft (`ProcedureRoot`): no law has to result
 * and none of the three walks the five stations, so it shares no type, no
 * list and no address with the Entwürfe (docs/decisions.md, „Routes to a
 * norm, and what the monitor follows";
 * docs/research/umsetzungsplan-petitionen-volksbegehren.md).
 *
 * GDPR invariant, as for statements: no name of a private person is part of
 * any type here. Parliament names the Erstunterzeichner of a
 * Bürgerinitiative; the reader drops it before anything is cached.
 */
import type { DraftDocument } from './common'

export type AnliegenKind = 'petition' | 'buergerinitiative' | 'volksbegehren' | 'petition-bundesrat'

/** Parliament's item type of each kind; a Volksbegehren is a Beilage (`I`). */
export type AnliegenItemType = 'PET' | 'BI' | 'I' | 'PET-BR'

/**
 * Which item it is: the period, the kind and Parliament's number. The
 * Bundesrat has no Gesetzgebungsperioden: a Petition an den Bundesrat has
 * `gp` „BR", as Parliament files it (`/gegenstand/BR/PET-BR/56`), whatever
 * period list 101's first column gives it.
 */
export interface AnliegenRoot {
  gp: string
  kind: AnliegenKind
  inr: number
}

// ---------------------------------------------------------------------------
// The course of an Anliegen, read from its Verlauf (step 1 of the plan)
// ---------------------------------------------------------------------------

/**
 * A vote by clubs, as Parliament records it in the shape „Dafür: ÖVP, SPÖ,
 * NEOS, dagegen: FPÖ, GRÜNE" („dagegen: -" is no club against). The older
 * shape „mehrstimmig ( dafür S, V; dagegen F, G, N; … )" of GP XXV is not
 * read into clubs; the step then says `majorityOnly`.
 */
export interface AnliegenClubVote {
  for: string[]
  against: string[]
}

/** A report Parliament cites by its Beilage number — „159 d.B." — and links. */
export interface AnliegenReportRef {
  citation: string
  url: string | null
}

/** One sitting of a committee the item stood on the agenda of. */
export interface AnliegenSitting {
  /** ISO date. */
  date: string
  /** „In der Sitzung vom … vertagt"; a „Wiederaufnahme der … vertagten
   *  Verhandlungen" is a sitting that was not adjourned. */
  adjourned: boolean
}

/**
 * One request of the committee for a written statement. The addressee is
 * never kept: it is free text, and persons stand behind „;", behind „*" and
 * alone (measured 15.11.2026 on 1,796 requests). The date and whether the
 * motion was adopted are all the page may say.
 */
export interface AnliegenStatementRequest {
  date: string
  adopted: boolean
}

/** The committee that deliberated the item first — for a Petition or a
 *  Bürgerinitiative the Ausschuss für Petitionen und Bürgerinitiativen, for a
 *  Volksbegehren the subject committee it was assigned to. */
export interface AnliegenCommittee {
  name: string
  assignedAt: string | null
  /** A Petition an den Bundesrat assigned anew („Neu zugewiesen an den …"):
   *  the committee it lay with before. Its sittings are not this committee's
   *  and are not counted here. */
  reassignedFrom: string | null
  sittings: AnliegenSitting[]
  statementRequests: AnliegenStatementRequest[]
}

/**
 * How the Ausschuss für Petitionen und Bürgerinitiativen ended its
 * deliberation. Three ways occur (1,100 items, GP XXII–XXVIII, 15.11.2026):
 * „durch Kenntnisnahme im Ausschuss zu erledigen", „Ersuchen an den
 * Präsidenten / die Präsidentin um Zuweisung an den …ausschuss", and once
 * (144/PET XXIV) „Antrag auf Übermittlung an Volksanwaltschaft",
 * which the plenary then agreed to (§ 100c Abs. 3 GOG-NR). Forwarding to
 * the Bundesregierung, which the same paragraph allows, occurs nowhere in
 * the corpus and has no kind. „Abstandnahme von der weiteren Verhandlung"
 * (once, XXII) is no kind either: it stays unread and is said so.
 */
export interface AnliegenDisposal {
  kind: 'kenntnisnahme' | 'zuweisung' | 'volksanwaltschaft'
  date: string
  /** The subject committee's name for a Zuweisung, else null. */
  to: string | null
  vote: AnliegenClubVote | null
  majorityOnly: boolean
  /** The Sammelbericht that reported the step to the plenary, where one
   *  stands in the Verlauf — also before the plenary took note of it. */
  report: AnliegenReportRef | null
}

/** What the subject committee did with a forwarded item. */
export interface AnliegenSubjectCommittee {
  name: string
  assignedAt: string | null
  report: AnliegenReportRef | null
  /** The date of its last sitting (or its subcommittee's) on the item. */
  lastSitting: string | null
  /** Whether that last sitting adjourned the item. */
  adjourned: boolean
  /** No stage of that committee at all — 34 of 59 forwarded items of GP
   *  XXVI and XXVII (15.11.2026). The record stops there. */
  noEntry: boolean
}

/**
 * The plenary's step. For a Petition or a Bürgerinitiative it is a vote
 * on the committee's Sammelbericht, never on the item
 * (`bericht-zur-kenntnis`: „Antrag, den Ausschussbericht zur Kenntnis zu
 * nehmen, angenommen", older „Antrag auf Kenntnisnahme angenommen"), except
 * where the committee asked for an Übermittlung an die Volksanwaltschaft:
 * then the plenary votes on that (`uebermittlung-zugestimmt`: „Antrag, der
 * Übermittlung an die Volksanwaltschaft zuzustimmen, angenommen", once, GP
 * XXIV). A Volksbegehren is taken note of itself (`kenntnisnahme`).
 */
export interface AnliegenPlenary {
  date: string
  kind: 'bericht-zur-kenntnis' | 'kenntnisnahme' | 'uebermittlung-zugestimmt'
  report: AnliegenReportRef | null
  vote: AnliegenClubVote | null
  majorityOnly: boolean
}

/** The two dated duties of a committee on a Volksbegehren (§ 24 GOG-NR). */
export interface AnliegenDuties {
  /** „Frist für die Aufnahme der Vorberatung: 05.10.2025", ISO. */
  deliberationBy: string | null
  /** „Fristsetzung für Berichterstattung: 05.02.2026", ISO. */
  reportBy: string | null
}

/** An Entschließung the plenary adopted with a committee's report on the item — a Volksbegehren's, a Sammelbericht, a subject committee's on a forwarded Petition or Bürgerinitiative. */
export interface AnliegenResolution {
  date: string
  /** „6/AEA" — the motion's number; the resulting E number is not in the stage. */
  ref: string
}

/** Where an item stands at the end of its record, from the stages alone. */
export type AnliegenEnd = 'kenntnisnahme-ausschuss' | 'zuweisung' | 'volksanwaltschaft' | 'plenum' | 'uebernommen' | 'uebermittlung' | 'zurueckgezogen' | 'offen'

/**
 * A Petition an den Bundesrat passed to the administration — „Übermittlung
 * der Petition an das Bundeskanzleramt / an das Bundesministerium für …",
 * 31 of 42 (15.11.2026), a step the Nationalrat's rail does not have.
 */
export interface AnliegenTransmission {
  date: string
  /**
   * Whom, only where every addressee matches the strict institutional shape
   * („das Bundeskanzleramt", „das Bundesministerium für …"), in Parliament's
   * order; null otherwise — the page then says „an eine Stelle der
   * Bundesverwaltung" and never passes the text through.
   */
  to: string[] | null
}

/** An item of another period: the predecessor or the successor. */
export interface AnliegenPeriodRef {
  gp: string
  inr: number
}

/**
 * The course of an Anliegen through the Nationalrat — typed facts only. No
 * stage text is passed through: a stage the reader does not recognise is
 * counted (`unreadStages`), never shown.
 */
export interface AnliegenCourse {
  arrivedAt: string | null
  /** The predecessor in the previous period („Neuverteilung gem. § 21 Abs. 1a GOG-NR"). */
  carriedFrom: AnliegenPeriodRef | null
  /** The successor in the next period („Verhandlungsgegenstand der nächstfolgenden GP …"). */
  carriedTo: AnliegenPeriodRef | null
  committee: AnliegenCommittee | null
  /** Petition and Bürgerinitiative only. */
  disposal: AnliegenDisposal | null
  /** Only after a Zuweisung. */
  subjectCommittee: AnliegenSubjectCommittee | null
  plenary: AnliegenPlenary | null
  /** Volksbegehren only: the day of the erste Lesung, where one was held. */
  firstReading: string | null
  /** Volksbegehren only. */
  duties: AnliegenDuties | null
  /** Volksbegehren: „Verfassungsausschuss: Bericht 200 d.B."; Petition an den Bundesrat: „Bericht 7765/BR d.B.". */
  committeeReport: AnliegenReportRef | null
  /** Adopted Entschließungen: a Volksbegehren's, a Petition an den Bundesrat's, and since 15.11.2026 a Petition's or Bürgerinitiative's (10 in GP XXII–XXVIII). */
  resolutions: AnliegenResolution[]
  /** Petition an den Bundesrat only. */
  transmission: AnliegenTransmission | null
  /** Petition an den Bundesrat only: „Gilt gemäß § 16 Abs. 5 GO-BR als zurückgezogen" (1 of 42), ISO. */
  withdrawnAt: string | null
  /**
   * The record says „Keine Veröffentlichung der Dokumente" (14 of 42
   * Petitionen an den Bundesrat): Parliament does not publish the item's
   * documents, and the page shows none.
   */
  documentsWithheld: boolean
  /** Stages no pattern recognised. */
  unreadStages: number
  end: AnliegenEnd
}

/**
 * Whether one can take part now, from the item's own two flags
 * (`statementsstate`, `approvalstate`). A Volksbegehren takes no
 * Unterstützung at all (`approvalstate` „9 Keine Zustimmung bei dem Doktyp
 * "VOLKBG" möglich" on all 85).
 */
export interface AnliegenParticipation {
  statements: 'open' | 'closed'
  support: 'open' | 'closed' | 'impossible'
}

/**
 * A member of the Nationalrat (or of the Bundesrat) who handed in a Petition — by club only. The
 * monitor shows the club, not who: as the page of an Initiativantrag states
 * its movers (decision 6 of the plan). No name is read, cached or answered.
 */
export interface AnliegenPresenter {
  /** Parliament's club code (`frak_code`), as it gives it. */
  club: string | null
}

/** A document of the item at Parliament, with its formats. */
export type AnliegenDocument = DraftDocument

/** Counts from Parliament's list of participations; null is „not read", never 0. */
export interface AnliegenCounts {
  statements: number | null
  support: number | null
}

/** One Anliegen's page. No field carries a private person's name. */
export interface AnliegenDetail {
  root: AnliegenRoot
  title: string
  citation: string
  parliamentUrl: string
  course: AnliegenCourse
  participation: AnliegenParticipation
  presenters: AnliegenPresenter[]
  documents: AnliegenDocument[]
  counts: AnliegenCounts
  /**
   * Whether the item's Gesetzgebungsperiode is over, from the running period
   * (`gpHasEnded`). Set by the API route, not by the reader, which knows no
   * running period. Absent or false where it is unknown — a page never says
   * „beendet" without it. With `course.end` „offen" it is the item that
   * ended with its period (`endedWithPeriod`): a Petition is never carried
   * over and simply stops.
   */
  periodEnded?: boolean
}

/**
 * Where an item stands — the weakest state the evidence supports, decided
 * once (`anliegenStateOf`) for the page's headline and the list's row alike.
 * No outcome is ranked or coloured by it (framing rule). `date` is the
 * state's own day where the course dates it (the Kenntnisnahme, the
 * forwarding, the plenary's step); the ongoing states carry none and are
 * dated by the last step.
 */
export type AnliegenState =
  | { kind: 'uebernommen'; successor: AnliegenRoot }
  | { kind: 'weitergeleitet'; committee: string; date: string | null }
  | { kind: 'weitergeleitet-bericht'; committee: string; report: string }
  | { kind: 'kenntnisnahme-ausschuss'; date: string }
  /**
   * The committee asked for an Übermittlung an die Volksanwaltschaft.
   * `agreed`: the plenary agreed to it, and `date` is that day; otherwise
   * only the committee's motion stands, dated by it. What the
   * Volksanwaltschaft did is not in the record.
   */
  | { kind: 'volksanwaltschaft'; date: string; agreed: boolean }
  | { kind: 'volksbegehren-kenntnisnahme'; date: string }
  | { kind: 'bericht-zur-kenntnis'; date: string }
  | { kind: 'ohne-erledigung-periode-beendet' }
  | { kind: 'in-behandlung' }
  // A Petition an den Bundesrat's own endings.
  | { kind: 'uebermittelt'; to: string[] | null; date: string }
  | { kind: 'bundesrat-bericht-zur-kenntnis'; date: string }
  | { kind: 'zurueckgezogen'; date: string }

/** One row of the list of Anliegen. */
export interface AnliegenRow {
  root: AnliegenRoot
  title: string
  /** Parliament's citation where the list gives one that `anliegenCitation` cannot build — „56/PET-BR/2024" carries the year. */
  citation?: string
  arrivedAt: string | null
  /** The date of the last stage, where the item's record was read; else null. */
  lastStepAt: string | null
  /** Where it stands, from the same record read; null where the record did not arrive within the budget — never a guess. */
  state: AnliegenState | null
  /** List 143's `AKTIV`; null where that list did not answer. */
  open: boolean | null
  counts: AnliegenCounts
}

/**
 * GET /api/anliegen?gp= — the rows of a period, and the kinds whose list
 * could not be read (never counted as none). The Petitionen an den
 * Bundesrat come whole, whatever the period: the Bundesrat has none.
 */
export interface AnliegenListResponse {
  gp: string
  /** The running period, as the server read it — the period select's newest option. */
  currentGp: string
  rows: AnliegenRow[]
  unread: { kinds: AnliegenKind[] }
  /** Every Petition an den Bundesrat; `unread` where list 101 did not answer for them — then `rows` is empty and says nothing. */
  bundesrat: { rows: AnliegenRow[]; unread: boolean }
}
