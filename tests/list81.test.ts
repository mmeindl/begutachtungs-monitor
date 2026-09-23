import { describe, expect, it } from 'vitest'
import { deriveShortTitle, mapDraftRow } from '../server/utils/parliament/list81'

// Real list-81 row (sample from 2026-08-15, 133/ME XXVIII)
const LIST81_ROW = [
  'XXVIII', 'ME', 133, '03.08.2026', 'IFI Beitragsgesetz 2026', '133/ME', 'BMF',
  '/gegenstand/XXVIII/ME/133', '24.08.2026', 'MEG', '2026-08-03T00:00:00', 'J',
  0, 1, '20260824', '0000000133', 'Bundesministerium für Finanzen', 36188157,
]

describe('mapDraftRow', () => {
  it('maps a real list-81 row completely', () => {
    expect(mapDraftRow(LIST81_ROW)).toEqual({
      gp: 'XXVIII',
      inr: 133,
      citation: '133/ME',
      title: 'IFI Beitragsgesetz 2026',
      ministryCode: 'BMF',
      ministryName: 'Bundesministerium für Finanzen',
      // One row names one Ressort; the joint case is folded a layer up
      // (`dedupeDraftList`), so the mapper always answers with an empty list.
      coMinistries: [],
      arrivedAt: '2026-08-03',
      deadline: '2026-08-24',
      active: true,
      statementCount: 1,
      parliamentUrl: 'https://www.parlament.gv.at/gegenstand/XXVIII/ME/133',
    })
  })

  it('AKTIV "N" → active false, empty Fristsort → deadline null', () => {
    const row = [...LIST81_ROW]
    row[11] = 'N'
    row[14] = ''
    const mapped = mapDraftRow(row)
    expect(mapped.active).toBe(false)
    expect(mapped.deadline).toBeNull()
  })
})

describe('deriveShortTitle', () => {
  it('extracts a trailing parenthetical law name', () => {
    expect(
      deriveShortTitle('Bundesgesetz, mit dem … geändert werden (Budgetbegleitgesetz 2026)'),
    ).toBe('Budgetbegleitgesetz 2026')
  })

  it('extracts a trailing comma acronym ending in G', () => {
    expect(
      deriveShortTitle(
        'Bundesgesetz über die Bundesstaatsanwaltschaft; Bundesgesetz zur Einführung einer Bundesstaatsanwaltschaft, BuStAG',
      ),
    ).toBe('BuStAG')
  })

  it('rejects non-name trailers and titles without a handle', () => {
    expect(deriveShortTitle('Umsatzsteuergesetz, Änderung')).toBeNull()
    expect(deriveShortTitle('ReFuelEU Aviation-Gesetz')).toBeNull()
    expect(deriveShortTitle('Bundesgesetz über Dinge (siehe Anlage)')).toBeNull()
  })
})
