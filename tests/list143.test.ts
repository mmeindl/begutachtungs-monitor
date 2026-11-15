/**
 * List 143 — Parliament's list of participations (`server/utils/parliament/list143.ts`):
 * the header check and the row mapper, against the layout observed on
 * 14.11.2026.
 */
import { describe, expect, it } from 'vitest'
import { checkList143Header, mapParticipationRow } from '../server/utils/parliament/list143'

/** The header as list 143 answered for `{ GP_CODE: ['XXVIII'], ITYP: ['PET'] }` (14.11.2026). */
const HEADER = [
  ['GP_CODE', 'GP_CODE'], ['ITYP', 'ITYP'], ['INR', 'INR'], ['ZUKZ', 'ZUKZ'], ['Datum', null], ['Gegenstand', null],
  ['Betreff', null], ['datumsort', null], ['Nr.', null], ['Wentry_ID', null], ['Status', null], ['DOKTYP', 'DOKTYP'],
  ['BETEILIGUNG', null], ['a', null], ['b', null], ['Beteiligen', null], ['Themen', 'THEMEN'], ['beguttyp', 'BEGUTTYP'],
  ['Beteiligen', 'INTERAKTIONSTYP'], ['Stellungnahmen', null], ['Unterstützungen', null], ['Trend', null],
  ['Stellungnahme von', 'TYP'], ['Aktiv?', 'AKTIV'], ['snflag', 'SNFLAG'], ['zustflag', 'ZUSTFLAG'], ['Ressort', 'MIN'],
].map(([label, feld]) => ({ label, feld_name: feld }))

/** One row of that answer, the link cells shortened. */
const ROW: unknown[] = [
  'XXVIII', 'PET', '00025', null, '29.06.2026', 'Petition', 'Erhaltung des Bezirksgerichtes Hermagor (25/PET)', '20260629',
  '25/PET', 34758500, 'xxx', 'PET', 'xxx', 'xxx', '/gegenstand/XXVIII/PET/25', '<a …>Stellung nehmen</a>',
  '["Inneres und Recht"]', 'PET', '["Z","S"]', 0, 5, 3, 'P', 'J', 'J', 'J', null,
]

describe('checkList143Header', () => {
  it('passes the header as observed', () => {
    expect(checkList143Header(HEADER)).toBeNull()
  })

  // A column inserted upstream shifts everything after it; the counts would
  // read the trend column. The sentence names what moved.
  it('names the column that moved', () => {
    const shifted = [...HEADER.slice(0, 19), { label: 'Neu', feld_name: null }, ...HEADER.slice(19)]
    expect(checkList143Header(shifted)).toBe('Liste 143: Spalte 19 ist „Neu“, erwartet „Stellungnahmen“')
    const renamed = HEADER.map((h, i) => (i === 23 ? { label: 'Aktiv?', feld_name: 'OFFEN' } : h))
    expect(checkList143Header(renamed)).toBe('Liste 143: Spalte 23 ist „Aktiv? (OFFEN)“, erwartet feld_name „AKTIV“')
  })

  it('refuses an answer without a header, or a short one', () => {
    expect(checkList143Header(undefined)).toBe('Liste 143: Antwort ohne Spaltenkopf')
    expect(checkList143Header(HEADER.slice(0, 20))).toBe('Liste 143: Spalte 20 fehlt im Spaltenkopf')
  })
})

describe('mapParticipationRow', () => {
  // INR is zero-padded in this list („00025"), unlike list 101's „25".
  it('reads number, counts and the flag', () => {
    expect(mapParticipationRow(ROW)).toEqual({ gp: 'XXVIII', ityp: 'PET', inr: 25, doktyp: 'PET', statements: 0, support: 5, active: true })
  })

  // A cell that is no count is not read as 0.
  it('reads an empty count as unread and anything but „J“ as not active', () => {
    const row = [...ROW]
    row[19] = null
    row[20] = ''
    row[23] = 'N'
    expect(mapParticipationRow(row)).toMatchObject({ statements: null, support: null, active: false })
  })
})
