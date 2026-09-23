import { describe, expect, it } from 'vitest'
import { parseBgbl, sameBgbl, stammnormOf } from '../server/utils/lawtext/bgblCitation'

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

  it('hält die Teile auseinander, auch über Organe hinweg', () => {
    // Normalisation may level spelling only, never the Teil: 84/2001 is both
    // the AMD-G (BGBl. I) and an Amtssitzgesetz (BGBl. III).
    expect(sameBgbl({ organ: 'dRGBl. S.', nummer: '219/1897' }, { organ: 'dRGBl. S', nummer: '219/1897' })).toBe(true)
    expect(sameBgbl({ organ: 'BGBl. I Nr.', nummer: '84/2001' }, { organ: 'BGBl. III Nr.', nummer: '84/2001' })).toBe(false)
    expect(sameBgbl({ organ: 'JGS Nr.', nummer: '946/1811' }, { organ: 'RGBl. Nr.', nummer: '946/1811' })).toBe(false)
  })
})
