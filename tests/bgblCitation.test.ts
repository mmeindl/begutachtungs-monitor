import { describe, expect, it } from 'vitest'
import { parseBgbl, sameBgbl, sameRisStammnorm, sameStammnormCited, stammnormOf } from '../server/utils/lawtext/bgblCitation'

describe('parseBgbl', () => {
  it('splits organ and number the way RIS stores them', () => {
    expect(parseBgbl('…, BGBl. Nr. 620/1989, zuletzt geändert…')).toEqual({ organ: 'BGBl. Nr.', nummer: '620/1989' })
    expect(parseBgbl('…, BGBl. I Nr. 84/2001, …')).toEqual({ organ: 'BGBl. I Nr.', nummer: '84/2001' })
    expect(parseBgbl('…, BGBl. III Nr. 84/2001, …')).toEqual({ organ: 'BGBl. III Nr.', nummer: '84/2001' })
    expect(parseBgbl('kein Zitat hier')).toBeNull()
  })

  it('takes the first citation — the Stammnorm, not the latest amendment', () => {
    const clause = 'Das Strafgesetzbuch, BGBl. Nr. 60/1974, zuletzt geändert durch das Bundesgesetz BGBl. I Nr. 135/2023, wird wie folgt geändert:'
    expect(parseBgbl(clause)).toEqual({ organ: 'BGBl. Nr.', nummer: '60/1974' })
  })

  it('distinguishes the Teil, because the number alone collides', () => {
    // Kundmachungsorgannummer=84/2001 matches the AMD-G (BGBl. I) and an
    // Amtssitz law (BGBl. III); only the pair identifies a law.
    expect(sameBgbl({ organ: 'BGBl. I Nr.', nummer: '84/2001' }, { organ: 'BGBl. III Nr.', nummer: '84/2001' })).toBe(false)
    expect(sameBgbl({ organ: 'BGBl. I Nr.', nummer: '84/2001' }, { organ: 'BGBl. I Nr.', nummer: '84/2001' })).toBe(true)
  })
})

