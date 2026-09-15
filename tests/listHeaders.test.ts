import { describe, expect, it } from 'vitest'
import { checkListHeader } from '../server/utils/listHeaders'

/* The two headers as the API returned them on 2026-09-15, reduced to the
 * keys the check reads. A column the check does not read is kept as `{}` so
 * the positions stay real. */
const HEADER_142 = [
  { feld_name: 'GP_CODE', label: '?' },
  { feld_name: 'ITYP', label: '?' },
  { feld_name: 'INR', label: '?' },
  {},
  { feld_name: 'DATUM', label: 'Datum' },
  { feld_name: 'DATUM_SORT', label: 'Datumsort' },
  { label: 'Von' },
  { feld_name: 'GP_CODE', label: 'GP' },
  { label: 'INR' },
  { label: 'ITYP' },
  { label: 'SORT' },
  { label: 'Datumsort' },
  { label: 'Unterstützungen' },
  { label: 'Details' },
  {},
  { label: 'Nr' },
  { label: 'Zu' },
  { label: 'Beteiligen' },
  { label: 'Bezug_Link' },
  {},
  { label: 'wentry_id' },
  {},
  {},
]

const HEADER_81 = [
  { feld_name: 'GP_CODE', label: 'Gesetzgebungsperiode' },
  { feld_name: 'ITYP', label: 'ITYP' },
  { feld_name: 'INR', label: 'INR' },
  { label: 'Einlangen' },
  { label: 'Betreff' },
  { label: 'Nr.' },
  { feld_name: 'MIN', label: 'Ressort' },
  { label: 'uri' },
  { label: 'Frist' },
  { feld_name: 'DOKTYP', label: 'doktyp' },
  { label: 'Datesort' },
  { feld_name: 'AKTIV', label: 'Begutachtung aktiv?' },
  { label: 'Engagement' },
  { label: 'Stellungnahmen' },
  { label: 'Fristsort' },
  { label: 'sortinr' },
  { label: 'Ministerium' },
  { label: 'wentry_id' },
]

describe('checkListHeader', () => {
  it('accepts the observed headers of lists 81 and 142', () => {
    expect(checkListHeader(81, HEADER_81)).toBeNull()
    expect(checkListHeader(142, HEADER_142)).toBeNull()
  })

  it('ignores columns appended at the end', () => {
    expect(checkListHeader(142, [...HEADER_142, { label: 'Neu' }])).toBeNull()
  })

  it('names the column that moved when one is inserted', () => {
    const shifted = [...HEADER_142.slice(0, 6), { label: 'Eingebracht von' }, ...HEADER_142.slice(6)]
    expect(checkListHeader(142, shifted)).toBe(
      'Liste 142: Spalte 6 ist „Eingebracht von“, erwartet „Von“',
    )
  })

  it('names a renamed dimension by both of its names', () => {
    const renamed = HEADER_81.map((h, i) => (i === 11 ? { feld_name: 'OFFEN', label: 'Begutachtung aktiv?' } : h))
    expect(checkListHeader(81, renamed)).toBe(
      'Liste 81: Spalte 11 ist „Begutachtung aktiv? (OFFEN)“, erwartet feld_name „AKTIV“',
    )
  })

  it('treats a missing header as a mismatch, not as unknown', () => {
    expect(checkListHeader(142, undefined)).toBe('Liste 142: Antwort ohne Spaltenkopf')
    expect(checkListHeader(81, HEADER_81.slice(0, 10))).toBe('Liste 81: Spalte 10 fehlt im Spaltenkopf')
  })

  it('has no opinion on lists it does not know', () => {
    expect(checkListHeader(305, [{}, {}])).toBeNull()
  })
})
