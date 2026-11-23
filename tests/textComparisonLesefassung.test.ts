/**
 * A failed read of the Lesefassung costs the reader its confirmation, not the
 * annex (`readAndCheck`, 23.11.2026): the rows go out, can only be marked
 * more, say so, and the answer is not kept.
 */
import { describe, expect, it, vi } from 'vitest'
import type { ConsolidatedTextResponse } from '../shared/types'
import { nitroCachedFunction } from './helpers/nitroCache'

vi.stubGlobal('defineCachedFunction', nitroCachedFunction)
vi.stubGlobal('DERIVED_CACHE', 'derived')
vi.mock('../server/utils/annex/annexGuardService', () => ({
  getAnnexVerification: vi.fn(async () => ({ ran: true, judged: 1, verified: 1, verdicts: { 'X#§ 5.': 'verified' }, uncheckedReasons: {}, withheldCauses: {}, doubtfulLaws: [] })),
}))
vi.mock('../server/utils/kons/konsService', () => ({ getConsolidatedText: vi.fn(), getRisConsolidatedText: vi.fn() }))

const { keptWithLesefassung, readAndCheck } = await import('../server/utils/annex/textComparisonService')

const row = {
  kind: 'pair', law: 'X', heading: null, gld: '§ 5.', para: '§ 5.', paraAfter: '§ 5.', current: '§ 5. Die Frist beträgt vier Wochen.', proposed: '§ 5. Die Frist beträgt sechs Wochen.',
  change: 'changed', editorial: false, elided: false,
  segments: [{ type: 'equal', text: '§ 5. Die Frist beträgt' }, { type: 'removed', text: 'vier' }, { type: 'inserted', text: 'sechs' }, { type: 'equal', text: 'Wochen.' }],
}
const read = (lesefassung: () => Promise<ConsolidatedTextResponse | null>) => readAndCheck(
  { gp: 'XXVIII', inr: 1, risId: null }, [], '2026-01-01', { articles: [], blocks: [] },
  { parsed: { rows: [row], refusal: null }, source: null, publisher: 'ris', readFrom: 'table', droppedPages: 0 } as never,
  null, lesefassung,
)

describe('readAndCheck with a Lesefassung that fails', () => {
  it('keeps the annex, marks the § and says the layer is missing', async () => {
    const out = await read(() => Promise.reject(new Error('upstream')))
    if (typeof out === 'string') throw new Error(out)
    expect(out.available).toBe(true)
    expect(out.rows).toHaveLength(1)
    expect(out.rows[0]!.check).not.toBe('verified')
    expect(out.lesefassungUnread).toBe(true)
    expect(keptWithLesefassung({ value: out })).toBe(false)
  })

  it('is no failure where a draft simply has none, and that answer is kept', async () => {
    const out = await read(async () => null)
    if (typeof out === 'string') throw new Error(out)
    expect(out.lesefassungUnread).toBeUndefined()
    expect(keptWithLesefassung({ value: out })).toBe(true)
  })

  it('marks the same way as a draft without a Lesefassung: a failure clears nothing', async () => {
    const [failed, none] = await Promise.all([read(() => Promise.reject(new Error('upstream'))), read(async () => null)])
    if (typeof failed === 'string' || typeof none === 'string') throw new Error('unread')
    expect(failed.rows.map((r) => r.check)).toEqual(none.rows.map((r) => r.check))
  })
})
