import type { LawDiffSegment, TraceLink } from './common'
import type { LawUnitChange } from './lawDiff'

/**
 * Warum ein Paragraph der eigenen konsolidierten Lesefassung nicht angezeigt
 * wird (`server/utils/konsGate.ts`, docs/architecture.md §12.12).
 *
 * Die Sätze dazu stehen im Gate, nicht hier: Sie sind eine Entscheidung mit
 * Tests, keine Typdefinition.
 */
export type ConsolidatedWithheldCause =
  | 'verweigert'
  | 'nicht-geladen'
  | 'unplausibel'
  | 'kein-anhang'
  | 'anhang-schweigt'
  | 'anhang-widerspricht'

/** Ein Paragraph, wie er nach den Anweisungen des Entwurfs lauten würde. */
export interface ConsolidatedParagraph {
  /** Die Nummer, „22" — dieselbe Schreibweise wie in der Gegenüberstellung. */
  id: string
  /** Die Überschrift des § NACH dem Entwurf; sie kann selbst geändert sein. */
  heading: string | null
  /**
   * Wortdiff des **Textes ohne Überschrift** — dieselbe rot/grün-Sprache wie
   * sonst auf der Seite. Getrennt von `headingSegments`, weil eine
   * Überschrift auf der Seite eine Überschrift ist: In einem Fließtext
   * hängt sie sonst am ersten Satz („Aufbau der Staatsanwaltschaften Am Sitz
   * jedes …"), und eine geänderte Überschrift ist genau die Änderung, die
   * ein Leser zuerst sehen soll.
   */
  segments: LawDiffSegment[]
  /** Wortdiff der Überschrift; null, wenn der § keine trägt. */
  headingSegments: LawDiffSegment[] | null
  /** Die geltende Fassung im RIS, zum Stichtag: die Quelle der linken Seite. */
  risUrl: string | null
  /**
   * Das Gesetz, unter dem der Anhang diesen § führt — der Schlüssel, mit dem
   * die Gegenüberstellung ihn wiederfindet (§12.12a).
   *
   * NICHT dasselbe wie `law`: Dort steht der Kurztitel des Gesetzes („Richter-
   * und Staatsanwaltschaftsdienstgesetz"), hier die Zeile der Beilage
   * („Änderung des Richter- und Staatsanwaltschaftsdienstgesetzes"). Der
   * Unterschied ist nicht kosmetisch — nachgeschlagen wird mit diesem String.
   *
   * `null` heißt „ohne Gesetz gesucht": Bei einer Einzelnovelle fragt das Tor
   * den Anhang nur nach der Bezeichnung, weil es nichts zu verwechseln gibt.
   * Die Seite muss dann genauso nachschlagen, sonst findet sie nichts —
   * dieselbe Regel wie in `tguOracle.paragraphRows`, von dem dieses Feld
   * stammt.
   */
  annexLaw: string | null
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
  paragraphs: ConsolidatedParagraph[]
  /** Wie viele §§ der Entwurf überhaupt ändert — der Nenner der Anzeige. */
  touched: number
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
