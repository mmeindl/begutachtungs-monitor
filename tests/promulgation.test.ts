import { describe, expect, it } from 'vitest'
import { PROMULGATION_WINDOW_DAYS, promulgationOverdue, promulgationState } from '../shared/utils/promulgation'

/**
 * A Gesetzesbeschluss that was not promulgated — the shared reading for the
 * list row, the spine and the homepage (`shared/utils/promulgation.ts`).
 *
 * Two signals of two kinds: Parliament's own stage (explicit), and a
 * calendar past every measured Kundmachung (overdue). The second may only
 * ever say „seit … nicht kundgemacht"; what these tests pin is where it
 * starts and what it counts from.
 */

const TODAY = '2026-10-03'

describe('promulgationOverdue', () => {
  it('counts from the Bundesrat where known, else from the Nationalrat', () => {
    // XXVII/1435 d.B.: Nationalrat 15.06.2022, Bundesrat 29.06.2022, no Kundmachung.
    expect(promulgationOverdue({ decidedAt: '2022-06-15', bundesratDecidedAt: '2022-06-29' }, null, TODAY)).toBe(true)
    // Nationalrat 121 days ago, Bundesrat 100: inside the window.
    expect(promulgationOverdue({ decidedAt: '2026-06-04', bundesratDecidedAt: '2026-06-25' }, null, TODAY)).toBe(false)
    expect(promulgationOverdue({ decidedAt: '2026-06-04' }, null, TODAY)).toBe(true)
  })

  it('starts the day after the window', () => {
    expect(PROMULGATION_WINDOW_DAYS).toBe(120)
    expect(promulgationOverdue({ decidedAt: '2026-06-05' }, null, TODAY)).toBe(false)
    expect(promulgationOverdue({ decidedAt: '2026-06-04' }, null, TODAY)).toBe(true)
  })

  it('is never overdue with a Kundmachung, or without a Beschluss', () => {
    expect(promulgationOverdue({ decidedAt: '2022-06-15' }, 'Bundesgesetzblatt I Nr. 18/2023', TODAY)).toBe(false)
    expect(promulgationOverdue({}, null, TODAY)).toBe(false)
  })
})

describe('promulgationState', () => {
  const notPromulgated = { date: '2025-09-24', reason: 'formalfehler' as const, successorAntrag: null }

  it("prefers Parliament's own stage to the calendar", () => {
    expect(promulgationState({ decidedAt: '2025-07-10', notPromulgated }, TODAY)).toBe('explicit')
    expect(promulgationState({ decidedAt: '2026-09-23', notPromulgated }, TODAY)).toBe('explicit')
  })

  it('falls back to the calendar, and says nothing inside the window', () => {
    expect(promulgationState({ decidedAt: '2022-06-15', bundesratDecidedAt: '2022-06-29' }, TODAY)).toBe('overdue')
    expect(promulgationState({ decidedAt: '2026-09-23' }, TODAY)).toBeNull()
    expect(promulgationState({ decidedAt: '2022-06-15', bgblNumber: 'Bundesgesetzblatt I Nr. 5/2023' }, TODAY)).toBeNull()
  })
})
