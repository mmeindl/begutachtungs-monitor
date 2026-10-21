/**
 * Urgency thresholds for Begutachtung deadlines — one definition for the
 * tones of a detail page's deadline card and for the state line of a list row
 * (`EntryState`).
 */
import { daysUntil, formatDateDe, spanInDays } from '#shared/utils/format'
import { GP_STARTS, gpInSentenceDe, gpNameDe } from '#shared/utils/gp'

/** Deadline ends in ≤ N days → critical (red badge tone). */
const DEADLINE_CRITICAL_DAYS = 3

/** Deadline ends in ≤ N days → serious (orange badge tone). */
const DEADLINE_SERIOUS_DAYS = 7

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
/**
 * Started ≤ N days ago → the „Neu" mark on the row („Neu: Begutachtung").
 *
 * Seven days, for the reader who looks once a week — the same week the
 * deadline warning means. Measured 17.09.2026 over 2025-01-01 → today: a
 * median of 3 open rows carry the mark (p90 8, max 24). In a list that is
 * typically 13 rows long that is a findable minority and not a column of
 * flags.
 *
 * Since 03.10.2026 the same window marks a row whose current station was
 * reached in it (`isWithinNewWindow`); the measurement above counts
 * Begutachtungen only.
 */
export const NEW_ARRIVAL_DAYS = 7

/**
 * Whether a date lies inside that window: today, or up to
 * `NEW_ARRIVAL_DAYS` back, on the Vienna day `daysUntil` counts by. A future
 * date is not new, and neither is a missing one.
 *
 * No `active` guard, unlike `isNewArrival` below, and on purpose: the later
 * stations have no such condition. A Kundmachung is news whether or not
 * anything can still be done about it — nobody files a Stellungnahme on a
 * law in the Bundesgesetzblatt, and that it got there this week is exactly
 * what the weekly reader came to find out.
 */
export function isWithinNewWindow(date: string | null | undefined): boolean {
  const days = daysUntil(date)
  return days !== null && days <= 0 && days >= -NEW_ARRIVAL_DAYS
}

/**
 * Whether a still-running Begutachtung began inside that window.
 *
 * `active` is part of the question, not a caller's concern: "neu" on a
 * closed Verfahren would mark the one thing nobody can act on any more.
 * The guard is specific to this event, the Begutachtung; the later
 * stations are marked by `isWithinNewWindow` alone.
 */
