import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BgblOutcome } from '../shared/types'
import { risConsultation } from './helpers/builders'
import type { FakeEvent } from './helpers/nitroGlobals'

/**
 * `GET /api/ris-drafts?station=bgbl` when RIS fails — an error, never „0
 * Verordnungsentwürfe" (`server/api/ris-drafts/index.get.ts`, the §12.13
 * rule).
 *
 * Under the station „Bundesgesetzblatt" the Kundmachung is not a column, it
 * is the FILTER: only what was promulgated stands in the list. Until
 * 22.10.2026 the route caught the outcome's failure into an empty record, so
 * a RIS outage answered 200 with total 0 — the list said no Verordnung of
 * the period had been promulgated, and the comment above the line said that
 * this was exactly the answer it must never give.
 *
 * The route runs for real, with its query parser, its filter and its budget;
 * what is faked is what lies behind it — the period, the RIS corpus and the
 * Kundmachung join — and h3's `defineEventHandler`, as the identity.
 */

vi.stubGlobal('defineEventHandler', <T>(handler: T): T => handler)

vi.mock('../server/utils/parliament/drafts', () => ({
  getCurrentGp: vi.fn(async () => 'XXVIII'),
  listAvailableGps: vi.fn(() => ['XXVIII', 'XXVII']),
}))
vi.mock('../server/utils/ris/risOnly', () => ({
  getRisOnlyForGp: vi.fn(),
  getCarryOverRisConsultations: vi.fn(async () => []),
}))
vi.mock('../server/utils/ris/bgblService', () => ({
  getBgblOutcomesForGp: vi.fn(),
}))

const { getRisOnlyForGp } = vi.mocked(await import('../server/utils/ris/risOnly'))
const { getBgblOutcomesForGp } = vi.mocked(await import('../server/utils/ris/bgblService'))
const { default: handler } = await import('../server/api/ris-drafts/index.get')

/** Two closed Verordnungsentwürfe of the period; the first was promulgated. */
const PROMULGATED = risConsultation({ id: 'BEGUT_A', title: 'Sachbezugswerteverordnung, Änderung', deadline: '2026-03-01', active: false })
const PENDING = risConsultation({ id: 'BEGUT_B', title: 'Druckgeräteaufstellungsverordnung, Änderung', deadline: '2026-04-01', active: false })

const OUTCOMES: Record<string, BgblOutcome> = {
  BEGUT_A: { state: 'kundgemacht', nummer: 'BGBl. II Nr. 50/2026', datum: '2026-03-20', url: null, days: 19 },
  BEGUT_B: { state: 'ausstehend', nummer: null, datum: null, url: null, days: null },
}

const request = (query: FakeEvent['__query']) => handler({ __query: query } as unknown as H3Event)

beforeEach(() => {
  getRisOnlyForGp.mockResolvedValue({ items: [PROMULGATED, PENDING], withGegenstand: 0, undecided: 0 })
  getBgblOutcomesForGp.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('station „Bundesgesetzblatt": the outcome is the filter', () => {
  it('a RIS failure is the answer\'s failure — no 200 with an empty list', async () => {
    getBgblOutcomesForGp.mockRejectedValue(new Error('RIS: The operation was aborted due to timeout'))
    await expect(request({ station: 'bgbl' })).rejects.toThrow('RIS')
  })

  it('and the next request, once RIS answers, lists what was promulgated', async () => {
    getBgblOutcomesForGp.mockRejectedValueOnce(new Error('RIS: fetch failed'))
    await expect(request({ station: 'bgbl' })).rejects.toThrow()

    getBgblOutcomesForGp.mockResolvedValue(OUTCOMES)
    const answer = await request({ station: 'bgbl' })
    expect(answer.total).toBe(1)
    expect(answer.items.map((i) => i.id)).toEqual(['BEGUT_A'])
    expect(answer.items[0]!.outcome?.nummer).toBe('BGBl. II Nr. 50/2026')
  })
})

describe('without that station the outcome stays a garnish', () => {
  it('a RIS failure leaves the column empty and the list whole — incomplete, not wrong', async () => {
    getBgblOutcomesForGp.mockRejectedValue(new Error('RIS: fetch failed'))
    const answer = await request({})
    expect(answer.total).toBe(2)
    expect(answer.items.every((i) => i.outcome === null)).toBe(true)
  })
})
