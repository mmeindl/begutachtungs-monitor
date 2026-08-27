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

const AVG_DAYS_PER_MONTH = 30.44

/**
 * The quotable verdict sentence for a long-quiet consultation
 * (TheyWorkForYou pattern): a fixed, controlled vocabulary with elapsed
 * time as the honesty bracket — the journalist's lede, pre-written so it
 * cannot be editorialized into "shelved". Null while the deadline is
 * missing/unparseable or still within RV_LATENCY_CONTEXT_DAYS, where the
 * latency context speaks instead of a verdict.
 */
export function noRvVerdictDe(deadline: string | null | undefined): string | null {
  const days = daysUntil(deadline)
  if (days === null || days >= -RV_LATENCY_CONTEXT_DAYS) return null
  const months = Math.floor(-days / AVG_DAYS_PER_MONTH)
  const elapsed =
    months >= 24
      ? `vor über ${Math.floor(months / 12)} Jahren`
      : months >= 12
        ? 'vor über einem Jahr'
        : `vor ${months} Monaten`
  return `Seit Ende der Begutachtungsfrist ${elapsed} liegt keine Regierungsvorlage vor.`
}
