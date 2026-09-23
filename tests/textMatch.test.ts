/**
 * One field, one rule for spaces (§12.31).
 *
 * The case that triggered it: „klima gesetz" found nothing in the list while
 * the full-text block below it showed two drafts — the same input, two rules,
 * one field.
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

describe('matchesQuery — die Stellungnahmenliste', () => {
  const org = 'Amt der Wiener Landesregierung; Magistratsdirektion - Recht'

  it('matches tokens in any order, across the punctuation', () => {
    expect(matchesQuery(org, 'wiener recht')).toBe(true)
    expect(matchesQuery(org, 'recht wiener')).toBe(true)
    /* The single substring a plain Cmd+F would need, and never finds. */
    expect(matchesQuery(org, 'landesregierung magistratsdirektion')).toBe(true)
  })

  it('requires every token', () => {
    expect(matchesQuery(org, 'wiener finanzen')).toBe(false)
  })

  it('matches a pasted citation', () => {
    expect(matchesQuery('epicenter.works 14/SN-8/ME', '14/SN-8/ME')).toBe(true)
  })

  it('treats an empty or punctuation-only query as no filter', () => {
    expect(matchesQuery(org, '')).toBe(true)
    expect(matchesQuery(org, '   ')).toBe(true)
    expect(matchesQuery(org, '-')).toBe(true)
  })

  it('finds an umlaut name typed without one', () => {
    expect(matchesQuery('Österreichischer Gewerkschaftsbund', 'oesterreichischer')).toBe(true)
    expect(matchesQuery('Österreichischer Gewerkschaftsbund', 'osterreichisch')).toBe(true)
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

describe('matchesQuery — die Entwurfsliste', () => {
  const haystack = 'Klimagesetz – KliG 137/ME BMLUK'

  it('verknüpft mehrere Wörter mit UND, in beliebiger Reihenfolge', () => {
    expect(matchesQuery(haystack, 'klima gesetz')).toBe(true)
    expect(matchesQuery(haystack, 'gesetz klima')).toBe(true)
    expect(matchesQuery(haystack, 'klima verordnung')).toBe(false)
  })

  it('sucht innerhalb eines Wortes weiter als Teilstring', () => {
    // The list searches titles, not documents — there the substring is the
    // more usable rule than RIS's word boundary.
    expect(matchesQuery(haystack, 'klimages')).toBe(true)
  })

  it('filtert nicht, wenn nichts eingegeben wurde', () => {
    expect(matchesQuery(haystack, '   ')).toBe(true)
  })
})

describe('matchesQuery — beide Lesarten, und eine genügt', () => {
  /* Measured on 22.09.2026 over the 472 haystacks of GP XXVIII: folding
     alone takes a hit away from 375 of 504.210 queries, the disjunction from
     none at all. One case from each of the two readings stands here. */
  const draft = 'Bundesgesetz über die Ökostromförderung, Änderung 133/ME BMLUK'

  it('findet den Umlaut auch ohne ihn — auch in der Entwurfsliste', () => {
    expect(matchesQuery(draft, 'oekostrom')).toBe(true)
    expect(matchesQuery(draft, 'okostrom')).toBe(true)
    expect(matchesQuery(draft, 'Ökostrom')).toBe(true)
  })

  it('verliert kein Wortinneres an die Faltung', () => {
    /* „ergesetz" no longer stands in the folded „paketsteurgesetz", because
       the folding swallows the „e" of „ue"; unfolded it is there. */
    expect(matchesQuery('Paketsteuergesetz; Finanzausgleichsgesetz, Änderung 104/ME BMF', 'ergesetz')).toBe(true)
    expect(matchesQuery('Audiovisuelle Mediendienste-Gesetz, Änderung 132/ME', 'ell')).toBe(true)
  })

  it('findet die Zitierung, mit und ohne Schrägstrich', () => {
    expect(matchesQuery(draft, '133/ME')).toBe(true)
    expect(matchesQuery(draft, '133 me')).toBe(true)
    expect(matchesQuery(draft, '132/ME')).toBe(false)
  })
})
