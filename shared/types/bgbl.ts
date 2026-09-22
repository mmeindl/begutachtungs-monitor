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
