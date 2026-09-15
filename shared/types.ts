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
  /** "Regierungsvorlage", "Geändert im Ausschuss", … */
  station: string
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
      /** See StatementMeta.documentUrl. */
      documentUrl: string
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
      StageBar. Null when that stage is undated. */
  rvDate: string | null
  /** Earlier Regierungsvorlagen from the same draft. ME→RV is 1:n and the
      split is real (4 of 132 in the XXVIII corpus, e.g. 74/ME → 443 + 444
      d.B.); without this the extra RVs are invisible. */
  furtherRv: TraceLink[]
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
      layer, history snapshots); the UI renders it condensed into the StageBar
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
  /**
   * Our redirect to the Stellungnahme's own document — the uploaded PDF,
   * or the page above when the text was typed into the web form. A
   * relative API path, resolved on click (`/api/stellungnahmen/…`).
   */
  documentUrl: string
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
  /** Upstream lastSync, normalized to ISO-8601 server-side; null if absent */
  lastSync: string | null
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
// ME → RV text comparison (docs/ris-join.md §6)
// ---------------------------------------------------------------------------

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

/** One § (or one Novellierungsanordnung) of the law text, in both versions. */
export interface LawDiffUnit {
  /** Artikel title of a package, law title otherwise, null when unknown */
  article: string | null
  /** Unit id in the Regierungsvorlage (or the draft, for removed units): "§5", "Z3" */
  id: string
  /** The draft's id for the same unit; differs from `id` after renumbering */
  meId: string | null
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
  meText: string | null
  rvText: string | null
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

export interface LawDiffResponse {
  gp: string
  inr: number
  /** False when one of the two texts is not available as HTML (GP XXVII and earlier: PDF only). */
  available: boolean
  /** German, user-facing: why no comparison can be shown */
  unavailableReason: string | null
  /** The two compared documents, for attribution and links */
  me: TraceLink | null
  rv: TraceLink | null
  /** Where the draft text was read: Parliament HTML, or the RIS XML when Parliament has only a PDF (GP XXVII and earlier) */
  meSource: 'parlament' | 'ris' | null
  /** `editorial` counts the subset of `changed` that is only citations, numbers, dates, punctuation */
  stats: { total: number; unchanged: number; changed: number; editorial: number; inserted: number; removed: number }
  /** Laws the Regierungsvorlage carries and the draft never had — a collective act merged in from other drafts. Their units are NOT in `units` or `stats`. */
  lawsOnlyInRv: LawPackageEntry[]
  /** Laws the draft carried and the Regierungsvorlage does not — dropped from the package. Their units are NOT in `units` or `stats`. */
  lawsOnlyInMe: LawPackageEntry[]
  units: LawDiffUnit[]
}

