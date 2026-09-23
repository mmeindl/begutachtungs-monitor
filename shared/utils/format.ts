/**
 * Formatting helpers shared by app and server (auto-imported by Nuxt from
 * shared/utils; import explicitly from '#shared/utils/format' if needed).
 */

/** ISO date ("2026-08-24" or full ISO) → "24.08.2026" */
export function formatDateDe(iso: string | null | undefined): string {
  if (!iso) return '–'
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)
  if (Number.isNaN(d.getTime())) return '–'
  return new Intl.DateTimeFormat('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
}

/** ISO date → "Mo., 31.08.2026" (de-AT, short weekday). Deadline planning
 * happens by calendar date, not by countdown — the weekday orients it. */
export function formatDateWeekdayDe(iso: string | null | undefined): string {
  if (!iso) return '–'
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)
  if (Number.isNaN(d.getTime())) return '–'
  return new Intl.DateTimeFormat('de-AT', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
}

/** ISO timestamp → "24.08.2026, 14:30" (de-AT) */
export function formatDateTimeDe(iso: string | null | undefined): string {
  if (!iso) return '–'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '–'
  return new Intl.DateTimeFormat('de-AT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d)
}

/** 12345 → "12.345" (de-AT grouping) */
export function formatNumberDe(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '–'
  return new Intl.NumberFormat('de-AT').format(n)
}

/** "1 Stellungnahme" / "12.345 Stellungnahmen" — singular exactly at 1. */
export function countLabelDe(n: number, singular: string, plural: string): string {
  return n === 1 ? `1 ${singular}` : `${formatNumberDe(n)} ${plural}`
}

/**
 * "1 Zustimmung" / "12 Zustimmungen".
 *
 * „Zustimmung" is Parliament's own term (upstream field: approvals) — the
 * vocabulary has to survive the click-through to parlament.gv.at. Here
 * because three components printed the same line: the panel, the
 * Regierungsvorlage's list and the organisation links.
 */
export function endorsementLabel(n: number): string {
  return countLabelDe(n, 'Zustimmung', 'Zustimmungen')
}

/**
 * "10 von 42 angezeigt" — where the reader stands in a paginated list.
 *
 * The remainder is deliberately NOT spelled out beside it. "10 von 42"
 * already says that 32 are left, and the button under this line says how
 * many the next press adds; a third number would state the same fact a
 * third time, in the one place on the panel where the reader is counting.
 */
export function shownLabelDe(visible: number, total: number): string {
  return `${formatNumberDe(Math.min(visible, total))} von ${formatNumberDe(total)} angezeigt`
}

/**
 * The step button's label, naming what the press will actually add — so the
 * last page reads "Weitere 3 anzeigen" and the button itself lands the
 * remainder.
 *
 * "anzeigen", never "laden": once a list is fetched nothing more travels,
 * and the organisation list ships with the page, where nothing ever did. A
 * button that says "laden" promises a request that does not happen.
 */
export function moreLabelDe(remaining: number, step: number): string {
  const n = Math.min(remaining, step)
  return n === 1 ? 'Eine weitere anzeigen' : `Weitere ${formatNumberDe(n)} anzeigen`
}

/** Cap at max characters at a word boundary; overlength ends in "…".
 * Mid-word cuts ("…Bundesges…") read broken in tabs and search results;
 * the boundary backtrack is skipped when it would eat >40% of the budget
 * (single-token strings). */
export function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  const cut = s.slice(0, max - 1)
  const brk = cut.lastIndexOf(' ')
  return `${(brk > (max - 1) * 0.6 ? cut.slice(0, brk) : cut).trimEnd()}…`
}

/**
 * One ISO date ("2026-09-21") as a timestamp, read as a plain calendar day.
 *
 * The day arithmetic here is date-only and runs in UTC — not because UTC is
 * the right timezone, but because it is the one without offsets: both
 * operands are already calendar days, so their difference is exact. NaN for
 * anything that is not a date, which every caller checks.
 */
function utcDay(iso: string): number {
  return Date.UTC(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10)),
  )
}

