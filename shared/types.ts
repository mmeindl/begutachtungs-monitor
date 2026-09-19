/**
 * Shared contract between server routes and the app.
 * Server routes map upstream Parliament API data into these shapes;
 * pages/components consume ONLY these types — never raw upstream rows.
 *
 * GDPR invariant: names of private individuals never leave the server.
 * `StatementMeta.submitterName` is non-null only for organisations.
 */

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
 * (`shared/utils/stations.ts`) minus `entwurf`, which is a document, not a
 * place the procedure can be at. One vocabulary for the spine and the list
 * filter (docs/architecture.md §12.26).
 */
export type DraftStation = 'begutachtung' | 'rv' | 'parlament' | 'bgbl'

/**
 * Whether a Gesetzgebungsperiode's ME→RV links are in the archive at all,
 * and therefore whether absence of a Vorlage carries any meaning there
 * (`shared/utils/draftChain.ts`, docs/architecture.md §12.27). `unknown`
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
   * Einlangen der Vorlage im Nationalrat, ISO; null when the draft has no
   * Vorlage or list 101 carries no sortable date for it.
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

export interface DocumentFormat {
  type: 'pdf' | 'html'
  url: string
}

export interface DraftDocument {
  title: string
  formats: DocumentFormat[]
}

/**
 * One block of the Kurzinformation (`content.shortinfo`).
 *
 * Upstream ships real semantic HTML — `<h4>Ziel</h4>`, `<ul><li>…` — and the
 * server maps it into these typed blocks rather than flattening it to text or
 * forwarding the markup. Every field is plain text, so nothing upstream can
 * inject HTML into our pages.
 */
export type DescriptionBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] }

