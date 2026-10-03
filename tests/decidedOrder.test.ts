import { describe, expect, it } from 'vitest'
import type { DraftChain } from '../shared/types'
import { pickDecided } from '../server/utils/parliament/decidedOrder'
import { PROMULGATION_WINDOW_DAYS } from '../shared/utils/promulgation'
import { draftSummary } from './helpers/builders'

/**
 * „Im Nationalrat beschlossen" — which drafts the homepage section shows,
 * and in which order (`server/utils/parliament/decidedOrder.ts`).
 *
 * Every row is a claim, decided and not yet promulgated, so what matters
 * is what does NOT get in: a law already in the Bundesgesetzblatt, a
 * running Begutachtung, and a Beschluss old enough that no Kundmachung is
 * on its way any more (80 d.B., §12.21).
 */

const TODAY = '2026-10-03'

const chain = (over: Partial<DraftChain>): DraftChain => ({
  station: 'parlament',
  rvCitation: '592 d.B.',
  rvDate: '2026-07-10',
  bgblNumber: null,
  filingOpen: false,
  ...over,
})

const draft = (inr: number, active = false) => draftSummary({ inr, citation: `${inr}/ME`, active })

describe('pickDecided', () => {
  it('shows what the Nationalrat decided and nobody promulgated, newest Beschluss first', () => {
    const out = pickDecided(
      [draft(89), draft(117), draft(73), draft(75)],
      {
        89: chain({ rvCitation: '539 d.B.', decidedAt: '2026-09-23' }),
        117: chain({ rvCitation: '590 d.B.', decidedAt: '2026-09-23' }),
        // Promulgated: the Bundesgesetzblatt's section, not this one.
        73: chain({ station: 'bgbl', decidedAt: '2026-09-24', bgblNumber: 'Bundesgesetzblatt I Nr. 90/2026' }),
        75: chain({ decidedAt: '2026-07-09' }),
      },
      TODAY,
    )
    // Same plenary day: the higher number first — an order nobody chose.
    expect(out.map((r) => r.inr)).toEqual([117, 89, 75])
    expect(out[0]).toMatchObject({ rvCitation: '590 d.B.', bgblNumber: null, rvDate: '2026-07-10' })
    expect(out[0]!.chain?.decidedAt).toBe('2026-09-23')
  })

  it('leaves out a draft without a Beschluss, an open one, and one without a chain', () => {
    const out = pickDecided(
      [draft(1), draft(2, true), draft(3)],
      {
        1: chain({ station: 'rv', decidedAt: null }),
        2: chain({ decidedAt: '2026-09-23' }),
      },
      TODAY,
    )
    expect(out).toEqual([])
  })

  /* 80 d.B.: decided 10.07.2025, no BGBl link at Parliament and no
   * Kundmachung in RIS that names it. Past the window, silence beats a
   * „noch nicht kundgemacht" that promises one. */
  it('drops a Beschluss older than the window, and one dated in the future', () => {
    const at = (decidedAt: string) => pickDecided([draft(2)], { 2: chain({ decidedAt }) }, TODAY).length
    expect(at('2025-07-10')).toBe(0)
    expect(at('2026-06-05')).toBe(1) // exactly PROMULGATION_WINDOW_DAYS before TODAY
    expect(PROMULGATION_WINDOW_DAYS).toBe(120)
    expect(at('2026-06-04')).toBe(0)
    expect(at('2026-10-04')).toBe(0)
  })

  /* 80 d.B.: Parliament's own record says no Kundmachung followed. Out,
   * whatever the date — and counted from the Bundesrat where it is known. */
  it('drops a Beschluss Parliament records as not promulgated, and counts from the Bundesrat', () => {
    const notPromulgated = { date: '2025-09-24', reason: 'formalfehler' as const, successorAntrag: null }
    expect(pickDecided([draft(2)], { 2: chain({ decidedAt: '2026-09-23', notPromulgated }) }, TODAY)).toEqual([])
    // Nationalrat 121 days ago, Bundesrat 100: the procedure ended inside the window.
    expect(pickDecided([draft(2)], { 2: chain({ decidedAt: '2026-06-04', bundesratDecidedAt: '2026-06-25' }) }, TODAY)).toHaveLength(1)
  })

  /* One procedure, one place: while the form is open — through the
   * Bundesrat's phase — it stands in the act half, under the Vorlage. */
  it('leaves a decided procedure out while its window is open', () => {
    expect(pickDecided([draft(117)], { 117: chain({ decidedAt: '2026-09-23', filingOpen: true }) }, TODAY)).toEqual([])
  })

  it('stops at the homepage length', () => {
    const inrs = [10, 11, 12, 13, 14, 15]
    const out = pickDecided(
      inrs.map((i) => draft(i)),
      Object.fromEntries(inrs.map((i) => [i, chain({ decidedAt: '2026-09-23' })])),
      TODAY,
    )
    expect(out.map((r) => r.inr)).toEqual([15, 14, 13, 12, 11])
  })
})
