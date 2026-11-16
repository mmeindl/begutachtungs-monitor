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
    expect(nitroCacheKeys().some((k) => k.startsWith('eu-portal-rueckmeldungen'))).toBe(false)
    // The portal recovers: the next opening reads it.
    portal()
    expect((await feedbackOf(13192, 15080)).state).toBe('gelesen')
  })

  it('caches the reading under the initiative, the publication and the reader\'s version — no country, no person, no text', async () => {
    portal()
    await feedbackOf(13192, 15129)
    const keys = nitroCacheKeys().filter((k) => k.startsWith('eu-portal-rueckmeldungen'))
    expect(keys.sort()).toEqual(['eu-portal-rueckmeldungen-erste:13192-15129|f4', 'eu-portal-rueckmeldungen:13192-15129-s5|f4'])
    // A second opening is served from the cache.
    asked = []
    await feedbackOf(13192, 15129)
    expect(asked.some((u) => u.includes('allFeedback'))).toBe(false)
  })

  it('asks nothing for a window the portal counts no contribution for', async () => {
    const record = fixture('initiative-13192') as { publications: Record<string, unknown>[] }
    const empty = { ...record, publications: record.publications.map((p) => (p.id === 15129 ? { ...p, totalFeedback: 0 } : p)) }
    portal({ initiative: () => empty })
    expect(await feedbackOf(13192, 15129)).toEqual({ state: 'gelesen', reading: { total: 0, read: 0, contributions: [], kinds: [], citizens: { count: 0, byCountry: {} }, other: 0, unpublished: 0 }, pages: 0 })
    expect(asked.some((u) => u.includes('allFeedback'))).toBe(false)
  })
})

/* ------------------------------------------------------------------ *
 * Two steps: page one first, then the whole — no page asked twice
 * ------------------------------------------------------------------ */

/**
 * A window of 350 contributions, four pages: invented citizens only (counted,
 * never named), so the pages need no organisation names at all.
 */
const TOTAL = 350
function syntheticPage(page: number): unknown {
  const size = Math.max(0, Math.min(100, TOTAL - page * 100))
  return {
    content: Array.from({ length: size }, () => ({ userType: 'EU_CITIZEN', status: 'PUBLISHED', country: 'AUT', firstName: 'Erfunden', surname: 'Beispiel' })),
    totalElements: TOTAL,
    number: page,
    last: (page + 1) * 100 >= TOTAL,
  }
}
const pageAsked = (url: string) => Number(new URL(url).searchParams.get('page'))
function multiPagePortal() {
  portal({ feedback: () => { throw new Error('replaced below') } })
  upstreamJson.mockImplementation(async (url: string) => {
    asked.push(url)
    if (url.includes('/brpapi/groupInitiatives/13192')) return fixture('initiative-13192')
    if (url.includes('/api/allFeedback')) return syntheticPage(pageAsked(url))
    throw new Error(`unexpected ${url}`)
  })
}
const feedbackPages = () => asked.filter((u) => u.includes('allFeedback')).map(pageAsked)

