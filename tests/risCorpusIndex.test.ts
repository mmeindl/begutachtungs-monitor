import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearNitroCache, nitroCachedFunction } from './helpers/nitroCache'
import { nitroCacheSource } from './helpers/nitropack'

/**
 * One RIS record without parsing the corpus (`server/utils/ris/begutCorpus.ts`,
 * `getRisBegutRecord`, 26.10.2026).
 *
 * The index is the corpus's own, so what is held here is that it never
 * answers differently from a read of the corpus: the same record for every
 * id, a fresh copy each time, and once the cache no longer holds the corpus
 * it was built with — evicted, or past its lifetime — the read of the corpus
 * itself, with a fresh build and that build's failure. The last block holds
 * the key the cache is asked about to the one nitropack stores under.
 */

const options = new Map<string, { name: string; base?: string; getKey?: () => string }>()
const calls = new Map<string, number>()
vi.stubGlobal('defineCachedFunction', (fn: (...a: unknown[]) => Promise<unknown>, opts: { name: string }) => {
  options.set(opts.name, opts)
  const cached = nitroCachedFunction(fn, opts)
  return (...args: unknown[]) => {
    calls.set(opts.name, (calls.get(opts.name) ?? 0) + 1)
    return cached(...args)
  }
})
let corpusStored = true
const hasItem = vi.fn(async (_key: string) => corpusStored)
vi.stubGlobal('useStorage', () => ({ hasItem }))
vi.stubGlobal('DERIVED_CACHE', '/derived')

vi.mock('../server/utils/upstream/fetch', () => ({ RIS_API_BASE: 'https://ris.example', risJson: vi.fn(), sleep: vi.fn(async () => {}) }))
// The test's documents are records already: flattening is `risRecord.test.ts`'s subject, not this one's.
vi.mock('../server/utils/ris/risRecord', async (original) => ({ ...(await original<object>()), flattenRisRecord: (doc: unknown) => doc }))

const { risJson } = vi.mocked(await import('../server/utils/upstream/fetch'))

const record = (id: string, titel: string) => ({
  id, titel, kurztitel: null, beginn: '2026-10-01', ende: '2026-11-12', stelle: 'BMJ', geaendert: null,
  mainDocument: { html: `https://ris.example/${id}.html`, xml: null, pdf: null },
  textComparison: null, textComparisonParts: [], explanations: null, coverLetter: null, otherDocuments: [],
})

function upstream(records: unknown[]): void {
  risJson.mockResolvedValue({ OgdDocumentResults: { OgdDocumentReference: records, Hits: { '#text': String(records.length) } } } as never)
}

const first = [record('BEGUT_A', 'Strafvollzugsnovelle („StVG“) – Entwurf'), record('BEGUT_B', 'Verordnung über die Höchstbeitragsgrundlage'), record('BEGUT_C', 'Ärztegesetz')]

async function load() {
  vi.resetModules()
  return import('../server/utils/ris/begutCorpus')
}

