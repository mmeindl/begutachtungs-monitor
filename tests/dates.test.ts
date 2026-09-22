import { describe, expect, it } from 'vitest'
import { parseFristsort, parseGermanDate } from '../server/utils/parliament/dates'

describe('parseFristsort', () => {
  it('parses yyyymmdd as number and string', () => {
    expect(parseFristsort(20260824)).toBe('2026-08-24')
    expect(parseFristsort('20260824')).toBe('2026-08-24')
  })

  it('empty/null/undefined → null', () => {
    expect(parseFristsort('')).toBeNull()
    expect(parseFristsort('   ')).toBeNull()
    expect(parseFristsort(null)).toBeNull()
    expect(parseFristsort(undefined)).toBeNull()
  })

  it('invalid values → null', () => {
    expect(parseFristsort(0)).toBeNull()
    expect(parseFristsort('abc')).toBeNull()
    expect(parseFristsort(20261301)).toBeNull() // month 13
    expect(parseFristsort(20260832)).toBeNull() // day 32
    expect(parseFristsort(2026)).toBeNull() // too short
    expect(parseFristsort('24.08.2026')).toBeNull() // display format
  })
})

describe('parseGermanDate', () => {
  it('dd.mm.yyyy → ISO', () => {
    expect(parseGermanDate('03.08.2026')).toBe('2026-08-03')
  })
  it('invalid → null', () => {
    expect(parseGermanDate('2026-08-03')).toBeNull()
    expect(parseGermanDate('99.99.2026')).toBeNull()
    expect(parseGermanDate(null)).toBeNull()
  })
})
