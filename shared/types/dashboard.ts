import type { DraftSummary } from './drafts'

export interface DashboardPayload {
  gp: string
  /** Active consultations, sorted by deadline ascending (soonest first) */
  open: DraftSummary[]
  stats: {
    consultationsTotalGp: number
  }
  /** Top 5 of the GP by statement count, descending */
  topByStatements: DraftSummary[]
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
 * Payload of /api/dashboard/outcomes — what became of the drafts the volume
 * ranking shows (`DashboardPayload.topByStatements`).
 */
export interface DashboardOutcomes {
  /**
   * CLOSED ROWS ONLY, and a row whose Gegenstand could not be read is left
   * out rather than reported as "bisher keine Regierungsvorlage": an
   * unresolved outcome and a missing Regierungsvorlage are different
   * claims, and only one of them is ours to make. The rows themselves come
   * from `/api/dashboard`, so the section renders with or without this —
   * without it, simply uncharted.
   */
  rankedOutcomes: ClosedOutcome[]
}

/**
 * Payload of /api/dashboard/enacted — "Zuletzt Gesetz geworden".
 *
 * The rows are Ministerialentwürfe again, not Vorlagen: the monitor's object
 * is the Begutachtung, and the card that renders them is the one every other
 * section uses. `bgblNumber` is non-null throughout by construction — a row
 * without a Kundmachung is not in this list.
 */
export interface DashboardEnacted {
  /** Newest promulgation first; empty is a normal state, not an error. */
  items: ClosedOutcome[]
}

/**
 * One Regierungsvorlage that is taking Stellungnahmen right now — the second
 * window for input, which closes with the vote and has no published Frist.
 */
export interface OpenVorlage {
  /** e.g. "594 d.B." */
  citation: string
  title: string
  /** Einlangen im Nationalrat, ISO; '' when upstream has no sortable date. */
  date: string
  /** The Vorlage's page, where the form is. */
  parliamentUrl: string
  /** Stellungnahmen filed on the Vorlage so far; null when the count failed. */
  statementCount: number | null
  /**
   * Die Begutachtung, aus der diese Vorlage kam — in drei Zuständen, weil
   * zwei zu wenig sind.
   *
   * Bis 18.09.2026 stand hier `draft: … | null`, und `null` musste zwei
   * Dinge zugleich heißen: „wir haben keine Seite dafür" und „es gab keine
   * Begutachtung". Gezeigt wurde das zweite („ohne Begutachtung"), belegt war
   * nur das erste — `preconst` ist kein universelles Feld, und auf GP XXVIII
   * fehlt es bei 32 von 117 Vorlagen ganz (`server/utils/precedingDraft.ts`).
   *
   *  - `draft` — die Vorlage nennt ihren Ministerialentwurf selbst. Der
   *    einzige Zustand, in dem eine Zeile auf unsere eigene Seite zeigt.
   *  - `none` — kein Zeiger, UND die Gegenprobe gegen Liste 81 findet keinen
   *    Entwurf, der ihr vorausgegangen sein könnte. Erst hier steht „ohne
   *    Begutachtung" in der Zeile.
   *  - `unknown` — kein Zeiger, aber ein plausibler Entwurf. Die Zeile sagt
   *    dann nichts: eine Titelähnlichkeit trägt keine Aussage über ein
   *    Regierungsvorhaben, in keine der beiden Richtungen.
   *
   * `none` und `unknown` verlinken beide nach außen; die Unterscheidung
   * betrifft nur, was behauptet wird (`docs/begutachtung-uebersprungen.md`).
   */
  consultation:
    | { kind: 'draft'; gp: string; inr: number }
    | { kind: 'none' }
    | { kind: 'unknown' }
}

export interface DashboardSecondRound {
  /**
   * The period these Vorlagen are from — always the current one, and stated
   * rather than assumed: `/entwuerfe` shows this section under a period
   * filter, and a list narrowed to an earlier GP must not carry rows from
   * this one. Inferring "current" from the newest period in the draft lists
   * would be a second, silently different answer to the same question.
   */
  gp: string
  /** Filing open, most recent first. Empty is a normal state, not an error. */
  items: OpenVorlage[]
}
