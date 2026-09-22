/* ------------------------------------------------------------------ *
 * Verordnungsentwurf → Kundmachung in the BGBl II
 * (docs/architecture.md §12.32)
 * ------------------------------------------------------------------ */

/**
 * What became of a Verordnungsentwurf — and the two states that must NOT be
 * thrown together (docs/architecture.md §12.32).
 *
 * `ausstehend` against `keine` is the whole point of this type. A median 57
 * days pass between Fristende and Kundmachung, and of the drafts whose Frist
 * ended less than 30 days ago not a single one was measured to have a
 * Kundmachung yet. „Bisher nicht kundgemacht" would be a statement about the
 * clock there, and would be read as one about the Ressort.
 */
export type BgblOutcomeState =
  /** Kundmachung found. */
  | 'kundgemacht'
  /** The Frist is still running — the question does not arise. */
  | 'begutachtung'
  /** Frist over, but still inside the usual duration. */
  | 'ausstehend'
  /** Long over and nothing found. A statement about our search, not about the Ressort. */
  | 'keine'
  /** No Fristende, no record — we cannot even ask the question. */
  | 'unbekannt'

export interface BgblOutcome {
  state: BgblOutcomeState
  /** „BGBl. II Nr. 50/2026" */
  nummer: string | null
  /** ISO date of issue. */
  datum: string | null
  /** The Kundmachung's ELI address in RIS. */
  url: string | null
  /** Days between Fristende and Kundmachung — the Verordnung half of „wie schnell". */
  days: number | null
}
