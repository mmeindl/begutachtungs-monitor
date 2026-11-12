import { join } from 'node:path'
import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LandDraftDetail, LandLawDetail } from '../shared/types'
import type { FakeError, FakeEvent } from './helpers/nitroGlobals'

/**
 * The envelope of the Land draft and Landesgesetz routes
 * (`server/utils/laender/landRoute.ts`): the address checked before the
 * Land is asked, the record read before the route's own work, and an outage
 * answered 503 — never an empty answer, never a 200.
 *
 * What lies behind it — the Land's record and RIS's law page — is mocked;
 * `isError` is h3's auto-import, faked as „carries a status code", which is
 * what separates the fake `createError`'s answers from a thrown `Error`.
 */

vi.mock('../server/utils/laender/sources', () => ({
  isLandNumber: vi.fn((_land: string, number: string) => /^\d+$/.test(number)),
  readLandDraft: vi.fn(),
}))
vi.mock('../server/utils/laender/landLawsService', () => ({
  readLandLawPage: vi.fn(),
  readLandKonsLaws: vi.fn(),
}))
// Only for the comparison route below: one pair it knows, nothing it compares.
vi.mock('../server/utils/laender/landLawDiffService', () => ({
  LAND_TEXT_PAIRS: [['entwurf', 'lgbl']],
  cachedLandComparison: vi.fn(),
}))

const { readLandDraft } = vi.mocked(await import('../server/utils/laender/sources'))
const { readLandLawPage, readLandKonsLaws } = vi.mocked(await import('../server/utils/laender/landLawsService'))
const { landDraftParams, landLawParams, withLandDraft, withLandLaw } = await import('../server/utils/laender/landRoute')

const event = (params: Record<string, string>, query: FakeEvent['__query'] = {}) =>
  ({ __params: params, __query: query }) satisfies FakeEvent as unknown as H3Event

const notADraft: FakeError = { statusCode: 404, statusMessage: 'Entwurf nicht gefunden' }
const notALaw: FakeError = { statusCode: 404, statusMessage: 'Gesetz nicht gefunden' }
const unavailable: FakeError = { statusCode: 503, statusMessage: 'Gerade nicht abrufbar' }

const DRAFT = { draft: { number: '57' } } as unknown as LandDraftDetail
const LAW = { law: { nr: 'LGBl. Nr. 44/2026' } } as unknown as LandLawDetail

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.stubGlobal('isError', (e: unknown) => typeof e === 'object' && e !== null && 'statusCode' in e)
  readLandDraft.mockReset()
  readLandLawPage.mockReset()
  readLandKonsLaws.mockReset()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  warn.mockRestore()
})

describe('landDraftParams', () => {
  it('404s an unknown Land', () => {
    expect(() => landDraftParams(event({ land: 'xx', number: '57' }))).toThrow(expect.objectContaining(notADraft))
  })

  it('404s a number not of the Land\'s shape', () => {
    expect(() => landDraftParams(event({ land: 'sbg', number: 'abc' }))).toThrow(expect.objectContaining(notADraft))
  })

  it('passes a well-formed address through', () => {
    expect(landDraftParams(event({ land: 'sbg', number: '57' }))).toEqual({ land: 'sbg', number: '57' })
  })
})

