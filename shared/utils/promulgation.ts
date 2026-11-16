/**
 * Whether a Gesetzesbeschluss was not promulgated — the one reading of it
 * for the list row (`entryView.ts`) and the spine and the page's headline
 * (`spine.ts`), so none of them can say it differently (03.10.2026; the
 * homepage's „Im Nationalrat beschlossen", `decidedOrder.ts`, read it too
 * until it went on 16.11.2026).
 *
 * TWO SIGNALS, AND THEY ARE NOT THE SAME KIND OF FACT.
 *  - `explicit`: Parliament's record carries the stage „Keine Kundmachung
 *    des Gesetzesbeschlusses …" (`NoPromulgation`). A statement of
 *    Parliament's, cause and successor included where it names them.
 *  - `overdue`: no Kundmachung, and the Beschluss is older than every
 *    Kundmachung we measured took. A statement about TIME only — „seit … nicht
 *    kundgemacht" —, never about why, and never „will not be".
 *
 * THE BUNDESRAT'S EINSPRUCH (14.11.2026) is not a Beschluss of the
 * Bundesrat, though the law's record calls the sitting „Beschluss im
 * Bundesrat". While the Nationalrat has not decided on it no Kundmachung can
 * come, so nothing is overdue; once it has, the window counts from that
 * final decision — the Beharrungsbeschluss, or the Bundesrat's decision on a
 * changed text (`bundesratDecidedAt` then), never from the Einspruch.
 *
 * Pure module: relative imports only, so the app, the server and vitest
 * read the same rule.
 */
import type { BundesratObjection, NoPromulgation, TreatyKind } from '../types'
import { spanInDays } from './format'

/**
 * How long after the Beschluss a missing Kundmachung is still ordinary.
 *
 * Measured 03.10.2026 over the 84 GP-XXVIII laws whose chain carries both
 * dates: Beschluss → Kundmachung took 20 days at the median, 29 at p90 and
 * 82 at most (a Beschluss in July, over the summer). 120 is that maximum
 * plus half of it again: what falls past it is no longer a law on its way.
 */
export const PROMULGATION_WINDOW_DAYS = 120

/** The dates of a Beschluss, as the chain and the page both carry them. */
export interface DecisionDates {
  /** The Nationalrat's Beschluss, ISO. */
  decidedAt?: string | null
  /** The Bundesrat's, ISO — the end of the procedure, and counted from where given. */
  bundesratDecidedAt?: string | null
  /** The Bundesrat's Einspruch, where one was read (`BundesratObjection`). */
  bundesratObjection?: BundesratObjection | null
  /** A treaty's Vorlage (14.11.2026): no window applies (`promulgationOverdue`). */
  treaty?: TreatyKind | null
}

/**
 * Whether an Einspruch stands that the Nationalrat has not (readably)
 * decided on: undecided, lapsed with the period, or of unknown outcome
 * without a decision date. No Kundmachung is due while it stands.
 */
export function objectionUnresolved(objection: BundesratObjection | null | undefined): boolean {
  if (!objection) return false
  return objection.outcome === 'pending' || objection.outcome === 'lapsed' || !objection.decidedAt
}

/**
 * The day a missing Kundmachung is counted from: the end of the procedure.
 * Without an Einspruch the Bundesrat's Beschluss, else the Nationalrat's;
 * after one, the Bundesrat's decision on a changed text, else the
 * Nationalrat's decision on the Einspruch — null while that is unresolved.
 */
export function finalDecisionOf(dates: DecisionDates): string | null {
  const objection = dates.bundesratObjection
  if (objection) return objectionUnresolved(objection) ? null : dates.bundesratDecidedAt || objection.decidedAt
  return dates.bundesratDecidedAt || dates.decidedAt || null
}

/**
 * True when there is no Kundmachung and the final decision
 * (`finalDecisionOf`) is older than the window. Without one there is
 * nothing to be overdue.
 *
 * NEVER FOR A TREATY (decision 5 of 14.11.2026). The window was measured on
 * laws; a Staatsvertrag is promulgated once it is ratified and in force,
 * which the Nationalrat's approval does not decide — 119 d.B. XXVIII came
 * out in BGBl. III 330 days after it (`pnpm corpus:staatsvertraege` has the
 * spread). Its missing Kundmachung is „ausstehend", never „nicht
 * kundgemacht".
 */
export function promulgationOverdue(
  dates: DecisionDates,
  bgblNumber: string | null | undefined,
  today: string,
): boolean {
  if (bgblNumber || dates.treaty) return false
  const decided = finalDecisionOf(dates)
  const age = spanInDays(decided, today)
  return age !== null && age > PROMULGATION_WINDOW_DAYS
}

/** What a chain or a page carries for the question below. */
export interface PromulgationFacts extends DecisionDates {
  bgblNumber?: string | null
  notPromulgated?: NoPromulgation | null
}

/**
 * `explicit` where Parliament's record says no Kundmachung followed,
 * `overdue` where the calendar says it is past due, null otherwise. The
 * explicit stage wins: it is Parliament's statement, the other is ours.
 */
export function promulgationState(
  facts: PromulgationFacts,
  today: string,
): 'explicit' | 'overdue' | null {
  if (facts.notPromulgated) return 'explicit'
  return promulgationOverdue(facts, facts.bgblNumber, today) ? 'overdue' : null
}
