import { describe, expect, it } from 'vitest'
import { GP_STARTS, gpEndedOn, gpHasEnded, intToRoman, previousGp, romanToInt } from '../shared/utils/gp'

describe('Roman numerals', () => {
  it('round-trips and rejects malformed codes strictly', () => {
    expect(romanToInt('XXVIII')).toBe(28)
    expect(intToRoman(28)).toBe('XXVIII')
    expect(romanToInt('XIV')).toBe(14)
    expect(romanToInt('IIX')).toBeNull()
    expect(romanToInt('abc')).toBeNull()
  })
})

describe('Gesetzgebungsperioden calendar', () => {
  it('ends a GP the day before the next one convened (Art. 27 B-VG)', () => {
    expect(gpEndedOn('XXVII')).toBe('2024-10-23')
    expect(gpEndedOn('XXVI')).toBe('2019-10-22')
    expect(gpEndedOn('XX')).toBe('1999-10-28')
    // The GP before the first table row still gets its end from that row.
    expect(gpEndedOn('XIX')).toBe('1996-01-14')
  })

  it('knows no end for the running GP, for GPs before the table, or for garbage', () => {
    expect(gpEndedOn('XXVIII')).toBeNull()
    expect(gpEndedOn('XVIII')).toBeNull()
    expect(gpEndedOn('kaputt')).toBeNull()
  })

  it('decides "ended" from the table first, then from the running GP', () => {
    expect(gpHasEnded('XXVII', 'XXVIII')).toBe(true)
    // A stale current-GP fallback cannot hide a boundary the table knows.
    expect(gpHasEnded('XXVII', 'XXVII')).toBe(true)
    // Before the table: only the running GP can tell.
    expect(gpHasEnded('XVIII', 'XXVIII')).toBe(true)
    expect(gpHasEnded('XVIII', null)).toBe(false)
    // Never "beendet" without evidence.
    expect(gpHasEnded('XXVIII', 'XXVIII')).toBe(false)
    expect(gpHasEnded('XXVIII', null)).toBe(false)
    expect(gpHasEnded('XXIX', 'XXVIII')).toBe(false)
    expect(gpHasEnded('nope', 'XXVIII')).toBe(false)
  })

  it('table rows are consecutive GPs in ascending date order', () => {
    const codes = Object.keys(GP_STARTS)
    for (let i = 1; i < codes.length; i++) {
      expect(romanToInt(codes[i]!)).toBe(romanToInt(codes[i - 1]!)! + 1)
      expect(GP_STARTS[codes[i]!]! > GP_STARTS[codes[i - 1]!]!).toBe(true)
    }
    expect(codes.at(-1)).toBe(intToRoman(28))
  })
})

/**
 * The period before a period — the arithmetic the Periodenwechsel fallback
 * stands on (§12.35, `server/utils/parliament/rankedPeriod.ts`).
 *
 * Its whole job is to work on a day nobody prepared for, so the case that
 * matters most is the one the calendar above does NOT know: on the day GP
 * XXIX constitutes itself there is no `GP_STARTS` row for it, and the
 * fallback still has to find XXVIII.
 */
describe('previousGp', () => {
  it('counts back one period, table or no table', () => {
    expect(previousGp('XXVIII')).toBe('XXVII')
    expect(previousGp('XXVII')).toBe('XXVI')
    // The case the fallback exists for: a period the calendar has no row for.
    expect(GP_STARTS['XXIX']).toBeUndefined()
    expect(previousGp('XXIX')).toBe('XXVIII')
    // And far below the table, where the monitor still has drafts.
    expect(previousGp('XIV')).toBe('XIII')
  })

  it('has nothing before GP I and nothing for a code it cannot read', () => {
    expect(previousGp('I')).toBeNull()
    expect(previousGp('IIX')).toBeNull()
    expect(previousGp('')).toBeNull()
    expect(previousGp('XXVIII ')).toBeNull()
  })
})