describe('stammnormOf', () => {
  it('reads the Stammnorm, not the most recent amendment', () => {
    expect(stammnormOf('Das Bundesgesetz X, BGBl. I Nr. 100/2000, zuletzt geändert durch BGBl. I Nr. 50/2020, wird wie folgt geändert:'))
      .toEqual({ organ: 'BGBl. I Nr.', nummer: '100/2000' })
  })

  // The UGB's Stammnorm is "dRGBl. S. 219/1897". Taking the first BGBl in the
  // whole clause returned the last amendment and resolved to another law.
  it('refuses when the law was not promulgated in a BGBl at all', () => {
    // The UGB is dRGBl. S. 219/1897. Until 19.09.2026 there was no reading
    // for that and the answer was null — right, for as long as the
    // alternative was to take the clause's *first BGBl number*, that is the
    // last amendment, and resolve to an unrelated law. The Stammnorm is read
    // now, and the danger of back then is the real assurance here: it is
    // 219/1897 and precisely not 6/2026.
    expect(stammnormOf('Das Unternehmensgesetzbuch - UGB, dRGBl. S. 219/1897, zuletzt geändert durch das Bundesgesetz BGBl. I Nr. 6/2026, wird wie folgt geändert:'))
      .toEqual({ organ: 'dRGBl. S.', nummer: '219/1897' })
  })

  it('liest die älteren Kundmachungsorgane, in denen Österreichs meistzitierte Gesetze stehen', () => {
    // ABGB, ZPO and Notariatsordnung are older than the Bundesgesetzblatt.
    // RIS carries them in the same field pair as any BGBl, so the existing
    // link carries them — it only did not know the Organe.
    expect(stammnormOf('Das allgemeine bürgerliche Gesetzbuch, JGS Nr. 946/1811, wird wie folgt geändert:'))
      .toEqual({ organ: 'JGS Nr.', nummer: '946/1811' })
    expect(stammnormOf('Die Zivilprozessordnung, RGBl. Nr. 113/1895, wird wie folgt geändert:'))
      .toEqual({ organ: 'RGBl. Nr.', nummer: '113/1895' })
  })

  // Measured over GP XXVIII on 25.09.2026: nine of 511 amending Artikel cited
  // their Stammnorm in a spelling this parser refused, and every one of them
  // was the ordinary citation typed differently (docs/architecture.md §12.11).
  it('liest die Schreibvarianten der Ressorts, ohne die Teile zu verlieren', () => {
    // "BGBI" is no organ; it is the l typed as a capital i (20/ME).
    expect(stammnormOf('Das Bundesbehindertengesetz, BGBI. Nr. 283/1990, wird wie folgt geändert:'))
      .toEqual({ organ: 'BGBl. Nr.', nummer: '283/1990' })
    expect(stammnormOf('Das Bundes-Seniorengesetz, BGBI. I Nr. 84/1998, wird wie folgt geändert:'))
      .toEqual({ organ: 'BGBl. I Nr.', nummer: '84/1998' })
    // The marker printed twice (109/ME) — and the Teil between them is the
    // load-bearing part: 30/2006 is the Hochschulgesetz in Teil I and a
    // Grenzgänger-Durchführungsverordnung in Teil III.
    expect(stammnormOf('Das Hochschulgesetz 2005, BGBl. Nr. I Nr. 30/2006, zuletzt geändert durch BGBl. I Nr. 100/2025, wird wie folgt geändert:'))
      .toEqual({ organ: 'BGBl. I Nr.', nummer: '30/2006' })
    // A period after the Teil (20/ME).
    expect(stammnormOf('Das Notarversorgungsgesetz - NVG 2020, BGBl. I. Nr. 100/2018, wird wie folgt geändert:'))
      .toEqual({ organ: 'BGBl. I Nr.', nummer: '100/2018' })
    // The marker without its period (UGB, 4/ME and 100/ME).
    expect(stammnormOf('Das Unternehmensgesetzbuch - UGB, dRGBl. S 219/1897, zuletzt geändert durch das Bundesgesetz BGBl. I Nr. 26/2026, wird wie folgt geändert:'))
      .toEqual({ organ: 'dRGBl. S.', nummer: '219/1897' })
    // No marker at all (FSVG, 96/ME) — and RIS stores "BGBl. Nr.", so the
    // comparison has to survive the missing one.
    expect(stammnormOf('Das Freiberuflichen-Sozialversicherungsgesetz - FSVG, BGBl. 624/1978, zuletzt geändert durch das Bundesgesetz BGBl. I Nr. 110/2023, wird wie folgt geändert:'))
      .toEqual({ organ: 'BGBl.', nummer: '624/1978' })
    expect(sameBgbl({ organ: 'BGBl.', nummer: '624/1978' }, { organ: 'BGBl. Nr.', nummer: '624/1978' })).toBe(true)
    expect(sameBgbl({ organ: 'BGBl.', nummer: '84/2001' }, { organ: 'BGBl. I Nr.', nummer: '84/2001' })).toBe(false)
  })

  it('rät nicht, wo das Zitat selbst kaputt ist', () => {
    // A three-digit year (61/ME, "BGBl. I Nr. 29/200"): the reading 2000 is a
    // guess, and a guessed number resolves to a law the draft never cited.
    expect(stammnormOf('Das Werbeabgabegesetz 2000, BGBl. I Nr. 29/200, wird wie folgt geändert:')).toBeNull()
    // A clause that names no organ at all (4/ME).
    expect(stammnormOf('Das Bundesgesetz über die Revision von Erwerbs- und Wirtschaftsgenossenschaften (GenRevG 1997), wird wie folgt geändert:')).toBeNull()
    // The placeholder a draft prints for its own future BGBl.
    expect(stammnormOf('Das Bundesgesetz X, BGBl. I Nr. xxx/2026, wird wie folgt geändert:')).toBeNull()
  })

  it('hält die Teile auseinander, auch über Organe hinweg', () => {
    // Normalisation may level spelling only, never the Teil: 84/2001 is both
    // the AMD-G (BGBl. I) and an Amtssitzgesetz (BGBl. III).
    expect(sameBgbl({ organ: 'dRGBl. S.', nummer: '219/1897' }, { organ: 'dRGBl. S', nummer: '219/1897' })).toBe(true)
    expect(sameBgbl({ organ: 'BGBl. I Nr.', nummer: '84/2001' }, { organ: 'BGBl. III Nr.', nummer: '84/2001' })).toBe(false)
    expect(sameBgbl({ organ: 'JGS Nr.', nummer: '946/1811' }, { organ: 'RGBl. Nr.', nummer: '946/1811' })).toBe(false)
  })
})

