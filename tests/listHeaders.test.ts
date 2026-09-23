import { describe, expect, it } from 'vitest'
import { checkListHeader } from '../server/utils/parliament/listHeaders'

/* The two headers as the API returned them on 2026-09-15 (list 142 column 19
 * re-read 2026-09-16, when the classifier started using it), reduced to the
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
  // The three `BEZUG_*` dimensions, re-read on 23.09.2026 off two saved
  // responses (6.828 rows). The fixture spelled them `GP_CODE` and bare
  // labels while the check read none of them; it does now, and these are the
  // names the API answers with.
  { feld_name: 'BEZUG_GP_CODE', label: 'GP' },
  { feld_name: 'BEZUG_INR', label: 'INR' },
  { feld_name: 'BEZUG_ITYP', label: 'ITYP' },
  { label: 'SORT' },
  { label: 'Datumsort' },
  { label: 'Unterstützungen' },
  { label: 'Details' },
  {},
  { label: 'Nr' },
  { label: 'Zu' },
  { label: 'Beteiligen' },
  { label: 'Bezug_Link' },
  { feld_name: 'TYP', label: '?' },
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

/* List 101, as the API returned it on 2026-09-15 for
 * `{GP_CODE, ITYP:["I"], VHG:["RV"]}`. Note index 0: `feld_name` is `GP`
 * here and `GP_CODE` is the *label* — the reverse of lists 81/142, and the
 * reason this fixture exists rather than a copied expectation. */
const HEADER_101 = [
  { feld_name: 'GP', label: 'GP_CODE' },
  { feld_name: 'ITYP', label: 'ITYP' },
  { feld_name: 'INR', label: 'INR' },
  { feld_name: 'ZUKZ', label: 'ZUKZ' },
  { feld_name: 'DATUM', label: 'Datum' },
  { feld_name: 'ART', label: 'Art' },
  { feld_name: 'PFAD', label: 'Betreff' },
  { feld_name: 'ZITATION', label: 'Nummer' },
  { feld_name: 'DATUMSORT', label: 'DATUMSORT' },
  { feld_name: 'PHASEN_BIS', label: 'PHASEN_BIS' },
  { feld_name: 'STATUS', label: 'Status' },
  { feld_name: 'DOKTYP', label: 'DOKTYP' },
  { feld_name: 'ZZZZ', label: 'Zust?' },
  { feld_name: 'DOKTYP_LANG', label: 'DOKTYP_LANG' },
  { feld_name: 'HIS_URL', label: 'HIS_URL' },
]

describe('checkListHeader', () => {
  it('accepts the observed header of list 101', () => {
    expect(checkListHeader(101, HEADER_101)).toBeNull()
  })

  it('rejects list 101 when the status column moves', () => {
    const shifted = [...HEADER_101]
    shifted.splice(9, 0, { feld_name: 'NEU', label: 'Neu' })
    expect(checkListHeader(101, shifted)).toBe(
      'Liste 101: Spalte 10 ist „PHASEN_BIS“, erwartet feld_name „STATUS“',
    )
  })

  it('does not confuse list 101 with the GP_CODE spelling of lists 81/142', () => {
    // The trap this fixture guards: asserting `feld_name: 'GP_CODE'` at
    // index 0 would fail on a perfectly healthy list-101 response.
    const wrong = [{ feld_name: 'GP_CODE', label: 'GP_CODE' }, ...HEADER_101.slice(1)]
    expect(checkListHeader(101, wrong)).toBe(
      'Liste 101: Spalte 0 ist „GP_CODE“, erwartet feld_name „GP“',
    )
  })

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

  /* Column 18 carries the parent's path, and the filter guard on list 142
   * reads it (`statementRowMatchesParent`) — so a move there would turn every
   * row into "wrong parent" and every statements list into a 502. */
  it('asserts the parent-link column of list 142', () => {
    const renamed = HEADER_142.map((h, i) => (i === 18 ? { label: 'Bezug' } : h))
    expect(checkListHeader(142, renamed)).toBe(
      'Liste 142: Spalte 18 ist „Bezug“, erwartet „Bezug_Link“',
    )
  })

  /* And so do the three filter dimensions the same guard reads beside it.
   * Their labels are the bare "GP"/"INR"/"ITYP", which columns 0-2 carry as
   * well — the `feld_name` is what tells the parent's period from the
   * Stellungnahme's own. */
  it('asserts the three BEZUG dimensions of list 142 by their feld_name', () => {
    const renamed = HEADER_142.map((h, i) => (i === 8 ? { feld_name: 'BEZUG_NR', label: 'INR' } : h))
    expect(checkListHeader(142, renamed)).toBe(
      'Liste 142: Spalte 8 ist „INR (BEZUG_NR)“, erwartet feld_name „BEZUG_INR“',
    )
    // The trap the fixture guards: column 7 is NOT the `GP_CODE` of column 0.
    const confused = HEADER_142.map((h, i) => (i === 7 ? { feld_name: 'GP_CODE', label: 'GP' } : h))
    expect(checkListHeader(142, confused)).toBe(
      'Liste 142: Spalte 7 ist „GP (GP_CODE)“, erwartet feld_name „BEZUG_GP_CODE“',
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
