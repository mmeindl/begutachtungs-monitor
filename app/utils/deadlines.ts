/**
 * Urgency thresholds for Begutachtung deadlines — one definition for the
 * tones of a detail page's deadline card and for the state line of a list row
 * (`EntryState`).
 */
import { daysUntil, formatDateDe, spanInDays } from '#shared/utils/format'

/** Deadline ends in ≤ N days → critical (red badge tone). */
const DEADLINE_CRITICAL_DAYS = 3

/** Deadline ends in ≤ N days → serious (orange badge tone). */
const DEADLINE_SERIOUS_DAYS = 7

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
/**
 * Started ≤ N days ago → „Neu" on the row.
 *
 * Seven days, for the reader who looks once a week — the same week the
 * deadline warning means. Measured 17.09.2026 over 2025-01-01 → today: a
 * median of 3 open rows carry the mark (p90 8, max 24). In a list that is
 * typically 13 rows long that is a findable minority and not a column of
 * flags.
 */
export const NEW_ARRIVAL_DAYS = 7

/**
 * Whether a still-running Begutachtung began inside that window.
 *
 * `active` is part of the question, not a caller's concern: "neu" on a
 * closed Verfahren would mark the one thing nobody can act on any more.
 */
export function isNewArrival(
  startedAt: string | null | undefined,
  active: boolean,
): boolean {
  if (!active) return false
  const days = daysUntil(startedAt)
  return days !== null && days <= 0 && days >= -NEW_ARRIVAL_DAYS
}

export type DeadlineTone = 'critical' | 'serious' | 'neutral' | 'inactive'

/**
 * One tone decision for every deadline surface — a detail page's
 * deadline card and the state line of a row (`EntryState`). Defense in depth alongside
 * server-side `reconcileActive`: even with stale client data an expired
 * deadline renders muted, never as a red element.
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
 * The ground of every deadline surface, keyed by tone — the list row's state
 * box (`EntryState`) and a detail page's deadline card share it, so
 * one state reads as one colour wherever it stands.
 *
 * Blue for the calm open state because blue means "you can do something
 * here" (main.css, 03.10.2026): `neutral` is only ever an open window — an
 * active Frist without haste, or a Vorlage that still takes Stellungnahmen.
 *
 * `accent-50` for it, not `accent-wash`: the open list is
 * typically 13 rows long, one of them critical. With `accent-wash` (#cde2fb)
 * twelve strong blue boxes would stand beside one pale red — the rarest
 * colour has to be the most conspicuous, or the column is decoration.
 */
export const deadlineGroundClass: Record<DeadlineTone, string> = {
  critical: 'bg-status-critical/15',
  serious: 'bg-status-serious/15',
  neutral: 'bg-accent-50',
  inactive: 'bg-ink-muted/15',
}

/**
 * The edge of a detail page's deadline card, beside its ground. The list's
 * boxes stand on white rows; the card stands on the page, and `accent-50`
 * (#e6f0fd) against `page` (#f5f4ef) is ~1,08:1 — only hue parted them, and
 * the page's one action read weaker than the white spine card above it. A
 * border in the card's own tone gives it back an edge. Not a WCAG need (a
 * grouping outline is exempt from 1.4.11), a legibility one.
 */
const deadlineEdgeClass: Record<DeadlineTone, string> = {
  critical: 'border-status-critical/40',
  serious: 'border-status-serious/40',
  neutral: 'border-accent-200',
  inactive: 'border-hairline',
}

/** Ground and edge of a detail page's deadline card, for one tone. */
export function deadlineCardClass(tone: DeadlineTone): string {
  return `${deadlineGroundClass[tone]} ${deadlineEdgeClass[tone]}`
}

