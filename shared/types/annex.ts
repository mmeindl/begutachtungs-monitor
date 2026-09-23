import type { LawDiffSegment, TraceLink } from './common'
import type { LawUnitChange } from './lawDiff'

/**
 * Why a Paragraph of our own konsolidierte Lesefassung is not shown
 * (`server/utils/kons/konsGate.ts`, docs/architecture.md §12.12).
 *
 * The sentences belong in the gate, not here: they are a decision with
 * tests, not a type definition.
 */
export type ConsolidatedWithheldCause =
  | 'verweigert'
  | 'nicht-geladen'
  | 'unplausibel'
  | 'kein-anhang'
  | 'anhang-schweigt'
  | 'anhang-widerspricht'

/** A Paragraph as it would read after the draft's Novellierungsanordnungen. */
export interface ConsolidatedParagraph {
  /** The number, „22" — the same spelling as in the Textgegenüberstellung. */
  id: string
  /**
   * Word diff of the **text without the heading** — the same red/green
   * language as everywhere else on the page. Kept apart from
   * `headingSegments`, because a heading on the page is a heading: inside
   * running text it otherwise hangs off the first sentence („Aufbau der
   * Staatsanwaltschaften Am Sitz jedes …"), and a changed heading is exactly
   * the change a reader should see first.
   */
  segments: LawDiffSegment[]
  /** Word diff of the heading; null when the § carries none. */
  headingSegments: LawDiffSegment[] | null
  /** The version in force in RIS, as of the cut-off date: the left side's source. */
  risUrl: string | null
  /**
   * The law the annex files this § under — the key the Textgegenüberstellung
   * is looked up with, and deliberately the gate's key rather than a second
   * one (docs/architecture.md §12.12a).
   *
   * NOT the same as `law`: that carries the Kurztitel („Richter- und
   * Staatsanwaltschaftsdienstgesetz"), this one the annex's line („Änderung
   * des Richter- und Staatsanwaltschaftsdienstgesetzes"). The lookup runs on
   * this string, so the difference is not cosmetic.
   *
   * `null` means „looked up without a law": for a single-law Novelle the gate
   * asks the annex by designation only, because there is nothing to confuse.
   * The page has to look up the same way or it finds nothing — the rule of
   * `paragraphRows` in `server/utils/kons/tguOracle.ts`, where this field
   * comes from.
   */
  annexLaw: string | null
}

/**
 * A draft's own konsolidierte Lesefassung — „so läse sich das Gesetz danach"
 * (docs/architecture.md §12.12).
 *
 * `touched` is the denominator without which `paragraphs` would be a lie: a
 * draft amends two dozen Paragraphen, a median 12 % of them are shown, and
 * absence must never look like „unverändert" on this page (§12.27).
 */
export interface ConsolidatedTextResponse {
  gp: string
  inr: number
  paragraphs: ConsolidatedParagraph[]
  /** How many §§ the draft amends at all — the denominator on display. */
  touched: number
}

/**
 * Why a § of the Textgegenüberstellung is not shown
 * (`server/utils/annex/verdict.ts`, docs/architecture.md §12.13).
 *
 * Three findings the page keeps apart: they mean different things to a
 * reader, and two of them can just as well be *our* reading of a PDF as the
 * ministry's document — so none of them is phrased as the ministry's error.
 *
 * - `standing` — the annex's **left** column is not accounted for by the
 *   standing § in RIS Bundesrecht.
 * - `alreadyStanding` — the **right** column shows as new a contiguous run of
 *   at least six comparable words that stands verbatim in the § and is absent
 *   from the left column. The left column is exempt on purpose: a sentence
 *   merely moved within the § stands there and must not report.
 * - `notInDraft` — the right column carries at least eight words found
 *   neither in the left column nor in the Novellierungsanordnungen the draft
 *   addresses to *this* §, and under 90 % of what it shows as new is found
 *   there. The reference is per § since 2026-09-10 (`draftBags` in
 *   `server/utils/annex/verdict.ts`): the whole draft is blind to text
 *   dragged out of a neighbouring §. Where the Gesetzestext could not be read
 *   at all the check is disarmed rather than failed, and text of a § the
 *   annex prints no block of its own for is inherited, not missing.
 */
export type AnnexWithheldCause = 'standing' | 'alreadyStanding' | 'notInDraft'

