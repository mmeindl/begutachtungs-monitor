import { describe, expect, it } from 'vitest'
import type { StatistikTag } from '../shared/types'
import { TAGE_HOECHSTENS, saeulenAus, skala } from '../app/utils/statistikChart'

/** `n` days ending on `bis`, newest first, as the payload has them; day i has i + 1 views. */
function tage(n: number, bis: string): StatistikTag[] {
  const ende = new Date(`${bis}T00:00:00Z`).getTime()
  return Array.from({ length: n }, (_, i) => ({
    tag: new Date(ende - i * 86_400_000).toISOString().slice(0, 10),
    seiten: n - i,
    feedKalender: 0,
    bots: 0,
  }))
}

describe('saeulenAus', () => {
  it('draws one bar per day, oldest first, only today open', () => {
    const { je, saeulen } = saeulenAus(tage(3, '2026-11-14'))
    expect(je).toBe('tag')
    expect(saeulen).toEqual([
      { von: '2026-11-12', bis: '2026-11-12', seiten: 1, offen: false },
      { von: '2026-11-13', bis: '2026-11-13', seiten: 2, offen: false },
      { von: '2026-11-14', bis: '2026-11-14', seiten: 3, offen: true },
    ])
  })

  it('sums Monday weeks beyond the limit; a partial first week and the running week are open', () => {
    // 2026-11-14 is a Saturday; the oldest day falls mid-week.
    const t = tage(TAGE_HOECHSTENS + 1, '2026-11-14')
    const { je, saeulen } = saeulenAus(t)
    expect(je).toBe('woche')
    expect(saeulen.every((s) => new Date(`${s.von}T00:00:00Z`).getUTCDay() === 1)).toBe(true)
    expect(saeulen.reduce((a, s) => a + s.seiten, 0)).toBe(t.reduce((a, d) => a + d.seiten, 0))
    expect(saeulen.at(-1)).toMatchObject({ von: '2026-11-09', bis: '2026-11-14', offen: true })
    expect(saeulen.slice(1, -1).every((s) => !s.offen)).toBe(true)
    expect(saeulen[0]!.offen).toBe(saeulen[0]!.von !== t.at(-1)!.tag)
  })
})

describe('skala', () => {
  it('steps by 1, 2 or 5 × 10ⁿ up to the first line at or above the maximum', () => {
    expect(skala(0)).toEqual([0, 1])
    expect(skala(3)).toEqual([0, 1, 2, 3])
    expect(skala(7)).toEqual([0, 2, 4, 6, 8])
    expect(skala(180)).toEqual([0, 50, 100, 150, 200])
    expect(skala(200)).toEqual([0, 50, 100, 150, 200])
    expect(skala(1234)).toEqual([0, 500, 1000, 1500])
  })
})