beforeEach(() => {
  clearNitroCache()
  calls.clear()
  hasItem.mockClear()
  corpusStored = true
  risJson.mockReset()
  upstream(first)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('a record by id', () => {
  it('is what the corpus holds under that id, read without the corpus', async () => {
    const { getRisBegutCorpus, getRisBegutRecord } = await load()
    const corpus = await getRisBegutCorpus()
    for (const id of ['BEGUT_A', 'BEGUT_B', 'BEGUT_C', 'BEGUT_NONE']) {
      expect(await getRisBegutRecord(id)).toEqual(corpus.records.find((r) => r.id === id) ?? null)
    }
    // One call: the build. The four lookups did not read the corpus again.
    expect(calls.get('ris-begut-corpus')).toBe(1)
  })

  it('is a fresh copy every time, so no reader changes another\'s', async () => {
    const { getRisBegutCorpus, getRisBegutRecord } = await load()
    await getRisBegutCorpus()
    const one = (await getRisBegutRecord('BEGUT_A'))!
    one.titel = 'changed by a reader'
    expect((await getRisBegutRecord('BEGUT_A'))!.titel).toBe('Strafvollzugsnovelle („StVG“) – Entwurf')
  })

  it('builds the corpus where there is none yet, and answers from that build', async () => {
    const { getRisBegutRecord } = await load()
    expect(await getRisBegutRecord('BEGUT_B')).toMatchObject({ titel: 'Verordnung über die Höchstbeitragsgrundlage' })
    expect(risJson).toHaveBeenCalledTimes(1)
  })
})

describe('only while the cache holds the corpus it came from', () => {
  it('reads a fresh corpus once the old one was pushed out — as a read of the corpus would', async () => {
    const { getRisBegutCorpus, getRisBegutRecord } = await load()
    await getRisBegutCorpus()
    clearNitroCache()
    corpusStored = false
    upstream([record('BEGUT_A', 'Strafvollzugsnovelle 2026')])
    expect(await getRisBegutRecord('BEGUT_A')).toMatchObject({ titel: 'Strafvollzugsnovelle 2026' })
    expect(await getRisBegutRecord('BEGUT_B')).toBeNull()
    expect(risJson).toHaveBeenCalledTimes(2)
  })

  it('reads the corpus again where the index cannot vouch for it, and answers the same', async () => {
    const { getRisBegutCorpus, getRisBegutRecord } = await load()
    const corpus = await getRisBegutCorpus()
    // The cache says the entry is gone, yet still serves it: the read decides.
    corpusStored = false
    expect(await getRisBegutRecord('BEGUT_C')).toEqual(corpus.records[2])
    expect(calls.get('ris-begut-corpus')).toBe(2)
    expect(risJson).toHaveBeenCalledTimes(1)
  })

  it('stops at the corpus\'s lifetime of 20 hours and builds anew', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-26T04:30:00Z'))
    const { getRisBegutCorpus, getRisBegutRecord } = await load()
    await getRisBegutCorpus()
    upstream([record('BEGUT_A', 'Strafvollzugsnovelle 2026')])
    vi.setSystemTime(new Date('2026-10-27T00:29:59Z'))
    expect(await getRisBegutRecord('BEGUT_A')).toMatchObject({ titel: 'Strafvollzugsnovelle („StVG“) – Entwurf' })
    vi.setSystemTime(new Date('2026-10-27T00:30:01Z'))
    expect(await getRisBegutRecord('BEGUT_A')).toMatchObject({ titel: 'Strafvollzugsnovelle 2026' })
  })

  it('fails as the build fails, where the corpus is gone and RIS does not answer', async () => {
    const { getRisBegutCorpus, getRisBegutRecord } = await load()
    await getRisBegutCorpus()
    clearNitroCache()
    corpusStored = false
    risJson.mockRejectedValue(new Error('RIS down'))
    await expect(getRisBegutRecord('BEGUT_A')).rejects.toMatchObject({ statusCode: 502 })
  })
})

describe('what the index rests on: nitropack', () => {
  it('asks the cache for the key the corpus is stored under', async () => {
    const { getRisBegutCorpus, getRisBegutRecord } = await load()
    await getRisBegutCorpus()
    await getRisBegutRecord('BEGUT_A')
    const opts = options.get('ris-begut-corpus')!
    // nitropack 2.13: `[opts.base, group, name, key + ".json"].filter(Boolean).join(":")`.
    expect(hasItem).toHaveBeenCalledWith([opts.base, 'nitro/functions', opts.name, `${opts.getKey!()}.json`].join(':'))
    const source = nitroCacheSource()
    expect(source).toContain('const group = opts.group || "nitro/functions";')
    expect(source).toContain('const cacheKey = [opts.base, group, name, key + ".json"].filter(Boolean).join(":")')
  })
})
