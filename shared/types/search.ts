import type { DraftSummary } from './drafts'
import type { RisConsultation } from './ris'

/* ------------------------------------------------------------------ *
 * Full-text search over the running Begutachtungen
 * (docs/architecture.md §12.31)
 * ------------------------------------------------------------------ */

/**
 * The snippet around a hit, in three parts.
 *
 * Three parts and no finished markup: the server delivers text, the page sets
 * the mark. A `<mark>` from the server would be HTML built from user input,
 * and there is no safe version of that.
 */
export interface BegutSearchSnippet {
  before: string
  match: string
  after: string
}

/**
 * A hit as what it is: a draft — with a Gegenstand at Parliament or without.
 * No shared row type with empty fields; the two kinds differ in what EXISTS
 * about them (docs/architecture.md §12.28).
 */
export type BegutSearchEntry =
  | { kind: 'draft'; draft: DraftSummary }
  | { kind: 'ris'; consultation: RisConsultation }

export interface BegutSearchHit {
  entry: BegutSearchEntry
  /**
   * The document the word stands in: „im Entwurfstext", „in den
   * Erläuterungen", … Null when we found it in no readable document of the
   * record — RIS also searches Anhänge and PDFs that we do not parse
   * (measured: 72,2 % of hits can be named).
   */
  place: string | null
  /** The place in the document, as the document names it: „§ 5.", „Zu § 5:". */
  designation: string | null
  snippet: BegutSearchSnippet | null
  /**
   * The word stands EXCLUSIVELY in a mention of a Ressort — in the
   * Begleitschreiben's Verteiler, in a signature line.
   *
   * Every Begleitschreiben lists all ministries as recipients, so every
   * portfolio word hits every draft: „klima" returns a
   * Druckgeräteaufstellungsverordnung. Measured 21.09.2026, 3 of 7 hits for
   * „klima" are of this kind. The row stays anyway — RIS delivered the
   * record, and for the UVP-G-Novelle, which swaps the Ressort's name in
   * dozens of §§, the name IS the subject.
   */
  ministryOnly: boolean
}

export interface BegutSearchResponse {
  /** The query as it went to RIS — normalised, with the asterisk. */
  query: string
  /** How many Begutachtungen are open today, i.e. were searched. */
  corpusSize: number
  /** Hits according to RIS, including the ones we could not resolve. */
  total: number
  hits: BegutSearchHit[]
}
