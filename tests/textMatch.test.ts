/**
 * Ein Feld, eine Regel für Leerzeichen (§12.31).
 *
 * Der Fall, der das ausgelöst hat: „klima gesetz" fand in der Liste nichts,
 * während der Volltextblock darunter zwei Entwürfe zeigte — dieselbe
 * Eingabe, zwei Regeln, ein Feld.
 */
import { describe, expect, it } from 'vitest'
import { foldForSearch, matchesQuery, queryTokens } from '../shared/utils/textMatch'

/* Real names from the corpus wherever one makes the point — the folding
 * rules exist because of how ministries and offices actually spell
 * themselves, not because of invented edge cases. */

describe('foldForSearch', () => {
  it('folds case, umlauts and their transliterations onto one spelling', () => {
    const target = foldForSearch('Österreichischer Rechtsanwaltskammertag')
    expect(foldForSearch('österreichischer rechtsanwaltskammertag')).toBe(target)
    expect(foldForSearch('OESTERREICHISCHER Rechtsanwaltskammertag')).toBe(target)
    expect(foldForSearch('Osterreichischer Rechtsanwaltskammertag')).toBe(target)
  })

  it('folds a decomposed umlaut like the precomposed one', () => {
    /* "Grüße" typed on a Mac can arrive as u + U+0308; it must not become a
     * different organisation than the one in the list. */
    expect(foldForSearch('Grüße')).toBe(foldForSearch('Grüße'))
  })

  it('strips diacritics beyond German', () => {
    expect(foldForSearch('Université')).toBe('universite')
    expect(foldForSearch('Škoda')).toBe('skoda')
  })

  it('reduces every punctuation run to one space', () => {
    expect(foldForSearch('Amt der Wiener Landesregierung; Magistratsdirektion - Recht')).toBe(
      'amt der wiener landesregierung magistratsdirektion recht',
    )
    expect(foldForSearch('21/SN-8/ME')).toBe('21 sn 8 me')
  })

  it('is stable under repetition — a folded string folds to itself', () => {
    const once = foldForSearch('Amt der Kärntner Landesregierung; Abteilung 1 – Verfassungsdienst')
    expect(foldForSearch(once)).toBe(once)
  })
})

describe('matchesQuery mit Faltung', () => {
  const org = 'Amt der Wiener Landesregierung; Magistratsdirektion - Recht'

  it('matches tokens in any order, across the punctuation', () => {
    expect(matchesQuery(org, 'wiener recht', { fold: true })).toBe(true)
    expect(matchesQuery(org, 'recht wiener', { fold: true })).toBe(true)
    /* The single substring a plain Cmd+F would need, and never finds. */
    expect(matchesQuery(org, 'landesregierung magistratsdirektion', { fold: true })).toBe(true)
  })

  it('requires every token', () => {
    expect(matchesQuery(org, 'wiener finanzen', { fold: true })).toBe(false)
  })

  it('matches a pasted citation', () => {
    expect(matchesQuery('epicenter.works 14/SN-8/ME', '14/SN-8/ME', { fold: true })).toBe(true)
  })

  it('treats an empty or punctuation-only query as no filter', () => {
    expect(matchesQuery(org, '', { fold: true })).toBe(true)
    expect(matchesQuery(org, '   ', { fold: true })).toBe(true)
    expect(matchesQuery(org, '-', { fold: true })).toBe(true)
  })

  it('finds an umlaut name typed without one', () => {
    expect(matchesQuery('Österreichischer Gewerkschaftsbund', 'oesterreichischer', { fold: true })).toBe(true)
    expect(matchesQuery('Österreichischer Gewerkschaftsbund', 'osterreichisch', { fold: true })).toBe(true)
  })
})

describe('queryTokens', () => {
  it('trennt an Leerraum und schreibt klein', () => {
    expect(queryTokens('  Klima   Gesetz ')).toEqual(['klima', 'gesetz'])
  })

  it('macht aus einer leeren Eingabe keine Wörter', () => {
    expect(queryTokens('   ')).toEqual([])
  })
})

describe('matchesQuery ohne Faltung', () => {
  const haystack = 'Klimagesetz – KliG 137/ME BMLUK'

  it('verknüpft mehrere Wörter mit UND, in beliebiger Reihenfolge', () => {
    expect(matchesQuery(haystack, 'klima gesetz', { fold: false })).toBe(true)
    expect(matchesQuery(haystack, 'gesetz klima', { fold: false })).toBe(true)
    expect(matchesQuery(haystack, 'klima verordnung', { fold: false })).toBe(false)
  })

  it('sucht innerhalb eines Wortes weiter als Teilstring', () => {
    // Die Liste durchsucht Titel, nicht Dokumente — dort ist der Teilstring
    // die brauchbarere Regel als die Wortgrenze des RIS.
    expect(matchesQuery(haystack, 'klimages', { fold: false })).toBe(true)
  })

  it('filtert nicht, wenn nichts eingegeben wurde', () => {
    expect(matchesQuery(haystack, '   ', { fold: false })).toBe(true)
  })
})
