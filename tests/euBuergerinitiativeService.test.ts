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
// Only the request is a fake. The error classes are the client's own: the
// service tells a 404 by them, and its log line reads them (`failureReason`).
vi.mock('../server/utils/upstream/fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../server/utils/upstream/fetch')>()),
  upstreamJson: vi.fn(),
}))

const { upstreamJson, UpstreamHttpError, UpstreamUnreachableError } = vi.mocked(await import('../server/utils/upstream/fetch'))
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

/** The log line of a failed list read (`eciList`); silenced, and read by the test that is about it. */
let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  asked = []
  clearNitroCache()
  upstreamJson.mockReset()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.clearAllMocks()
  warn.mockRestore()
})

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

  it('says why in the log: the kind of the failure, and nothing of the answer', async () => {
    // What the client throws for a body that is no JSON. The runtime's message quotes the body; the name is invented.
    const quoting = new SyntaxError(`Unexpected token 'E', "Erika Must"... is not valid JSON`)
    register({ list: () => { throw new UpstreamUnreachableError('https://register.eci.ec.europa.eu/core/api/register/search/ALL/DE/0/0', quoting) } })
    expect(await eciList()).toBeNull()
    expect(warn.mock.calls).toEqual([['[eu] Register der Bürgerinitiative nicht abrufbar:', 'nicht erreichbar (Antwort ist kein JSON)']])
  })

  it('is silent where the list reads', async () => {
    register()
    await eciList()
    expect(warn).not.toHaveBeenCalled()
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
