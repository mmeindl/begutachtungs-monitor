import type { TraceLink } from './common'

// ---------------------------------------------------------------------------
// EU-Recht (docs/architecture.md §12.66)
// ---------------------------------------------------------------------------

/**
 * The page's fact: what the Vorblatt says the draft does with EU law.
 *
 * - `umsetzung` — „Setzt EU-Recht um" (the WFA tool's „dient der Umsetzung
 *   einer EU-Richtlinie", or a ressort's own words for it);
 * - `flankierend-vo` / `flankierend-rl` — „Begleitet EU-Verordnungen" / „…
 *   eine EU-Richtlinie" (the tool's „flankierende Regelungen zu …");
 * - `ueber-umsetzung` — „Setzt EU-Recht um", with the Vorblatt's own
 *   sentence („geht über eine verpflichtende Umsetzung … hinaus") quoted and
 *   attributed, never paraphrased.
 *
 * Every other answer of the Vorblatt — not in the scope of EU law, in it but
 * not implementing anything, only mandatory measures — and an unreadable one
 * put nothing on the page (rule D1).
 */
export type EuMarker = 'umsetzung' | 'flankierend-vo' | 'flankierend-rl' | 'ueber-umsetzung'

/** One EU act the draft's law text (or title) names. */
export interface EuActView {
  kind: 'richtlinie' | 'verordnung' | 'beschluss' | 'rahmenbeschluss'
  /** „Richtlinie (EU) 2024/1069", „Richtlinie 2009/43/EG" — the act's own citation form. */
  label: string
  celex: string
  /** The act in EUR-Lex, German, by its ELI. */
  eurLexUrl: string
  /**
   * Whether the draft adds this act: true where the law in force does not
   * name it yet (or the draft creates a new law), false where it does — an
   * amendment restates the whole Umsetzungshinweis, directives transposed
   * years ago included (rule D4). Null where the law in force could not be
   * read; then no deadline is printed.
   */
  isNew: boolean | null
  /**
   * Named as the base text of an amending act the draft also names
   * („Richtlinie (EU) 2018/2001 … in der Fassung der Richtlinie (EU)
   * 2024/1711"): the draft implements the amendment, so the base's deadline
   * is not the draft's and is not printed.
   */
  base: boolean
  /**
   * For a directive with transposition dates in EUR-Lex: the latest as the
   * deadline, the others as the footnote's „weitere Fristen für einzelne
   * Bestimmungen" (rule D3). Null for regulations and decisions, for
   * directives without a date, and where the Cellar did not answer.
   */
  transposition: { deadline: string; otherDates: string[] } | null
  /** The day the act was adopted, ISO, from the Cellar — where the EU timeline begins. Null where unknown. */
  adopted: string | null
}

/**
 * Whether a draft implements EU law, which act, and until when — the
 * Vorblatt decides whether, the law text which act, EUR-Lex until when.
 * `available: false` is a normal answer (no RIS record, no Vorblatt that can
 * be read) and puts nothing on the page.
 */
export interface EuRechtResponse {
  available: boolean
  /** Why nothing could be read, as a sentence; null when available. */
  unavailableReason: string | null
  /** Null where the Vorblatt says the draft is no EU matter, or the Vorblätter contradict each other. */
  marker: EuMarker | null
  /** Which document decided `marker`: the Vorblatt, or — only where none can be read — the Erläuterungen (rule D5). */
  markerSource: 'vorblatt' | 'gesetzestext' | 'erlaeuterungen' | null
  /** The Vorblatt's EU sentence verbatim — printed for `ueber-umsetzung` only, „laut Vorblatt". */
  vorblattSentence: string | null
  acts: EuActView[]
  /** Where the acts' names came from. Null when none is named. */
  actsSource: 'gesetzestext' | 'titel' | null
  /** The first day of the Begutachtungsfrist as RIS records it — the second date of the fact line. */
  begutachtungStart: string | null
  /** The documents read, for the source line: the Vorblatt, the law text, the Erläuterungen. */
  sources: TraceLink[]
}