export function isNewArrival(
  startedAt: string | null | undefined,
  active: boolean,
): boolean {
  return active && isWithinNewWindow(startedAt)
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
 *
 * Both urgent tones at /30 since 03.10.2026, in that order of strength:
 * open < serious < critical. At /15 the serious wash was a second pink
 * beside critical's and fainter than `accent-50`; orange is a light hue
 * that needs twice the wash to read as orange, and critical followed to /30
 * so that it stays the loudest. The numbers stand beside
 * `--color-status-serious` in main.css.
 */
export const deadlineGroundClass: Record<DeadlineTone, string> = {
  critical: 'bg-status-critical/30',
  serious: 'bg-status-serious/30',
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
 * Frist practice per Gesetzgebungsperiode — the context the `FristBar` and
 * the yardstick sentence give, measured for the period the draft's Frist
 * began in (21.10.2026). Until then one median „seit 2013" stood for every
 * draft; readers who write Stellungnahmen asked to be compared with the
 * practice of the government in office, not with an average over four.
 *
 * Measured 21.10.2026, Beginn → Frist (`spanInDays`, Frists of at least a
 * day): Ministerialentwürfe from list 81 (`/api/drafts?gp=`), Verordnungs-
 * entwürfe from the RIS Begut corpus (`/api/ris-drafts?gp=&art=verordnung`,
 * assigned to a period by `gpWindow`). The median barely moves — 28 days
 * everywhere but the Verordnungen of XXV (29) — the share that reaches the
 * Regelfall does: 17 → 25 % for the Entwürfe, 15–21 % for the Verordnungen.
 * The running period's row is a snapshot (Stand 21.10.2026) and is
 * re-measured when the period closes, with `outcomes.ts`.
 *
 * Under three weeks, for the record and not on the page: Entwürfe 26,2 /
 * 27,0 / 25,7 / 31,9 %, Verordnungen 16,6 / 15,3 / 21,8 / 21,1 %.
 */
export interface FristPractice {
  /** Frists measured. */
  drafts: number
  /** Median length in days. */
  median: number
  /** Share that reached the Regelfall (`FULL_FRIST_DAYS`). */
  fullShare: number
}

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
export const FRIST_PRACTICE: Readonly<Record<FristKind, Readonly<Record<string, FristPractice>>>> = {
  entwurf: {
    XXVIII: { drafts: 144, median: 28, fullShare: 0.25 },
    XXVII: { drafts: 350, median: 28, fullShare: 0.24 },
    XXVI: { drafts: 163, median: 28, fullShare: 0.221 },
    XXV: { drafts: 324, median: 28, fullShare: 0.173 },
  },
  verordnung: {
    XXVIII: { drafts: 204, median: 28, fullShare: 0.206 },
    XXVII: { drafts: 624, median: 28, fullShare: 0.146 },
    XXVI: { drafts: 287, median: 28, fullShare: 0.164 },
    XXV: { drafts: 500, median: 29, fullShare: 0.162 },
  },
}

export type FristKind = 'entwurf' | 'verordnung'

export interface FristPeriod {
  gp: string
  practice: FristPractice
  /** „XXVIII. GP" — under the bar's tick (`gpNameDe`). */
  basisShort: string
  /** „in der XXVIII. Gesetzgebungsperiode (seit Oktober 2024)" — in a sentence. */
  basisLong: string
}

/**
 * The period a Frist began in, with its practice row — by date, so the
 * Ministerialentwurf and the RIS record are placed the same way (the RIS
 * records carry no GP, `gpWindow`). Null before GP XXV or without a start:
 * there is no measured row, and the bar then shows the Regelfall alone
 * rather than borrow another period's median.
 */
export function fristPeriodFor(start: string | null | undefined, kind: FristKind = 'entwurf'): FristPeriod | null {
  if (!start) return null
  const day = start.slice(0, 10)
  const gp = Object.keys(GP_STARTS)
    .filter((g) => GP_STARTS[g]! <= day)
    .sort((a, b) => GP_STARTS[b]!.localeCompare(GP_STARTS[a]!))[0]
  const practice = gp ? FRIST_PRACTICE[kind][gp] : undefined
  if (!gp || !practice) return null
  return { gp, practice, basisShort: gpNameDe(gp), basisLong: gpInSentenceDe(gp) }
}

const ORDINAL: Record<number, string> = { 3: 'dritte', 4: 'vierte', 5: 'fünfte', 6: 'sechste', 7: 'siebte', 8: 'achte' }

/** „vierte" for a share of 0.25 — the „jeder n-te" a reader can picture. */
function everyNthDe(share: number): string | null {
  return share > 0 ? ORDINAL[Math.round(1 / share)] ?? null : null
}

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
 * Frist compares with the Regelfall and with the practice of its own period
 * (`fristPeriodFor`, 21.10.2026 — „seit 2013" until then). Null in the
 * middle, and null without a measured period: a sentence about practice
 * needs the practice it names.
 *
 * A Verordnungsentwurf is compared with its own kind: it reaches the
 * Regelfall less often (one in five to one in seven, against one in four
 * for the Entwürfe of the last two periods).
 */
function fristYardstickDe(cls: FristClass, kind: FristKind, period: FristPeriod | null): string | null {
  if (!period) return null
  const { practice, basisLong } = period
  if (cls === 'short') {
    const drafts = kind === 'verordnung' ? 'Verordnungsentwürfe' : 'Entwürfe'
    return practice.median >= 28
      ? `Im Regelfall vorgesehen sind sechs Wochen, und die Hälfte der ${drafts} ${basisLong} hatte mindestens vier.`
      : 'Im Regelfall vorgesehen sind sechs Wochen.'
  }
  if (cls === 'full') {
    const nth = everyNthDe(practice.fullShare)
    if (!nth) return null
    const draft = kind === 'verordnung' ? 'Verordnungsentwurf' : 'Entwurf'
    return `Die im Regelfall vorgesehenen sechs Wochen erreicht nur etwa jeder ${nth} ${draft} ${basisLong}.`
  }
  return null
}

/** The yardstick as a sentence of its own, for the action card while the
 *  Frist runs: the countdown heads that card, the rail names the class. */
export function fristContextDe(cls: FristClass, kind: FristKind, period: FristPeriod | null): string | null {
  const yardstick = fristYardstickDe(cls, kind, period)
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

/** The yardstick sentence for a Frist from its dates — `fristContextDe` on
 *  `fristClassOf`, the pair both detail pages put in their action card. */
export function fristContextFor(
  start: string | null | undefined,
  deadline: string | null | undefined,
  kind: FristKind = 'entwurf',
): string | null {
  return fristContextDe(fristClassOf(start, deadline), kind, fristPeriodFor(start, kind))
}

/**
 * The Frist, running or closed, as the fact under „Die Begutachtung": its
 * range, with the `FristBar` hung under it through the slot `after-frist`.
 * One row for both detail pages, so the title and the key the bar's slot is
 * named by cannot part. Structurally a `Fact` (`FactList`), kept free of the component here.
 */
export function fristFact(
  start: string | null | undefined,
  deadline: string,
): { key: 'frist'; title: string; text: string } {
  return { key: 'frist', title: 'Begutachtungsfrist', text: fristRangeDe(start, deadline) }
}

/**
 * Where a Begutachtung stands, in a few words for a link preview or a search
 * snippet: open with or without a Frist, closed with or without a date.
 *
 * Two shapes, for where the phrase stands. `fact` stands alone between „·"
 * („Frist bis 16.10.2026 · 12 Stellungnahmen", the draft page's og facts);
 * `clause` continues a sentence after the type word („Verordnungsentwurf, in
 * Begutachtung bis 16.10.2026", the RIS page's description). Closed, both say
 * the same, so a closed one never reads „in Begutachtung".
 */
export function fristStateDe(
  active: boolean,
  deadline: string | null | undefined,
  shape: 'fact' | 'clause' = 'fact',
): string {
  if (active) {
    if (shape === 'clause') return deadline ? `in Begutachtung bis ${formatDateDe(deadline)}` : 'in Begutachtung'
    return deadline ? `Frist bis ${formatDateDe(deadline)}` : 'Begutachtung läuft'
  }
  return deadline ? `Begutachtung endete am ${formatDateDe(deadline)}` : 'Begutachtung abgeschlossen'
}
