import type { DescriptionBlock, DraftDocument, TraceLink } from './common'
import type { StatementsSummary } from './statements'
import type { RisMapRow } from './ris'
import type { LawStationId } from './lawDiff'

export interface DraftSummary {
  /** Gesetzgebungsperiode, e.g. "XXVIII" */
  gp: string
  /** Item number within the GP */
  inr: number
  /** e.g. "133/ME" */
  citation: string
  title: string
  /** Ressort short code, e.g. "BMF" */
  ministryCode: string
  /** Full ministry name */
  ministryName: string
  /** ISO date (Einlangen) */
  arrivedAt: string
  /** ISO date — end of Begutachtungsfrist; null when upstream has none */
  deadline: string | null
  /** Frist still running (upstream server-computed AKTIV flag) */
  active: boolean
  statementCount: number
  /** Absolute URL of the parlament.gv.at detail page */
  parliamentUrl: string
  /**
   * Where the draft stands, when the station map was readable — absent
   * means "we could not look", never "nothing happened". The list says
   * which of the two it is rather than rendering a silent `begutachtung`
   * over a corpus it failed to resolve.
   */
  chain?: DraftChain
}

/**
 * Where a draft stands now — the detail page's stations
 * (`app/utils/spine.ts`) minus `entwurf`, which is a document, not a
 * place the procedure can be at. One vocabulary for the spine and the list
 * filter (docs/architecture.md §12.26).
 */
export type DraftStation = 'begutachtung' | 'rv' | 'parlament' | 'bgbl'

/**
 * Whether a Gesetzgebungsperiode's ME→RV links are in the archive at all,
 * and therefore whether absence of a Vorlage carries any meaning there
 * (`shared/utils/draftStations.ts`, docs/architecture.md §12.27). `unknown`
 * is treated as `unlinked` at every point where a claim would be made.
 */
export type ChainCoverage = 'linked' | 'unlinked' | 'unknown'

/** What the stage record says became of a draft. Every field is a fact read
 *  upstream, never an inference: no Vorlage means the stage record names
 *  none, which is not the same as "the draft failed". */
export interface DraftChain {
  station: DraftStation
  /** e.g. "594 d.B."; null while the draft is still at its Begutachtung. */
  rvCitation: string | null
  /**
   * The Vorlage's Einlangen in the Nationalrat, ISO; null when the draft has
   * no Vorlage or list 101 carries no sortable date for it.
   *
   * Read off the Vorlagen list the station map already fetches for the
   * house status, so it costs no upstream request. It exists because a row
   * whose window is the zweite Runde has no Frist to date itself by — the
   * form closes with the vote — and the one date it does have is this one
   * (docs/architecture.md §12.28).
   */
  rvDate: string | null
  /** e.g. "Bundesgesetzblatt I Nr. 81/2026"; null until promulgated. */
  bgblNumber: string | null
  /** Stellungnahmen can still be filed on the Vorlage — the zweite Runde. */
  filingOpen: boolean
}

/** A TraceLink that knows which station of the process it belongs to. */
export interface TextVersion extends TraceLink {
  /** Upstream's own wording: "Regierungsvorlage", "Geändert im Ausschuss", … */
  station: string
  /**
   * The station as the comparison addresses it, or null for a document that
   * sits in this list without being a version of the law text — a
   * Verhältnismäßigkeitsprüfung, a Vertragstext. Those stay listed as
   * documents and are never offered as a side to compare
   * (`shared/utils/lawStations.ts`).
   */
  stationId: LawStationId | null
}

/** One step of the parliamentary process history (from ME detail stages[]) */
export interface TraceStep {
  /** ISO date, null when the stage carries no date */
  date: string | null
  /** Plain text — upstream HTML stripped server-side */
  text: string
  /** Absolute URLs extracted from the stage HTML */
  links: TraceLink[]
}

/**
 * Parliament forwarding the Stellungnahmen to the ressort — across the
 * XXVIII corpus the only stage that is neither Einlangen, Fristende nor
 * Regierungsvorlage, and the moment the ball is back with the ministry.
 */
export interface Handoff {
  /** ISO date, null when the stage carries none */
  date: string | null
  /** Recipient as parliament words it ("das Bundesministerium für Justiz") */
  recipient: string
}

/**
 * Another Ministerialentwurf whose title names the same laws — equal
 * normalised title tokens (docs/architecture.md §12.10), nearest by
 * arrival. The claim the UI may make is exactly that, "gleichlautend", never
 * "the same text": "Tierschutzgesetz, Änderung" recurs every few years.
 */
export interface RelatedDraft {
  gp: string
  inr: number
  /** e.g. "32/ME" */
  citation: string
  title: string
  /** ISO date (Einlangen) */
  arrivedAt: string
  deadline: string | null
  /** Whether that draft produced a Regierungsvorlage; null when not checked */
  hasRv: boolean | null
}