describe('who gave feedback, in two steps', () => {
  // The service remembers for six hours which windows have a whole reading;
  // each test starts seven hours after the last, so none inherits that memory.
  let clock = Date.now()
  beforeEach(() => {
    clock += 7 * 60 * 60 * 1000
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(clock)
  })
  afterEach(() => { vi.useRealTimers() })

  it('answers page one as „teilweise", then the whole from it — every page asked once', async () => {
    multiPagePortal()
    const first = await feedbackOf(13192, 15080, 'erste')
    expect(first.state).toBe('teilweise')
    if (first.state !== 'teilweise') return
    expect(first.reading).toMatchObject({ total: 350, read: 100, citizens: { count: 100 } })
    expect(feedbackPages()).toEqual([0])

    const whole = await feedbackOf(13192, 15080)
    expect(whole.state).toBe('gelesen')
    if (whole.state !== 'gelesen') return
    expect(whole.reading).toMatchObject({ total: 350, read: 350, citizens: { count: 350 } })
    // Page one came from the cache: four pages in all, each once — what the whole alone asked before.
    expect(feedbackPages()).toEqual([0, 1, 2, 3])

    // Page one asked again, once the whole is in: the whole, as „gelesen", and nothing asked.
    const again = await feedbackOf(13192, 15080, 'erste')
    expect(again).toMatchObject({ state: 'gelesen', reading: { read: 350 }, pages: 5 })
    expect(feedbackPages()).toEqual([0, 1, 2, 3])
  })

  it('asks every page once when page one and the whole are asked at the same time', async () => {
    multiPagePortal()
    const [first, whole, wholeAgain] = await Promise.all([feedbackOf(13192, 15080, 'erste'), feedbackOf(13192, 15080), feedbackOf(13192, 15080)])
    expect(first).toMatchObject({ state: 'teilweise', reading: { read: 100 } })
    expect(whole).toMatchObject({ state: 'gelesen', reading: { read: 350 } })
    expect(wholeAgain).toEqual(whole)
    expect(feedbackPages().sort()).toEqual([0, 1, 2, 3])
  })

  it('answers page one as „gelesen" where it holds the whole list, and the whole asks nothing more', async () => {
    portal()
    expect(await feedbackOf(13192, 15080, 'erste')).toMatchObject({ state: 'gelesen', reading: { total: 14, read: 14 } })
    expect(await feedbackOf(13192, 15080)).toMatchObject({ state: 'gelesen', reading: { total: 14, read: 14 } })
    expect(feedbackPages()).toEqual([0])
  })

  it('keeps the rule on the cached page one: a counted row keeps no day, no number, no name', async () => {
    multiPagePortal()
    await feedbackOf(13192, 15080, 'erste')
    const cached = JSON.stringify(nitroCacheKeys())
    expect(cached).toContain('eu-portal-rueckmeldungen-erste:13192-15080|f4')
    const { readFirstFeedbackPage } = await import('../server/utils/eu/portalFeedback')
    const page = await readFirstFeedbackPage(async () => syntheticPage(0), 15080)
    expect(JSON.stringify(page)).not.toMatch(/Erfunden|Beispiel|date|"id"/)
  })

  it('a failed whole after page one is „ungelesen", caches nothing of the whole, and asks only the rest again', async () => {
    multiPagePortal()
    await feedbackOf(13192, 15080, 'erste')
    upstreamJson.mockImplementation(async (url: string) => {
      asked.push(url)
      if (url.includes('/brpapi/groupInitiatives/13192')) return fixture('initiative-13192')
      if (pageAsked(url) === 2) throw new Error('timeout')
      return syntheticPage(pageAsked(url))
    })
    expect(await feedbackOf(13192, 15080)).toEqual({ state: 'ungelesen' })
    expect(nitroCacheKeys().some((k) => k.startsWith('eu-portal-rueckmeldungen:'))).toBe(false)
    multiPagePortal()
    asked = []
    expect(await feedbackOf(13192, 15080)).toMatchObject({ state: 'gelesen', reading: { read: 350 } })
    expect(feedbackPages()).toEqual([1, 2, 3])
  })
})

/* ------------------------------------------------------------------ *
 * More on request: steps of five pages, each from the step before
 * ------------------------------------------------------------------ */

/** A window of `total` contributions, citizens only (counted, never named). */
function sizedPortal(total: number) {
  upstreamJson.mockImplementation(async (url: string) => {
    asked.push(url)
    if (url.includes('/brpapi/groupInitiatives/13192')) return fixture('initiative-13192')
    if (url.includes('/api/allFeedback')) {
      const page = pageAsked(url)
      const size = Math.max(0, Math.min(100, total - page * 100))
      return { content: Array.from({ length: size }, () => ({ userType: 'EU_CITIZEN', status: 'PUBLISHED', country: 'AUT', firstName: 'Erfunden', surname: 'Beispiel' })), totalElements: total, number: page, last: (page + 1) * 100 >= total }
    }
    throw new Error(`unexpected ${url}`)
  })
}

