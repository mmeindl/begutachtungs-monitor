/**
 * Shared contract between server routes and the app.
 * Server routes map upstream Parliament API data into these shapes;
 * pages/components consume ONLY these types — never raw upstream rows.
 *
 * GDPR invariant: names of private individuals never leave the server.
 * `StatementMeta.submitterName` is non-null only for organisations.
 */

export interface ConsultationSummary {
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
}

export interface DocumentFormat {
  type: 'pdf' | 'html'
  url: string
}

export interface ConsultationDocument {
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

/** One step of the parliamentary process history (from ME detail stages[]) */
export interface TraceStep {
  /** ISO date, null when the stage carries no date */
  date: string | null
  /** Plain text — upstream HTML stripped server-side */
  text: string
  /** Absolute URLs extracted from the stage HTML */
  links: TraceLink[]
}

export interface StatementsSummary {
  total: number
  organisations: number
  privatePersons: number
  nonPublic: number
  /**
   * Set when list 142 was unavailable or inconsistent with list 81: `total`
   * then comes from the list-81 counter and the breakdown/topOrganisations
   * are unknown (zeros/empty) — render a hint instead of the panel.
   */
  degraded?: boolean
  /** Organisations only — private persons are never listed by name */
  topOrganisations: {
    name: string
    endorsements: number
    parliamentUrl: string
  }[]
}

/** "Was wurde daraus" — filled once a Regierungsvorlage exists */
export interface EnactmentInfo {
  /** e.g. "2238 d.B." */
  rvCitation: string
  rvUrl: string
  /** e.g. "Bundesgesetzblatt I Nr. 5/2024" — null while not enacted */
  bgblNumber: string | null
  bgblRisUrl: string | null
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
export interface ConsultationDetail extends Omit<ConsultationSummary, 'statementCount'> {
  /** Kurzinformation (Ziel, Inhalt, …) as typed blocks; empty when absent */
  description: DescriptionBlock[]
  /** Minister who submitted the draft ("Übermittelt von"), null if absent */
  invitedBy: string | null
  documents: ConsultationDocument[]
  trace: TraceStep[]
  /** Text evolution links: Gesetzestext → amended in committee → plenary */
  textEvolution: TraceLink[]
  statements: StatementsSummary
  enactment: EnactmentInfo | null
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

export interface StatementsResponse {
  items: StatementMeta[]
}

export type ConsultationStatus = 'open' | 'closed' | 'all'

export interface ConsultationsResponse {
  items: ConsultationSummary[]
  total: number
  gp: string
  availableGps: string[]
  /** Distinct ministries present in the requested GP (for the filter UI) */
  ministries: { code: string; name: string }[]
}

export interface DashboardPayload {
  gp: string
  /** Active consultations, sorted by deadline ascending (soonest first) */
  open: ConsultationSummary[]
  stats: {
    openCount: number
    closingWithin7Days: number
    statementsTotalGp: number
    consultationsTotalGp: number
  }
  /** Top 5 of the GP by statement count, descending */
  topByStatements: ConsultationSummary[]
  /** Upstream lastSync, normalized to ISO-8601 server-side; null if absent */
  lastSync: string | null
}

/** One recently closed consultation with its resolved chain state.
 *  Extends the summary so the SAME card component renders both the open
 *  list and the outcome section — one anatomy, one hover, no sibling
 *  component drift. */
export interface ClosedOutcome extends ConsultationSummary {
  /** e.g. "474 d.B." — null while no Regierungsvorlage exists */
  rvCitation: string | null
  /** e.g. "Bundesgesetzblatt I Nr. 37/2026" — null while not enacted */
  bgblNumber: string | null
}

/**
 * Payload of /api/dashboard/outcomes — the "Zuletzt abgeschlossen – was
 * wurde daraus?" section. Fetched deferred/client-side by the dashboard:
 * resolving the pool can hit many cold upstream fetches and must never
 * block first paint.
 */
export interface DashboardOutcomes {
  /** Most recently ended consultations, strict recency order — never
      sorted by outcome (Nachverfolgung, not a scoreboard). */
  recent: ClosedOutcome[]
  /** The pool's most recent item that reached RV/BGBl, when `recent`
      itself shows no progression — keeps the full chain demonstrable
      during the months of normal ME→RV latency. Null when `recent`
      already contains one (or none exists in the pool). */
  lastEnacted: ClosedOutcome | null
}
