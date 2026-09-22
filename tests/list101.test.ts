import { describe, expect, it } from 'vitest'
import { mapVorlageRow } from '../server/utils/parliament/list101'

/* One real list-101 row, GP XXVIII, as the API returned it on 2026-09-15
 * (trailing columns the mapper does not read are dropped). */
const LIST101_ROW: unknown[] = [
  'XXVIII', 'I', '254', null, '15.10.2025', 'RV',
  'MinroG-Novelle IE-R 2025', '254 d.B.', '20251015', '05', '5', 'RV',
  'N', 'Regierungsvorlage', '/gegenstand/XXVIII/I/254',
]

describe('mapVorlageRow', () => {
  it('maps a real list-101 row completely', () => {
    expect(mapVorlageRow(LIST101_ROW)).toEqual({
      gp: 'XXVIII',
      inr: 254,
      citation: '254 d.B.',
      title: 'MinroG-Novelle IE-R 2025',
      date: '2025-10-15',
      status: '5',
      parliamentUrl: 'https://www.parlament.gv.at/gegenstand/XXVIII/I/254',
    })
  })

  it('reads the date from DATUMSORT, not from the dd.mm.yyyy display column', () => {
    // The house rule (api-exploration.md §5): the display column is never
    // parsed. Corrupting it must not change the result.
    const row = [...LIST101_ROW]
    row[4] = 'Unsinn'
    expect(mapVorlageRow(row).date).toBe('2025-10-15')
  })

  it('survives a missing DATUMSORT and a missing path', () => {
    const row = [...LIST101_ROW]
    row[8] = ''
    row[14] = ''
    const mapped = mapVorlageRow(row)
    expect(mapped.date).toBe('')
    // Falls back to the canonical Gegenstand path rather than a broken link.
    expect(mapped.parliamentUrl).toBe('https://www.parlament.gv.at/gegenstand/XXVIII/I/254')
  })

  it('keeps status as the string upstream sends, so "2" stays distinguishable', () => {
    const row = [...LIST101_ROW]
    row[10] = '2'
    expect(mapVorlageRow(row).status).toBe('2')
  })
})
