import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PAGE_CONCURRENCY, readPages, risPageCount } from '../server/utils/upstream/pages'
import { RisEnvelopeError } from '../server/utils/upstream/fetch'
import { clearNitroCache, nitroCacheKeys, nitroCachedFunction } from './helpers/nitroCache'

/**
 * Paged upstream reads — page 1 alone, the rest together once page 1 has
 * stated the total (`server/utils/upstream/pages.ts`, 12.11.2026).
 *
 * The readers walk the pages as their sequential loops did, so what has to
 * hold is what those loops guaranteed: the rows in page order, whatever
 * order the pages arrive in; one failed page failing the read with nothing
 * stored; a count that disagrees with the rows ending or failing the read
 * as before; and a one-page answer costing one request. The first block
 * drives the helper with deferred promises, so the arrival order is the
 * test's choice; the second runs the real RIS readers against a fake
 * `fetch`, the seam every upstream request goes through.
 */

vi.stubGlobal('defineCachedFunction', nitroCachedFunction)
// `kons/konsCache.ts` reads the layer name as a Nitro auto-import.
vi.stubGlobal('DERIVED_CACHE', '/derived')

const { konsRecordsOfNummer, paragraphHistory, resolveLawByBgbl } = await import('../server/utils/ris/konsLaw')
const { readKonsRecords, resolveKonsLaw, konsRecordsSettled } = await import('../server/utils/kons/konsCache')
const { lawsOfBgbl } = await import('../server/utils/ris/bgblLaws')

/** A promise the test resolves by hand. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (err: unknown) => void } {
  let resolve!: (value: T) => void
  let reject!: (err: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('readPages — the helper', () => {
  it('asks page 1 alone, then the rest at most PAGE_CONCURRENCY at a time, and keeps page order', async () => {
    const pending = new Map<number, ReturnType<typeof deferred<string>>>()
    let inFlight = 0
    let most = 0
    const fetchPage = (page: number) => {
      const d = deferred<string>()
      pending.set(page, d)
      inFlight++
      most = Math.max(most, inFlight)
      return d.promise.finally(() => inFlight--)
    }
    const read = readPages(fetchPage, () => 9, 20)
    await flush()
    expect([...pending.keys()]).toEqual([1])
    pending.get(1)!.resolve('p1')
    await flush()
    expect([...pending.keys()]).toEqual([1, 2, 3, 4, 5])
    // Arrive backwards: the answer is still in page order.
    for (const page of [9, 8, 7, 6, 5, 4, 3, 2]) {
      await flush()
      pending.get(page)?.resolve(`p${page}`)
      await flush()
      for (const [p, d] of pending) if (p > 1) d.resolve(`p${p}`)
    }
    const pages = await read
    expect(pages.prefetched).toBe(9)
    expect(await Promise.all(Array.from({ length: 9 }, (_, i) => pages.get(i + 1)))).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'])
    expect(most).toBe(PAGE_CONCURRENCY)
  })

  it('does no extra work where page 1 is the only page — or says nothing usable', async () => {
    for (const count of [1, 0, -3, Number.NaN]) {
      const asked: number[] = []
      const pages = await readPages(async (page) => (asked.push(page), page), () => count, 20)
      expect(asked).toEqual([1])
      expect(pages.prefetched).toBe(1)
    }
  })

  it('stops at the ceiling, and fetches a page past what page 1 counted only when the walk asks for it', async () => {
    const asked: number[] = []
    const pages = await readPages(async (page) => (asked.push(page), page), () => 50, 3)
    expect(asked).toEqual([1, 2, 3])
    expect(await pages.get(4)).toBe(4)
    expect(asked).toEqual([1, 2, 3, 4])
  })

  it('fails the whole read when one page fails, and pulls no further page after it', async () => {
    const asked: number[] = []
    const read = readPages(
      async (page) => {
        asked.push(page)
        if (page === 2) throw new Error('page 2')
        await flush()
        return page
      },
      () => 12,
      20,
      2,
    )
    await expect(read).rejects.toThrow('page 2')
    await flush()
    await flush()
    // Page 3 was in flight beside page 2; nothing after it was started.
    expect(asked).toEqual([1, 2, 3])
  })

  it('counts pages of a hundred, rounding up', () => {
    expect(risPageCount(0)).toBe(0)
    expect(risPageCount(100)).toBe(1)
    expect(risPageCount(101)).toBe(2)
    expect(risPageCount(1151)).toBe(12)
    expect(risPageCount(21, 20)).toBe(2)
  })
})

/** One § of the Ärztegesetz 1998 as a BrKons record. */
function paragraph(n: number, gesetzesnummer = '10011138') {
  const nor = `NOR4${String(n).padStart(7, '0')}`
  return {
    Data: {
      Metadaten: {
        Technisch: { ID: nor },
        Bundesrecht: {
          Kurztitel: 'Ärztegesetz 1998',
          BrKons: {
            ArtikelParagraphAnlage: `§ ${n}`,
            Paragraphnummer: String(n),
            Gesetzesnummer: gesetzesnummer,
            StammnormPublikationsorgan: 'BGBl. I Nr.',
            StammnormBgblnummer: '169/1998',
            Kundmachungsorgan: 'BGBl. I Nr. 169/1998 zuletzt geändert durch BGBl. I Nr. 21/2024',
          },
        },
      },
      Dokumentliste: { ContentReference: { ContentType: 'MainDocument', Urls: { ContentUrl: [{ DataType: 'Xml', Url: `https://www.ris.bka.gv.at/Dokumente/Bundesnormen/${nor}/${nor}.xml` }] } } },
    },
  }
}

