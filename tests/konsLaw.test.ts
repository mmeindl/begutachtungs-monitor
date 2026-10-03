import { describe, expect, it } from 'vitest'
import { bridgeVersionGap, pickByName, soleUnlessContradicted, type KonsVersion } from '../server/utils/ris/konsLaw'

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

describe('soleUnlessContradicted — a sole law needs no rival, only no contradiction (03.10.2026)', () => {
  const law = (kurztitel: string, abkuerzung = ''): [string, { kurztitel: string; abkuerzung: string }] => ['1', { kurztitel, abkuerzung }]
  it('refuses the wrong law a mistyped Stammnorm finds (58/ME XXVIII: 10/2013 is the BVwGG)', () => {
    expect(soleUnlessContradicted(law('Bundesverwaltungsgerichtsgesetz', 'BVwGG'), 'Änderung des Bundesvergabegesetzes Verteidigung und Sicherheit 2012')).toBeNull()
  })
  it('keeps a noisy but compatible title, and one that only the Abkürzung carries', () => {
    expect(soleUnlessContradicted(law('Versorgungssicherungsgesetz'), 'Änderung des Versorgungssicherungsgesetzes')).not.toBeNull()
    expect(soleUnlessContradicted(law('Einrichtung und Betrieb einer Abbaumanagementgesellschaft des Bundes', 'ABBAG-Gesetz'), 'Änderung des ABBAG-Gesetzes')).not.toBeNull()
  })
  it('keeps the right law whose name the draft paraphrases (22/ME XXVIII)', () => {
    expect(soleUnlessContradicted(law('Zivildienstgesetz 1986', 'ZDG'), 'Änderung des Bundesgesetzes über den Zivildienst')).not.toBeNull()
  })
  it('takes it without a name to hold against', () => {
    expect(soleUnlessContradicted(law('Bundesverwaltungsgerichtsgesetz'), null)).not.toBeNull()
  })
})

describe('bridgeVersionGap — a hole in RIS with one signature (03.10.2026)', () => {
  const v = (nor: string, from: string, to: string | null, novelle: string | null, kundmachung = 'BGBl. I Nr. 19/2016'): KonsVersion => ({
    ref: { nor, label: '§ 1', id: '1', inkrafttreten: from, ausserkrafttreten: to, kundmachungsorgan: null, stammnorm: null, gesetzesnummer: '20009507', xmlUrl: null },
    novelle,
    kundmachung,
  })
  // Kulturgüterrückgabegesetz § 1, as RIS holds it: the old version ends a
  // year early, the new one starts by an amendment of 2026.
  const old = v('OLD', '2016-04-14', '2025-03-24', null)
  const next = v('NEW', '2026-03-25', null, '10/2026', 'BGBl. I Nr. 19/2016 zuletzt geändert durch BGBl. I Nr. 10/2026')

  it('takes the earlier version for a Stichtag in the hole (34/ME XXVIII, 2025-07-22)', () => {
    expect(bridgeVersionGap([old, next], '2025-07-22')?.nor).toBe('OLD')
  })
  it('bridges nothing when an amendment of the same year could have ended it', () => {
    expect(bridgeVersionGap([old, v('NEW', '2026-03-25', null, '10/2025')], '2025-07-22')).toBeNull()
  })
  it('never bridges a repeal', () => {
    expect(bridgeVersionGap([old, v('REP', '2026-03-25', null, '10/2026', 'BGBl. I Nr. 19/2016 aufgehoben durch BGBl. I Nr. 10/2026')], '2025-07-22')).toBeNull()
    expect(bridgeVersionGap([v('REP', '2016-04-14', '2025-03-24', '5/2016', 'BGBl. … aufgehoben durch BGBl. I Nr. 5/2016'), next], '2025-07-22')).toBeNull()
  })
  it('needs both sides, and no version covering the date', () => {
    expect(bridgeVersionGap([old], '2025-07-22')).toBeNull()
    expect(bridgeVersionGap([next], '2025-07-22')).toBeNull()
    expect(bridgeVersionGap([old, v('MID', '2025-03-25', null, null), next], '2025-07-22')).toBeNull()
  })
})
