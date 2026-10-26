import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LandConsultation, LandStage } from '../shared/types'
import { clearNitroCache, nitroCacheKeys, nitroCachedFunction } from './helpers/nitroCache'

/**
 * The page's decision about a title search's find, laid on the lists
 * (`server/utils/laender/verdicts.ts`, 23.10.2026).
 *
 * Until then a draft its page called „keine Kundmachung gefunden" stood in
 * the period list as „Kundgemacht" — sbg-32570 as LGBl. Nr. 30/2026, whose
 * Regierungsvorlage holds 13,5 % of it. Asserted: the list says what the
 * page says, through the same two functions; a list never waits for the
 * map longer than its budget; a failed decision refutes nothing.
 */

vi.stubGlobal('defineCachedFunction', nitroCachedFunction)

vi.mock('../server/utils/laender/texts/kundmachung', () => ({
  RESOLVED: { sbg: ['gesetz', 'verordnung'], ooe: ['verordnung'] },
  resolveKundmachung: vi.fn(),
}))

const { resolveKundmachung } = vi.mocked(await import('../server/utils/laender/texts/kundmachung'))
const { decidedByText, listVerdictOf, withListVerdicts, withVerdict } = await import('../server/utils/laender/verdicts')

const found = (detail: string): LandStage => ({ station: 'bgbl', label: 'Kundgemacht', detail, date: '2026-03-01', url: `https://www.ris.bka.gv.at/${detail}`, via: 'suche' })

const draft = (id: string, stage: LandConsultation['stage'], over: Partial<LandConsultation> = {}): LandConsultation => ({
  id, land: 'sbg', kind: 'gesetz', title: `Entwurf ${id}`, startedAt: '2025-06-01', deadline: null,
  url: `https://www.salzburg.gv.at/${id}`, documents: [], active: false, stage, ...over,
})

const record = (nr: string) => ({ nr, datum: '2024-11-20', url: `https://www.ris.bka.gv.at/eli/${nr}` })

/** The resolver's answer for a draft, as `resolveKundmachung` holds it. */
function decide(byId: Record<string, unknown>) {
  resolveKundmachung.mockImplementation(async (_land: string, d: LandConsultation) => {
    const v = byId[d.id]
    if (v instanceof Error) throw v
    return (v ?? { value: null, complete: true }) as never
  })
}

beforeEach(() => {
  clearNitroCache()
  resolveKundmachung.mockReset()
})

describe('the list says what the page decided', () => {
  it('drops a refuted find and names it; puts the decided Landesgesetzblatt in place of another', async () => {
    decide({
      'sbg-32570': { value: 'widerlegt', complete: true },
      'sbg-27156': { value: { record: record('LGBl. Nr. 115/2022'), certainBy: 'vorlage', searched: 'LGBl. Nr. 40/2024', landtag: null }, complete: true },
      'sbg-30001': { value: { record: record('LGBl. Nr. 12/2025'), certainBy: 'wortlaut', searched: null, landtag: null }, complete: true },
    })
    const items = [
      draft('sbg-32570', found('LGBl. Nr. 30/2026')),
      draft('sbg-27156', found('LGBl. Nr. 40/2024')),
      draft('sbg-30001', found('LGBl. Nr. 12/2025')),
      // Not certain either way: the title search stands, as the page shows it.
      draft('sbg-30002', found('LGBl. Nr. 13/2025')),
    ]
    const [refuted, moved, confirmed, open] = await withListVerdicts(items, '2024-11-01_laufend')

    expect(refuted!.stage).toBeUndefined()
    expect(refuted).toMatchObject({ lgblSearch: 'widerlegt', lgblRefuted: 'LGBl. Nr. 30/2026' })
    expect(moved!.stage).toMatchObject({ detail: 'LGBl. Nr. 115/2022', date: '2024-11-20', certainBy: 'vorlage', searched: 'LGBl. Nr. 40/2024', label: 'Kundgemacht' })
    expect(confirmed!.stage).toMatchObject({ detail: 'LGBl. Nr. 12/2025', certainBy: 'wortlaut' })
    expect((confirmed!.stage as LandStage).searched).toBeUndefined()
    expect(open).toEqual(items[3])
  })

  it('lays the page\'s own decision on the draft by the same rule', () => {
    const d = draft('sbg-32570', found('LGBl. Nr. 30/2026'))
    expect(withVerdict(d, listVerdictOf('widerlegt', d.stage as LandStage))).toMatchObject({ stage: undefined, lgblSearch: 'widerlegt', lgblRefuted: 'LGBl. Nr. 30/2026' })
    expect(withVerdict(d, listVerdictOf(null, d.stage as LandStage))).toBe(d)
  })

  it('asks only for what the page decides by text: closed, found by the search, of a kind the Land is resolved for', async () => {
    decide({})
    const items = [
      draft('sbg-1', found('LGBl. Nr. 1/2025'), { active: true }),
      draft('sbg-2', { ...found('LGBl. Nr. 2/2025'), via: undefined }),
      draft('ooe-3', found('LGBl. Nr. 3/2025'), { land: 'ooe', kind: 'gesetz' }),
      draft('w-4', found('LGBl. Nr. 4/2025'), { land: 'w' }),
      draft('sbg-5', null),
      draft('sbg-6', 'unknown'),
    ]
    expect(items.map((d) => decidedByText(d.land, d))).toEqual([false, false, false, false, false, false])
    expect(await withListVerdicts(items, 'w')).toEqual(items)
    expect(resolveKundmachung).not.toHaveBeenCalled()
  })
})