/** "Was wurde daraus" — filled once a Regierungsvorlage exists */
export interface EnactmentInfo {
  /** e.g. "2238 d.B." */
  rvCitation: string
  rvUrl: string
  /** The Regierungsvorlage's own Gesetzestext (PDF) — the text to hold
      against the draft. Null when upstream ships no text for it. */
  rvTextUrl: string | null
  /** Date of the stage carrying the RV link — the RV station's date in the
      SpineRail. Null when that stage is undated. */
  rvDate: string | null
  /** Earlier Regierungsvorlagen from the same draft. ME→RV is 1:n and the
      split is real (4 of 132 in the XXVIII corpus, e.g. 74/ME → 443 + 444
      d.B.); without this the extra RVs are invisible. */
  furtherRv: TraceLink[]
  /** e.g. "Bundesgesetzblatt I Nr. 5/2024" — null while not enacted */
  bgblNumber: string | null
  bgblRisUrl: string | null
  /**
   * Whether parliament currently accepts Stellungnahmen on this Vorlage —
   * upstream's `statementsstate` on the RV's detail JSON, "1" while the
   * Nationalrat has the text, "0" once it voted. The second window for
   * input; false when the RV record could not be read.
   */
  filingOpen: boolean
}

/**
 * Detail of one Ministerialentwurf.
 *
 * `statementCount` is deliberately omitted from the inherited summary: the
 * detail response carries exactly ONE statement number, `statements.total`,
 * aggregated from list 142 — the same source as the breakdown below it.
 * Two independently cached numbers for the same fact drifted apart in
 * practice (card said 4, detail page said 1).
 */
export interface DraftDetail extends Omit<DraftSummary, 'statementCount'> {
  /** Colloquial short name derived from the official title ("BuStAG",
      "Budgetbegleitgesetz 2026") — journalists cite by it and it fits a
      tab; null when no clearly name-like handle exists. */
  shortTitle: string | null
  /** Kurzinformation (Ziel, Inhalt, …) as typed blocks; empty when absent */
  description: DescriptionBlock[]
  /** Minister who submitted the draft ("Übermittelt von"), null if absent */
  invitedBy: string | null
  documents: DraftDocument[]
  handoff: Handoff | null
  /** Versions AFTER the Regierungsvorlage (committee, plenary), one document
      per station with its formats — rendered like the Entwurfsdokumente. The
      RV's own text is `enactment.rvTextUrl`, so no station appears twice. */
  textEvolution: DraftDocument[]
  statements: StatementsSummary
  enactment: EnactmentInfo | null
  /** The RIS Begut record of this draft (docs/ris-join.md); null when the
      RIS map was unavailable. `status` says whether RIS has the draft at all. */
  risDraft: RisMapRow | null
  /**
   * The draft's Gesetzgebungsperiode is over — a later GP is running. A
   * Ministerialentwurf stays with the GP it was filed in; measured on GP
   * XXVII, 4 of the 61 drafts still without a Regierungsvorlage at the
   * GP's end got one in the next GP, so "bisher keine" turns into a
   * boundary statement here, not into "never" (app/utils/outcomes.ts).
   */
  gpEnded: boolean
  /** Its last day (the day before the next Nationalrat convened, Art. 27
      B-VG); null while it runs, or when the boundary predates the table
      in shared/utils/gp.ts (before GP XX). */
  gpEndedOn: string | null
  /** Whether this GP's ME→RV links exist at all — the gate on every "no
      Regierungsvorlage" statement this page would otherwise make
      (docs/architecture.md §12.27). Enrichment, so `unknown` is the
      answer whenever the station map was not there to ask. */
  chainCoverage: ChainCoverage
  /** Earlier same-title draft that produced NO Regierungsvorlage — the
      "second attempt" context on the later draft's page. Null otherwise: a
      routine repeat amendment of a law that did pass is not a relation
      worth a sentence. Searched in this and the previous GP. */
  predecessor: RelatedDraft | null
  /** Later same-title draft; only while this one has no Regierungsvorlage,
      searched in this and the next GP. `hasRv` stays null (not checked). */
  successor: RelatedDraft | null
}

export type DraftStatus = 'open' | 'closed' | 'all'

export interface DraftsResponse {
  items: DraftSummary[]
  total: number
  gp: string
  availableGps: string[]
  /** Distinct ministries present in the requested GP (for the filter UI) */
  ministries: { code: string; name: string }[]
  /**
   * Whether the station map could be read for this period. False means the
   * rows carry no `chain` and a station filter was NOT applied — the list
   * says so instead of showing an unfiltered list under an active filter.
   */
  stationsAvailable: boolean
  /**
   * Whether this period's ME→RV links are in the archive at all. `unlinked`
   * means the rows deliberately carry no `chain` although the map was read
   * fine: not one draft of the period links to a Vorlage, so a station on
   * every row would have read as "all of them shelved" — a claim list 101
   * contradicts (docs/architecture.md §12.27).
   */
  chainCoverage: ChainCoverage
}