describe('sameStammnormCited — two ministry texts citing one law (01.10.2026)', () => {
  it('tolerates a Teil one of them dropped or added (XXVI 162/ME: „BGBl. Nr. 36/2004" for the EU-JZG)', () => {
    expect(sameStammnormCited({ organ: 'BGBl. Nr.', nummer: '36/2004' }, { organ: 'BGBl. I Nr.', nummer: '36/2004' })).toBe(true)
    expect(sameStammnormCited({ organ: 'BGBl. I Nr.', nummer: '839/1992' }, { organ: 'BGBl. Nr.', nummer: '839/1992' })).toBe(true)
    expect(sameStammnormCited({ organ: 'BGBl.', nummer: '624/1978' }, { organ: 'BGBl. Nr.', nummer: '624/1978' })).toBe(true)
  })

  it('still separates two Teile, two organs and two numbers', () => {
    expect(sameStammnormCited({ organ: 'BGBl. I Nr.', nummer: '84/2001' }, { organ: 'BGBl. III Nr.', nummer: '84/2001' })).toBe(false)
    expect(sameStammnormCited({ organ: 'JGS Nr.', nummer: '946/1811' }, { organ: 'RGBl. Nr.', nummer: '946/1811' })).toBe(false)
    expect(sameStammnormCited({ organ: 'BGBl. I Nr.', nummer: '36/2004' }, { organ: 'BGBl. I Nr.', nummer: '36/2005' })).toBe(false)
  })
})

describe('sameRisStammnorm — the draft\'s Teil set by the year (03.10.2026)', () => {
  const c = (organ: string, nummer: string) => ({ organ, nummer })
  it('drops a Teil the draft wrote before 1997 (Bankwesengesetz, 6/ME XXVIII)', () => {
    expect(sameRisStammnorm(c('BGBl. Nr.', '532/1993'), c('BGBl. I Nr.', '532/1993'))).toBe(true)
  })
  it('reads a missing Teil after 1996 as I (Datenschutzgesetz, 18/ME XXVIII)', () => {
    expect(sameRisStammnorm(c('BGBl. I Nr.', '165/1999'), c('BGBl. Nr.', '165/1999'))).toBe(true)
  })
  it('never infers II or III — a Verordnung of the same number stays out', () => {
    expect(sameRisStammnorm(c('BGBl. II Nr.', '104/2006'), c('BGBl. Nr.', '104/2006'))).toBe(false)
    expect(sameRisStammnorm(c('BGBl. III Nr.', '84/2001'), c('BGBl. I Nr.', '84/2001'))).toBe(false)
  })
  it('keeps every other organ exact', () => {
    expect(sameRisStammnorm(c('dRGBl. S', '219/1897'), c('dRGBl. S.', '219/1897'))).toBe(true)
    expect(sameRisStammnorm(c('BGBl. I Nr.', '10/2013'), c('BGBl. I Nr.', '10/2012'))).toBe(false)
  })
})