describe('the list never waits for the map, and a failure refutes nothing', () => {
  it('answers with the title search while the map is still being built', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      let release: () => void = () => {}
      resolveKundmachung.mockImplementation(() => new Promise((resolve) => {
        release = () => resolve({ value: 'widerlegt', complete: true } as never)
      }))
      const items = [draft('sbg-32570', found('LGBl. Nr. 30/2026'))]
      const first = withListVerdicts(items, 'slow')
      await vi.advanceTimersByTimeAsync(2_000)
      expect(await first).toEqual(items)
      // The build goes on behind the answer; the next list finds it.
      release()
      await vi.advanceTimersByTimeAsync(0)
      expect((await withListVerdicts(items, 'slow'))[0]).toMatchObject({ lgblSearch: 'widerlegt' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves a draft whose decision failed as the search found it, and keeps such a map only briefly', async () => {
    decide({
      'sbg-1': new Error('Vorlage timed out'),
      'sbg-2': { value: 'widerlegt', complete: true },
    })
    const items = [draft('sbg-1', found('LGBl. Nr. 1/2025')), draft('sbg-2', found('LGBl. Nr. 2/2025'))]
    const [failed, refuted] = await withListVerdicts(items, 'gap')
    expect(failed).toEqual(items[0])
    expect(refuted).toMatchObject({ lgblSearch: 'widerlegt' })
    // Stored, but as incomplete: `keepIncompleteFor` serves it ten minutes, not six hours.
    expect(nitroCacheKeys()).toEqual(['land-verdicts:sbg-gap'])
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(Date.now() + 11 * 60 * 1000)
      decide({ 'sbg-1': { value: 'widerlegt', complete: true }, 'sbg-2': { value: 'widerlegt', complete: true } })
      expect((await withListVerdicts(items, 'gap'))[0]).toMatchObject({ lgblSearch: 'widerlegt' })
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('the builds take turns', () => {
  it('decides one draft at a time across every Land and window, and still finishes each', async () => {
    let deciding = 0
    let most = 0
    resolveKundmachung.mockImplementation(async () => {
      deciding++
      most = Math.max(most, deciding)
      await new Promise((resolve) => setTimeout(resolve, 5))
      deciding--
      return { value: 'widerlegt', complete: true } as never
    })
    const sbg = [draft('sbg-1', found('LGBl. Nr. 1/2025')), draft('sbg-2', found('LGBl. Nr. 2/2025'))]
    const ooe = [draft('ooe-1', found('LGBl. Nr. 3/2025'), { land: 'ooe', kind: 'verordnung' })]
    // Two Länder in one period and Salzburg in another: three builds at once.
    const lists = await Promise.all([withListVerdicts([...sbg, ...ooe], 'period-a'), withListVerdicts(sbg, 'period-b')])
    expect(most).toBe(1)
    expect(lists.flat().map((d) => d.lgblSearch)).toEqual(['widerlegt', 'widerlegt', 'widerlegt', 'widerlegt', 'widerlegt'])
  })
})
