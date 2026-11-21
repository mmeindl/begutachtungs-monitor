/**
 * One § family's versions in RIS's consolidated Landesrecht
 * (`konsParagraphHistory`, 20.11.2026): every page RIS counts, and a read
 * that falls short of the count fails, so the comparison withholds the § as
 * unchecked and keeps nothing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../server/utils/upstream/fetch', () => ({ risJson: vi.fn() }))
const { risJson } = vi.mocked(await import('../server/utils/upstream/fetch'))
const { konsParagraphHistory } = await import('../server/utils/laender/landKonsLaws')

const record = (i: number) => ({ Data: { Metadaten: { Landesrecht: { LrKons: { Gesetzesnummer: '20000001', ArtikelParagraphAnlage: `§ 5${i % 2 ? 'a' : ''}` } } } } })
/** RIS's answer: `hits` counted, the records of `page` (100 a page). */
const answer = (hits: number, page: number) => ({ OgdDocumentResults: { Hits: { '#text': String(hits) }, OgdDocumentReference: Array.from({ length: Math.max(0, Math.min(100, hits - (page - 1) * 100)) }, (_, k) => record(k)) } })
const pageOf = (url: string) => Number(new URL(url).searchParams.get('Seitennummer') ?? 1)

beforeEach(() => {
  risJson.mockReset()
})

describe('konsParagraphHistory', () => {
  it('reads one page where RIS counts no more, at the address it always had', async () => {
    risJson.mockImplementation((async (url: string) => answer(85, pageOf(url))) as never)
    expect(await konsParagraphHistory('ooe', '20000001', '§5')).toHaveLength(85)
    expect(risJson).toHaveBeenCalledTimes(1)
    expect(new URL(risJson.mock.calls[0]![0]).searchParams.has('Seitennummer')).toBe(false)
  })

  it('reads on where §§ 5, 5a and 5b share more than one page', async () => {
    risJson.mockImplementation((async (url: string) => answer(230, pageOf(url))) as never)
    expect(await konsParagraphHistory('ooe', '20000001', '§5')).toHaveLength(230)
    expect(risJson.mock.calls.map(([url]) => pageOf(url))).toEqual([1, 2, 3])
  })

  it('fails where the pages fall short of the count, never answers with a part', async () => {
    // RIS counts 150 and serves no second page.
    risJson.mockImplementation((async (url: string) => (pageOf(url) === 1 ? answer(150, 1) : answer(150, 99))) as never)
    await expect(konsParagraphHistory('ooe', '20000001', '§5')).rejects.toThrow()
  })
})
