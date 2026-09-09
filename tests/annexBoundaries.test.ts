import { describe, expect, it } from 'vitest'
import { candidateOf, resolveBoundaries } from '../server/utils/annexBoundaries'
import { lawNameScore, type DraftArticle } from '../server/utils/lawTitles'

function draft(...articles: { n?: string; title?: string | null; amends?: boolean }[]): DraftArticle[] {
  return articles.map((a, index) => ({
    index,
    number: a.n ? `Artikel ${a.n}` : null,
    numeral: a.n ?? null,
    title: a.title ?? null,
    key: a.title ?? (a.n ? `Artikel ${a.n}` : null),
    amends: a.amends ?? true,
    bgbl: null,
  }))
}

const cands = (...lines: string[]) => lines.map((l) => candidateOf(l)).filter((c) => c !== null)

describe('candidateOf', () => {
  it('reads the number and the title from one line', () => {
    expect(candidateOf('Artikel 3 Änderung des Aktiengesetzes')).toEqual({ text: 'Artikel 3 Änderung des Aktiengesetzes', numeral: '3', title: 'Änderung des Aktiengesetzes' })
  })

  it('takes a bare Artikel line without a title', () => {
    expect(candidateOf('Artikel VI')).toEqual({ text: 'Artikel VI', numeral: 'VI', title: null })
  })

  // The three shapes that are not boundaries, all observed in annexes.
  it('refuses a citation, an Artikel-numbered provision and running text', () => {
    expect(candidateOf('Art. 31 EUStA-VO')).toBeNull()
    expect(candidateOf('Artikel 10. (1) Bundessache ist die Gesetzgebung.')).toBeNull()
    expect(candidateOf('Artikel 29b der Bilanz-Richtlinie')).toBeNull()
  })

  it('takes a law title on its own as a candidate without a number', () => {
    expect(candidateOf('Änderung des Aktiengesetzes')).toMatchObject({ numeral: null, title: 'Änderung des Aktiengesetzes' })
  })
})

describe('lawNameScore', () => {
  // The draft writes the genitive, the annex sometimes the nominative.
  it('matches a genitive against a nominative', () => {
    expect(lawNameScore('Änderung des Staatsanwaltschaftsgesetzes', 'Staatsanwaltschaftsgesetz')).toBe(1)
  })

  it('keeps the year, which is often the only difference between two laws', () => {
    expect(lawNameScore('Änderung der Strafprozeßordnung 1975', 'Änderung der Strafprozessordnung 1975')).toBe(1)
    expect(lawNameScore('Änderung des Jugendgerichtsgesetzes 1988', 'Änderung des Jugendgerichtsgesetzes 2011')).toBeLessThan(0.6)
  })

  it('is not fooled by the template words every title shares', () => {
    expect(lawNameScore('Änderung des Aktiengesetzes', 'Änderung des Bankwesengesetzes')).toBe(0)
  })
})

