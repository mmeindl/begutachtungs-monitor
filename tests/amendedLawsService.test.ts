import { describe, expect, it, vi } from 'vitest'
import { draftArticle } from './helpers/builders'

/**
 * The laws a draft amends, through the Nitro wrapper
 * (`server/utils/lawtext/amendedLawsService.ts`).
 *
 * WHY THIS FILE EXISTS. The list is a statement on the page — „ändert 65
 * Gesetze" in the spine, every law in the Entwurf's frame — and until
 * 22.10.2026 the ceiling on RIS lookups cut the list itself: 116/ME XXVIII
 * named 65 laws and the page said 40. The ceiling lives in the cached
 * function, so the test runs it.
 *
 * `defineCachedFunction` calls straight through, and the three neighbours are
 * the module's boundaries: the Parliament list (the reference date), the
 * draft's Artikel, and the RIS lookup, whose calls are what the ceiling
 * bounds.
 */
vi.stubGlobal('defineCachedFunction', <A extends unknown[], R>(fn: (...args: A) => R) => fn)
vi.stubGlobal('DERIVED_CACHE', 'derived')
vi.mock('../server/utils/parliament/drafts', () => ({ getDraftsForGp: vi.fn() }))
vi.mock('../server/utils/lawtext/draftArticlesService', () => ({ getDraftArticles: vi.fn() }))
vi.mock('../server/utils/kons/konsCache', () => ({ resolveKonsLaw: vi.fn() }))

const { getDraftsForGp } = vi.mocked(await import('../server/utils/parliament/drafts'))
const { getDraftArticles } = vi.mocked(await import('../server/utils/lawtext/draftArticlesService'))
const { resolveKonsLaw } = vi.mocked(await import('../server/utils/kons/konsCache'))
const { getAmendedLaws } = await import('../server/utils/lawtext/amendedLawsService')

describe('getAmendedLaws — every law the draft names (22.10.2026)', () => {
  it('lists all 65 laws of a Sammelgesetz and asks RIS for the first 40 only', async () => {
    getDraftsForGp.mockResolvedValue({ items: [{ inr: 116, arrivedAt: '2026-10-01' }] } as never)
    const articles = Array.from({ length: 65 }, (_, i) =>
      draftArticle({ index: i, number: `Artikel ${i + 1}`, numeral: String(i + 1), title: `Änderung des Gesetzes ${i + 1}`, key: `Gesetz ${i + 1}`, bgbl: { organ: 'BGBl. I', nummer: `${i + 1}/2020` } }),
    )
    getDraftArticles.mockResolvedValue({ blocks: [], articles } as never)
    resolveKonsLaw.mockImplementation(async (_organ: string, nummer: string) => ({ gesetzesnummer: `G${nummer.replace('/', '-')}`, kurztitel: `Gesetz ${nummer}`, paragraphs: {} }))

    const r = await getAmendedLaws('XXVIII', 116)

    expect(r.laws).toHaveLength(65)
    expect(resolveKonsLaw).toHaveBeenCalledTimes(40)
    expect(r.laws[39]).toMatchObject({ title: 'Gesetz 40/2020', bgbl: 'BGBl. I 40/2020' })
    expect(r.laws[39]!.risUrl).toMatch(/Gesetzesnummer=G40-2020/)
    // Beyond the ceiling: listed as the draft names it, without a RIS link.
    expect(r.laws[40]).toMatchObject({ title: 'Änderung des Gesetzes 41', bgbl: 'BGBl. I 41/2020', risUrl: null, amendedBy: null })
    expect(r.createsNewLaw).toBe(false)
  })
})
