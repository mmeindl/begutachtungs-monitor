import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nitroCachedFunction } from './helpers/nitroCache'

/**
 * The Länder's paged RIS reads with the pages after the first fetched
 * together (`server/utils/upstream/pages.ts`, 12.11.2026): the Land's whole
 * Landesgesetzblatt (`lgblIndex.ts`) and the consolidated records that name
 * one (`landKonsLaws.ts`). What their loops guaranteed still holds — page
 * order, the index's count check, the „complete" flag, one failure failing
 * the read.
 */

vi.mock('../server/utils/upstream/fetch', () => ({ risJson: vi.fn(), upstreamText: vi.fn() }))
vi.stubGlobal('defineCachedFunction', nitroCachedFunction)

const { risJson } = vi.mocked(await import('../server/utils/upstream/fetch'))
const { fetchLgblIndex } = await import('../server/utils/laender/lgblIndex')
const { konsRefsOfLgbl } = await import('../server/utils/laender/landKonsLaws')
const { clearNitroCache } = await import('./helpers/nitroCache')

/** One Landesgesetzblatt as the index reads it. */
const entry = (n: number) => ({
  Data: { Metadaten: { Kundmachungsdatum: '2026-01-01', Titel: `Gesetz ${n}`, Landesrecht: { Kundmachungsdatum: '2026-01-01', Titel: `Gesetz ${n}`, LgblAuth: { Lgblnummer: `LGBl. Nr. ${n}/2026`, Typ: 'Kundmachung' } } } },
})
/** A page of the index: `total` as RIS counts it, entries `from`…`to`. */
const indexPage = (total: number, from: number, to: number) => ({
  OgdDocumentResults: { Hits: { '#text': String(total) }, OgdDocumentReference: Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => entry(from + i)) },
})
const pageOf = (url: string) => Number(new URL(url).searchParams.get('Seitennummer'))

beforeEach(() => {
  risJson.mockReset()
  clearNitroCache()
})

describe('fetchLgblIndex — the Land\'s whole gazette', () => {
  it('reads every page in page order, page 1 first, at most four at a time', async () => {
    let inFlight = 0
    let most = 0
    const asked: number[] = []
    risJson.mockImplementation((async (url: string) => {
      const p = pageOf(url)
      asked.push(p)
      inFlight++
      most = Math.max(most, inFlight)
      await new Promise((r) => setTimeout(r, (11 - p) % 3))
      inFlight--
      return indexPage(1050, (p - 1) * 100 + 1, Math.min(p * 100, 1050))
    }) as never)
    const entries = await fetchLgblIndex('sbg')
    expect(entries.map((e) => e.nr)).toEqual(Array.from({ length: 1050 }, (_, i) => `LGBl. Nr. ${i + 1}/2026`))
    expect(asked[0]).toBe(1)
    expect(asked).toHaveLength(11)
    expect(most).toBe(4)
  })

  it('still refuses a short read for the whole gazette', async () => {
    // Counted 1.050, page 7 comes back empty: 950 of 1.050 is under 98 %.
    risJson.mockImplementation((async (url: string) => {
      const p = pageOf(url)
      return p === 7 ? indexPage(1050, 0, -1) : indexPage(1050, (p - 1) * 100 + 1, Math.min(p * 100, 1050))
    }) as never)
    await expect(fetchLgblIndex('sbg')).rejects.toThrow('LGBl sbg: 950 von 1050 gelesen')
  })

  it('fails the read when one page fails', async () => {
    risJson.mockImplementation((async (url: string) => {
      if (pageOf(url) === 4) throw new Error('RIS 503')
      return indexPage(1050, 1, 100)
    }) as never)
    await expect(fetchLgblIndex('sbg')).rejects.toThrow('RIS 503')
  })

  it('costs one request where the gazette fits one page', async () => {
    risJson.mockImplementation((async () => indexPage(40, 1, 40)) as never)
    expect(await fetchLgblIndex('sbg')).toHaveLength(40)
    expect(risJson).toHaveBeenCalledTimes(1)
  })
})

describe('konsRefsOfLgbl — the records that name one Landesgesetzblatt', () => {
  const record = (n: number) => ({ n })
  const refsPage = (hits: number, from: number, to: number) => ({
    OgdDocumentResults: { Hits: { '#text': String(hits) }, OgdDocumentReference: Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => record(from + i)) },
  })

  it('keeps page order and says it is complete', async () => {
    risJson.mockImplementation((async (url: string) => {
      const p = pageOf(url)
      await new Promise((r) => setTimeout(r, p === 2 ? 5 : 0))
      return refsPage(230, (p - 1) * 100 + 1, Math.min(p * 100, 230))
    }) as never)
    const { refs, complete } = await konsRefsOfLgbl('sbg', '94/2026')
    expect(refs.map((r: { n: number }) => r.n)).toEqual(Array.from({ length: 230 }, (_, i) => i + 1))
    expect(complete).toBe(true)
  })

  it('says it is not complete where the rows do not reach the count — as the loop did', async () => {
    risJson.mockImplementation((async (url: string) => (pageOf(url) === 1 ? refsPage(230, 1, 100) : refsPage(230, 0, -1))) as never)
    const { refs, complete } = await konsRefsOfLgbl('sbg', '94/2026')
    expect(refs).toHaveLength(100)
    expect(complete).toBe(false)
  })
})
