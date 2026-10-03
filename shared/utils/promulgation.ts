/**
 * Whether a Gesetzesbeschluss was not promulgated — the one reading of it
 * for the list row (`entryView.ts`), the spine and the page's headline
 * (`spine.ts`), and the homepage's „Im Nationalrat beschlossen"
 * (`decidedOrder.ts`), so none of them can say it differently
 * (docs/architecture.md §12.33, Nachtrag 03.10.2026).
 *
 * TWO SIGNALS, AND THEY ARE NOT THE SAME KIND OF FACT.
 *  - `explicit`: Parliament's record carries the stage „Keine Kundmachung
 *    des Gesetzesbeschlusses …" (`NoPromulgation`). A statement of
 *    Parliament's, cause and successor included where it names them.
 *  - `overdue`: no Kundmachung, and the Beschluss is older than every
 *    Kundmachung we measured took. A statement about TIME only — „seit … nicht
 *    kundgemacht" —, never about why, and never „will not be".
 *
 * Pure module: relative imports only, so the app, the server and vitest
 * read the same rule.
 */
import type { NoPromulgation } from '../types'
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
}

/**
 * True when there is no Kundmachung and the Beschluss — the Bundesrat's if
 * known, the Nationalrat's otherwise — is older than the window. Without a
 * Beschluss there is nothing to be overdue.
 */
export function promulgationOverdue(
  dates: DecisionDates,
  bgblNumber: string | null | undefined,
  today: string,
): boolean {
  if (bgblNumber) return false
  const decided = dates.bundesratDecidedAt || dates.decidedAt
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
