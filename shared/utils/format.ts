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
 * Whole days from today until the given ISO date (date-only math, UTC).
 * 0 = today, negative = past.
 */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null
  const target = Date.UTC(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10)),
  )
  if (Number.isNaN(target)) return null
  const now = new Date()
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((target - today) / 86_400_000)
}

/** German remaining-time label for a deadline. */
export function fristLabel(deadline: string | null | undefined, active: boolean): string {
  const days = daysUntil(deadline)
  if (!active) {
    return deadline ? `Endete am ${formatDateDe(deadline)}` : 'Frist abgelaufen'
  }
  if (days === null) return 'Frist läuft'
  if (days < 0) return 'Frist abgelaufen'
  if (days === 0) return 'Endet heute'
  if (days === 1) return 'Noch 1 Tag'
  return `Noch ${days} Tage`
}
