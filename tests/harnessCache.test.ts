import { mkdtempSync, readdirSync, rmSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFetchCache, isBegutSearch, isRisSearch } from '../scripts/lib/harnessCache'

/**
 * The harness cache and the one request it must not answer from disk
 * (20.11.2026).
 *
 * The cache served every URL it held for ever, and the Begut list is one
 * constant URL per page — so every annex and fault-injection round from
 * 09.09.2026 on measured the list of that day, and the weekly drift alarm,
 * whose CI cache is carried from week to week, could not see a new draft.
 * A fake `fetch` stands in for RIS: no test here reaches the network.
 */

const LIST = 'https://data.bka.gv.at/ris/api/v2.6/Bundesrecht?Applikation=Begut&Begut.Gesetzgebungsperiode=XXVIII&DokumenteProSeite=OneHundred&Seitennummer=1'
const KONS = 'https://data.bka.gv.at/ris/api/v2.6/Bundesrecht?Applikation=BrKons&Gesetzesnummer=10008147&Fassung.FassungVom=2026-09-08&DokumenteProSeite=OneHundred&Seitennummer=1'
const DOCUMENT = 'https://www.ris.bka.gv.at/Dokumente/Begut/BEGUT_COO_2026_100_2_2729371/BEGUT_COO_2026_100_2_2729371.xml'

let dir: string
let answers: string[]
let calls: string[]

/** A fake upstream that answers each request with the next body in `answers`. */
function fakeUpstream(): void {
  calls = []
  vi.stubGlobal('fetch', async (input: unknown) => {
    calls.push(String(input))
    return new Response(answers.shift() ?? 'leer', { status: 200 })
  })
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'harness-cache-'))
  answers = []
})

afterEach(() => {
  vi.unstubAllGlobals()
  rmSync(dir, { recursive: true, force: true })
})

describe('isRisSearch', () => {
  it('is a RIS query that pages, without a document address', () => {
    expect(isRisSearch(LIST)).toBe(true)
    expect(isRisSearch(KONS)).toBe(true)
  })

  it('is not a document, a document page or another host', () => {
    expect(isRisSearch(DOCUMENT)).toBe(false)
    expect(isRisSearch('https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=BgblAuth&Dokumentnummer=BGBLA_2024_I_5&Seitennummer=1')).toBe(false)
    expect(isRisSearch('https://data.bka.gv.at/ris/api/v2.6/Bundesrecht?Applikation=Begut&Dokumentnummer=BEGUT_X&Seitennummer=1')).toBe(false)
    expect(isRisSearch('https://www.parlament.gv.at/Filter/api/json/post?jsMode=EVAL&FBEZ=WFW_002&Seitennummer=1')).toBe(false)
    expect(isRisSearch('not a url')).toBe(false)
  })

  it('needs the page parameter: a query without one is not a list', () => {
    expect(isRisSearch('https://data.bka.gv.at/ris/api/v2.6/Bundesrecht?Applikation=Begut')).toBe(false)
  })
})

describe('isBegutSearch', () => {
  it('is the Begut list, not the standing-law lookups the gate holds', () => {
    expect(isBegutSearch(LIST)).toBe(true)
    // Pinned to the Beginn by `Fassung.FassungVom` and some 3.300 per run:
    // fetching these afresh would put every run online and change nothing
    // about the window.
    expect(isBegutSearch(KONS)).toBe(false)
    expect(isBegutSearch(DOCUMENT)).toBe(false)
  })
})

describe('installFetchCache', () => {
  it('answers from disk what it holds, by default', async () => {
    answers = ['erste Liste', 'zweite Liste']
    fakeUpstream()
    installFetchCache(dir)
    expect(await (await fetch(LIST)).text()).toBe('erste Liste')
    expect(await (await fetch(LIST)).text()).toBe('erste Liste')
    expect(calls).toHaveLength(1)
  })

  it('fetches a fresh request every time, even when the disk holds it', async () => {
    answers = ['Liste vom 09.09.', 'Liste vom 20.11.']
    fakeUpstream()
    installFetchCache(dir, { fresh: isBegutSearch })
    expect(await (await fetch(LIST)).text()).toBe('Liste vom 09.09.')
    expect(await (await fetch(LIST)).text()).toBe('Liste vom 20.11.')
    expect(calls).toEqual([LIST, LIST])
  })

  it('still answers everything else from disk', async () => {
    answers = ['Dokument', 'anderes Dokument']
    fakeUpstream()
    installFetchCache(dir, { fresh: isBegutSearch })
    await fetch(DOCUMENT)
    expect(await (await fetch(DOCUMENT)).text()).toBe('Dokument')
    expect(calls).toHaveLength(1)
  })

  it('writes the fresh answer, so an offline replay reads the newest list', async () => {
    answers = ['alt', 'neu']
    fakeUpstream()
    installFetchCache(dir, { fresh: isBegutSearch })
    await fetch(LIST)
    await fetch(LIST)
    expect(readdirSync(dir)).toHaveLength(1)

    vi.unstubAllGlobals()
    fakeUpstream()
    installFetchCache(dir, { fresh: isBegutSearch, replay: true })
    expect(await (await fetch(LIST)).text()).toBe('neu')
    expect(calls).toEqual([])
  })

  it('does not fall back on the disk when the fresh request fails', async () => {
    answers = ['alt']
    fakeUpstream()
    installFetchCache(dir)
    await fetch(LIST)

    vi.unstubAllGlobals()
    vi.stubGlobal('fetch', async () => {
      throw new Error('RIS nicht erreichbar')
    })
    installFetchCache(dir, { fresh: isBegutSearch })
    // An old list served in place of a failed one would be the stale window
    // again, without anyone being told.
    await expect(fetch(LIST)).rejects.toThrow('RIS nicht erreichbar')
  })

  it('says where each fresh-class answer came from, and when it was fetched', async () => {
    answers = ['Liste', 'Dokument']
    fakeUpstream()
    installFetchCache(dir)
    await fetch(LIST)
    const [file] = readdirSync(dir)
    const sept = new Date('2026-09-09T14:49:43.000Z')
    utimesSync(join(dir, file!), sept, sept)

    vi.unstubAllGlobals()
    fakeUpstream()
    const replayed = installFetchCache(dir, { fresh: isBegutSearch, replay: true })
    await fetch(LIST)
    await fetch(DOCUMENT)
    // Only the requests the predicate names are recorded: the list, not the
    // thousands of documents a run reads.
    expect(replayed.served).toEqual([{ url: LIST, fromCache: true, fetchedAt: sept }])

    vi.unstubAllGlobals()
    answers = ['Liste']
    fakeUpstream()
    const live = installFetchCache(dir, { fresh: isBegutSearch })
    const before = Date.now()
    await fetch(LIST)
    expect(live.served).toHaveLength(1)
    expect(live.served[0]!.fromCache).toBe(false)
    expect(live.served[0]!.fetchedAt.getTime()).toBeGreaterThanOrEqual(before)
  })
})
