/**
 * The number a schedule's designation carries — „Anlage 2", „Anhang XIV",
 * „Anlage A" — the one reading both sides of the Lesefassung key a schedule
 * by: the engine (`unitKey` in `server/utils/text/designation.ts`) and the
 * page (`annexUnitId` in `explanationKey.ts`). Two readings would be two
 * chances to drift, and a drift here is not an error but an outcome that
 * meets no block.
 *
 * PURE MODULE — relative imports only, so vitest and the page run it alike.
 */
import { PARAGRAPH_NUMBER } from './paragraphNumber'

const ROMAN: readonly (readonly [string, number])[] = [
  ['M', 1000], ['CM', 900], ['D', 500], ['CD', 400], ['C', 100], ['XC', 90],
  ['L', 50], ['XL', 40], ['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1],
]

/**
 * A number as a Roman numeral: 14 → „XIV". Named apart from the server's
 * `romanOf` (`text/designation.ts`, which hands this one on), so the
 * auto-imports of `shared/` and `server/utils` never hold two of one name.
 */
export function romanNumeral(n: number): string {
  let out = ''
  let rest = n
  for (const [symbol, value] of ROMAN) {
    while (rest >= value) {
      out += symbol
      rest -= value
    }
  }
  return out
}

/**
 * A Roman numeral → its value, written in Arabic: „XIV" → „14". Null for
 * anything else.
 *
 * Parsed greedily and then written back, so only the canonical spelling is
 * accepted: „IIII" and „VX" are no numerals and come back null rather than
 * as 4 and 5.
 */
export function romanNumberKey(numeral: string): string | null {
  const upper = numeral.trim().toUpperCase()
  if (!/^[IVXLCDM]+$/.test(upper)) return null
  let value = 0
  let rest = upper
  for (const [symbol, amount] of ROMAN) {
    while (rest.startsWith(symbol)) {
      value += amount
      rest = rest.slice(symbol.length)
    }
  }
  if (rest.length > 0 || value === 0) return null
  return romanNumeral(value) === upper ? String(value) : null
}

/** The word a schedule's designation opens with, and the token right after it. */
const SCHEDULE_TOKEN_RE = /^(?:Anlage|Anhang|Anl\.?)\s*([^\s,;:()]+)/i
const DIGITS_RE = new RegExp(`^(${PARAGRAPH_NUMBER})`)

/**
 * The schedule's own number, read right after its word and nowhere else —
 * null for a schedule without one („Anhang", „Anlage zu § 5").
 *
 *  - Arabic as it stands („Anlage 2" → „2", „Anl. 4a" → „4a").
 *  - **Roman in Arabic** („Anhang XIV" → „14"), because RIS files every
 *    schedule so: over the harness cache's RIS answers every label is
 *    „Anl." with an Arabic number, the BVergG 2018's twenty Anhänge
 *    included, and a draft may write either for the same schedule
 *    (12732B03: „Anlage 1 … sowie … Anlage II" for the law's Anlage I and
 *    II). Read only in capitals, and a single letter only as I, V or X: a
 *    lettered schedule „Anlage C" is a letter, not a hundred.
 *  - Anything else that opens with a capital as written — a letter
 *    („Anlage A"), or a numeral that is not canonical („Anhang IVX", 58/ME
 *    XXVIII): a key of its own that meets nothing it should not.
 *
 * Until 19.11.2026 the number was the first one anywhere in the label, and
 * there is none in „Anhang XIV": every Roman- or letter-numbered schedule of
 * a law fell into the bare „Anl.", the key that means a law's only
 * schedule — one outcome for the eleven Anhänge of the BVergG 2018 in 58/ME
 * XXVIII, placed at each of them. And „Anlage zu § 5" read as „Anl. 5".
 */
export function scheduleNumber(label: string): string | null {
  const token = SCHEDULE_TOKEN_RE.exec(label.trim())?.[1]?.replace(/\.$/, '')
  if (!token) return null
  const digits = DIGITS_RE.exec(token)
  if (digits) return digits[1]!
  if (/^(?:[IVX]|[IVXLCDM]{2,})$/.test(token)) return romanNumberKey(token) ?? token
  return /^[A-ZÄÖÜ]/.test(token) ? token : null
}