/** A BrKons page: `hits` as RIS counts them, and §§ `from`…`to`. */
function page(hits: number, from: number, to: number) {
  const refs = Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => paragraph(from + i))
  return { OgdSearchResult: { OgdDocumentResults: { Hits: { '#text': String(hits) }, OgdDocumentReference: refs } } }
}

const ENVELOPE = { OgdSearchResult: { Error: { Applikation: 'BrKons', Message: 'Die Abfrage konnte nicht durchgeführt werden.' } } }

/** What RIS answers for page N; `requests` lists every page asked, in order. */
let answer: (page: number) => unknown
let requests: number[] = []
let inFlight = 0
let most = 0

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

/** The promise, with the fake clock run until it settles — the retries wait 600 and 1200 ms. */
async function settled<T>(promise: Promise<T>): Promise<T> {
  const outcome = promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  )
  await vi.runAllTimersAsync()
  const result = await outcome
  if (!result.ok) throw result.error
  return result.value
}

describe('the RIS readers over it', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    requests = []
    inFlight = 0
    most = 0
    clearNitroCache()
    vi.stubGlobal('fetch', async (url: string) => {
      const p = Number(new URL(url).searchParams.get('Seitennummer'))
      requests.push(p)
      inFlight++
      most = Math.max(most, inFlight)
      // Let the other workers start before this one answers.
      await Promise.resolve()
      await Promise.resolve()
      inFlight--
      return json(answer(p))
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.stubGlobal('defineCachedFunction', nitroCachedFunction)
    vi.stubGlobal('DERIVED_CACHE', '/derived')
  })

  it('paragraphHistory: twelve pages, every row in page order, four in flight at most', async () => {
    answer = (p) => page(1150, (p - 1) * 100 + 1, Math.min(p * 100, 1150))
    const history = await settled(paragraphHistory('10011138'))
    expect(history?.map((v) => v.ref.id)).toEqual(Array.from({ length: 1150 }, (_, i) => String(i + 1)))
    expect(requests[0]).toBe(1)
    expect([...requests].sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1))
    expect(most).toBeLessThanOrEqual(PAGE_CONCURRENCY)
    expect(most).toBeGreaterThan(1)
  })

  it('a one-page answer costs one request', async () => {
    answer = () => page(2, 1, 2)
    expect((await settled(konsRecordsOfNummer('169/1998', '2026-04-10'))).map((r) => r.ref.label)).toEqual(['§ 1', '§ 2'])
    expect(requests).toEqual([1])
  })

  it('an implausible count still throws on page 1, without fetching the other pages', async () => {
    answer = () => page(441_147, 1, 100)
    await expect(settled(konsRecordsOfNummer('169/1998', '2026-04-10'))).rejects.toThrow(/RIS ignorierte den Filter/)
    expect(requests).toEqual([1])
  })

  it('a count the rows do not reach ends the walk where it always did — at the first empty page', async () => {
    // RIS counts 300 and serves 100: page 2 is empty, page 3 is never read.
    answer = (p) => (p === 1 ? page(300, 1, 100) : page(300, 0, -1))
    expect(await settled(konsRecordsOfNummer('169/1998', '2026-04-10'))).toHaveLength(100)
  })

  it('a count that grows between pages is read off each page, and the walk fetches what page 1 did not name', async () => {
    answer = (p) => (p === 1 ? page(150, 1, 100) : p === 2 ? page(250, 101, 200) : page(250, 201, 250))
    const records = await settled(konsRecordsOfNummer('169/1998', '2026-04-10'))
    expect(records.map((r) => r.ref.id)).toEqual(Array.from({ length: 250 }, (_, i) => String(i + 1)))
    expect(requests).toEqual([1, 2, 3])
  })

  it('a failed page fails the read, and nothing is stored', async () => {
    answer = (p) => (p === 3 ? ENVELOPE : page(450, (p - 1) * 100 + 1, Math.min(p * 100, 450)))
    await expect(settled(readKonsRecords('169/1998', '2026-04-10'))).rejects.toBeInstanceOf(RisEnvelopeError)
    await expect(settled(lawsOfBgbl('Bundesgesetzblatt I Nr. 169/1998'))).rejects.toBeInstanceOf(RisEnvelopeError)
    expect(nitroCacheKeys()).toEqual([])
  })

  it('resolveLawByBgbl over its records reads what it read before', async () => {
    answer = (p) => page(150, (p - 1) * 100 + 1, Math.min(p * 100, 150))
    const law = await settled(resolveLawByBgbl({ organ: 'BGBl. I Nr.', nummer: '169/1998' }, '2026-04-10', 'Ärztegesetz 1998'))
    expect(law?.gesetzesnummer).toBe('10011138')
    expect(law?.kurztitel).toBe('Ärztegesetz 1998')
    expect(Object.keys(law?.paragraphs ?? {})).toHaveLength(150)
    expect(Object.keys(law?.paragraphs ?? {})[0]).toBe('§ 1')
  })
})

