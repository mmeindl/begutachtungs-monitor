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
