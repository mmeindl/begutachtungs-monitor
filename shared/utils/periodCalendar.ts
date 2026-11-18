/**
 * The calendar the list's time span reads — the Bund's Gesetzgebungsperioden
 * (`GP_STARTS` in `./gp`) and the Länder's own Landtag periods, in one place
 * (14.11.2026). The server's window (`/api/laender?landtag=`,
 * `/api/laender/gesetze?landtag=`), the select's labels and the tests read
 * the same rows, so a date entered here is the date every one of them uses.
 *
 * Which spans the list offers depends on the sources (`periodViewFor`):
 *
 *  - the Bund chosen, alone or with Länder → the Bund's periods, named by GP;
 *  - exactly one Land, no Bund, its calendar not empty → that Land's own
 *    periods, named as the Land names them;
 *  - several Länder, no Bund — or one Land whose calendar is empty → the
 *    Bund's spans by their dates alone, no period name. That third case is
 *    the permanent answer for a Land whose periods are not verified, not a
 *    stub: the dates say exactly what the filter does.
 *
 * Pure module (auto-imported; vitest imports it relatively). Every function
 * takes the calendars as an argument with `LAND_PERIODS` as its default, so
 * the tests run on fixture calendars and never on dates entered here.
 */
import type { LandCode } from '../types'
import { formatDateDe, todayIso } from './format'
import { GP_STARTS, gpWindow, romanToInt } from './gp'
import { LAND_CODES, LAND_NAME } from './laender'

/** One Landtag period of a Land. */
export interface LandPeriod {
  /** The ordinal number of the period (17 for the 17. Gesetzgebungsperiode) — the value in `?landtag=sbg-17`. */
  id: number
  /** The designation as the Land writes it: „17. Gesetzgebungsperiode", „XVIII. Gesetzgebungsperiode", „21. Wahlperiode". */
  label: string
  /** ISO date of the Landtag's constituent sitting — the period's first day. */
  start: string
}

export type LandPeriodCalendars = Readonly<Partial<Record<LandCode, readonly LandPeriod[]>>>

/**
 * The Länder's Landtag periods, entered on 14.11.2026 from
 * `docs/research/landtagsperioden.md`: per Land the unbroken run of periods
 * back from the running one whose start two sources agree on, one of them
 * official. A period the memo lists as open is not here, and neither is any
 * period before it.
 *
 * Only a date that two independent sources agree on, as recorded in
 * `docs/research/landtagsperioden.md`, may be entered here. A period starts
 * on the day of the Landtag's constituent sitting and ends the day before the
 * next one starts; the newest is open-ended, so no end column is needed. Order
 * does not matter (the functions sort by `start`). The shape, per Land:
 *
 *   sbg: [
 *     { id: 16, label: '16. Gesetzgebungsperiode', start: 'YYYY-MM-DD' },
 *     { id: 17, label: '17. Gesetzgebungsperiode', start: 'YYYY-MM-DD' },
 *   ],
 *
 * A Land without a row here — or a span its calendar does not reach back to —
 * is listed by the Bund's spans with their dates alone (`periodViewFor`).
 */