/** Built once — constructing an Intl formatter is the expensive part. */
const VIENNA_DAY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Vienna',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * Today as an ISO date (yyyy-mm-dd) — the calendar day in Europe/Vienna, and
 * the only definition of "today" this codebase has.
 *
 * The timezone is named because nothing in the process carries it: the VPS
 * runs in UTC (`deploy/` sets none), the browser runs wherever the reader
 * sits, and a Begutachtungsfrist „bis 21.09.2026" is an Austrian calendar
 * date that runs to the end of that day in Vienna. Three places used to
 * decide the day for themselves — `daysUntil` from the process's LOCAL day,
 * `ris/risRecord.today()` and the Begut search from the UTC day — and
 * between 00:00 and 02:00 Vienna time (22:00–24:00 UTC) they disagreed: the
 * server, still on yesterday, rendered „Endet heute" and `reconcileActive`
 * kept the draft open, while the client, two hours into the new day, got −1
 * and said „Frist abgelaufen". A hydration mismatch and a wrong state, for
 * two hours every night.
 *
 * The parts are read by name instead of trusting a locale to print
 * yyyy-mm-dd; Node 22 and every browser ship the full ICU this needs.
 */
export function todayIso(now: Date = new Date()): string {
  const parts = VIENNA_DAY_FORMAT.formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

/**
 * Whole days from today until the given ISO date (date-only math, UTC).
 * 0 = today, negative = past.
 *
 * "Today" is the Vienna calendar day (`todayIso`), never the one the process
 * happens to live in — see there for what the local day used to cost. `now`
 * is there so a test can pin the clock by passing it, without mocking Date.
 */
export function daysUntil(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null
  const target = utcDay(iso)
  if (Number.isNaN(target)) return null
  return Math.round((target - utcDay(todayIso(now))) / 86_400_000)
}

/**
 * "Bundesgesetzblatt I Nr. 69/2026" → "BGBl. I Nr. 69/2026".
 *
 * Parliament writes the word out, everything that shows or looks up the
 * citation wants the short form: the spine's Kundmachung fact, the row detail
 * of a promulgated draft, and the RIS lookup, which only finds the document
 * under its own Kurzform.
 */
export function bgblShort(citation: string): string {
  return citation.replace(/^Bundesgesetzblatt\b/, 'BGBl.')
}

/**
 * One wording for a Frist that has ended (decided 22.09.2026): the chip said
 * „Endete am …" and the row detail „Frist endete …" — one fact, two spellings.
 * The dateless sibling stays „Frist abgelaufen".
 */
export function fristEndedDe(deadline: string): string {
  return `Frist endete am ${formatDateDe(deadline)}`
}

/** German remaining-time label for a deadline. */
export function fristLabel(deadline: string | null | undefined, active: boolean): string {
  const days = daysUntil(deadline)
  if (!active) {
    return deadline ? fristEndedDe(deadline) : 'Frist abgelaufen'
  }
  if (days === null) return 'Frist läuft'
  if (days < 0) return 'Frist abgelaufen'
  if (days === 0) return 'Endet heute'
  if (days === 1) return 'Noch 1 Tag'
  return `Noch ${days} Tage`
}

/**
 * Whole days from one ISO date to another (date-only math, UTC), negative
 * when `to` lies before `from`; null when either date is missing.
 *
 * Separate from `daysUntil`, which measures against today: these are two
 * different questions, and a "how long did this take" that silently used
 * the clock would change its answer overnight.
 *
 * Not `daysBetween`: `server/utils/ris/titleSimilarity.ts` exports that name for the
 * same arithmetic on non-null dates, and Nuxt auto-imports both trees —
 * the duplicate name resolved to the server one and silently shadowed this
 * everywhere it was called unqualified. Worth consolidating once the join
 * is touched again; a collision is not worth risking for a nicer name.
 */
export function spanInDays(
  from: string | null | undefined,
  to: string | null | undefined,
): number | null {
  if (!from || !to) return null
  const a = utcDay(from)
  const b = utcDay(to)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((b - a) / 86_400_000)
}
