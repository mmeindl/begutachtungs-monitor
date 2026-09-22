import { describe, expect, it } from 'vitest'
import { pickByName } from '../server/utils/ris/konsLaw'

/**
 * Which law of a Bundesgesetzblatt a caller meant.
 *
 * One BGBl regularly creates several laws — 532/1993 the Bankwesengesetz and
 * the Bausparkassengesetz, 663/1994 the Umsatzsteuergesetz and its
 * Binnenmarkt-Anhang — and the Stammnorm pair cannot separate them. The
 * Artikel heading can, and `paraTitleService` and `amendedLawsService` passed
 * the empty string instead until 19.09.2026, so every § of an ambiguous BGBl
 * went out without a name and without a RIS link.
 */
const laws = (...titles: string[]) => new Map(titles.map((t, i) => [`nr${i}`, { kurztitel: t }]))

describe('pickByName', () => {
  it('picks the law the Artikel heading names', () => {
    const m = laws('Bankwesengesetz', 'Bausparkassengesetz')
    expect(pickByName(m, 'Änderung des Bankwesengesetzes')?.[1].kurztitel).toBe('Bankwesengesetz')
    expect(pickByName(m, 'Änderung des Bausparkassengesetzes')?.[1].kurztitel).toBe('Bausparkassengesetz')
  })

  it('reads the genitive the draft writes', () => {
    // "Änderung des Glücksspielgesetzes" must find "Glücksspielgesetz";
    // "Änderung" and "des" are stopwords, the stem carries the match.
    expect(pickByName(laws('Glücksspielgesetz', 'Tabakgesetz'), 'Änderung des Glücksspielgesetzes')?.[1].kurztitel).toBe('Glücksspielgesetz')
  })

  it('refuses a tie rather than taking whichever came first', () => {
    expect(pickByName(laws('Umsatzsteuergesetz 1994', 'Umsatzsteuergesetz 1994'), 'Änderung des Umsatzsteuergesetzes 1994')).toBeNull()
  })

  it('refuses when nothing fits clearly enough', () => {
    expect(pickByName(laws('Bankwesengesetz', 'Bausparkassengesetz'), 'Änderung des Tabakgesetzes')).toBeNull()
  })

  it('refuses an Artikel that carries only a number', () => {
    // `articleBlocks` keys such an Artikel by its number; scoring it would be
    // scoring an empty token set, and the answer must stay a refusal.
    expect(pickByName(laws('Bankwesengesetz', 'Bausparkassengesetz'), 'Artikel 3')).toBeNull()
    expect(pickByName(laws('Bankwesengesetz', 'Bausparkassengesetz'), '')).toBeNull()
  })

  it('separates a law from its own annex, which is a near-namesake', () => {
    const m = laws('Umsatzsteuergesetz 1994', 'Umsatzsteuergesetz 1994 - Anhang (Binnenmarkt)')
    expect(pickByName(m, 'Änderung des Umsatzsteuergesetzes 1994')?.[1].kurztitel).toBe('Umsatzsteuergesetz 1994')
  })
})
