import { describe, expect, it } from 'vitest'
import { formatNumberDe, moreLabelDe, shownLabelDe } from '../shared/utils/format'
import { foldForSearch, matchesSearch } from '../shared/utils/search'

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

describe('matchesSearch', () => {
  const org = 'Amt der Wiener Landesregierung; Magistratsdirektion - Recht'

  it('matches tokens in any order, across the punctuation', () => {
    expect(matchesSearch(org, 'wiener recht')).toBe(true)
    expect(matchesSearch(org, 'recht wiener')).toBe(true)
    /* The single substring a plain Cmd+F would need, and never finds. */
    expect(matchesSearch(org, 'landesregierung magistratsdirektion')).toBe(true)
  })

  it('requires every token', () => {
    expect(matchesSearch(org, 'wiener finanzen')).toBe(false)
  })

  it('matches a pasted citation', () => {
    expect(matchesSearch('epicenter.works 14/SN-8/ME', '14/SN-8/ME')).toBe(true)
  })

  it('treats an empty or punctuation-only query as no filter', () => {
    expect(matchesSearch(org, '')).toBe(true)
    expect(matchesSearch(org, '   ')).toBe(true)
    expect(matchesSearch(org, '-')).toBe(true)
  })

  it('finds an umlaut name typed without one', () => {
    expect(matchesSearch('Österreichischer Gewerkschaftsbund', 'oesterreichischer')).toBe(true)
    expect(matchesSearch('Österreichischer Gewerkschaftsbund', 'osterreichisch')).toBe(true)
  })
})

describe('shownLabelDe', () => {
  it('states position only — the remainder is not spelled out', () => {
    /* "10 von 35" already says 25 are left, and the button below says what
     * the next press adds. A third number would be the same fact again. */
    expect(shownLabelDe(10, 35)).toBe('10 von 35 angezeigt')
  })

  it('reads the same at the end of the list', () => {
    expect(shownLabelDe(35, 35)).toBe('35 von 35 angezeigt')
  })

  it('never claims more rows than the list holds', () => {
    /* The panel steps `visibleCount` past the total on the last press. */
    expect(shownLabelDe(40, 35)).toBe('35 von 35 angezeigt')
  })

  it('groups thousands through the shared number formatting', () => {
    /* Composed, not spelled out: de-AT groups with a narrow no-break space
     * in Node's ICU, and this line must not be the one place that pins it. */
    expect(shownLabelDe(10, 1234)).toBe(`10 von ${formatNumberDe(1234)} angezeigt`)
  })
})

describe('moreLabelDe', () => {
  it('names the step', () => {
    expect(moreLabelDe(25, 10)).toBe('Weitere 10 anzeigen')
  })

  it('names the remainder on the last page', () => {
    expect(moreLabelDe(3, 10)).toBe('Weitere 3 anzeigen')
  })

  it('stays German at one', () => {
    expect(moreLabelDe(1, 10)).toBe('Eine weitere anzeigen')
  })
})
