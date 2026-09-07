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

export interface FristDivergence {
  /** RIS's end of the Frist (ISO date) */
  date: string
  /** RIS entry of the draft, so the claim is checkable; null when unmatched */
  url: string | null
  /** Absolute difference in days — the direction is in `later` */
  days: number
  /** true = RIS names a LATER date, the direction that can cost a deadline */
  later: boolean
}

/**
 * The two official sources disagree about when the Begutachtungsfrist ends.
 *
 * Only while the Frist runs: this is the one RIS fact a submitter can act on,
 * and it used to render inside the RIS block, which appears only once the
 * Verfahren is closed — shown exactly when it had become trivia. Afterwards
 * the divergence is a data-quality curiosity and stays in `/api/ris-map`.
 *
 * Sign convention is the join's (`RisMapRow.endeOffsetDays` = RIS Ende −
 * Parliament Frist): positive means RIS is later. Getting this backwards
 * would tell a submitter the wrong thing, which is why it is tested.
 *
 * Rare by measurement: one draft per Gesetzgebungsperiode (56/ME in XXVIII,
 * one in XXVII, both exactly 31 days).
 */
export function fristDivergence(
  ris: { endeOffsetDays: number | null; risEnde: string | null; risUrl: string | null } | null,
  active: boolean,
): FristDivergence | null {
  if (!active || !ris?.endeOffsetDays || !ris.risEnde) return null
  return {
    date: ris.risEnde,
    url: ris.risUrl,
    days: Math.abs(ris.endeOffsetDays),
    later: ris.endeOffsetDays > 0,
  }
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