describe('resolveBoundaries', () => {
  const pkg = draft(
    { n: '1', title: 'Änderung des Aktiengesetzes' },
    { n: '2', title: 'Änderung des GmbH-Gesetzes' },
    { n: '3', title: 'Änderung des Bankwesengesetzes' },
  )

  it('joins each heading to the draft Artikel of the same number', () => {
    const c = cands('Artikel 1', 'Artikel 2', 'Artikel 3')
    const { accepted, refusal } = resolveBoundaries(c, pkg)
    expect(refusal).toBeNull()
    expect([...accepted.values()].map((a) => a.numeral)).toEqual(['1', '2', '3'])
  })

  // The load-bearing rule. "Artikel VI" inside one law is typeset exactly like
  // a law boundary; only the draft's own Artikel list says it is not one.
  it('refuses a heading the draft does not have', () => {
    const { accepted } = resolveBoundaries(cands('Artikel 1', 'Artikel VI', 'Artikel 2'), pkg)
    expect([...accepted.values()].map((a) => a.numeral)).toEqual(['1', '2'])
  })

  // A law that divides itself into Artikel I, II, III is the reason Roman
  // numerals cannot be believed on their own.
  it('accepts Roman numerals only from a Roman-numbered draft', () => {
    const roman = draft({ n: 'I', title: 'Änderung des Aktiengesetzes' }, { n: 'II', title: 'Änderung des GmbH-Gesetzes' })
    expect(resolveBoundaries(cands('Artikel I', 'Artikel II'), roman).accepted.size).toBe(2)
    expect(resolveBoundaries(cands('Artikel I', 'Artikel II'), pkg).accepted.size).toBe(0)
  })

  // One annex prints the draft's Artikel 3 and 4 the other way round. No rule
  // inside the annex can see that; the title can.
  it('follows the title when the number points at the wrong law', () => {
    const swapped = cands('Artikel 2 Änderung des Bankwesengesetzes', 'Artikel 3 Änderung des GmbH-Gesetzes')
    const { accepted } = resolveBoundaries(swapped, pkg)
    expect([...accepted.values()].map((a) => a.title)).toEqual(['Änderung des Bankwesengesetzes', 'Änderung des GmbH-Gesetzes'])
  })

  // A differently worded title is not a contradiction: one draft calls its law
  // "Bundesgesetz über den Zivildienst" where the annex writes
  // "Zivildienstgesetz". The number decides, because nothing else fits.
  it('keeps the number when the title matches no other law either', () => {
    const other = draft({ n: '1', title: 'Bundesgesetz über den Zivildienst' }, { n: '2', title: 'Änderung des Wehrgesetzes 2001' })
    const { accepted } = resolveBoundaries(cands('Artikel 1 Zivildienstgesetz'), other)
    expect(accepted.get(0)?.numeral).toBe('1')
  })

  // "Artikel VI" between the real Artikel 3 and 4 of a Roman-numbered draft
  // joins by number and would otherwise open a law twice over.
  it('rejects a heading that jumps backwards on the number alone', () => {
    const roman = draft({ n: 'I' }, { n: 'II' }, { n: 'III' })
    const { accepted } = resolveBoundaries(cands('Artikel I', 'Artikel III', 'Artikel II'), roman)
    expect([...accepted.values()].map((a) => a.numeral)).toEqual(['I', 'III'])
  })

  it('does not open the same law twice', () => {
    expect(resolveBoundaries(cands('Artikel 1', 'Artikel 1'), pkg).accepted.size).toBe(1)
    // Annexes repeat a law's title over its later pages; that is not a second law.
    expect(resolveBoundaries(cands('Änderung des GmbH-Gesetzes', 'Änderung des GmbH-Gesetzes'), pkg).accepted.size).toBe(1)
  })

  // Some annexes print only the law titles, without the Artikel numbers.
  it('joins a title-only heading when it names exactly one amending Artikel', () => {
    const { accepted } = resolveBoundaries(cands('Änderung des GmbH-Gesetzes', 'Änderung des Bankwesengesetzes'), pkg)
    expect([...accepted.values()].map((a) => a.numeral)).toEqual(['2', '3'])
  })

  it('ignores a title-only heading that names no law of the draft', () => {
    expect(resolveBoundaries(cands('Änderung der Schwellen- oder Loswerte'), pkg).accepted.size).toBe(0)
  })

  // The ordinary case: two drafts in three amend a single law and the annex
  // has no boundaries to print.
  it('gives the whole annex to the one law the draft amends', () => {
    const { whole, refusal } = resolveBoundaries([], draft({ title: 'Änderung des Sicherheitspolizeigesetzes' }))
    expect(whole?.title).toBe('Änderung des Sicherheitspolizeigesetzes')
    expect(refusal).toBeNull()
  })

  // The refusal that matters. § 5 of the second law is a different provision
  // from § 5 of the first — in the multi-law annexes 15,1 % of designations
  // recur in another law of the same package — so an unmarked package is
  // shown undivided rather than divided wrongly.
  it('refuses to attribute anything when a package marks no boundaries', () => {
    const { accepted, whole, refusal } = resolveBoundaries([], pkg)
    expect(accepted.size).toBe(0)
    expect(whole).toBeNull()
    expect(refusal).toContain('3 Gesetze')
  })

  // The check is symmetric, and here it indicts the draft parser rather than
  // the annex: one draft's parse holds only two of its Artikel.
  it('refuses when the annex is divided into Artikel the draft does not know', () => {
    const { refusal } = resolveBoundaries(cands('Artikel 1', 'Artikel 2'), draft({ title: 'Änderung des Eisenbahngesetzes 1957' }))
    expect(refusal).toContain('Der Entwurf nennt keine Artikel')
  })

  it('leaves a Stammgesetz without a law rather than inventing one', () => {
    const stamm = draft({ n: '1', title: 'Bundesgesetz über die Bundesstaatsanwaltschaft', amends: false }, { n: '2', title: 'Änderung des Aktiengesetzes', amends: false })
    expect(resolveBoundaries([], stamm).whole).toBeNull()
  })
})