describe('one read per (number, day) under every resolution (`kons/konsCache.ts`)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    requests = []
    clearNitroCache()
    answer = (p) => page(250, (p - 1) * 100 + 1, Math.min(p * 100, 250))
    vi.stubGlobal('fetch', async (url: string) => {
      requests.push(Number(new URL(url).searchParams.get('Seitennummer')))
      return json(answer(requests.at(-1)!))
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.stubGlobal('defineCachedFunction', nitroCachedFunction)
    vi.stubGlobal('DERIVED_CACHE', '/derived')
  })

  it('the § names, the annex check and the amended laws ask with different names — RIS is asked once', async () => {
    const asTitles = await settled(resolveKonsLaw('BGBl. I Nr.', '169/1998', '2026-04-10', 'Änderung des Ärztegesetzes 1998'))
    const asAnnex = await settled(resolveKonsLaw('BGBl. I Nr.', '169/1998', '2026-04-10', 'Ärztegesetz 1998', { name: 'Ärztegesetz 1998', abbreviation: 'ÄrzteG 1998' }))
    expect(asTitles?.gesetzesnummer).toBe('10011138')
    expect(asAnnex?.gesetzesnummer).toBe('10011138')
    expect([...requests].sort((a, b) => a - b)).toEqual([1, 2, 3])
    // Two resolutions, one leaf.
    expect(nitroCacheKeys().filter((k) => k.startsWith('kons-bgbl-fassung:'))).toHaveLength(1)
    expect(nitroCacheKeys().filter((k) => k.startsWith('kons-law-by-bgbl:'))).toHaveLength(2)
  })

  it('another day is another question', async () => {
    await settled(resolveKonsLaw('BGBl. I Nr.', '169/1998', '2026-04-10', ''))
    await settled(resolveKonsLaw('BGBl. I Nr.', '169/1998', '2026-05-13', ''))
    expect(requests).toHaveLength(6)
  })
})