describe('who gave feedback, more on request', () => {
  let clock = Date.now() + 1000 * 60 * 60 * 24 * 30
  beforeEach(() => {
    clock += 7 * 60 * 60 * 1000
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(clock)
  })
  afterEach(() => { vi.useRealTimers() })

  it('reads each further step from the step before: the pages it lacks, each once', async () => {
    sizedPortal(1234)
    expect(await feedbackOf(13192, 15080, 'erste')).toMatchObject({ state: 'teilweise', pages: 1, reading: { read: 100, total: 1234 } })
    expect(await feedbackOf(13192, 15080, 5)).toMatchObject({ state: 'gelesen', pages: 5, reading: { read: 500 } })
    expect(await feedbackOf(13192, 15080, 10)).toMatchObject({ state: 'gelesen', pages: 10, reading: { read: 1000, total: 1234 } })
    expect(await feedbackOf(13192, 15080, 15)).toMatchObject({ state: 'gelesen', pages: 15, reading: { read: 1234 } })
    expect(feedbackPages()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    // Each step its own entry, in memory, under the reader's version.
    expect(nitroCacheKeys().filter((k) => k.startsWith('eu-portal-rueckmeldungen:')).sort()).toEqual([
      'eu-portal-rueckmeldungen:13192-15080-s10|f4',
      'eu-portal-rueckmeldungen:13192-15080-s15|f4',
      'eu-portal-rueckmeldungen:13192-15080-s5|f4',
    ])
    // Asked again: from the cache, nothing of the portal.
    asked = []
    expect(await feedbackOf(13192, 15080, 10)).toMatchObject({ pages: 10, reading: { read: 1000 } })
    expect(feedbackPages()).toEqual([])
  })

  it('shares one step asked twice at once, and runs a window\'s steps one after the other', async () => {
    sizedPortal(1234)
    const [a, b, c] = await Promise.all([feedbackOf(13192, 15080, 5), feedbackOf(13192, 15080, 10), feedbackOf(13192, 15080, 10)])
    expect(a).toMatchObject({ pages: 5, reading: { read: 500 } })
    expect(b).toMatchObject({ pages: 10, reading: { read: 1000 } })
    expect(c).toEqual(b)
    expect(feedbackPages()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('begins again at page one where the step before is gone, and reads what five requests reach', async () => {
    sizedPortal(1234)
    await feedbackOf(13192, 15080, 5)
    asked = []
    // Step 15 without step 10 in the cache: page one is cached, so five requests read pages 1–5.
    expect(await feedbackOf(13192, 15080, 15)).toMatchObject({ state: 'gelesen', pages: 15, reading: { read: 600 } })
    expect(feedbackPages()).toEqual([1, 2, 3, 4, 5])
    // The block offers the next step from there, and it goes on below.
    asked = []
    expect(await feedbackOf(13192, 15080, 20)).toMatchObject({ pages: 20, reading: { read: 1100 } })
    expect(feedbackPages()).toEqual([6, 7, 8, 9, 10])
  })

  it('starts again from page one after six hours counted from page one\'s read, not from the step\'s', async () => {
    sizedPortal(1234)
    await feedbackOf(13192, 15080, 'erste')
    vi.setSystemTime(clock + 5 * 60 * 60 * 1000)
    await feedbackOf(13192, 15080, 5)
    await feedbackOf(13192, 15080, 10)
    asked = []
    // Five hours and fifty-nine minutes after page one: still served.
    vi.setSystemTime(clock + (5 * 60 + 59) * 60 * 1000)
    expect(await feedbackOf(13192, 15080, 10)).toMatchObject({ reading: { read: 1000 } })
    expect(feedbackPages()).toEqual([])
    // Six hours and a minute: gone, every step with it — the step asked begins again at page one.
    vi.setSystemTime(clock + (6 * 60 + 1) * 60 * 1000)
    expect(await feedbackOf(13192, 15080, 10)).toMatchObject({ pages: 10, reading: { read: 500 } })
    expect(feedbackPages()).toEqual([0, 1, 2, 3, 4])
  })

  it('a failed step is „ungelesen", caches nothing of it, and the steps before stand', async () => {
    sizedPortal(1234)
    await feedbackOf(13192, 15080, 5)
    upstreamJson.mockImplementation(async (url: string) => {
      asked.push(url)
      if (url.includes('/brpapi/groupInitiatives/13192')) return fixture('initiative-13192')
      throw new Error('timeout')
    })
    expect(await feedbackOf(13192, 15080, 10)).toEqual({ state: 'ungelesen' })
    expect(nitroCacheKeys().some((k) => k.includes('-s10|'))).toBe(false)
    sizedPortal(1234)
    asked = []
    expect(await feedbackOf(13192, 15080, 10)).toMatchObject({ pages: 10, reading: { read: 1000 } })
    expect(feedbackPages()).toEqual([5, 6, 7, 8, 9])
  })

  it('answers no step that is none: only multiples of five up to fifty', async () => {
    sizedPortal(1234)
    for (const pages of [0, 3, 7, 55, 1000]) expect(await feedbackOf(13192, 15080, pages), String(pages)).toEqual({ state: 'unbekannt' })
    expect(feedbackPages()).toEqual([])
  })

  it('keeps the naming rule on every cached step: a counted row keeps no day, no number, no name', async () => {
    sizedPortal(1234)
    await feedbackOf(13192, 15080, 10)
    const { rowOf } = await import('../server/utils/eu/portalFeedback')
    expect(JSON.stringify(rowOf({ userType: 'EU_CITIZEN', status: 'PUBLISHED', country: 'AUT', firstName: 'Erfunden', surname: 'Beispiel', id: 5, dateFeedback: '2026/11/10 10:00:00' }))).not.toMatch(/Erfunden|Beispiel|date|"id"/)
  })
})
