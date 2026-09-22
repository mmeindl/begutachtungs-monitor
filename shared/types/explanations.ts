import type { TraceLink } from './common'

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
  /**
   * Whether those passages really stand at a § on this page.
   *
   * The general part names what it does not print, and since §12.30 that
   * sentence has two true versions: „steht im Dokument selbst", and „steht
   * unten an den Paragraphen". Which one is true is not a property of the
   * Erläuterungen — it is a property of the page, so it is decided where the
   * annex is known (the same join row, no second call) rather than guessed
   * from `paragraphs.length`.
   *
   * False where the ressort published no Textgegenüberstellung (23 of 132
   * GP-XXVIII drafts) and on the RIS-only page, which links the annex instead
   * of rendering it: a pointer to a section that is not there is worse than
   * the sentence it replaced.
   */
  paragraphsAtAnnex: boolean
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
