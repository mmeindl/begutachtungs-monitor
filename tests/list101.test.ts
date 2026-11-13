import { describe, expect, it } from 'vitest'
import { mapAntragRow, mapVorlageRow } from '../server/utils/parliament/list101'

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
    // The house rule (api-exploration.md §1): the display column is never
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

/* An Antrag row of list 101, GP XXVIII, as the API returned it on 2026-11-09. */
const ANTRAG_ROW: unknown[] = [
  'XXVIII', 'A', '409', null, '24.09.2025', 'A',
  'ORF-Gesetz, Änderung (ÖVP, SPÖ, NEOS)', '409/A', '20250924', '05', '5', 'A',
  'N', 'Selbständiger Antrag', '/gegenstand/XXVIII/A/409',
]

describe('mapAntragRow', () => {
  it('takes the movers\' Klubs off the title and keeps the Antrag\'s page', () => {
    expect(mapAntragRow(ANTRAG_ROW)).toMatchObject({
      inr: 409,
      citation: '409/A',
      title: 'ORF-Gesetz, Änderung',
      date: '2025-09-24',
      parliamentUrl: 'https://www.parlament.gv.at/gegenstand/XXVIII/A/409',
    })
  })

  it('keeps parentheses that are part of the title', () => {
    const row = [...ANTRAG_ROW]
    row[6] = 'Notarversorgungsgesetz (2.Novelle zum NVG 2020) (GRÜNE)'
    expect(mapAntragRow(row).title).toBe('Notarversorgungsgesetz (2.Novelle zum NVG 2020)')
    row[6] = 'Durchführung der Verordnung (EU)'
    expect(mapAntragRow(row).title).toBe('Durchführung der Verordnung (EU)')
  })

  it('falls back to the Antrag path, not the Vorlage path', () => {
    const row = [...ANTRAG_ROW]
    row[14] = ''
    expect(mapAntragRow(row).parliamentUrl).toBe('https://www.parlament.gv.at/gegenstand/XXVIII/A/409')
  })
})