export const LAND_PERIODS: LandPeriodCalendars = {
  bgld: [
    { id: 18, label: 'XVIII. Gesetzgebungsperiode', start: '2000-12-28' },
    { id: 19, label: 'XIX. Gesetzgebungsperiode', start: '2005-10-25' },
    { id: 20, label: 'XX. Gesetzgebungsperiode', start: '2010-06-24' },
    { id: 21, label: 'XXI. Gesetzgebungsperiode', start: '2015-07-09' },
    { id: 22, label: 'XXII. Gesetzgebungsperiode', start: '2020-02-17' },
    { id: 23, label: 'XXIII. Gesetzgebungsperiode', start: '2025-02-06' },
  ],
  ktn: [
    { id: 28, label: '28. Gesetzgebungsperiode', start: '1999-04-08' },
    { id: 29, label: '29. Gesetzgebungsperiode', start: '2004-03-31' },
    { id: 30, label: '30. Gesetzgebungsperiode', start: '2009-03-31' },
    { id: 31, label: '31. Gesetzgebungsperiode', start: '2013-03-28' },
    { id: 32, label: '32. Gesetzgebungsperiode', start: '2018-04-12' },
    { id: 33, label: '33. Gesetzgebungsperiode', start: '2023-04-13' },
  ],
  noe: [
    { id: 16, label: 'XVI. Gesetzgebungsperiode', start: '2003-04-24' },
    { id: 17, label: 'XVII. Gesetzgebungsperiode', start: '2008-04-10' },
    { id: 18, label: 'XVIII. Gesetzgebungsperiode', start: '2013-04-24' },
    { id: 19, label: 'XIX. Gesetzgebungsperiode', start: '2018-03-22' },
    { id: 20, label: 'XX. Gesetzgebungsperiode', start: '2023-03-23' },
  ],
  ooe: [
    { id: 26, label: 'XXVI. Gesetzgebungsperiode', start: '2003-10-23' },
    { id: 27, label: 'XXVII. Gesetzgebungsperiode', start: '2009-10-23' },
    { id: 28, label: 'XXVIII. Gesetzgebungsperiode', start: '2015-10-23' },
    { id: 29, label: 'XXIX. Gesetzgebungsperiode', start: '2021-10-23' },
  ],
  sbg: [
    { id: 12, label: '12. Gesetzgebungsperiode', start: '1999-04-27' },
    { id: 13, label: '13. Gesetzgebungsperiode', start: '2004-04-28' },
    { id: 14, label: '14. Gesetzgebungsperiode', start: '2009-04-22' },
    { id: 15, label: '15. Gesetzgebungsperiode', start: '2013-06-19' },
    { id: 16, label: '16. Gesetzgebungsperiode', start: '2018-06-13' },
    { id: 17, label: '17. Gesetzgebungsperiode', start: '2023-06-14' },
  ],
  stmk: [
    { id: 14, label: 'XIV. Gesetzgebungsperiode', start: '2000-11-07' },
    { id: 15, label: 'XV. Gesetzgebungsperiode', start: '2005-10-25' },
    { id: 16, label: 'XVI. Gesetzgebungsperiode', start: '2010-10-21' },
    { id: 17, label: 'XVII. Gesetzgebungsperiode', start: '2015-06-16' },
    { id: 18, label: 'XVIII. Gesetzgebungsperiode', start: '2019-12-17' },
    { id: 19, label: 'XIX. Gesetzgebungsperiode', start: '2024-12-18' },
  ],
  t: [
    { id: 14, label: 'XIV. Gesetzgebungsperiode', start: '2003-10-21' },
    { id: 15, label: 'XV. Gesetzgebungsperiode', start: '2008-07-01' },
    { id: 16, label: 'XVI. Gesetzgebungsperiode', start: '2013-05-24' },
    { id: 17, label: 'XVII. Gesetzgebungsperiode', start: '2018-03-28' },
    { id: 18, label: 'XVIII. Gesetzgebungsperiode', start: '2022-10-25' },
  ],
  // Vorarlberg counts the Landtag itself („XXXII. Vorarlberger Landtag").
  vbg: [
    { id: 27, label: 'XXVII. Landtag', start: '1999-10-05' },
    { id: 28, label: 'XXVIII. Landtag', start: '2004-10-05' },
    { id: 29, label: 'XXIX. Landtag', start: '2009-10-14' },
    { id: 30, label: 'XXX. Landtag', start: '2014-10-15' },
    { id: 31, label: 'XXXI. Landtag', start: '2019-11-06' },
    { id: 32, label: 'XXXII. Landtag', start: '2024-11-06' },
  ],
  w: [
    { id: 17, label: '17. Wahlperiode', start: '2001-04-27' },
    { id: 18, label: '18. Wahlperiode', start: '2005-11-18' },
    { id: 19, label: '19. Wahlperiode', start: '2010-11-25' },
    { id: 20, label: '20. Wahlperiode', start: '2015-11-24' },
    { id: 21, label: '21. Wahlperiode', start: '2020-11-24' },
    { id: 22, label: '22. Wahlperiode', start: '2025-06-10' },
  ],
}

/** A span of days, both ends inclusive; `to` null while it runs. */
export interface DateWindow {
  from: string
  to: string | null
}

