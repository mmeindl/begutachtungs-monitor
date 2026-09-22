/**
 * Ein Feld, eine Regel für Leerzeichen (§12.31).
 *
 * Der Fall, der das ausgelöst hat: „klima gesetz" fand in der Liste nichts,
 * während der Volltextblock darunter zwei Entwürfe zeigte — dieselbe
 * Eingabe, zwei Regeln, ein Feld.
 */
import { describe, expect, it } from 'vitest'
import { matchesQuery, queryTokens } from '../shared/utils/searchQuery'

describe('queryTokens', () => {
  it('trennt an Leerraum und schreibt klein', () => {
    expect(queryTokens('  Klima   Gesetz ')).toEqual(['klima', 'gesetz'])
  })

  it('macht aus einer leeren Eingabe keine Wörter', () => {
    expect(queryTokens('   ')).toEqual([])
  })
})

describe('matchesQuery', () => {
  const haystack = 'Klimagesetz – KliG 137/ME BMLUK'

  it('verknüpft mehrere Wörter mit UND, in beliebiger Reihenfolge', () => {
    expect(matchesQuery(haystack, 'klima gesetz')).toBe(true)
    expect(matchesQuery(haystack, 'gesetz klima')).toBe(true)
    expect(matchesQuery(haystack, 'klima verordnung')).toBe(false)
  })

  it('sucht innerhalb eines Wortes weiter als Teilstring', () => {
    // Die Liste durchsucht Titel, nicht Dokumente — dort ist der Teilstring
    // die brauchbarere Regel als die Wortgrenze des RIS.
    expect(matchesQuery(haystack, 'klimages')).toBe(true)
  })

  it('filtert nicht, wenn nichts eingegeben wurde', () => {
    expect(matchesQuery(haystack, '   ')).toBe(true)
  })
})
