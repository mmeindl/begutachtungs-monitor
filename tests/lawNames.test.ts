import { describe, expect, it } from 'vitest'
import { articleNameTokens, jaccardSimilarity, lawNameScore } from '../server/utils/lawtext/lawNames'

describe('jaccardSimilarity', () => {
  it('is 1 for the same tokens and 0 for none in common', () => {
    expect(jaccardSimilarity(new Set(['a', 'b']), new Set(['b', 'a']))).toBe(1)
    expect(jaccardSimilarity(new Set(['a']), new Set(['b']))).toBe(0)
  })

  it('counts shared over all distinct tokens', () => {
    expect(jaccardSimilarity(new Set(['a', 'b']), new Set(['b', 'c']))).toBeCloseTo(1 / 3, 10)
  })

  it('answers 0 where one side has nothing to compare', () => {
    expect(jaccardSimilarity(new Set(), new Set(['a']))).toBe(0)
    expect(jaccardSimilarity(new Set(['a']), new Set())).toBe(0)
  })
})

describe('articleNameTokens', () => {
  it('names the same law from draft and bill titles', () => {
    expect(articleNameTokens('Änderung des Umsatzsteuergesetzes 1994')).toEqual(new Set(['umsatzsteuergesetz', '1994']))
    expect(articleNameTokens('Bundesgesetz, mit dem das Umsatzsteuergesetz 1994 geändert wird')).toEqual(new Set(['umsatzsteuergesetz', '1994']))
  })
})

describe('lawNameScore — die Vorlage zählt nicht als Inhalt', () => {
  // A draft without an Artikel line carries its title as a sentence. The
  // verbs „geändert wird" dropped the match to 0,50, and `pickByName` demands
  // 0,60 — so the LMSVG was no longer determinable against the second law of
  // the same BGBl (70/ME, 20 units without a name).
  it('matches a sentence-form draft title against the RIS Kurztitel', () => {
    const sentence = 'Bundesgesetz, mit dem das Lebensmittelsicherheits- und Verbraucherschutzgesetz geändert wird'
    expect(lawNameScore(sentence, 'Lebensmittelsicherheits- und Verbraucherschutzgesetz')).toBe(1)
    expect(lawNameScore(sentence, 'Kontroll- und Digitalisierungs-Durchführungsgesetz')).toBe(0)
  })

  it('still separates two namesakes of one Bundesgesetzblatt', () => {
    expect(lawNameScore('Änderung des Bankwesengesetzes', 'Bausparkassengesetz')).toBe(0)
    expect(lawNameScore('Änderung des Bankwesengesetzes', 'Bankwesengesetz')).toBe(1)
  })
})

describe('lawNameScore — die Gesetze eines Bundesgesetzblatts', () => {
  // One BGBl regularly creates several laws: 532/1993 the Bankwesengesetz and
  // the Bausparkassengesetz, 663/1994 the Umsatzsteuergesetz and its Anhang.
  // The amending Artikel's own title is what separates them.
  it('separates the laws one BGBl created', () => {
    expect(lawNameScore('Änderung des Bankwesengesetzes', 'Bankwesengesetz')).toBe(1)
    expect(lawNameScore('Änderung des Bankwesengesetzes', 'Bausparkassengesetz')).toBe(0)
    expect(lawNameScore('Änderung des Umsatzsteuergesetzes 1994', 'Umsatzsteuergesetz 1994')).toBeGreaterThan(
      lawNameScore('Änderung des Umsatzsteuergesetzes 1994', 'Umsatzsteuergesetz 1994 – Anhang (Binnenmarkt)'),
    )
  })
})