export interface TraceLink {
  label: string
  url: string
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

export interface StatementsSummary {
  total: number
  organisations: number
  privatePersons: number
  nonPublic: number
  /**
   * Set when list 142 was unavailable or inconsistent with list 81: `total`
   * then comes from the list-81 counter and the breakdown/organisationList
   * are unknown (zeros/empty) — render a hint instead of the panel.
   */
  degraded?: boolean
  /**
   * The list-81 overview counter (what the cards show). The two upstream
   * sources drift systematically — when it disagrees with `total`, the UI
   * states the provenance instead of silently contradicting itself.
   */
  overviewTotal?: number | null
  /**
   * Set when the live list-142 fetch failed and a previously fetched
   * aggregation is served instead (ISO timestamp of that fetch) —
   * staleness is always visible, never silent.
   */
  staleAsOf?: string | null
  /**
   * EVERY organisation that filed, not a top-n selection — private persons
   * are never listed by name. Sorted by endorsements desc, then name: the
   * UI splits it at "endorsements > 0" but the ordering is the contract.
   *
   * ONE ENTRY PER ORGANISATION, not per Stellungnahme: the same office can
   * file more than once in one Verfahren (132/ME: Amt der Tiroler
   * Landesregierung as 95/SN and 103/SN), which used to render the same name
   * twice with nothing to tell the rows apart.
   *
   * Capped (ORG_LIST_CAP) above every population measured in GP XXVIII
   * (32/ME: 100 organisations). `organisations` stays the true count of
   * organisation *statements*, so both the partition above and a capped
   * list stay detectable.
   */
  organisationList: {
    name: string
    /** Summed over this organisation's statements (usually exactly one). */
    endorsements: number
    /** Chronological; every one of them links to its own upstream page. */
    statements: {
      /** e.g. "95/SN-132/ME" */
      citation: string
      /** ISO date, null when upstream ships none */
      date: string | null
      endorsements: number
      parliamentUrl: string
    }[]
  }[]
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
  /** The complete upstream stage record. Kept as raw material (accountability
      layer, history snapshots); the UI renders it condensed into the SpineRail
      and `handoff` rather than as a second timeline. */
  trace: TraceStep[]
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
   * boundary statement here, not into "never" (shared/utils/outcomes.ts).
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

export type SubmitterKind = 'organisation' | 'person' | 'nonpublic'

export interface StatementMeta {
  /** e.g. "476/SN-88/ME" */
  citation: string
  /** ISO date */
  date: string | null
  submitterKind: SubmitterKind
  /** Organisation name; ALWAYS null for persons (GDPR) and nonpublic */
  submitterName: string | null
  endorsements: number
  /** Public source page on parlament.gv.at */
  parliamentUrl: string
}

/**
 * Where one Stellungnahme's own text actually is. `pdf` when the submitter
 * uploaded a file, `page` when they typed into the web form and the text
 * lives on the parliament page — measured 2026-09-16 over 60 statements of
 * 132/ME: 14 PDFs against 46 web-form submissions, and every organisation
 * in that sample uploaded a file.
 */
export interface StatementDocument {
  kind: 'pdf' | 'page'
  url: string
}

/**
 * The Stellungnahmen on the Regierungsvorlage a draft became — the second
 * window for input, on parliament's side (`/api/drafts/:gp/:inr/rv-stellungnahmen`).
 * Same shape as the Begutachtung's summary, so the same rows render it.
 */
export interface RvStatementsResponse {
  /** e.g. "2238 d.B." */
  rvCitation: string
  /** The Vorlage's page on parlament.gv.at, which lists them all. */
  rvUrl: string
  /** Upstream's count — known above the cap too. */
  total: number
  /** Null above `cap`: the count is shown, the breakdown deliberately not fetched. */
  summary: StatementsSummary | null
  cap: number
}

export interface StatementsResponse {
  items: StatementMeta[]
  /**
   * Set when list 142 was unavailable and the persisted last-good
   * aggregation is served instead (ISO timestamp of that fetch) — same
   * contract as `StatementsSummary.staleAsOf`: stale is served, never
   * as fresh.
   */
  staleAsOf?: string | null
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

export interface DashboardPayload {
  gp: string
  /** Active consultations, sorted by deadline ascending (soonest first) */
  open: DraftSummary[]
  stats: {
    openCount: number
    closingWithin7Days: number
    statementsTotalGp: number
    consultationsTotalGp: number
  }
  /** Top 5 of the GP by statement count, descending */
  topByStatements: DraftSummary[]
}

/** One recently closed consultation with its resolved chain state.
 *  Extends the summary so the SAME card component renders both the open
 *  list and the outcome section — one anatomy, one hover, no sibling
 *  component drift. */
export interface ClosedOutcome extends DraftSummary {
  /** e.g. "474 d.B." — null while no Regierungsvorlage exists */
  rvCitation: string | null
  /** e.g. "Bundesgesetzblatt I Nr. 37/2026" — null while not enacted */
  bgblNumber: string | null
}

/**
 * Payload of /api/dashboard/outcomes — what became of the drafts the volume
 * ranking shows (`DashboardPayload.topByStatements`).
 */
export interface DashboardOutcomes {
  /**
   * CLOSED ROWS ONLY, and a row whose Gegenstand could not be read is left
   * out rather than reported as "bisher keine Regierungsvorlage": an
   * unresolved outcome and a missing Regierungsvorlage are different
   * claims, and only one of them is ours to make. The rows themselves come
   * from `/api/dashboard`, so the section renders with or without this —
   * without it, simply uncharted.
   */
  rankedOutcomes: ClosedOutcome[]
}

/**
 * Payload of /api/dashboard/enacted — "Zuletzt Gesetz geworden".
 *
 * The rows are Ministerialentwürfe again, not Vorlagen: the monitor's object
 * is the Begutachtung, and the card that renders them is the one every other
 * section uses. `bgblNumber` is non-null throughout by construction — a row
 * without a Kundmachung is not in this list.
 */
export interface DashboardEnacted {
  /** Newest promulgation first; empty is a normal state, not an error. */
  items: ClosedOutcome[]
}

/**
 * One Regierungsvorlage that is taking Stellungnahmen right now — the second
 * window for input, which closes with the vote and has no published Frist.
 */
export interface OpenVorlage {
  /** e.g. "594 d.B." */
  citation: string
  title: string
  /** Einlangen im Nationalrat, ISO; '' when upstream has no sortable date. */
  date: string
  /** The Vorlage's page, where the form is. */
  parliamentUrl: string
  /** Stellungnahmen filed on the Vorlage so far; null when the count failed. */
  statementCount: number | null
  /**
   * Die Begutachtung, aus der diese Vorlage kam — in drei Zuständen, weil
   * zwei zu wenig sind.
   *
   * Bis 18.09.2026 stand hier `draft: … | null`, und `null` musste zwei
   * Dinge zugleich heißen: „wir haben keine Seite dafür" und „es gab keine
   * Begutachtung". Gezeigt wurde das zweite („ohne Begutachtung"), belegt war
   * nur das erste — `preconst` ist kein universelles Feld, und auf GP XXVIII
   * fehlt es bei 32 von 117 Vorlagen ganz (`server/utils/precedingDraft.ts`).
   *
   *  - `draft` — die Vorlage nennt ihren Ministerialentwurf selbst. Der
   *    einzige Zustand, in dem eine Zeile auf unsere eigene Seite zeigt.
   *  - `none` — kein Zeiger, UND die Gegenprobe gegen Liste 81 findet keinen
   *    Entwurf, der ihr vorausgegangen sein könnte. Erst hier steht „ohne
   *    Begutachtung" in der Zeile.
   *  - `unknown` — kein Zeiger, aber ein plausibler Entwurf. Die Zeile sagt
   *    dann nichts: eine Titelähnlichkeit trägt keine Aussage über ein
   *    Regierungsvorhaben, in keine der beiden Richtungen.
   *
   * `none` und `unknown` verlinken beide nach außen; die Unterscheidung
   * betrifft nur, was behauptet wird (`docs/begutachtung-uebersprungen.md`).
   */
  consultation:
    | { kind: 'draft', gp: string, inr: number }
    | { kind: 'none' }
    | { kind: 'unknown' }
}

export interface DashboardSecondRound {
  /**
   * The period these Vorlagen are from — always the current one, and stated
   * rather than assumed: `/entwuerfe` shows this section under a period
   * filter, and a list narrowed to an earlier GP must not carry rows from
   * this one. Inferring "current" from the newest period in the draft lists
   * would be a second, silently different answer to the same question.
   */
  gp: string
  /** Filing open, most recent first. Empty is a normal state, not an error. */
  items: OpenVorlage[]
}

// ---------------------------------------------------------------------------
// RIS ↔ ME mapping (docs/ris-join.md)
// ---------------------------------------------------------------------------

export type RisJoinStatus = 'matched' | 'matched_weak' | 'ambiguous' | 'unmatched'

export interface RisMapRow {
  citation: string
  inr: number
  status: RisJoinStatus
  /** A ≥ 0.90, B ≥ 0.75, C = weak dates+ministry rule; null when not matched */
  tier: 'A' | 'B' | 'C' | null
  /** RIS Technisch.ID, e.g. BEGUT_COO_2026_100_2_1836568 */
  risId: string | null
  risKurztitel: string | null
  /** Human-readable RIS page of the draft */
  risUrl: string | null
  /** RIS main document (draft text) in the formats RIS offers */
  risDocument: { html: string | null; xml: string | null; pdf: string | null } | null
  /**
   * The ressort's Textgegenüberstellung — current law against proposed law,
   * written by the ministry itself. Null when the draft carries none;
   * `xml` null when RIS offers only a scan (docs/api-exploration.md §2c).
   */
  textComparison: { html: string | null; xml: string | null; pdf: string | null } | null
  /**
   * The Erläuterungen as their own RIS document — the Allgemeiner Teil a
   * reader triages the draft by. Carried here for the same reason as the
   * annex above: Parliament publishes the document only as a PDF, RIS as
   * typed XML, so the readable copy is reachable only through this join.
   */
  explanations: { html: string | null; xml: string | null; pdf: string | null } | null
  score: number | null
  /**
   * RIS's own start of the Begutachtungsfrist (ISO date) — the day the annex
   * was written, and therefore the version of the standing law its left
   * column claims to quote. The reference date for checking that claim
   * (`annexCheck.ts`): taking it from anywhere else moved one draft's score
   * from 66,7 % to 88,9 %, which made the measurement an argument about the
   * date rather than about the parse.
   */
  risBeginn: string | null
  /** RIS Beginn − Parliament Einlangen, days */
  beginnOffsetDays: number | null
  /** RIS Ende − Parliament Frist, days; a non-zero value is a Fristabweichung */
  endeOffsetDays: number | null
  /**
   * RIS's own end of the Begutachtungsfrist (ISO date). Carried so a page can
   * NAME the diverging date instead of only the offset — while the Frist
   * runs, "the other official source says the 21st" is actionable and "31
   * days off" is a riddle.
   */
  risEnde: string | null
  reason: string | null
}

export interface RisMapResponse {
  gp: string
  ruleVersion: number
  /** ISO timestamp of the RIS fetch this map was computed from */
  risFetchedAt: string
  risRecordsConsidered: number
  counts: Record<RisJoinStatus, number>
  rows: RisMapRow[]
}

// ---------------------------------------------------------------------------
// Begutachtungen without a parliamentary Gegenstand (docs/architecture.md §12.16)
// ---------------------------------------------------------------------------

/**
 * What kind of legal instrument a RIS-only Begutachtung is about.
 *
 * From `classifyRisRecord`, which reads the title — RIS Begut carries no
 * type field. It was built as a score penalty inside the RIS↔ME join, where
 * a wrong guess was outvoted by dates and titles; putting it on screen makes
 * it a factual claim, so it was checked against the join as an oracle
 * (`pnpm audit:verordnungen`): of 472 records that the join tied to a real
 * Ministerialentwurf — which Parliament's list 81 only ever carries for
 * Gesetzesentwürfe — not one is classified `verordnung`.
 *
 * `unbestimmt` is the honest third state: a record whose title names no type
 * word (Staatsverträge, Vereinbarungen, programmes). The UI names the source
 * rather than guessing a type for it.
 */
export type RisConsultationKind = 'verordnung' | 'gesetz' | 'unbestimmt'

/**
 * One Begutachtung that RIS publishes and Parliament does not have a
 * Gegenstand for — two thirds of the whole pre-parliamentary corpus
 * (3.012 of 4.574 records on 2026-09-17).
 *
 * Deliberately NOT a `DraftSummary`: almost every field of that shape is a
 * promise this record cannot keep. There is no Geschäftszahl (the identity
 * is the RIS document ID), no Stellungnahmen list, no submitter counts and
 * no ME→RV chain, because none of those exist without a parliamentary
 * Gegenstand. Modelling it as a draft with null fields would have spread
 * "unknown" through a type whose readers treat those fields as known.
 */
export interface RisConsultation {
  /** `Metadaten.Technisch.ID` — the only stable identity this record has. */
  id: string
  kind: RisConsultationKind
  /** Kurztitel where RIS has one, else the long Titel. */
  title: string
  /** The full official Titel, when it says more than `title`; else null. */
  longTitle: string | null
  /** Ressort short code, e.g. "BMLUK"; '' when RIS names no parsable code. */
  ministryCode: string
  /** Full ministry name as RIS words it. */
  ministryName: string
  /** ISO date — BeginnBegutachtungsfrist; null when RIS has none. */
  startedAt: string | null
  /** ISO date — EndeBegutachtungsfrist; null when RIS has none. */
  deadline: string | null
  /** Frist still running, computed from `deadline` against today. */
  active: boolean
  /** The record's human-readable page on ris.bka.gv.at. */
  risUrl: string
  /**
   * Der Ausgang: kundgemacht, und wo (§12.32).
   *
   * Auf der BASIS und nicht erst auf dem Detailsatz, weil die Liste ihn
   * genauso braucht — die Spalte „Stand" sagte auf jeder abgeschlossenen
   * Zeile „Begutachtung abgeschlossen", auch wo die Verordnung längst galt.
   *
   * Null heißt „nicht ermittelt", NICHT „nicht kundgemacht": Beide Wege
   * dorthin haben ein Zeitbudget, und was darin nicht fertig wurde, darf
   * keine Aussage über das Ressort werden. Der Negativbefund heißt
   * `state: 'keine'` und steht im Objekt.
   */
  outcome: BgblOutcome | null
}

/**
 * The same record with its documents — everything the Begutachtung
 * published, which for two thirds of these is more than the first look
 * suggested: 72,1 % carry Erläuterungen, 79,4 % a Begleitschreiben.
 */
export interface RisConsultationDetail extends RisConsultation {
  /** The draft text itself; always present in the measured corpus. */
  mainDocument: RisDocumentFormats
  /** The ministry's reasoning — Allgemeiner and Besonderer Teil. */
  explanations: RisDocumentFormats | null
  /** Current law against proposed law, where the ministry wrote one. */
  textComparison: RisDocumentFormats | null
  /**
   * The Begleitschreiben. It names the address a Stellungnahme goes to, and
   * for these procedures that is the ONLY way to file one: there is no
   * parliamentary form, because there is no Gegenstand.
   */
  coverLetter: RisDocumentFormats | null
}

export interface RisDocumentFormats {
  html: string | null
  xml: string | null
  pdf: string | null
}

export interface RisConsultationsResponse {
  items: RisConsultation[]
  /** Rows after the filters — what the result line counts. */
  total: number
  /**
   * Rows in the GP BEFORE any filter. The page states the denominator next
   * to `withGegenstand`, and that sentence must not move when someone picks
   * a ministry — it describes the period, not the current view.
   */
  gpTotal: number
  /** The Gesetzgebungsperiode whose window was searched. */
  gp: string
  availableGps: string[]
  /** Distinct ministries present in the result's GP (for the filter UI). */
  ministries: { code: string; name: string }[]
  /**
   * How many of the GP's RIS records DO have a Ministerialentwurf behind
   * them — the other half of the denominator, so a page can say what it is
   * leaving out instead of implying it is everything.
   */
  withGegenstand: number
  /**
   * Ministerialentwürfe whose RIS record the join could not decide
   * (`ambiguous`). While this is 0 the list above is exact; above 0 it can
   * carry that many rows too many, because the record belonging to such an
   * ME stays unclaimed and reads as "no Gegenstand". Measured 0 in GP XXVII
   * and GP XXVIII — surfaced rather than assumed away.
   */
  undecided: number
}

// ---------------------------------------------------------------------------
// ME → RV text comparison (docs/ris-join.md §6)
// ---------------------------------------------------------------------------

/**
 * A station of the procedure whose law text can be one side of the §
 * comparison (`shared/utils/lawStations.ts`, docs/architecture.md §12.18).
 *
 * Not the same list as the five reader-facing stations in
 * `shared/utils/stations.ts`: Begutachtung and Bundesgesetzblatt publish no
 * Gesetzestext of their own, and these four do.
 */
/**
 * `bgbl` ist seit 19.09.2026 dabei und ist anders als die vier davor: Seine
 * Fassung steht nicht beim Parlament, sondern im RIS, und zwischen ihr und
 * der Plenarfassung handelt KEIN Akteur mehr (§12.33).
 */
export type LawStationId = 'me' | 'rv' | 'ausschuss' | 'plenum' | 'bgbl'

export type LawUnitChange = 'unchanged' | 'changed' | 'inserted' | 'removed'

export interface LawDiffSegment {
  type: 'equal' | 'removed' | 'inserted'
  text: string
}

/**
 * GET /api/drafts/:gp/:inr/paragraphtitel — the heading of each § a
 * change amends, looked up in the standing law (docs/architecture.md §12.11).
 *
 * Keyed by `unitKey` (shared/utils/diffKey.ts) so it merges straight onto the
 * diff units — `article|id|change`, because a Regierungsvorlage can carry a
 * removed and an inserted unit with the same Ziffer number. A
 * missing key means no name could be resolved with certainty, which is the
 * normal case for a Stammgesetz and for any § the lookup could not verify.
 */
/** One law in force that a draft would amend. */
export interface AmendedLaw {
  /** The law's Kurztitel from RIS; the draft's own Artikel title where RIS
   *  could not resolve it; the bare BGBl citation as a last resort. */
  title: string
  /** The Stammnorm citation from the Promulgationsklausel, null where the
   *  clause names none (a Stammnorm that is no BGBl at all, e.g. the UGB's
   *  "dRGBl. S. 219/1897"). */
  bgbl: string | null
  /** RIS consolidated text at `asOf`, null when no Gesetzesnummer resolved. */
  risUrl: string | null
}

export interface AmendedLawsResponse {
  gp: string
  inr: number
  /** ISO date of the law version linked — the draft's Einlangen. */
  asOf: string | null
  /** The draft creates law rather than amending it, so there is no standing
   *  text to compare against. Distinct from an empty `laws` list, which can
   *  also mean the draft text was not readable. */
  createsNewLaw: boolean
  laws: AmendedLaw[]
}

export interface ParagraphTitlesResponse {
  gp: string
  inr: number
  /** ISO date of the law version the titles were read from (the draft's Einlangen) */
  asOf: string | null
  titles: Record<string, string>
}

/**
 * Warum ein Paragraph der eigenen konsolidierten Lesefassung nicht angezeigt
 * wird (`server/utils/konsGate.ts`, docs/architecture.md §12.12).
 *
 * Die Sätze dazu stehen im Gate, nicht hier: Sie sind eine Entscheidung mit
 * Tests, keine Typdefinition.
 */
export type ConsolidatedWithheldCause =
  | 'verweigert'
  | 'unplausibel'
  | 'kein-anhang'
  | 'anhang-schweigt'
  | 'anhang-widerspricht'

/** Ein Paragraph, wie er nach den Anweisungen des Entwurfs lauten würde. */
export interface ConsolidatedParagraph {
  /** Das Gesetz des Pakets, dessen § das ist; null bei einer Einzelnovelle. */
  law: string | null
  /** „Artikel 5" — nur bei einem Paket gesetzt. */
  article: string | null
  /** Die Nummer, „22" — dieselbe Schreibweise wie in der Gegenüberstellung. */
  id: string
  /** „§ 22" */
  label: string
  /** Die Überschrift des § NACH dem Entwurf; sie kann selbst geändert sein. */
  heading: string | null
  /** Der geltende Text zum Stichtag, wie das RIS ihn führt. */
  before: string
  /** Derselbe §, nachdem die Anweisungen dieses Entwurfs angewendet wurden. */
  after: string
  /** Wortdiff zwischen beiden — dieselbe rot/grün-Sprache wie sonst auf der Seite. */
  segments: LawDiffSegment[]
  /** Die geltende Fassung im RIS, zum Stichtag: die Quelle der linken Seite. */
  risUrl: string | null
}

/**
 * Die eigene konsolidierte Lesefassung eines Entwurfs — „so läse sich das
 * Gesetz danach" (docs/architecture.md §12.12).
 *
 * `touched` ist die Bezugsgröße, ohne die `paragraphs` eine Lüge wäre: Ein
 * Entwurf ändert zwei Dutzend Paragraphen, gezeigt werden im Median 12 % von
 * ihnen, und Abwesenheit darf auf dieser Seite nie wie „unverändert"
 * aussehen (§12.27).
 */
export interface ConsolidatedTextResponse {
  gp: string
  inr: number
  available: boolean
  unavailableReason: string | null
  /** Stichtag der geltenden Fassung: der erste Tag der Begutachtungsfrist. */
  asOf: string | null
  paragraphs: ConsolidatedParagraph[]
  /** Wie viele §§ der Entwurf überhaupt ändert — der Nenner der Anzeige. */
  touched: number
  /** Warum die übrigen fehlen, gezählt und benannt. */
  withheld: { cause: ConsolidatedWithheldCause; label: string; count: number }[]
}

/**
 * Why a § of the Textgegenüberstellung is not shown (`annexCheck.ts`).
 *
 * Three different findings, and the page keeps them apart because they mean
 * different things to a reader — and because two of them can just as well be
 * *our* reading of a PDF as the ministry's document.
 *
 * - `standing` — the annex's **left** column is not accounted for by the
 *   standing § in RIS Bundesrecht. The row is mis-paired, or the annex quotes
 *   a superseded version of the law. Does not mean the ministry got the law
 *   wrong: on the PDF path our own row pairing is at least as likely.
 * - `alreadyStanding` — the **right** column shows as new a run of at least
 *   six comparable words that stands verbatim in the § and is absent from the
 *   left column. Either the left column lost that text (ours to answer for on
 *   the PDF path, the annex's on the table path) or the annex was written
 *   against an older version. Does *not* mean the ministry re-enacted
 *   existing law: a sentence merely moved within the § is present on the left
 *   and never counted here.
 * - `notInDraft` — the right column carries at least eight words that occur
 *   neither in the left column nor in the Novellierungsanordnungen the draft
 *   addresses to *this* §, and less than 90 % of what it shows as new can be
 *   found there. Text has been misfiled into the column, or the draft orders
 *   this change somewhere else than the annex shows it. Not a claim that the
 *   words are absent from the draft as a whole: since 2026-09-10 the
 *   reference is per § (`annexCheck.draftBags`), because the whole draft is
 *   blind to text dragged out of a neighbouring §. Where the Gesetzestext
 *   could not be read at all, the check is disarmed rather than failed, and
 *   text of a § the annex prints no block of its own for is never counted —
 *   that text is inherited by the block it stands in, not missing.
 */
export type AnnexWithheldCause = 'standing' | 'alreadyStanding' | 'notInDraft'

/** One row of the ressort's Textgegenüberstellung (docs/api-exploration.md §2c). */
export interface TextComparisonRow {
  kind: 'article' | 'pair'
  /**
   * Which law of the package the row belongs to. Null when the draft amends
   * one law, and null when the annex does not mark its boundaries: § 5 of the
   * second law of a package is a different provision from § 5 of the first,
   * and 15,1 % of designations in the multi-law annexes recur in another law
   * of the same package — so an unattributed row is the honest answer.
   */
  law: string | null
  heading: string | null
  /** "§ 5." when the row opens a paragraph; null for a row that continues one */
  gld: string | null
  /** The § the row belongs to, inherited where the row opens none of its own */
  para: string | null
  current: string
  proposed: string
  change: LawUnitChange
  /** The ressort's own yellow marking — recorded, but the word diff decides */
  marked: boolean
  /** "2. bis 26b. …": unchanged text the annex leaves out on purpose */
  elided: boolean
  segments: LawDiffSegment[] | null
  editorial: boolean
  /**
   * How the row's "Geltende Fassung" fared against the standing law in RIS
   * (`annexCheck.ts`).
   *
   * - `verified` — the row's § carried enough prose to judge, the standing §
   *   accounts for its left column, and neither right-column rule fired; the
   *   diff beside it means what it says. Nothing else earns this label: it is
   *   a claim we make, not a default.
   * - `unchecked` — everything the check did not vouch for. No Stammnorm
   *   resolved, RIS holds no such §, the § is held there as a table, the
   *   ceiling cut the run short, the check never ran at all, the row shows
   *   too little text to judge — or the row carries no § designation, so no
   *   verdict can address it. Shown, and said to be unchecked. Article
   *   heading rows are `unchecked` too: they carry no law text to check.
   * - `withheld` — one of the three checks refused the § (`withheldCause`).
   *   `current`, `proposed` and `segments` are emptied before the response
   *   leaves the server: a wrong comparison must not be renderable at all.
   */
  check: 'verified' | 'unchecked' | 'withheld'
  /**
   * Which check refused the row's §, present only on a withheld row. The
   * notice that replaces the text stands inside the §, so it has to be able
   * to name what was found *there* rather than one sentence for all three
   * causes.
   */
  withheldCause?: AnnexWithheldCause
}

/**
 * GET /api/drafts/:gp/:inr/gegenueberstellung — the draft's official
 * comparison of current law against proposed law, when it carries one.
 * `available: false` with a German reason otherwise; roughly six in ten
 * drafts have the annex and four in ten of those only as a scan.
 */
export interface TextComparisonResponse {
  gp: string
  inr: number
  available: boolean
  unavailableReason: string | null
  /**
   * The document the rows were read from, in the format they were read from —
   * and where nothing could be read, the next best thing to look at: the
   * annex's HTML version at Parliament, or the RIS record whose assignment to
   * this draft is in doubt. The label says which; the page prints it.
   */
  source: TraceLink | null
  /**
   * Die Vorbemerkung der Quellenzeile, samt Lizenz — „Quelle (CC BY 4.0,
   * RIS):" oder, wo die Kopie des Parlaments gelesen wurde, ohne
   * Lizenzangabe.
   *
   * Serverseitig, weil hier die Quelle gewählt wird: Der Abschnitt hatte den
   * CC-BY-Satz festverdrahtet, und sobald dieselbe Sektion ein Dokument des
   * Parlaments liest, ist das eine Lizenzbehauptung, die niemand geprüft hat
   * (§13.1, Frage E3 offen).
   */
  credit: string
  /**
   * The annex as a PDF, for a reader to open where we could not read it: the
   * RIS scan, or Parliament's copy for the drafts whose RIS record carries no
   * annex at all (11 of 130 matched GP-XXVIII drafts, measured 2026-09-10).
   */
  pdf: TraceLink | null
  /**
   * Which document the rows were read from, because the two are not the same
   * claim. `table` is the ressort's own XML table — its structure, its
   * pairing. `pdf` is the ressort's text with **our** reading of its page
   * geometry on top, for the annexes RIS publishes only as images.
   *
   * The page needs the difference for its wording: where a whole law's §§
   * fail the RIS check, the cause on the table path is most likely the
   * ministry quoting an older version, and on the PDF path just as likely
   * our own row pairing. Blaming the ministry for the second would be both
   * wrong and against the framing rule.
   */
  readFrom: 'table' | 'pdf' | null
  /**
   * Pages of the annex PDF whose geometry the parse could not vouch for and
   * therefore did not read (`annexPdf.ts`, `isProven`): a page set to another
   * width than the rest of the document, one carrying a skewed text run, one
   * whose runs disagree about which way the page is turned. Everything below
   * this point reads a column out of a coordinate, and a page set differently
   * is not read differently but *wrongly*, in words that are all real — so it
   * is refused, and the reader is told that something is missing rather than
   * left with a comparison that quietly has a hole in it.
   *
   * **0 on the table path and whenever nothing was dropped**, never
   * `undefined`: the page prints the sentence on `> 0`, and an optional field
   * would make that test silently false wherever the number went missing.
   * Today it is 0 for all 114 GP-XXVIII PDF annexes (measured 2026-09-10) —
   * which is what makes it worth wiring before the corpus produces the first
   * such page rather than after.
   *
   * Pages without any text do not count: nothing on them could be misread.
   */
  droppedPages: number
  /**
   * Set when the draft amends several laws and the annex does not mark where
   * one ends and the next begins. The comparison is shown undivided, and this
   * says why — the alternative is to divide it wrongly.
   */
  boundaryNote: string | null
  stats: { total: number; unchanged: number; changed: number; editorial: number; inserted: number; removed: number }
  /**
   * What the RIS check made of the annex — **never null while `available` is
   * true**, and null only alongside it. The page states these counts: a
   * comparison that quietly drops §§ is a different kind of wrong answer
   * from one that says what it dropped.
   */
  verification: {
    /**
     * At least one § was actually compared against a standing text from RIS.
     *
     * The field exists because the page could not previously tell "nothing
     * failed" from "nothing was looked at" — both showed `judged: 0`, and
     * the rows went out labelled as verified regardless. False here means
     * the comparison is entirely unvouched-for.
     */
    ran: boolean
    /**
     * Why no § could be judged, as a German sentence fragment fit to print
     * after "Nichts konnte geprüft werden: …" — for example "im RIS fehlt
     * der Beginn der Begutachtungsfrist" or "der Entwurf schafft neues Recht
     * oder ist eine Verordnung — es gibt keinen geltenden Text im RIS
     * Bundesrecht". Null exactly when `judged > 0`.
     *
     * A RIS outage never appears here: the request fails instead of
     * answering, so no cache can hold a definitive-sounding sentence about a
     * network hiccup (`textComparisonService.ts`).
     */
    notRunReason: string | null
    /**
     * The date the standing law was read at — RIS's own start of the
     * Begutachtungsfrist, the day the ministry wrote the annex, ISO or null.
     *
     * Named on the page, because "checked against the law in force" is
     * ambiguous without it: a comparison written in March and read today has
     * been held against the March text, and that is the right one to hold it
     * against.
     */
    asOf: string | null
    /**
     * §§ with enough prose to judge, and how many came through every check
     * — the standing text accounts for the left column and neither
     * right-column rule fired.
     *
     * `judged` counts §§ whose *left* column carried enough words to score,
     * so a § withheld by a right-column rule without any judgeable left text
     * is in `withheldParagraphs` and not in `judged`. The two numbers answer
     * different questions and are not meant to subtract.
     */
    judged: number
    verified: number
    /** §§ whose text was withheld, whichever of the three checks refused them */
    withheldParagraphs: number
    /**
     * The same number split by cause; it sums to `withheldParagraphs`,
     * because a withheld § carries exactly the first cause that fired. The
     * page names the causes separately: "the current version is not in RIS
     * like that", "it shows text as new that already applies" and "it carries
     * text the draft's own Gesetzestext does not have" are three different
     * things to a reader, and only the first is about the left column.
     */
    withheldByCause: Record<AnnexWithheldCause, number>
    /**
     * Laws where so many §§ failed that the annex probably quotes another
     * version of the law. Named for the reader; the §§ that verified are
     * still shown, because they verified against the standing text.
     */
    doubtfulLaws: string[]
    /**
     * §§ that show at least one change and carry no verdict — the part of
     * what the reader sees that is unvouched-for.
     *
     * Not every § without a verdict: one whose rows are all unchanged is
     * folded away behind a count and needs no check, and one the draft
     * *inserts* has no standing text to check against, which is the point of
     * it rather than a gap. Counting those made the sentence "… ließen sich
     * nicht prüfen" read as an alarm about the ministry's annex.
     */
    uncheckedParagraphs: number
    /**
     * Rows shown as a change that carry no § designation at all, so no §
     * verdict can address them — counted apart from `uncheckedParagraphs`,
     * which counts §§. They are shown as `unchecked`.
     *
     * A property of the table path. Measured 2026-09-10: it emits 285 rows
     * without a designation, 83 of them shown as a change. On the PDF path a
     * row *is* a provision, cut at the § marker, and the front matter that
     * carries no marker is dropped by the parser instead of being shown as
     * new law — so every row it emits carries a designation and this is 0.
     */
    rowsWithoutParagraph: number
  } | null
  rows: TextComparisonRow[]
}

// ---------------------------------------------------------------------------
// Erläuterungen (docs/architecture.md §12.29)
// ---------------------------------------------------------------------------

/** One passage of the Erläuterungen: a heading and the prose under it. */
export interface ExplanationsPassageView {
  /** As the ministry printed it — „Hauptgesichtspunkte des Entwurfs:". */
  heading: string | null
  text: string[]
}

/**
 * The Allgemeiner Teil of the Erläuterungen — the ministry's own answer to
 * "what is this law supposed to do", which is where a reader's relevance check
 * begins.
 *
 * Unavailability is a normal answer here too, and it has three distinct
 * causes worth telling apart: the draft has no Erläuterungen document at all,
 * the document is a scan, or it is readable but never marks a general part.
 * In each case the document itself is still linked — the section exists to
 * open a document, not to replace it.
 */
export interface ExplanationsResponse {
  available: boolean
  /** Why nothing is shown, as a sentence the page prints. Null when available. */
  unavailableReason: string | null
  /** The document these paragraphs were read from (RIS), for the source line. */
  source: TraceLink | null
  /** The same document to read in full — HTML where RIS offers it, else PDF. */
  document: TraceLink | null
  /** The part heading as printed; null where the ministry headed nothing. */
  heading: string | null
  /**
   * Whether a part of the document actually said „Allgemeiner Teil".
   *
   * False means the prose was taken as the general part because the document
   * carried no part headings (16,4 % of the 2024+ window). The page says so
   * rather than claiming a structure the ministry did not write.
   */
  labelled: boolean
  passages: ExplanationsPassageView[]
  /** Prose characters — the page decides from this whether to fold. */
  chars: number
  /** Figures and table cells not printed here; > 0 means "read the document". */
  dropped: number
  /**
   * Whether the document also carries a Besonderer Teil — the per-§ half.
   * The page uses it to say where the rest is.
   */
  hasSpecial: boolean
  /**
   * The Besonderer Teil resolved onto (law, §) — the ministry's reasoning for
   * one provision, to stand beside that provision in the Textgegenüberstellung
   * (docs/architecture.md §12.30).
   *
   * `law` is `ComparisonRow.law` and `para` the normalised designation, so the
   * page looks entries up rather than matching text. A passage naming several
   * §§ appears once per §. Empty where the document has no Besonderer Teil, and
   * where the annex could not be told apart law by law — there a passage would
   * risk standing under the wrong law's § (`explanationsJoin.ts`).
   */
  paragraphs: ParagraphExplanationView[]
}

/** One passage of the Besonderer Teil, addressed to one § of one law. */
export interface ParagraphExplanationView {
  /** Matches `ComparisonRow.law`; null where the rows carry none either. */
  law: string | null
  /** Normalised designation, „§ 54c". */
  para: string
  /** The passage heading as the ministry printed it, „Zu Z 4 (§ 54c Abs. 1a):". */
  heading: string
  text: string[]
}

/** One § (or one Novellierungsanordnung) of the law text, in both versions. */
export interface LawDiffUnit {
  /** Artikel title of a package, law title otherwise, null when unknown */
  article: string | null
  /** Unit id on the later side of the pair (or the earlier one, for removed units): "§5", "Z3" */
  id: string
  /** The same unit's id on the earlier side; differs from `id` after renumbering */
  fromId: string | null
  heading: string | null
  /**
   * The § heading(s) the unit quotes — a readable name for a change whose own
   * text is a legistic instruction. Quoted from the law, never generated, so
   * it needs no machine-generated marking (docs/architecture.md §12.11).
   */
  quotedHeading: string | null
  change: LawUnitChange
  /**
   * Changed, but every inserted or removed piece is a citation, a number, a
   * date or punctuation (shifted cross-references, date formats). Decided by
   * what the changed words are, not by how many there are. False for the
   * other states and when the word diff was too long to compute.
   */
  editorial: boolean
  /** 0..1 token similarity for changed units, null otherwise */
  similarity: number | null
  /** The text at the earlier station of the compared pair (`LawDiffResponse.from`) */
  fromText: string | null
  /** The text at the later station (`LawDiffResponse.to`) */
  toText: string | null
  /** Word-level diff for changed units; null when unchanged, inserted, removed or too long */
  segments: LawDiffSegment[] | null
}

/**
 * One law of a package that only one of the two documents carries — the
 * Regierungsvorlage merged it in from another draft, or the package lost it
 * on the way. Reported as a law, never as its individual paragraphs.
 */
export interface LawPackageEntry {
  /** The article title, i.e. the law it changes */
  article: string
  /** How many units (§§ or Novellierungsanordnungen) it brings */
  units: number
}

/**
 * One station this draft has a law text for — the selector's options.
 *
 * Present but not comparable is a real state and says which: a text
 * published only as a PDF can be named and linked, never diffed. Measured
 * over GP XXVI–XXVIII it never happens for the parliamentary stations and
 * regularly for the draft itself in the older periods
 * (`scripts/stations-corpus.ts`).
 */
export interface LawStationOption {
  id: LawStationId
  label: string
  /** Whether this station's text can be one side of a comparison. */
  comparable: boolean
  /** The document itself, for the source line; null when nothing is published. */
  document: TraceLink | null
}

export interface LawDiffResponse {
  gp: string
  inr: number
  /** The compared pair, always earlier → later. */
  from: LawStationId
  to: LawStationId
  /** False when one of the two texts is not available as HTML (the older periods are PDF-only for the draft). */
  available: boolean
  /** German, user-facing: why no comparison can be shown */
  unavailableReason: string | null
  /** The two compared documents, for attribution and links */
  fromDocument: TraceLink | null
  toDocument: TraceLink | null
  /** Where the earlier text was read: Parliament HTML, or the RIS XML when Parliament has only a PDF (older periods, draft side only) */
  fromSource: 'parlament' | 'ris' | null
  /**
   * Dasselbe für die spätere Seite. Seit es die BGBl-Station gibt, kann auch
   * RECHTS ein RIS-Dokument stehen — die Kundmachung liegt beim Parlament
   * überhaupt nicht (§12.33), und die Quellenzeile muss das sagen dürfen.
   */
  toSource: 'parlament' | 'ris' | null
  /** Every station this draft published a text for, in procedural order. */
  stations: LawStationOption[]
  /** `editorial` counts the subset of `changed` that is only citations, numbers, dates, punctuation */
  stats: { total: number; unchanged: number; changed: number; editorial: number; inserted: number; removed: number }
  /** Laws the later text carries and the earlier one never had — a collective act merged in from other drafts. Their units are NOT in `units` or `stats`. */
  lawsOnlyInTo: LawPackageEntry[]
  /** Laws the earlier text carried and the later one does not. Their units are NOT in `units` or `stats`. */
  lawsOnlyInFrom: LawPackageEntry[]
  units: LawDiffUnit[]
}


/* ------------------------------------------------------------------ *
 * Volltextsuche über die laufenden Begutachtungen (§12.31)
 * ------------------------------------------------------------------ */

/**
 * Der Textausschnitt um eine Fundstelle, in drei Teilen.
 *
 * Drei Teile und kein fertiges Markup: Der Server liefert Text, die Seite
 * setzt die Marke. Ein `<mark>` aus dem Server wäre HTML aus einer
 * Nutzereingabe, und davon gibt es keine sichere Fassung.
 */
export interface BegutSearchSnippet {
  before: string
  match: string
  after: string
}

/**
 * Ein Treffer, als das, was er ist: ein Entwurf — mit Gegenstand im
 * Parlament oder ohne. Kein gemeinsamer Zeilentyp mit leeren Feldern; die
 * beiden Arten unterscheiden sich in dem, was es über sie GIBT (§12.28).
 */
export type BegutSearchEntry =
  | { kind: 'draft'; draft: DraftSummary }
  | { kind: 'ris'; consultation: RisConsultation }

export interface BegutSearchHit {
  entry: BegutSearchEntry
  /**
   * Das Dokument, in dem das Wort steht: „im Entwurfstext", „in den
   * Erläuterungen", … Null, wenn wir es in keinem lesbaren Dokument des
   * Satzes gefunden haben — das RIS durchsucht auch Anlagen und PDFs, die
   * wir nicht auswerten (gemessen: 72,2 % der Treffer sind benennbar).
   */
  place: string | null
  /** Die Stelle im Dokument, wie es sie führt: „§ 5.", „Zu § 5:". */
  designation: string | null
  snippet: BegutSearchSnippet | null
}

export interface BegutSearchResponse {
  /** Die Suche, wie sie ans RIS ging — normalisiert, mit Stern. */
  query: string
  /** Die einzelnen Wörter, für die Hervorhebung auf der Seite. */
  terms: string[]
  /** Wie viele Begutachtungen heute offen sind, also durchsucht wurden. */
  corpusSize: number
  /** Treffer laut RIS, auch die, die wir nicht auflösen konnten. */
  total: number
  /** Von den Treffern: wie viele eine benannte Fundstelle haben. */
  located: number
  hits: BegutSearchHit[]
}

/* ------------------------------------------------------------------ *
 * Verordnungsentwurf → Kundmachung im BGBl II (§12.32)
 * ------------------------------------------------------------------ */

/**
 * Was aus einem Verordnungsentwurf geworden ist — und die beiden Zustände,
 * die man NICHT zusammenwerfen darf.
 *
 * `ausstehend` gegen `keine` ist der ganze Punkt dieses Typs. Zwischen
 * Fristende und Kundmachung liegen im Median 57 Tage (p90 197), und von den
 * Entwürfen, deren Frist weniger als 30 Tage zurückliegt, hat gemessen KEIN
 * einziger schon eine Kundmachung. „Bisher nicht kundgemacht" wäre dort eine
 * Aussage über die Uhr, gelesen würde sie aber als eine über das Ressort.
 */
export type BgblOutcomeState =
  /** Kundmachung gefunden. */
  | 'kundgemacht'
  /** Frist läuft noch — die Frage stellt sich nicht. */
  | 'begutachtung'
  /** Frist vorbei, aber noch innerhalb der üblichen Dauer. */
  | 'ausstehend'
  /** Lange vorbei und nichts gefunden. Eine Auskunft über unseren Fund, keine über das Ressort. */
  | 'keine'
  /** Kein Fristende, kein Satz — wir können die Frage nicht stellen. */
  | 'unbekannt'

export interface BgblOutcome {
  state: BgblOutcomeState
  /** „BGBl. II Nr. 50/2026" */
  nummer: string | null
  /** ISO-Ausgabedatum. */
  datum: string | null
  /** Die ELI-Adresse der Kundmachung im RIS. */
  url: string | null
  /** Tage zwischen Fristende und Kundmachung — die Verordnungshälfte von „wie schnell". */
  days: number | null
}