/** The day before an ISO date. */
function dayBefore(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** A Land's periods, newest first; empty where its calendar is. */
export function landPeriodsOf(land: LandCode, calendars: LandPeriodCalendars = LAND_PERIODS): LandPeriod[] {
  return [...(calendars[land] ?? [])].sort((a, b) => b.start.localeCompare(a.start))
}

/** The period that runs: the newest row — open-ended, as `GP_STARTS`' newest. Null for an empty calendar. */
export function runningLandPeriod(land: LandCode, calendars: LandPeriodCalendars = LAND_PERIODS): LandPeriod | null {
  return landPeriodsOf(land, calendars)[0] ?? null
}

/** The days a Land's period occupies: its start to the day before the next one's. Null for a period the calendar does not hold. */
export function landPeriodWindow(land: LandCode, id: number, calendars: LandPeriodCalendars = LAND_PERIODS): DateWindow | null {
  const periods = landPeriodsOf(land, calendars)
  const i = periods.findIndex((p) => p.id === id)
  if (i < 0) return null
  const next = periods[i - 1]
  return { from: periods[i]!.start, to: next ? dayBefore(next.start) : null }
}

/* ------------------------------------------------------------------ *
 * `?landtag=sbg-17`
 * ------------------------------------------------------------------ */

/** The URL parameter of a Land period, in the German style of `quellen`, `art`, `station`. */
export const LANDTAG_PARAM = 'landtag'

/** Well-formed: a Land code, a hyphen, an ordinal of one to three digits. Bounded, so every value that passes is a finite key. */
const LANDTAG_RE = /^([a-z]{1,4})-([1-9]\d{0,2})$/

/** `sbg-17` — the parameter's value for a Land period. */
export function landtagValue(land: LandCode, id: number): string {
  return `${land}-${id}`
}

/** The parts of a well-formed value (lower or upper case, trimmed), not yet held against a calendar; null where it is malformed. */
export function landtagParts(raw: string | null | undefined): { land: LandCode; id: number } | null {
  const m = LANDTAG_RE.exec((raw ?? '').trim().toLowerCase())
  if (!m || !(LAND_CODES as readonly string[]).includes(m[1]!)) return null
  return { land: m[1] as LandCode, id: Number(m[2]) }
}

/**
 * A Land period the calendar holds, as its canonical value and window — or
 * null for anything else: malformed, an unknown Land, a period not entered.
 */
export function parseLandtag(
  raw: string | null | undefined,
  calendars: LandPeriodCalendars = LAND_PERIODS,
): { land: LandCode; id: number; value: string; window: DateWindow } | null {
  const parts = landtagParts(raw)
  if (!parts) return null
  const window = landPeriodWindow(parts.land, parts.id, calendars)
  return window ? { ...parts, value: landtagValue(parts.land, parts.id), window } : null
}

/* ------------------------------------------------------------------ *
 * Which spans the sources offer
 * ------------------------------------------------------------------ */

/**
 * Which calendar names the span (14.11.2026):
 *
 *  - `bund`: the Bund is among the sources — its periods, „GP XXVIII";
 *  - `land`: exactly one Land and no Bund, its calendar not empty — the
 *    Land's own periods (newest first);
 *  - `dates`: the rest — the Bund's spans by their dates alone.
 */
export type PeriodView =
  | { mode: 'bund' }
  | { mode: 'dates' }
  | { mode: 'land'; land: LandCode; periods: LandPeriod[] }

export function periodViewFor(
  bund: boolean,
  laender: readonly LandCode[],
  calendars: LandPeriodCalendars = LAND_PERIODS,
): PeriodView {
  if (bund) return { mode: 'bund' }
  if (laender.length === 1) {
    const periods = landPeriodsOf(laender[0]!, calendars)
    if (periods.length) return { mode: 'land', land: laender[0]!, periods }
  }
  return { mode: 'dates' }
}

/**
 * Whether a Bund period is offered in a view: every period under the Bund;
 * under the dates and a Land's own calendar only one with a window (a period
 * the Bund's calendar does not reach holds no Land's draft) — and beside a
 * Land's own periods only one that begins before the Land's calendar reaches
 * back, the span the Land's calendar cannot name.
 */
export function gpOfferedIn(gp: string, view: PeriodView): boolean {
  if (view.mode === 'bund') return true
  const w = gpWindow(gp)
  if (!w) return false
  if (view.mode === 'dates') return true
  const earliest = view.periods.at(-1)!.start
  return w.from < earliest
}

/** Whether a Land period is offered in a view: only its own Land's, while that Land is the selection. */
export function landtagOfferedIn(landtag: string, view: PeriodView): boolean {
  if (view.mode !== 'land') return false
  const parts = landtagParts(landtag)
  return !!parts && parts.land === view.land && view.periods.some((p) => p.id === parts.id)
}

/**
 * The span the list may filter by in a view — a chosen value the view does
 * not offer falls to the running span, '' (14.11.2026). `landtag` wins over
 * `gp` in a Land's view; elsewhere `landtag` never applies.
 */
export function coherentSpan(
  span: { gp: string; landtag: string },
  view: PeriodView,
): { gp: string; landtag: string } {
  const landtag = span.landtag && landtagOfferedIn(span.landtag, view) ? span.landtag : ''
  const gp = !landtag && span.gp && gpOfferedIn(span.gp, view) ? span.gp : ''
  return { gp, landtag }
}

/**
 * What the Länder endpoints are asked for: the Land period, the running one
 * where none is chosen in a Land's view — the default the Bund's periods get
 * from the server, which does not know which Land is chosen — else the GP
 * (undefined: the running one, as before).
 */
export function laenderSpanQuery(
  span: { gp: string; landtag: string },
  view: PeriodView,
): { gp?: string; landtag?: string } {
  if (span.landtag) return { landtag: span.landtag }
  if (view.mode === 'land' && !span.gp) return { landtag: landtagValue(view.land, view.periods[0]!.id) }
  return span.gp ? { gp: span.gp } : {}
}

/* ------------------------------------------------------------------ *
 * How a span is named
 * ------------------------------------------------------------------ */

/**
 * „seit 24.10.2024", „23.10.2019 – 23.10.2024" — the dates of a window, both
 * ends inclusive. `compact` drops the spaces round the dash, for a chip:
 * „23.10.2019–23.10.2024".
 */
export function windowDatesDe(w: DateWindow, compact = false): string {
  if (w.to === null) return `seit ${formatDateDe(w.from)}`
  return `${formatDateDe(w.from)}${compact ? '–' : ' – '}${formatDateDe(w.to)}`
}

/** A Bund span by its dates alone; null where the calendar does not reach it. */
export function gpSpanDatesDe(gp: string, compact = false): string | null {
  const w = gpWindow(gp)
  return w ? windowDatesDe(w, compact) : null
}

/** „seit 03.07.2023 (17. Gesetzgebungsperiode)" — an option of the select in a Land's view. */
export function landPeriodSpanLabelDe(land: LandCode, period: LandPeriod, calendars: LandPeriodCalendars = LAND_PERIODS): string {
  const w = landPeriodWindow(land, period.id, calendars)
  return w ? `${windowDatesDe(w)} (${period.label})` : period.label
}

/**
 * „17. GP Salzburg" — the chip of a Land period: the Land's own designation
 * with „Gesetzgebungsperiode" shortened to the „GP" the Bund's chip uses, and
 * the Land's name, so the chip is unambiguous without its select beside it.
 * Another word („21. Wahlperiode Wien") stays as the Land writes it.
 */
export function landPeriodChipDe(land: LandCode, period: LandPeriod): string {
  return `${period.label.replace(/Gesetzgebungsperiode/, 'GP')} ${LAND_NAME[land]}`
}

/* ------------------------------------------------------------------ *
 * The Bund's periods a window touches
 * ------------------------------------------------------------------ */

/**
 * The Bund periods whose window overlaps `w` — what a Land period's window
 * needs of maps built per Bund period (the EU map, `/api/laender`). Newest
 * first; empty where the Bund's calendar does not reach.
 */
export function gpsOverlapping(w: DateWindow): string[] {
  return Object.keys(GP_STARTS)
    .filter((gp) => {
      const g = gpWindow(gp)!
      return (w.to === null || g.from <= w.to) && (g.to === null || g.to >= w.from)
    })
    .sort((a, b) => (romanToInt(b) ?? 0) - (romanToInt(a) ?? 0))
}

/* ------------------------------------------------------------------ *
 * A span of the reader's own: `?von=` and `?bis=` (18.11.2026)
 * ------------------------------------------------------------------ */

/**
 * The URL parameters of a span of the reader's own — „alle Entwürfe vom 9.
 * bis 15.11.", a link a team shares so everybody reviews the same rows.
 * German, as `quellen`, `art`, `landtag`. `bis` is optional: without it the
 * span runs to today and on.
 */
export const VON_PARAM = 'von'
export const BIS_PARAM = 'bis'

/** A calendar day that exists, as `YYYY-MM-DD`, or '' for anything else (31.02. included). */
export function parseIsoDay(raw: string | null | undefined): string {
  const s = (raw ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
  const d = new Date(`${s}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : ''
}

/** Whether a day lies in a window, both ends inclusive. A row without a day lies in none. */
export function inDateWindow(day: string | null | undefined, w: DateWindow): boolean {
  return !!day && day >= w.from && (w.to === null || day <= w.to)
}

/**
 * A span of the reader's own, held against the Bund's calendar.
 *
 * NO NEW DATA PATH: every half of the list is fetched per Bund period, as
 * for the select's periods, and the page cuts the rows by their day
 * (`rowDay`). So a window resolves to ONE period — the newest it touches —
 * and is clipped to it. A weekly window, and any window inside a period,
 * is never clipped. One that reaches back over a Periodenwechsel shows its
 * part in the later period, and `cut` is the part before, which the page
 * names and links to (it resolves to the period before, and so on back).
 * Uniting several periods would mean asking every list endpoint for several
 * at once — rejected while nobody needs a span over a Periodenwechsel.
 *
 * Null where no span is chosen, or it lies wholly before the calendar.
 */
export interface CustomSpan {
  /** The Bund period the rows are fetched for. */
  gp: string
  /** The days the rows are cut to: the reader's window, clipped to `gp`'s. */
  window: DateWindow
  /** The reader's days before `gp` began, which this list does not show; null when none. */
  cut: DateWindow | null
}

export function customSpanOf(von: string, bis: string): CustomSpan | null {
  if (!von) return null
  const asked: DateWindow = { from: von, to: bis || null }
  const gp = gpsOverlapping(asked)[0]
  if (!gp) return null
  const g = gpWindow(gp)!
  const from = asked.from < g.from ? g.from : asked.from
  const to = g.to === null ? asked.to : asked.to === null || asked.to > g.to ? g.to : asked.to
  return {
    gp,
    window: { from, to },
    cut: asked.from < g.from ? { from: asked.from, to: dayBefore(g.from) } : null,
  }
}

/**
 * `von` and `bis` as the URL may carry them, made one window: each a real
 * day or '', a `bis` without a `von` dropped (a span needs its start), and two
 * ends written the wrong way round turned round — the reader meant the days
 * between them, and an empty list would only say they typed in a hurry.
 *
 * No day after today (18.11.2026): every day a list cuts by — a
 * Begutachtung's start, an Anliegen's arrival, a Kundmachung — lies in the
 * past, so an end after today says nothing an open end does not, and is
 * made open („heute"; today itself stays a fixed end, so a shared link
 * keeps its days); a later start holds nothing at all and is no span. The
 * calendar offers no such day either (`DateRangeButton`).
 */
export function orderedRange(von: string, bis: string, today: string = todayIso()): { von: string; bis: string } {
  const a = parseIsoDay(von)
  const b = parseIsoDay(bis)
  if (!a) return { von: '', bis: '' }
  const [start, end] = b && b < a ? [b, a] : [a, b]
  if (start > today) return { von: '', bis: '' }
  return { von: start, bis: end && end <= today ? end : '' }
}

/** The Monday of the week a day lies in — where „Eigener Zeitraum" starts (the review a team splits by calendar weeks). */
export function weekStartOf(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

/** The first day the Bund's calendar has a window for: a span of the reader's own cannot start before it. */
export function earliestSpanDay(): string {
  return Object.keys(GP_STARTS).map((gp) => gpWindow(gp)?.from).filter((d): d is string => !!d).sort()[0] ?? ''
}
