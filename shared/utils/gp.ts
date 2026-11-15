/**
 * Canonical GP knowledge — validation for GP codes and item numbers, the
 * Roman-numeral conversion, and the calendar of Gesetzgebungsperioden. The
 * ONE definition for client routes, server params, and mappers
 * (auto-imported; pure module so vitest can import it relatively).
 */

import { formatDateDe } from './format'

/**
 * Valid GP code: a canonical Roman numeral from I to XCIX — never empty,
 * never longer than eight characters (LXXXVIII).
 *
 * Canonical and bounded on purpose, not a character class: every code that
 * passes becomes a cache key and an upstream filter value, so the pattern
 * is what keeps the key space finite (99 values, against ~5^n for
 * `[IVXLC]+`). GP XCIX lies centuries out; the running period is XXVIII.
 * A numeric "is this period real" check needs the running GP, which is an
 * upstream call — that lives server-side (`isPlausibleGp`).
 */
export const GP_RE = /^(?=[IVXL])(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/

/**
 * Valid item number (INR): one to seven digits. Parliament's largest
 * numbers (Stellungnahmen, six digits) leave a factor of ten of headroom;
 * the cap keeps `Number(inr)` a safe integer, so an oversized string cannot
 * turn into `Infinity` and slip past a `< 1` check.
 */
export const INR_RE = /^\d{1,7}$/

/** An INR string as a number, or null unless it is a positive integer within `INR_RE`. */
export function parseInr(raw: string): number | null {
  if (!INR_RE.test(raw)) return null
  const n = Number(raw)
  return Number.isSafeInteger(n) && n >= 1 ? n : null
}

/**
 * Whether `gp` names a period that exists or is about to: I up to the one
 * after `currentGp`. One ahead because `currentGp` may be a stale fallback
 * on the day a period convenes — the same tolerance `gpHasEnded` keeps.
 */
export function isPlausibleGp(gp: string, currentGp: string): boolean {
  const n = romanToInt(gp)
  const current = romanToInt(currentGp)
  if (n === null) return false
  return current === null ? true : n <= current + 1
}

const ROMAN_TOKENS: [string, number][] = [
  ['C', 100],
  ['XC', 90],
  ['L', 50],
  ['XL', 40],
  ['X', 10],
  ['IX', 9],
  ['V', 5],
  ['IV', 4],
  ['I', 1],
]

export function intToRoman(n: number): string {
  if (!Number.isInteger(n) || n <= 0 || n > 399) return ''
  let rest = n
  let out = ''
  for (const [token, value] of ROMAN_TOKENS) {
    while (rest >= value) {
      out += token
      rest -= value
    }
  }
  return out
}

/** Strict inverse — "IIX" and the like → null. */
export function romanToInt(roman: string): number | null {
  if (!GP_RE.test(roman)) return null
  let total = 0
  let i = 0
  for (const [token, value] of ROMAN_TOKENS) {
    while (roman.startsWith(token, i)) {
      total += value
      i += token.length
    }
  }
  if (i !== roman.length) return null
  return intToRoman(total) === roman ? total : null
}

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
/**
 * First day of each Gesetzgebungsperiode — the konstituierende Sitzung of
 * the Nationalrat. Art. 27 B-VG: a GP lasts until the day the new
 * Nationalrat convenes, so GP n ends the day before GP n+1 starts and no
 * end column is needed. XX to XXVIII verified 2026-09-08 against the table
 * of Gesetzgebungsperioden (de.wikipedia.org/wiki/Nationalrat_(Österreich))
 * and against list 81 itself: last GP XXVII arrival 2024-10-11, first GP
 * XXVIII arrival 2024-12-17. XIV to XIX verified 2026-11-14 against
 * Parliament's page and stenographic protocol of the 1. Sitzung of each
 * period (Angelobung, Wahl des Präsidenten) and the same Wikipedia table
 * (`docs/research/landtagsperioden.md`, "Bund"). The table starts at XIV,
 * the oldest period the monitor reaches back to; a date enters only with two
 * agreeing sources. Extend by one row when GP XXIX convenes.
 */
export const GP_STARTS: Readonly<Record<string, string>> = {
  XIV: '1975-11-04',
  XV: '1979-06-05',
  XVI: '1983-05-19',
  XVII: '1986-12-17',
  XVIII: '1990-11-05',
  XIX: '1994-11-07',
  XX: '1996-01-15',
  XXI: '1999-10-29',
  XXII: '2002-12-20',
  XXIII: '2006-10-30',
  XXIV: '2008-10-28',
  XXV: '2013-10-29',
  XXVI: '2017-11-09',
  XXVII: '2019-10-23',
  XXVIII: '2024-10-24',
}

/**
 * Last day of a Gesetzgebungsperiode (ISO date): the day before the next
 * one convened. Null while it runs, and where the successor has no row
 * (before XIII; XIII ends the day before XIV); use `gpHasEnded` for the
 * yes/no question.
 */
export function gpEndedOn(gp: string): string | null {
  const n = romanToInt(gp)
  if (n === null) return null
  const nextStart = GP_STARTS[intToRoman(n + 1)]
  if (!nextStart) return null
  const d = new Date(`${nextStart}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/**
 * The calendar window a Gesetzgebungsperiode occupies, as ISO dates; `to`
 * null while it runs. Null for a GP the table above does not reach.
 *
 * Needed because the RIS Begut records carry no GP at all — they precede
 * the parliamentary stage entirely, so "which period is this Verordnung
 * from?" can only be answered by its Begutachtungsbeginn falling inside
 * this range (`server/utils/ris/risOnly.ts`).
 */
export function gpWindow(gp: string): { from: string; to: string | null } | null {
  const from = GP_STARTS[gp]
  if (!from) return null
  return { from, to: gpEndedOn(gp) }
}

/**
 * Where a period stands against the first day a source holds (`coversFrom`,
 * ISO): `before` — it ended before that day, so the source holds none of
 * it; `straddles` — it began before that day and ended on or after it, so
 * the source holds only its later part; `within` — the source holds all of
 * it. Null where the calendar has no row for the period. The running
 * period has no end and is never `before`.
 */
export function periodAgainstSource(gp: string, coversFrom: string): 'before' | 'straddles' | 'within' | null {
  const w = gpWindow(gp)
  if (!w) return null
  if (w.to !== null && w.to < coversFrom) return 'before'
  return w.from < coversFrom ? 'straddles' : 'within'
}

/**
 * The period whose window holds `day` (ISO, a timestamp is cut to its day):
 * the latest `GP_STARTS` row on or before it. Null before GP XIV, where the
 * table does not reach. The day after the newest row falls to that row's
 * period, whose window is open-ended (`gpEndedOn`) — the same answer
 * `windowPeriodFor` gives a period that convened before its row was added.
 */
export function gpOfDay(day: string): string | null {
  const d = day.slice(0, 10)
  let best: string | null = null
  for (const [gp, from] of Object.entries(GP_STARTS)) {
    if (from <= d && (best === null || from > GP_STARTS[best]!)) best = gp
  }
  return best
}

const MONTHS = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

/**
 * How the site names a Gesetzgebungsperiode it measures over — one wording
 * everywhere (21.10.2026). The GP is the name: it is the unit the site
 * counts in (the period select, every citation, the URLs), and the readers
 * who file Stellungnahmen think in it. The years go where there is room, in
 * a sentence, so that nobody has to know when XXVIII began. A label said
 * „XXVII. GP" and the next „seit Okt. 2024" for a few hours that day; two
 * names for one kind of thing.
 */

/** „XXVIII. GP" — the label under a tick, the credit line. */
export function gpNameDe(gp: string): string {
  return `${gp}.\u00a0GP`
}

/** „2019–2024", „seit Oktober 2024" — the years of a period; null where the calendar does not reach. */
export function gpYearsDe(gp: string): string | null {
  const w = gpWindow(gp)
  if (!w) return null
  const [y, m] = w.from.split('-').map(Number) as [number, number]
  return w.to === null ? `seit ${MONTHS[m - 1]} ${y}` : `${y}–${w.to.slice(0, 4)}`
}

/** „in der XXVIII. Gesetzgebungsperiode (seit Oktober 2024)" — in a sentence. */
export function gpInSentenceDe(gp: string): string {
  const years = gpYearsDe(gp)
  return `in der ${gp}. Gesetzgebungsperiode${years ? ` (${years})` : ''}`
}

/**
 * „seit 24.10.2024 (GP XXVIII)", „23.10.2019 – 23.10.2024 (GP XXVII)" — an
 * option of the period filter on /entwuerfe (14.11.2026). The filter is a
 * TIME SPAN and the GP is the Bund's name for it: the list holds the Länder's
 * drafts too, which have periods of their own and fall into the span in which
 * their Begutachtung began. The dates are `gpWindow`'s, both ends inclusive —
 * the bounds `readLaenderInWindow` filters by (`server/utils/laender/
 * sources.ts`) — so the label states exactly what the choice does. A period
 * the calendar does not reach (before XIV, or a new one before its row is
 * added) has no window and no Länder rows there; it is named by its GP alone.
 */
export function gpSpanLabelDe(gp: string): string {
  const w = gpWindow(gp)
  if (!w) return `GP ${gp}`
  const span = w.to === null ? `seit ${formatDateDe(w.from)}` : `${formatDateDe(w.from)} – ${formatDateDe(w.to)}`
  return `${span} (GP ${gp})`
}

/**
 * The Gesetzgebungsperiode immediately before `gp` — XXVIII → XXVII. Null
 * for a code that is not a Roman numeral and below GP I, where there is no
 * period before.
 *
 * ARITHMETIC ON THE NUMERAL, not a lookup in `GP_STARTS`, and that is the
 * point: the one caller is the Periodenwechsel fallback, which has
 * to work on the day GP XXIX constitutes itself — before anybody has added
 * a row to the table above. A fallback that needed maintenance at the
 * cutover would need it on exactly the day it exists to survive.
 */
export function previousGp(gp: string): string | null {
  const n = romanToInt(gp)
  if (n === null || n <= 1) return null
  return intToRoman(n - 1)
}

/**
 * Which period's DATE WINDOW answers for `gp` — itself, normally.
 *
 * The RIS Begut records carry no Gesetzgebungsperiode at all; they are
 * assigned to one by their Begutachtungsbeginn falling inside `gpWindow`
 * (`server/utils/ris/risOnly.ts`). So a period the calendar above has no row
 * for gets no records — not a thin list but no list, and it would stay that
 * way until someone edited the table. On the day a new period convenes that
 * is exactly the wrong dependency, and it costs roughly half of what is open.
 *
 * The predecessor answers for it, because its window is open-ended by
 * construction: `gpEndedOn` reads the successor's start, which is precisely
 * the row that is missing, so the window already runs to today and covers
 * the new period's records too.
 *
 * The condition is exact and self-disabling. An open-ended predecessor
 * window means no successor row exists, so this returns a different code
 * only for the period straight after the newest one in the table, and stops
 * the moment that row is added. A code further back — before GP XIV, which
 * the table does not reach — fails it and returns null, because there the
 * predecessor has no window either and inventing one would date records into
 * a period nobody verified.
 */
export function windowPeriodFor(gp: string): string | null {
  if (GP_STARTS[gp]) return gp
  const prev = previousGp(gp)
  const prevWindow = prev ? gpWindow(prev) : null
  return prev && prevWindow && prevWindow.to === null ? prev : null
}

/**
 * Whether `gp` lies before the GP that is running (`currentGp`, read from
 * Parliament's page configuration). Falls to false on unparseable codes and
 * when the current GP is unknown — the safe direction: a page never claims
 * "beendet" without evidence. The table is consulted too, so a GP with a
 * known successor reads as ended even if `currentGp` is a stale fallback.
 */
export function gpHasEnded(gp: string, currentGp: string | null | undefined): boolean {
  if (gpEndedOn(gp) !== null) return true
  const a = romanToInt(gp)
  const b = currentGp ? romanToInt(currentGp) : null
  return a !== null && b !== null && a < b
}