describe('withLandDraft', () => {
  it('hands the record to the route and returns its answer', async () => {
    readLandDraft.mockResolvedValue(DRAFT)
    const run = vi.fn(async (detail: LandDraftDetail) => ({ got: detail }))
    await expect(withLandDraft('sbg', '57', 'Vergleich', run)).resolves.toEqual({ got: DRAFT })
    expect(readLandDraft).toHaveBeenCalledWith('sbg', '57')
    expect(run).toHaveBeenCalledWith(DRAFT)
  })

  it('404s a number the Land does not know, without running the route', async () => {
    readLandDraft.mockResolvedValue(null)
    const run = vi.fn()
    await expect(withLandDraft('sbg', '57', 'Vergleich', run)).rejects.toEqual(notADraft)
    expect(run).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('passes an H3 error on as it is', async () => {
    const gone: FakeError = { statusCode: 410, statusMessage: 'Nicht mehr veröffentlicht' }
    readLandDraft.mockRejectedValue(gone)
    await expect(withLandDraft('sbg', '57', 'Vergleich', vi.fn())).rejects.toBe(gone)
    expect(warn).not.toHaveBeenCalled()
  })

  it('answers any other failure 503 and logs it under the route\'s label', async () => {
    readLandDraft.mockRejectedValue(new Error('Gate'))
    await expect(withLandDraft('sbg', '57', 'Vergleich', vi.fn())).rejects.toEqual(unavailable)
    expect(warn).toHaveBeenCalledWith('[laender] Vergleich sbg/57:', 'Gate')
  })

  it('answers a failure of the route\'s own work 503 as well', async () => {
    readLandDraft.mockResolvedValue(DRAFT)
    await expect(withLandDraft('sbg', '57', 'Erläuterungen', async () => { throw new Error('PDF') })).rejects.toEqual(unavailable)
    expect(warn).toHaveBeenCalledWith('[laender] Erläuterungen sbg/57:', 'PDF')
  })

  it('logs without a label as the draft\'s own route always has', async () => {
    readLandDraft.mockRejectedValue('kaputt')
    await expect(withLandDraft('w', '12', '', vi.fn())).rejects.toEqual(unavailable)
    expect(warn).toHaveBeenCalledWith('[laender] w/12:', 'kaputt')
  })
})

describe('landLawParams', () => {
  it('404s an unknown Land or a malformed year or number', () => {
    for (const params of [{ land: 'xx', year: '2026', nr: '44' }, { land: 'w', year: '26', nr: '44' }, { land: 'w', year: '2026', nr: '044' }]) {
      expect(() => landLawParams(event(params))).toThrow(expect.objectContaining(notALaw))
    }
  })

  it('passes a well-formed address through as numbers', () => {
    expect(landLawParams(event({ land: 'w', year: '2026', nr: '44' }))).toEqual({ land: 'w', year: 2026, number: 44 })
  })
})

describe('withLandLaw', () => {
  const p = { land: 'w', year: 2026, number: 44 } as const

  it('hands the law\'s page to the route and returns its answer', async () => {
    readLandLawPage.mockResolvedValue(LAW)
    await expect(withLandLaw(p, 'Gesetz', (detail) => detail)).resolves.toBe(LAW)
    expect(readLandLawPage).toHaveBeenCalledWith('w', 2026, 44)
  })

  it('404s a number RIS does not hold', async () => {
    readLandLawPage.mockResolvedValue(null)
    await expect(withLandLaw(p, 'Gesetz', vi.fn())).rejects.toEqual(notALaw)
  })

  it('passes an H3 error on as it is', async () => {
    const busy: FakeError = { statusCode: 503, statusMessage: 'Anders formuliert' }
    readLandLawPage.mockRejectedValue(busy)
    await expect(withLandLaw(p, 'Gesetz', vi.fn())).rejects.toBe(busy)
  })

  it('answers any other failure 503 and logs it under the route\'s label', async () => {
    readLandLawPage.mockRejectedValue(new Error('Index'))
    await expect(withLandLaw(p, 'Vergleich Gesetz', vi.fn())).rejects.toEqual(unavailable)
    expect(warn).toHaveBeenCalledWith('[laender] Vergleich Gesetz w/2026/44:', 'Index')
  })
})

describe('the draft comparison route', () => {
  /*
   * The one route that checks something of its own between the address and
   * the read: an unknown pair is a 400 and asks the Land nothing. Imported
   * by a computed path, as in `draftSubroutes.test.ts`.
   */
  it('refuses an unknown text pair before the Land is read', async () => {
    vi.stubGlobal('defineEventHandler', <T>(handler: T): T => handler)
    const path: string = join(import.meta.dirname, '..', 'server', 'api', 'laender', '[land]', '[number]', 'vergleich.get.ts')
    const { default: handler } = (await import(/* @vite-ignore */ path)) as { default: (event: H3Event) => Promise<unknown> }
    await expect(handler(event({ land: 'sbg', number: '57' }, { von: 'lgbl', bis: 'entwurf' }))).rejects.toEqual({
      statusCode: 400,
      statusMessage: 'Unbekanntes Textpaar',
    })
    expect(readLandDraft).not.toHaveBeenCalled()
  })
})

describe('the geltende-Fassung route of a Landesgesetz', () => {
  /*
   * Outside `withLandLaw` — it reads no law page, only RIS's consolidated
   * Landesrecht by the number — but under the same rule in its catch.
   */
  const route = async () => {
    vi.stubGlobal('defineEventHandler', <T>(handler: T): T => handler)
    const path: string = join(import.meta.dirname, '..', 'server', 'api', 'laender', '[land]', 'lgbl', '[year]', '[nr]', 'geltende-fassung.get.ts')
    return ((await import(/* @vite-ignore */ path)) as { default: (event: H3Event) => Promise<unknown> }).default
  }
  const law = () => event({ land: 'w', year: '2026', nr: '44' })

  it('passes an H3 error on as it is, without reading the law\'s page', async () => {
    const gone: FakeError = { statusCode: 410, statusMessage: 'Nicht mehr veröffentlicht' }
    readLandKonsLaws.mockRejectedValue(gone)
    await expect((await route())(law())).rejects.toBe(gone)
    expect(readLandKonsLaws).toHaveBeenCalledWith('w', 'LGBl. Nr. 44/2026')
    expect(readLandLawPage).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('answers any other failure 503 and logs it under its label', async () => {
    readLandKonsLaws.mockRejectedValue(new Error('LrKons'))
    await expect((await route())(law())).rejects.toEqual(unavailable)
    expect(warn).toHaveBeenCalledWith('[laender] Geltende Fassung w/2026/44:', 'LrKons')
  })
})
