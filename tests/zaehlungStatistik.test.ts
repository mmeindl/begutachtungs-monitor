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
    expect(s.gesamt).toEqual({ aufrufe: 4, bots: 1 })
    expect(s.tage).toEqual([
      { tag: '2026-10-30', aufrufe: 2, entwurfBund: 0, entwurfLand: 1, feedKalender: 1, bots: 0 },
      { tag: '2026-10-29', aufrufe: 0, entwurfBund: 0, entwurfLand: 0, feedKalender: 0, bots: 0 },
      { tag: '2026-10-28', aufrufe: 2, entwurfBund: 1, entwurfLand: 0, feedKalender: 1, bots: 1 },
    ])
    expect(s.herkunft).toEqual([{ host: 'b.example', aufrufe: 2 }, { host: 'a.example', aufrufe: 1 }])
    expect(s.stand).toBe('2026-10-30T12:00:00.000Z')
  })

  it('answers an empty directory with nothing counted', () => {
    expect(fasseZusammen([], new Date('2026-10-30T15:00:00Z'))).toEqual({
      seit: null, gesamt: { aufrufe: 0, bots: 0 }, tage: [], herkunft: [], stand: null,
    })
  })
})