/** One row of the Ressort's Textgegenüberstellung (docs/api-exploration.md §2c). */
export interface TextComparisonRow {
  kind: 'article' | 'pair'
  /**
   * Which law of the package the row belongs to. Null when the draft amends
   * one law, and null when the annex does not mark its boundaries: § 5 of the
   * second law of a package is a different provision from § 5 of the first,
   * and 15,1 % of designations in the multi-law annexes recur in another law
   * of the same package — so an unattributed row is the honest answer
   * (docs/architecture.md §12.13).
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
  /** "2. bis 26b. …": unchanged text the annex leaves out on purpose */
  elided: boolean
  segments: LawDiffSegment[] | null
  editorial: boolean
  /**
   * How the row's "Geltende Fassung" fared against the standing law in RIS
   * (`server/utils/annex/verdict.ts`, docs/architecture.md §12.13).
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
   * The credit line's opening, licence included — „Quelle (CC BY 4.0, RIS):"
   * or, where Parliament's copy was read, without a licence claim.
   *
   * Server-side, because the source is chosen here: the section used to have
   * the CC-BY sentence hard-wired, and the moment the same section reads a
   * Parliament document that is a licence claim nobody has checked
   * (the open licence question over that data, docs/architecture.md §13.1).
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
   * therefore did not read (`isProven` in `server/utils/annex/annexPdf.ts`):
   * a page set to another width than the rest of the document, one carrying a
   * skewed text run, one whose runs disagree about which way the page is
   * turned. Everything below this point reads a column out of a coordinate,
   * and a page set differently is not read differently but *wrongly*, in
   * words that are all real — so it is refused, and the reader is told that
   * something is missing rather than left with a comparison that quietly has
   * a hole in it.
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
     * Exists because the page could not tell "nothing failed" from "nothing
     * was looked at" — both showed `judged: 0` and the rows went out
     * labelled as verified. False means the comparison is unvouched-for.
     */
    ran: boolean
    /**
     * Why no § could be judged, as a German sentence fragment fit to print
     * after "Nichts konnte geprüft werden: …" — for example "im RIS fehlt
     * der Beginn der Begutachtungsfrist". Null exactly when `judged > 0`.
     *
     * A RIS outage never appears here: the request fails instead of
     * answering, so no cache can hold a definitive-sounding sentence about a
     * network hiccup (`server/utils/annex/textComparisonService.ts`).
     */
    notRunReason: string | null
    /**
     * The date the standing law was read at — RIS's own start of the
     * Begutachtungsfrist, the day the Ressort wrote the annex, ISO or null.
     * Named on the page: a comparison written in March has been held against
     * the March text, and that is the right text to hold it against.
     */
    asOf: string | null
    /**
     * §§ with enough prose to judge, and how many came through every check.
     * `judged` counts §§ whose *left* column carried enough words to score,
     * so a § withheld by a right-column rule without judgeable left text is
     * in `withheldParagraphs` and not here. The two are not meant to
     * subtract.
     */
    judged: number
    verified: number
    /** §§ whose text was withheld, whichever of the three checks refused them */
    withheldParagraphs: number
    /**
     * The same number split by cause; sums to `withheldParagraphs`, because a
     * withheld § carries exactly the first cause that fired. The page names
     * the three separately — only the first is about the left column.
     */
    withheldByCause: Record<AnnexWithheldCause, number>
    /**
     * Laws where so many §§ failed that the annex probably quotes another
     * version of the law. A sentence for the reader, not a withholding: the
     * §§ that verified are still shown, because they verified against the
     * standing text. A first version refused the whole law and withheld 59 §§
     * that had passed individually (docs/architecture.md §12.13).
     */
    doubtfulLaws: string[]
    /**
     * §§ that show at least one change and carry no verdict — the part of
     * what the reader sees that is unvouched-for.
     *
     * Not every § without a verdict: one whose rows are all unchanged is
     * folded away behind a count, and one the draft *inserts* has no standing
     * text to check against. Counting those made "… ließen sich nicht prüfen"
     * read as an alarm about the Ressort's annex.
     */
    uncheckedParagraphs: number
    /**
     * Rows shown as a change that carry no § designation at all, so no §
     * verdict can address them — counted apart from `uncheckedParagraphs`,
     * which counts §§. Shown as `unchecked`.
     *
     * A property of the table path. Measured 2026-09-10: 285 rows without a
     * designation, 83 of them shown as a change; on the PDF path a row *is* a
     * provision, cut at the § marker, so this is 0 (docs/architecture.md
     * §12.13).
     */
    rowsWithoutParagraph: number
  } | null
  rows: TextComparisonRow[]
}
