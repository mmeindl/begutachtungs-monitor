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
    // Das UGB ist dRGBl. S. 219/1897. Bis 19.09.2026 gab es dafür keine
    // Lesart und die Antwort war null — richtig, solange die Alternative war,
    // die *erste BGBl-Zahl* der Klausel zu nehmen, also die letzte Novelle,
    // und damit auf ein fremdes Gesetz aufzulösen. Jetzt wird die Stammnorm
    // gelesen, und die Gefahr von damals ist die eigentliche Zusicherung
    // hier: es ist 219/1897 und gerade nicht 6/2026.
    expect(stammnormOf('Das Unternehmensgesetzbuch - UGB, dRGBl. S. 219/1897, zuletzt geändert durch das Bundesgesetz BGBl. I Nr. 6/2026, wird wie folgt geändert:'))
      .toEqual({ organ: 'dRGBl. S.', nummer: '219/1897' })
  })

  it('liest die älteren Kundmachungsorgane, in denen Österreichs meistzitierte Gesetze stehen', () => {
    // ABGB, ZPO und Notariatsordnung sind älter als das Bundesgesetzblatt.
    // Das RIS führt sie im selben Feldpaar wie jedes BGBl, also trägt die
    // bestehende Verknüpfung sie — sie kannte die Organe nur nicht.
    expect(stammnormOf('Das allgemeine bürgerliche Gesetzbuch, JGS Nr. 946/1811, wird wie folgt geändert:'))
      .toEqual({ organ: 'JGS Nr.', nummer: '946/1811' })
    expect(stammnormOf('Die Zivilprozessordnung, RGBl. Nr. 113/1895, wird wie folgt geändert:'))
      .toEqual({ organ: 'RGBl. Nr.', nummer: '113/1895' })
  })

  it('hält die Teile auseinander, auch über Organe hinweg', () => {
    // Die Normalisierung darf nur Schreibweise einebnen, nie den Teil:
    // 84/2001 ist sowohl das AMD-G (BGBl. I) als auch ein Amtssitzgesetz
    // (BGBl. III).
    expect(sameBgbl({ organ: 'dRGBl. S.', nummer: '219/1897' }, { organ: 'dRGBl. S', nummer: '219/1897' })).toBe(true)
    expect(sameBgbl({ organ: 'BGBl. I Nr.', nummer: '84/2001' }, { organ: 'BGBl. III Nr.', nummer: '84/2001' })).toBe(false)
    expect(sameBgbl({ organ: 'JGS Nr.', nummer: '946/1811' }, { organ: 'RGBl. Nr.', nummer: '946/1811' })).toBe(false)
  })
})
