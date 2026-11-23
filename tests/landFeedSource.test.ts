import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LandConsultation } from '../shared/types'

/**
 * A Land's RSS feed while its whole list cannot be read (23.11.2026): the
 * running drafts and a gap sentence, or an error, never an empty feed. The
 * calendar stays an error throughout.
 */
vi.stubGlobal('createError', (e: { statusCode: number; statusMessage: string }) => Object.assign(new Error(e.statusMessage), e))
vi.mock('../server/utils/laender/sources', () => ({ readLaenderInWindow: vi.fn() }))

const { readLaenderInWindow } = vi.mocked(await import('../server/utils/laender/sources'))
const { LAND_FEED_RUNNING_ONLY_GAP, landFeedItems, landRssItems } = await import('../server/utils/laender/feedSource')

const draft: LandConsultation = {
  id: 'stmk-1', land: 'stmk', kind: 'gesetz', title: 'Entwurf', startedAt: '2026-10-30', deadline: '2026-12-11',
  url: 'https://pallast2.stmk.gv.at/x', documents: [], active: true,
}
const read = (state: 'ok' | 'unavailable', items: LandConsultation[] = []) =>
  ({ items, undated: {}, sources: [{ land: 'stmk' as const, state, listUrl: 'https://pallast2.stmk.gv.at/' }] })

beforeEach(() => readLaenderInWindow.mockReset())

describe('a Land’s RSS feed', () => {
  it('carries the whole list, without a gap, when it can be read', async () => {
    readLaenderInWindow.mockResolvedValueOnce(read('ok', [draft]))
    expect(await landRssItems('stmk', 'XXVIII')).toEqual({ items: [draft], gap: null })
    expect(readLaenderInWindow).toHaveBeenCalledTimes(1)
  })

  it('falls back to the running drafts and says so', async () => {
    readLaenderInWindow.mockResolvedValueOnce(read('unavailable')).mockResolvedValueOnce(read('ok', [draft]))
    expect(await landRssItems('stmk', 'XXVIII')).toEqual({ items: [draft], gap: LAND_FEED_RUNNING_ONLY_GAP })
    expect(LAND_FEED_RUNNING_ONLY_GAP).toMatch(/^Gerade nicht abrufbar: /)
  })

  it('is an error, never an empty feed, with nothing running to show', async () => {
    readLaenderInWindow.mockResolvedValueOnce(read('unavailable')).mockResolvedValueOnce(read('ok', []))
    await expect(landRssItems('stmk', 'XXVIII')).rejects.toMatchObject({ statusCode: 503 })
  })

  it('is an error when the running drafts cannot be read either', async () => {
    readLaenderInWindow.mockResolvedValueOnce(read('unavailable')).mockResolvedValueOnce(read('unavailable'))
    await expect(landRssItems('stmk', 'XXVIII')).rejects.toMatchObject({ statusCode: 503 })
  })
})

describe('a Land’s calendar', () => {
  it('stays an error rather than deleting events from a subscriber’s app', async () => {
    readLaenderInWindow.mockResolvedValueOnce(read('unavailable'))
    await expect(landFeedItems('stmk', 'XXVIII')).rejects.toMatchObject({ statusCode: 503 })
    expect(readLaenderInWindow).toHaveBeenCalledTimes(1)
  })
})
