import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LandDraftDetail, LandLawDiffResponse } from '../shared/types'
import { clearNitroCache, nitroCacheKeys, nitroCachedFunction } from './helpers/nitroCache'

/**
 * The cache in front of a Land's comparisons (`server/utils/laender/
 * landLawDiffService.ts`, 25.10.2026): an answer resting on a failed read is
 * served, and not kept. Until then a RIS timeout during the check of the
 * Textgegenüberstellung was held for a day as „im RIS nicht wortgleich".
 */

vi.stubGlobal('defineCachedFunction', nitroCachedFunction)
vi.stubGlobal('DERIVED_CACHE', 'derived')

vi.mock('../server/utils/laender/landTguService', () => ({ compareTgu: vi.fn() }))
vi.mock('../server/utils/laender/sources', () => ({ draftsSharingKundmachung: vi.fn() }))
vi.mock('../server/utils/laender/texts/stations', () => ({ textSources: vi.fn() }))

const { compareTgu } = vi.mocked(await import('../server/utils/laender/landTguService'))
const { textSources } = vi.mocked(await import('../server/utils/laender/texts/stations'))
const { cachedLandComparison, compareLandTexts } = await import('../server/utils/laender/landLawDiffService')

const detail = { draft: { id: 'ktn-1-2025-1' }, comparisons: [['geltend', 'entwurf']] } as unknown as LandDraftDetail
const answer = (withheld: LandLawDiffResponse['withheld']): LandLawDiffResponse => ({
  from: 'geltend', to: 'entwurf', available: true, unavailableReason: null, units: [], stats: { total: 0, unchanged: 0, changed: 0, editorial: 0, inserted: 0, removed: 0 },
  fromDocument: null, toDocument: null, addedLaws: [], droppedLaws: [], sharedWith: [], withheld,
})

beforeEach(() => {
  clearNitroCache()
  compareTgu.mockReset()
})

describe('cachedLandComparison', () => {
  it('serves an answer with a § unchecked for want of RIS, keeps none, and answers anew once RIS is back', async () => {
    compareTgu.mockResolvedValueOnce({ value: answer([{ law: 'K', id: '§5', reason: 'unchecked' }]), complete: false })
    expect((await cachedLandComparison('ktn', '1-2025-1', 'geltend', 'entwurf', detail)).withheld).toEqual([{ law: 'K', id: '§5', reason: 'unchecked' }])
    expect(nitroCacheKeys()).toEqual([])

    compareTgu.mockResolvedValueOnce({ value: answer([]), complete: true })
    expect((await cachedLandComparison('ktn', '1-2025-1', 'geltend', 'entwurf', detail)).withheld).toEqual([])
    expect(nitroCacheKeys()).toEqual(['land-law-diff:ktn-1-2025-1-geltend-entwurf'])
    // Kept: the next request does not compare again.
    expect((await cachedLandComparison('ktn', '1-2025-1', 'geltend', 'entwurf', detail)).withheld).toEqual([])
    expect(compareTgu).toHaveBeenCalledTimes(2)
  })

  it('keeps nothing where the comparison throws', async () => {
    compareTgu.mockRejectedValueOnce(new Error('PDF timed out'))
    await expect(cachedLandComparison('ktn', '1-2025-1', 'geltend', 'entwurf', detail)).rejects.toMatchObject({ message: 'PDF timed out' })
    expect(nitroCacheKeys()).toEqual([])
  })
})

describe('compareLandTexts — what the Land filed as the draft and is none (26.10.2026)', () => {
  // Salzburg 23088: the „Entwurf" is the Gemeindeverband's Stellungnahme (`notADraft`).
  it('is not compared as the draft, and the page says why', async () => {
    const lgbl = { units: [{ id: '§1' }], text: '§ 1' } as never
    textSources.mockReturnValueOnce({
      entwurf: { document: { label: 'Entwurf', url: 'https://example.org/e', publisher: 'Land Salzburg' }, read: async () => ({ units: null, text: 'Stellungnahme', notDraft: true }) },
      lgbl: { document: { label: 'LGBl. Nr. 16/2021', url: null, publisher: 'RIS (CC BY 4.0)' }, read: async () => lgbl },
    })
    const ofDraft = { ...detail, comparisons: [['entwurf', 'lgbl']] } as unknown as LandDraftDetail
    const got = await compareLandTexts('sbg', ofDraft, 'entwurf', 'lgbl')
    expect(got.value).toMatchObject({ available: false, unavailableReason: 'Das Land hat als Entwurf ein anderes Dokument veröffentlicht; der Monitor liest es nicht als Entwurf.' })
  })
})
