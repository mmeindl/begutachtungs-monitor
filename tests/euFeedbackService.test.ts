import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearNitroCache, nitroCacheKeys, nitroCachedFunction } from './helpers/nitroCache'

/**
 * Who gave feedback, through the service (`feedbackOf`,
 * `server/utils/eu/portalService.ts`): the publication must be a window of
 * the initiative, proven through the initiative's own record, so the
 * endpoint is no proxy for arbitrary numbers; a failure is „not read",
 * never an empty list, and never cached.
 *
 * The portal is a fake: the initiative from the fixture of 14.11.2026
 * (13192, publications 15015 without a period, 15129, 15080, 15883) and the
 * synthetic page of contributions.
 */

vi.stubGlobal('defineCachedFunction', nitroCachedFunction)

// No 2.5 s between the fake's answers.
vi.mock('../server/utils/laender/session', () => ({ SitePacer: class { async turn() {} } }))
vi.mock('../server/utils/upstream/fetch', () => {
  class UpstreamHttpError extends Error {
    constructor(readonly status: number, readonly url: string) {
      super(`HTTP ${status} für ${url}`)
    }
  }
  return { UpstreamHttpError, upstreamJson: vi.fn() }
})

const { upstreamJson, UpstreamHttpError } = vi.mocked(await import('../server/utils/upstream/fetch'))
const { feedbackOf } = await import('../server/utils/eu/portalService')

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/eu-portal/${name}.json`, import.meta.url), 'utf8'))

/** What the fake portal answers, by address; `asked` records every address. */
let asked: string[] = []
function portal(answers: { feedback?: () => unknown; initiative?: () => unknown } = {}) {
  upstreamJson.mockImplementation(async (url: string) => {
    asked.push(url)
    if (url.includes('/brpapi/groupInitiatives/13192')) return (answers.initiative ?? (() => fixture('initiative-13192')))()
    if (url.includes('/brpapi/groupInitiatives/')) throw new UpstreamHttpError(404, url)
    if (url.includes('/api/allFeedback')) return (answers.feedback ?? (() => fixture('feedback-page')))()
    throw new Error(`unexpected ${url}`)
  })
}

beforeEach(() => {
  asked = []
  clearNitroCache()
  upstreamJson.mockReset()
})
afterEach(() => vi.clearAllMocks())

describe('who gave feedback, through the service', () => {
  it('reads a window of the initiative: its counts and the names the rule allows', async () => {
    portal()
    const r = await feedbackOf(13192, 15080)
    expect(r.state).toBe('gelesen')
    if (r.state !== 'gelesen') return
    expect(r.reading).toMatchObject({ total: 14, read: 14, citizens: { count: 2 }, other: 2, unpublished: 1 })
    // Each contribution linked under the initiative it was asked by.
    expect(r.reading.contributions[0]).toEqual({ name: 'Siemens AG', type: 'COMPANY', country: 'DEU', date: '2026-11-14', url: 'https://ec.europa.eu/info/law/better-regulation/have-your-say/initiatives/13192/F987654301_de' })
    expect(asked.filter((u) => u.includes('allFeedback'))).toEqual(['https://ec.europa.eu/info/law/better-regulation/api/allFeedback?publicationId=15080&page=0&size=100&language=EN'])
  })

  it('answers „unknown" for a publication that is none of the initiative\'s windows, and never asks the portal for it', async () => {
    portal()
    // Another initiative's publication number, a number nobody has, and the initiative's own publication without a period.
    for (const publication of [99999, 1, 15015]) expect(await feedbackOf(13192, publication), String(publication)).toEqual({ state: 'unbekannt' })
    expect(asked.some((u) => u.includes('allFeedback'))).toBe(false)
  })

  it('answers „unknown" where the portal proves the initiative unknown', async () => {
    portal()
    expect(await feedbackOf(42, 15080)).toEqual({ state: 'unbekannt' })
    expect(asked.some((u) => u.includes('allFeedback'))).toBe(false)
  })

  it('says „not read" where the initiative or the list fails — never an empty list, and caches no failure', async () => {
    portal({ initiative: () => { throw new Error('timeout') } })
    expect(await feedbackOf(13192, 15080)).toEqual({ state: 'ungelesen' })
    portal({ feedback: () => ({ code: 'not_acceptable' }) })
    expect(await feedbackOf(13192, 15080)).toEqual({ state: 'ungelesen' })
    expect(nitroCacheKeys().some((k) => k.startsWith('eu-portal-rueckmeldungen:'))).toBe(false)
    // The portal recovers: the next opening reads it.
    portal()
    expect((await feedbackOf(13192, 15080)).state).toBe('gelesen')
  })

  it('caches the reading under the initiative, the publication and the reader\'s version — no country, no person, no text', async () => {
    portal()
    await feedbackOf(13192, 15129)
    const keys = nitroCacheKeys().filter((k) => k.startsWith('eu-portal-rueckmeldungen:'))
    expect(keys).toEqual(['eu-portal-rueckmeldungen:13192-15129|f2'])
    // A second opening is served from the cache.
    asked = []
    await feedbackOf(13192, 15129)
    expect(asked.some((u) => u.includes('allFeedback'))).toBe(false)
  })

  it('asks nothing for a window the portal counts no contribution for', async () => {
    const record = fixture('initiative-13192') as { publications: Record<string, unknown>[] }
    const empty = { ...record, publications: record.publications.map((p) => (p.id === 15129 ? { ...p, totalFeedback: 0 } : p)) }
    portal({ initiative: () => empty })
    expect(await feedbackOf(13192, 15129)).toEqual({ state: 'gelesen', reading: { total: 0, read: 0, contributions: [], kinds: [], citizens: { count: 0, byCountry: {} }, other: 0, unpublished: 0 } })
    expect(asked.some((u) => u.includes('allFeedback'))).toBe(false)
  })
})
