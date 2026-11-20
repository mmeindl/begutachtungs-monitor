/**
 * A Land's Erläuterungen as the page's endpoint caches them
 * (`landExplanationsService.ts`): an answer that rests on a failed read of
 * the draft is served, never kept — as the Bund's twin does
 * (`explanationsService.ts`, `cache/gathered.ts`). The PDFs are mocked; the
 * reading and a cache that keeps as Nitro's does (`helpers/nitroCache.ts`)
 * run as they are.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearNitroCache, nitroCachedFunction } from './helpers/nitroCache'

vi.stubGlobal('defineCachedFunction', nitroCachedFunction)
vi.mock('../server/utils/laender/texts/pdfPagesService', () => ({ cachedPdfPages: vi.fn() }))

const { cachedPdfPages } = vi.mocked(await import('../server/utils/laender/texts/pdfPagesService'))
const { cachedLandExplanations } = await import('../server/utils/laender/landExplanationsService')

const DRAFT = 'https://service.salzburg.gv.at/pub/get/1001'
const ERL = 'https://service.salzburg.gv.at/pub/get/1002'
/** Salzburg files its Erläuterungen as a document of their own; „Zu Z 1:" names only the draft's Ziffer. */
const detail = {
  draft: { title: 'Gesetz, mit dem das Salzburger Beispielgesetz geändert wird', documents: [{ title: 'Entwurf', url: DRAFT }, { title: 'Erläuterungen', url: ERL }] },
} as unknown as Parameters<typeof cachedLandExplanations>[2]
const PAGES: Record<string, string[]> = {
  [ERL]: ['Erläuterungen\nAllgemeiner Teil\nDas Gesetz regelt das Beispiel.\nBesonderer Teil\nZu Z 1:\nDer Paragraph wird neu gefasst.'],
  [DRAFT]: ['Gesetz vom …, mit dem das Salzburger Beispielgesetz geändert wird\nDer Salzburger Landtag hat beschlossen:\nDas Salzburger Beispielgesetz wird geändert wie folgt:\n1. § 6 Abs 1 lautet:\n„(1) Neuer Text.“'],
}

beforeEach(() => {
  vi.clearAllMocks()
  clearNitroCache()
})

describe('cachedLandExplanations — a failed read of the draft is not kept (20.11.2026)', () => {
  it('serves the answer without the draft\'s Ziffern, and reads the draft again on the next request', async () => {
    cachedPdfPages.mockImplementation(async (url: string) => {
      if (url === DRAFT) throw new Error('Land antwortet nicht')
      return PAGES[url]!
    })
    const first = await cachedLandExplanations('sbg', '1001', detail)
    expect(first.available).toBe(true)
    expect(first.particular.map((e) => e.paras)).toEqual([[]])

    cachedPdfPages.mockImplementation(async (url: string) => PAGES[url]!)
    const second = await cachedLandExplanations('sbg', '1001', detail)
    expect(second.particular.map((e) => e.paras)).toEqual([['6']])
  })

  it('keeps a whole answer', async () => {
    cachedPdfPages.mockImplementation(async (url: string) => PAGES[url]!)
    expect((await cachedLandExplanations('sbg', '1001', detail)).particular.map((e) => e.paras)).toEqual([['6']])
    await cachedLandExplanations('sbg', '1001', detail)
    expect(cachedPdfPages.mock.calls.filter(([url]) => url === DRAFT)).toHaveLength(1)
  })
})
