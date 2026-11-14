import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * `GET /api/dashboard/zweite-runde` (`server/api/dashboard/zweite-runde.get.ts`)
 * since 14.11.2026: the committees' own motions (`BUA`) stand beside the
 * Regierungsvorlagen, and status `3` is admitted — 365 d.B. XXVIII, sent back
 * to the committee, stood there with its form open. The list column only
 * narrows; the item's `statementsstate` decides.
 *
 * The route runs for real; what is faked is the period, list 101, the detail
 * records and the statement count — and h3's `defineEventHandler`, as the
 * identity.
 */

vi.stubGlobal('defineEventHandler', <T>(handler: T): T => handler)

vi.mock('../server/utils/parliament/drafts', () => ({
  getCurrentGp: vi.fn(async () => 'XXVIII'),
  getItemsForGp: vi.fn(),
  getGegenstand: vi.fn(),
  getDraftsForGp: vi.fn(async () => ({ gp: 'XXVIII', items: [] })),
}))
vi.mock('../server/utils/parliament/statements', () => ({
  getStatementsForRv: vi.fn(async () => ({ total: 2 })),
}))

const { getItemsForGp, getGegenstand } = vi.mocked(await import('../server/utils/parliament/drafts'))
const { default: handler, secondRoundCandidates, STATUS_IN_PROCEDURE } = await import('../server/api/dashboard/zweite-runde.get')

const row = (inr: number, doktyp: string, status: string, title = `Gegenstand ${inr}`) => ({
  gp: 'XXVIII',
  inr,
  citation: `${inr} d.B.`,
  title,
  date: '2025-12-09',
  status,
  doktyp,
  parliamentUrl: `https://www.parlament.gv.at/gegenstand/XXVIII/I/${inr}`,
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('the candidates', () => {
  it('admit status 1–4 and the two kinds the section words', () => {
    expect([...STATUS_IN_PROCEDURE].sort()).toEqual(['1', '2', '3', '4'])
    const rows = [row(365, 'BUA', '3'), row(620, 'RV', '1'), row(14, 'BUA', '5'), row(119, 'RVS', '2'), row(700, 'RV', '3')]
    expect(secondRoundCandidates(rows).map((r) => `${r.inr} ${r.kind}`)).toEqual(['365 ausschussantrag', '620 regierungsvorlage', '700 regierungsvorlage'])
  })
})

describe('the rows', () => {
  it('show an open committee\'s motion at status 3 as an Ausschussantrag, claiming nothing about a Begutachtung', async () => {
    getItemsForGp.mockResolvedValue([row(365, 'BUA', '3', 'Erneuerbaren-Ausbau-Gesetz, Ökostromgesetz, Änderung')] as never)
    getGegenstand.mockResolvedValue({ content: { statementsstate: '1' } } as never)
    const answer = await (handler as unknown as () => Promise<{ gp: string; items: unknown[] }>)()
    expect(answer.items).toEqual([{
      kind: 'ausschussantrag',
      citation: '365 d.B.',
      title: 'Erneuerbaren-Ausbau-Gesetz, Ökostromgesetz, Änderung',
      date: '2025-12-09',
      parliamentUrl: 'https://www.parlament.gv.at/gegenstand/XXVIII/I/365',
      statementCount: 2,
      consultation: { kind: 'unknown' },
    }])
  })

  it('leave out an item at status 3 whose form is closed — the flag decides, not the column', async () => {
    getItemsForGp.mockResolvedValue([row(365, 'BUA', '3'), row(700, 'RV', '3')] as never)
    getGegenstand.mockResolvedValue({ content: { statementsstate: '0' } } as never)
    const answer = await (handler as unknown as () => Promise<{ items: unknown[] }>)()
    expect(answer.items).toEqual([])
  })

  it('keep a Regierungsvorlage\'s own draft and its kind', async () => {
    getItemsForGp.mockResolvedValue([row(312, 'RV', '2')] as never)
    getGegenstand.mockResolvedValue({ content: { statementsstate: '1', preconst: [{ ityp: 'ME', gp_code: 'XXVIII', inr: 32 }] } } as never)
    const answer = await (handler as unknown as () => Promise<{ items: { kind: string; consultation: unknown }[] }>)()
    expect(answer.items.map((i) => [i.kind, i.consultation])).toEqual([['regierungsvorlage', { kind: 'draft', gp: 'XXVIII', inr: 32 }]])
  })
})
