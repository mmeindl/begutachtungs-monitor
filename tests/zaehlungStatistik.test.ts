import { describe, expect, it } from 'vitest'
import { fasseZusammen } from '../server/utils/zaehlung/statistik'
import { ANDERE, erfasse, leererTag } from '../server/utils/zaehlung/tag'

/** The public summary behind /statistik (docs/architecture.md §12.65). */
const tag = leererTag

describe('fasseZusammen', () => {
  it('sums the window and the totals, newest day first, hosts ranked without „andere“', () => {
    const d1 = tag('2026-10-28')
    erfasse(d1, { klasse: 'entwurf-bund', bot: false, herkunft: 'a.example' })
    erfasse(d1, { klasse: 'feed', bot: false, herkunft: null })
    erfasse(d1, { klasse: 'start', bot: true, herkunft: null })
    const d2 = tag('2026-10-30')
    erfasse(d2, { klasse: 'entwurf-land', land: 'sbg', bot: false, herkunft: 'b.example' })
    erfasse(d2, { klasse: 'frist-kalender', bot: false, herkunft: 'b.example' })
    d2.herkunft[ANDERE] = 9
    d2.stand = '2026-10-30T12:00:00.000Z'
    const s = fasseZusammen([d2, d1], new Date('2026-10-30T15:00:00Z'))
    expect(s.seit).toBe('2026-10-28')
    expect(s.gesamt).toEqual({ seiten: 2, feedKalender: 2, bots: 1 })
    expect(s.tage).toEqual([
      { tag: '2026-10-30', seiten: 1, feedKalender: 1, bots: 0 },
      { tag: '2026-10-29', seiten: 0, feedKalender: 0, bots: 0 },
      { tag: '2026-10-28', seiten: 1, feedKalender: 1, bots: 1 },
    ])
    // Every page class, most views first, ties in KLASSEN order; bots never.
    expect(s.nachSeite.map((r) => r.klasse)).toEqual([
      'entwurf-bund', 'entwurf-land', 'start', 'entwuerfe', 'so-funktionierts',
      'ueber', 'impressum', 'datenschutz', 'statistik', 'sonstige',
    ])
    expect(s.nachSeite.filter((r) => r.aufrufe)).toEqual([
      { klasse: 'entwurf-bund', aufrufe: 1 }, { klasse: 'entwurf-land', aufrufe: 1 },
    ])
    expect(s.nachAbo).toEqual([
      { klasse: 'feed', aufrufe: 1 }, { klasse: 'frist-kalender', aufrufe: 1 }, { klasse: 'kalender', aufrufe: 0 },
    ])
    expect(s.herkunft).toEqual([{ host: 'b.example', aufrufe: 2 }, { host: 'a.example', aufrufe: 1 }])
    expect(s.stand).toBe('2026-10-30T12:00:00.000Z')
  })

  it('answers an empty directory with nothing counted', () => {
    const s = fasseZusammen([], new Date('2026-10-30T15:00:00Z'))
    expect(s).toMatchObject({
      seit: null, gesamt: { seiten: 0, feedKalender: 0, bots: 0 }, tage: [], herkunft: [], stand: null,
    })
    expect([...s.nachSeite, ...s.nachAbo].every((r) => r.aufrufe === 0)).toBe(true)
  })

  it('keeps „Andere Seiten“ last however many views it has', () => {
    const d = tag('2026-10-30')
    for (let i = 0; i < 3; i++) erfasse(d, { klasse: 'sonstige', bot: false, herkunft: null })
    erfasse(d, { klasse: 'ueber', bot: false, herkunft: null })
    const s = fasseZusammen([d], new Date('2026-10-30T15:00:00Z'))
    expect(s.nachSeite[0]).toEqual({ klasse: 'ueber', aufrufe: 1 })
    expect(s.nachSeite.at(-1)).toEqual({ klasse: 'sonstige', aufrufe: 3 })
  })

  it('leaves days outside the window out of the per-page sums but in the totals', () => {
    const alt = tag('2026-09-01')
    erfasse(alt, { klasse: 'ueber', bot: false, herkunft: null })
    const neu = tag('2026-10-30')
    erfasse(neu, { klasse: 'ueber', bot: false, herkunft: null })
    const s = fasseZusammen([alt, neu], new Date('2026-10-30T15:00:00Z'))
    expect(s.gesamt.seiten).toBe(2)
    expect(s.nachSeite.find((r) => r.klasse === 'ueber')).toEqual({ klasse: 'ueber', aufrufe: 1 })
  })
})
