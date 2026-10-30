import { describe, expect, it } from 'vitest'
import type { LandConsultation, LandStage } from '../shared/types'
import { isDecidedLandLaw, isEnactedLandLaw, mergeNewestFirst, newestPerLand } from '../shared/utils/landRecent'

/**
 * The Länder in the homepage's track sections (`shared/utils/landRecent.ts`):
 * which rows each section may claim, and that merging the Bund's
 * Kundmachungen with a Land's never reorders either.
 */

const draft = (over: Partial<LandConsultation> & { stage?: LandStage | null | 'unknown' }): LandConsultation => ({
  id: 'sbg-1',
  land: 'sbg',
  kind: 'gesetz',
  title: 'Entwurf',
  startedAt: '2026-01-01',
  deadline: '2026-02-01',
  url: 'https://example.org',
  documents: [],
  active: false,
  ...over,
} as LandConsultation)

const kundgemacht = (over: Partial<LandStage> = {}): LandStage =>
  ({ station: 'bgbl', label: 'Kundgemacht', detail: 'LGBl. Nr. 45/2026', date: '2026-10-01', ...over })

describe('isEnactedLandLaw', () => {
  it('takes the Land\'s own record, a text decision and a single candidate', () => {
    expect(isEnactedLandLaw(draft({ stage: kundgemacht() }))).toBe(true)
    expect(isEnactedLandLaw(draft({ stage: kundgemacht({ via: 'suche', certainBy: 'vorlage' }) }))).toBe(true)
    expect(isEnactedLandLaw(draft({ stage: kundgemacht({ via: 'suche', unique: true }) }))).toBe(true)
  })

  it('leaves out a pick among several candidates no text decided', () => {
    expect(isEnactedLandLaw(draft({ stage: kundgemacht({ via: 'suche' }) }))).toBe(false)
  })

  it('leaves out Verordnungen, running drafts and earlier stations', () => {
    expect(isEnactedLandLaw(draft({ kind: 'verordnung', stage: kundgemacht() }))).toBe(false)
    expect(isEnactedLandLaw(draft({ active: true, stage: kundgemacht() }))).toBe(false)
    expect(isEnactedLandLaw(draft({ stage: kundgemacht({ station: 'parlament' }) }))).toBe(false)
    expect(isEnactedLandLaw(draft({ stage: 'unknown' }))).toBe(false)
  })
})

describe('isDecidedLandLaw', () => {
  const beschlossen = (over: Partial<LandStage> = {}) =>
    kundgemacht({ station: 'parlament', label: 'Beschlossen – Kundmachung ausständig', detail: null, date: '2026-10-01', ...over })

  it('takes a Beschluss the Land records, within the window', () => {
    expect(isDecidedLandLaw(draft({ stage: beschlossen() }), '2026-10-30')).toBe(true)
  })

  it('leaves out our own join, where „noch nicht kundgemacht" is not ours to say', () => {
    expect(isDecidedLandLaw(draft({ stage: beschlossen({ joined: true }) }), '2026-10-30')).toBe(false)
  })

  it('leaves out a Beschluss past the window, undated or in the future', () => {
    expect(isDecidedLandLaw(draft({ stage: beschlossen({ date: '2026-01-01' }) }), '2026-10-30')).toBe(false)
    expect(isDecidedLandLaw(draft({ stage: beschlossen({ date: null }) }), '2026-10-30')).toBe(false)
    expect(isDecidedLandLaw(draft({ stage: beschlossen({ date: '2026-11-15' }) }), '2026-10-30')).toBe(false)
  })
})

describe('newestPerLand', () => {
  it('cuts each Land to five and orders all of them newest first', () => {
    const sbg = Array.from({ length: 7 }, (_, i) =>
      draft({ id: `sbg-${i}`, stage: kundgemacht({ date: `2026-0${i + 1}-15`, detail: `LGBl. Nr. ${i}/2026` }) }))
    const ooe = draft({ id: 'ooe-1', land: 'ooe', stage: kundgemacht({ date: '2026-05-20' }) })
    const out = newestPerLand([...sbg, ooe])
    expect(out.map((d) => d.id)).toEqual(['sbg-6', 'sbg-5', 'ooe-1', 'sbg-4', 'sbg-3', 'sbg-2'])
  })

  it('breaks a tie by the number in one Landesgesetzblatt', () => {
    const a = draft({ id: 'a', stage: kundgemacht({ detail: 'LGBl. Nr. 9/2026' }) })
    const b = draft({ id: 'b', stage: kundgemacht({ detail: 'LGBl. Nr. 10/2026' }) })
    expect(newestPerLand([a, b]).map((d) => d.id)).toEqual(['b', 'a'])
  })
})

describe('mergeNewestFirst', () => {
  const ids = (m: { item: { id: string } }[]) => m.map((x) => x.item.id)

  it('merges by date and keeps each list\'s own order', () => {
    // The Bund's list is in BGBl order, and its dates need not agree with it.
    const bund = [{ id: 'b1', d: '2026-10-20' }, { id: 'b2', d: '2026-10-22' }, { id: 'b3', d: '2026-09-01' }]
    const land = [{ id: 'l1', d: '2026-10-21' }, { id: 'l2', d: '2026-10-01' }]
    expect(ids(mergeNewestFirst(bund, (x) => x.d, land, (x) => x.d))).toEqual(['l1', 'b1', 'b2', 'l2', 'b3'])
  })

  it('places an undated row right after its predecessor, a first one first', () => {
    const bund = [{ id: 'b1', d: null }, { id: 'b2', d: '2026-10-01' }, { id: 'b3', d: null }]
    const land = [{ id: 'l1', d: '2026-10-05' }, { id: 'l2', d: '2026-09-01' }]
    expect(ids(mergeNewestFirst(bund, (x) => x.d, land, (x) => x.d))).toEqual(['b1', 'l1', 'b2', 'b3', 'l2'])
  })

  it('gives a tie to the first list', () => {
    expect(ids(mergeNewestFirst([{ id: 'a', d: '2026-10-01' }], (x) => x.d, [{ id: 'b', d: '2026-10-01' }], (x) => x.d))).toEqual(['a', 'b'])
  })
})
