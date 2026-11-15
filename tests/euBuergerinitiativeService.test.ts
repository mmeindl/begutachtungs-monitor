import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearNitroCache, nitroCacheKeys, nitroCachedFunction } from './helpers/nitroCache'

/**
 * The register of the European Citizens' Initiative, through the service
 * (`server/utils/eu/eciService.ts`): three states for one initiative (found,
 * unknown only on a proven 404, not read), the list null on failure — never
 * empty —, nothing failed cached, and the initiatives in collection read in
 * sequence with a row kept, not dropped, where its details failed or are
 * still being read.
 *
 * The register is a fake: the list of 15.11.2026 and the details fixtures.
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
const { eciByNumber, eciList, eciOpen } = await import('../server/utils/eu/eciService')

const fixture = (name: string): Record<string, unknown> => JSON.parse(readFileSync(new URL(`./fixtures/eu-eci/${name}.json`, import.meta.url), 'utf8'))

/** A list of two in collection (ECI(2026)000009 from the fixture and ECI(2026)000007), one answered. */
function smallList() {
  const all = fixture('search-de').entries as Record<string, unknown>[]
  const entries = all.filter((e) => (e.year === '2026' && (e.number === '000009' || e.number === '000007')) || (e.year === '2022' && e.number === '000002'))
  return { ...fixture('search-de'), recordsFound: entries.length, entries }
}

let asked: string[] = []
function register(answers: { list?: () => unknown; details?: (path: string) => unknown } = {}) {
  upstreamJson.mockImplementation(async (url: string) => {
    asked.push(url)
    if (url.includes('/search/ALL/DE/')) return (answers.list ?? smallList)()
    const m = /\/details\/(\d{4})\/(\d{6})$/.exec(url)
    if (m) {
      if (answers.details) return answers.details(`${m[1]}/${m[2]}`)
      if (`${m[1]}/${m[2]}` === '2026/000009') return fixture('details-ongoing')
      if (`${m[1]}/${m[2]}` === '2022/000002') return fixture('details-answered')
      throw new UpstreamHttpError(404, url)
    }
    throw new Error(`unexpected ${url}`)
  })
}

beforeEach(() => {
  asked = []
  clearNitroCache()
  upstreamJson.mockReset()
})
afterEach(() => vi.clearAllMocks())

describe('one initiative, through the service', () => {
  it('is found, and cached under its number', async () => {
    register()
    const r = await eciByNumber(2022, 2)
    expect(r.state).toBe('gefunden')
    if (r.state === 'gefunden') expect(r.initiative.reference).toBe('ECI(2022)000002')
    await eciByNumber(2022, 2)
    expect(asked.filter((u) => u.includes('/details/'))).toEqual(['https://register.eci.ec.europa.eu/core/api/register/details/2022/000002'])
  })

  it('is unknown only where the register answers 404', async () => {
    register()
    expect(await eciByNumber(2022, 99)).toEqual({ state: 'unbekannt' })
  })

  it('is „not read" for every other failure, and the failure is not cached', async () => {
    register({ details: () => { throw new Error('timeout') } })
    expect(await eciByNumber(2022, 2)).toEqual({ state: 'ungelesen' })
    register({ details: () => ({ unexpected: true }) })
    expect(await eciByNumber(2022, 2)).toEqual({ state: 'ungelesen' })
    expect(nitroCacheKeys().filter((k) => k.startsWith('eu-eci-initiative'))).toEqual([])
    register()
    expect((await eciByNumber(2022, 2)).state).toBe('gefunden')
  })

  it('refuses an answer that names another initiative than the one asked for', async () => {
    register({ details: () => fixture('details-answered') })
    expect(await eciByNumber(2026, 9)).toEqual({ state: 'ungelesen' })
  })
})

describe('the list, through the service', () => {
  it('is null where the register fails — never an empty list — and the failure is not cached', async () => {
    register({ list: () => { throw new Error('timeout') } })
    expect(await eciList()).toBeNull()
    expect(nitroCacheKeys().filter((k) => k.startsWith('eu-eci-liste'))).toEqual([])
    register()
    expect((await eciList())?.entries).toHaveLength(3)
  })
})

describe('the initiatives in collection', () => {
  it('reads the details of each one in collection, in sequence, and gives each its day', async () => {
    register({ details: (p) => (p === '2026/000009' ? fixture('details-ongoing') : { ...fixture('details-ongoing'), comRegNum: 'ECI(2026)000007', deadline: '05/05/2027' }) })
    const open = await eciOpen()
    expect(open?.rows.map((r) => [r.reference, r.deadline, r.details])).toEqual([
      ['ECI(2026)000009', '2027-11-13', 'gelesen'],
      ['ECI(2026)000007', '2027-05-05', 'gelesen'],
    ])
    expect(open?.counts.ongoing).toBe(13)
    // Only the initiatives in collection are asked for, never the answered one.
    expect(asked.filter((u) => u.includes('/details/'))).toEqual([
      'https://register.eci.ec.europa.eu/core/api/register/details/2026/000009',
      'https://register.eci.ec.europa.eu/core/api/register/details/2026/000007',
    ])
  })

  it('keeps a row whose details failed, as „not read", and goes on to the next', async () => {
    register()
    const open = await eciOpen()
    expect(open?.rows.map((r) => [r.reference, r.deadline, r.details])).toEqual([
      ['ECI(2026)000009', '2027-11-13', 'gelesen'],
      ['ECI(2026)000007', null, 'ungelesen'],
    ])
  })

  it('keeps a row whose details are not at hand within the budget, as still being read', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    register({ details: async (p) => {
      if (p === '2026/000007') await gate
      return p === '2026/000009' ? fixture('details-ongoing') : { ...fixture('details-ongoing'), comRegNum: 'ECI(2026)000007' }
    } })
    const open = await eciOpen(20)
    expect(open?.rows.map((r) => [r.reference, r.details])).toEqual([
      ['ECI(2026)000009', 'gelesen'],
      ['ECI(2026)000007', 'ausstehend'],
    ])
    release()
  })

  it('is null where the list cannot be read', async () => {
    register({ list: () => { throw new Error('timeout') } })
    expect(await eciOpen()).toBeNull()
  })
})