describe('konsRecordsSettled — which stored answers may be served stale', () => {
  const DAY = 24 * 60 * 60 * 1000
  const now = Date.parse('2026-11-12T10:00:00Z')
  const entry = (date: string, ageMs: number) => ({ value: { date, records: [] }, mtime: now - ageMs })

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('anything within its TTL', () => {
    expect(konsRecordsSettled(entry('2026-11-12', DAY / 2))).toBe(true)
  })

  it('past its TTL, a day well before the read — the law then is settled', () => {
    expect(konsRecordsSettled(entry('2026-04-10', 2 * DAY))).toBe(true)
  })

  it('past its TTL, a day within a month of the read — RIS may still work an amendment in', () => {
    expect(konsRecordsSettled(entry('2026-11-05', 2 * DAY))).toBe(false)
    expect(konsRecordsSettled(entry('2026-10-20', 2 * DAY))).toBe(false)
    expect(konsRecordsSettled(entry('2026-10-05', 2 * DAY))).toBe(true)
    expect(konsRecordsSettled(entry('not a date', 2 * DAY))).toBe(false)
  })
})

/**
 * The guard: a paged RIS read added later walks page by page again only on
 * purpose. Every file under server/utils that asks for `Seitennummer` by a
 * page variable reads through `upstream/pages.ts` — or stands here, with
 * the reason its sequence is deliberate.
 */
describe('no paged read walks page by page by accident', () => {
  const SEQUENTIAL: Record<string, string> = {
    'ris/begutCorpus.ts': 'pauses 300 ms between pages on purpose — the whole Begut corpus, 46 pages, read unattended by the prewarm',
    'ris/bgblService.ts': 'a Bundesgesetzblatt year page runs to 3,6 MB; walking a dozen at once would hold them all on a 320 MB heap, and the walk rebuilds from cached pages',
    'harness/risKonsHistory.ts': 'harness-only; the harnesses set their own concurrency over laws, and a reader never waits on it',
  }

  it('reads through readPages, or names its reason', async () => {
    const { readdirSync, readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const utils = join(import.meta.dirname, '..', 'server', 'utils')
    const paged = readdirSync(utils, { encoding: 'utf8', recursive: true })
      .filter((f) => f.endsWith('.ts'))
      .filter((f) => /Seitennummer:\s*String\(page\)/.test(readFileSync(join(utils, f), 'utf8')))
      .map((f) => f.split('\\').join('/'))
    expect(paged.length).toBeGreaterThan(5)
    const unguarded = paged.filter((f) => SEQUENTIAL[f] === undefined && !readFileSync(join(utils, f), 'utf8').includes("from '../upstream/pages'"))
    expect(unguarded, 'A paged RIS read fetches page N+1 only after page N: use `readPages` (`upstream/pages.ts`) or add the file to SEQUENTIAL with its reason.').toEqual([])
    expect(Object.keys(SEQUENTIAL).filter((f) => !paged.includes(f))).toEqual([])
  })
})
