/**
 * Urgency thresholds for Begutachtung deadlines — one definition for the
 * badge tones (DeadlineBadge), the dashboard stat tile, and its label.
 */
import { daysUntil } from './format'

/** Deadline ends in ≤ N days → critical (red badge tone). */
export const DEADLINE_CRITICAL_DAYS = 3

/** Deadline ends in ≤ N days → serious (orange badge tone, dashboard count). */
export const DEADLINE_SERIOUS_DAYS = 7

export type DeadlineTone = 'critical' | 'serious' | 'neutral' | 'inactive'

/**
 * One tone decision for every deadline surface (DeadlineBadge pill,
 * DeadlineBlock on cards/rows). Defense in depth alongside server-side
 * reconcileActive: even with stale client data an expired deadline renders
 * muted, never as a red element.
 */
export function deadlineTone(
  deadline: string | null | undefined,
  active: boolean,
): DeadlineTone {
  if (!active) return 'inactive'
  const days = daysUntil(deadline)
  if (days === null) return 'neutral'
  if (days < 0) return 'inactive'
  if (days <= DEADLINE_CRITICAL_DAYS) return 'critical'
  if (days <= DEADLINE_SERIOUS_DAYS) return 'serious'
  return 'neutral'
}

/**
 * Deadline ended ≤ N days ago → the no-RV note adds pipeline-latency context
 * ("häufig mehrere Monate"), so a fresh "Bisher keine Regierungsvorlage"
 * reads as "not yet", never as shelved. Replace the hand-written wording
 * with the measured median once base-rate data exists (NLnet WP4).
 */
export const RV_LATENCY_CONTEXT_DAYS = 180
