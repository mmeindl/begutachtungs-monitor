/**
 * Canonical GP knowledge — validation for GP codes and item numbers, the
 * Roman-numeral conversion, and the calendar of Gesetzgebungsperioden. The
 * ONE definition for client routes, server params, and mappers
 * (auto-imported; pure module so vitest can import it relatively).
 */

/** Valid GP code: Roman numerals (value range of the Parliament API). */
export const GP_RE = /^[IVXLC]+$/

/** Valid item number (INR): digit sequence. */
export const INR_RE = /^\d+$/

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
 * end column is needed. Verified 2026-09-08 against the table of
 * Gesetzgebungsperioden (de.wikipedia.org/wiki/Nationalrat_(Österreich))
 * and against list 81 itself: last GP XXVII arrival 2024-10-11, first GP
 * XXVIII arrival 2024-12-17. Older GPs are absent on purpose — the monitor
 * reaches back to GP XIV (1979), but a date is only shown where it is
 * verified; `gpEndedOn` returns null there and the page says "beendet"
 * without one. Extend by one row when GP XXIX convenes.
 */
export const GP_STARTS: Readonly<Record<string, string>> = {
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
 * one convened. Null while it runs — and null for GPs before XX, where the
 * table has no successor row; use `gpHasEnded` for the yes/no question.
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
 * The Gesetzgebungsperiode immediately before `gp` — XXVIII → XXVII. Null
 * for a code that is not a Roman numeral and below GP I, where there is no
 * period before.
 *
 * ARITHMETIC ON THE NUMERAL, not a lookup in `GP_STARTS`, and that is the
 * point: the one caller is the Periodenwechsel fallback (§12.35), which has
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
 * is exactly the wrong dependency, and it costs roughly half of what is open
 * (§12.16, §12.35).
 *
 * The predecessor answers for it, because its window is open-ended by
 * construction: `gpEndedOn` reads the successor's start, which is precisely
 * the row that is missing, so the window already runs to today and covers
 * the new period's records too.
 *
 * The condition is exact and self-disabling. An open-ended predecessor
 * window means no successor row exists, so this returns a different code
 * only for the period straight after the newest one in the table, and stops
 * the moment that row is added. A gap further back — GP XIX and older, which
 * the table simply does not reach — fails it and returns null, because there
 * the predecessor has no window either and inventing one would date records
 * into a period nobody verified.
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