interface FristDivergence {
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
 * reads as "not yet", never as shelved. Written by hand in August 2026 and
 * confirmed by measurement on 2026-09-08 (`scripts/corpus/rvLatency.ts`): the
 * p90 of Fristende → first Regierungsvorlage is 189 days in GP XXVII and
 * 148 in GP XXVI, so nine in ten arrive inside this window — which is what
 * `app/utils/outcomes.ts` now says under the sentence.
 */
export const RV_LATENCY_CONTEXT_DAYS = 180

const AVG_DAYS_PER_MONTH = 30.44

/**
 * The quotable verdict sentence for a long-quiet draft
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

/**
 * Below this many days a Begutachtungsfrist is called short. Measured on
 * 30.09.2026 over list 81, Einlangen → Frist, GP XXV–XXVIII (983 drafts):
 * the median is 28 days in every period, with peaks at 28 and 42; under 21
 * days ran 26–33 % of drafts, under 14 days 11–17 %.
 *
 * Three weeks and not two, because two would miss the case the flag is for:
 * 115/ME XXVIII, the Sterbeverfügungsgesetz, ran exactly 14 days.
 */
export const SHORT_FRIST_DAYS = 21

/**
 * From this many days on the Frist is the one § 9 Abs. 3
 * WFA-Grundsatz-Verordnung names for the Regelfall: six weeks. Reached by
 * 22–25 % of drafts in the same measurement.
 */
export const FULL_FRIST_DAYS = 42

/**
 * The median Frist, the same 28 days in every period of the measurement
 * above (list 81, GP XXV–XXVIII, i.e. since 2013) and for the
 * Verordnungsentwürfe of the RIS corpus (`fristYardstickDe`). Context on the
 * `FristBar`, never its yardstick.
 */
export const MEDIAN_FRIST_DAYS = 28

/**
 * Where a Frist sits against practice and the Verordnung — only at the
 * edges, and at both of them.
 *
 * A flag against the six-week norm alone would stand on three quarters of
 * all pages: a blame counter, and one that stops meaning anything. So the
 * middle says nothing beyond its length, and a full Frist is named as
 * plainly as a short one (framing rule: what became of the procedure, both
 * ways).
 */
export type FristClass = 'short' | 'full' | null

export function fristClassOf(start: string | null | undefined, deadline: string | null | undefined): FristClass {
  const days = spanInDays(start, deadline)
  if (days === null || days < 1) return null
  if (days < SHORT_FRIST_DAYS) return 'short'
  if (days >= FULL_FRIST_DAYS) return 'full'
  return null
}

/** The length alone — „2 Wochen", „10 Tage": weeks wherever the span is a
 *  clean multiple of seven, days otherwise. Shared by the rail, the list
 *  entry and the page's sentence, so none of them can disagree. */
export function fristSpanDe(start: string | null | undefined, deadline: string | null | undefined): string | null {
  const days = spanInDays(start, deadline)
  if (days === null || days < 1) return null
  if (days >= 14 && days % 7 === 0) return `${days / 7} Wochen`
  return days === 1 ? '1 Tag' : `${days} Tage`
}

/** „Kurze Frist: 2 Wochen" / „Volle Frist: 6 Wochen" at the edges, null in
 *  the middle — the one wording of the class, for rail and list alike. */
export function fristClassLineDe(start: string | null | undefined, deadline: string | null | undefined): string | null {
  const cls = fristClassOf(start, deadline)
  const span = fristSpanDe(start, deadline)
  if (!cls || !span) return null
  return `${cls === 'short' ? 'Kurze' : 'Volle'} Frist: ${span}`
}

/**
 * The yardstick for the rail's „Kurze Frist" or „Volle Frist": how this
 * Frist compares with the Regelfall and with practice. Null in the middle.
 *
 * A Verordnungsentwurf is compared with its own kind. Measured on
 * 30.09.2026 over the RIS Begut corpus, Beginn → Ende der
 * Begutachtungsfrist, since 2013 (1.707 Verordnungen): the median is 28
 * days as for the Gesetze and 66 % ran at least four weeks, but only
 * 16,8 % reached six — one in six, not one in four (the RIS Gesetze of the
 * same pass: 23,0 %, which matches list 81's 22–25 % and so checks the
 * instrument). Under three weeks 18,7 %, stable across 2013–2019,
 * 2020–2022 and since 2023.
 */
function fristYardstickDe(cls: FristClass, kind: 'entwurf' | 'verordnung'): string | null {
  const drafts = kind === 'verordnung' ? 'Verordnungsentwürfe' : 'Entwürfe'
  if (cls === 'short') {
    return `Im Regelfall vorgesehen sind sechs Wochen, und die Hälfte der ${drafts} seit 2013 hatte mindestens vier.`
  }
  if (cls === 'full') {
    return kind === 'verordnung'
      ? 'Die im Regelfall vorgesehenen sechs Wochen erreicht nur etwa jeder sechste Verordnungsentwurf.'
      : 'Die im Regelfall vorgesehenen sechs Wochen erreicht nur etwa jeder vierte Entwurf.'
  }
  return null
}

/** The yardstick as a sentence of its own, for the action card while the
 *  Frist runs: the countdown heads that card, the rail names the class. */
export function fristContextDe(cls: FristClass, kind: 'entwurf' | 'verordnung' = 'entwurf'): string | null {
  const yardstick = fristYardstickDe(cls, kind)
  return yardstick ? `Zum Vergleich: ${yardstick}` : null
}

/** „03.06.–17.06.2026", the year once where both ends share it; the
 *  deadline alone („bis 17.06.2026") without a start. */
export function fristRangeDe(start: string | null | undefined, deadline: string): string {
  const end = formatDateDe(deadline)
  if (!start || spanInDays(start, deadline) === null) return `bis ${end}`
  const from = formatDateDe(start)
  return from.slice(-4) === end.slice(-4) ? `${from.slice(0, -4)}–${end}` : `${from} – ${end}`
}
