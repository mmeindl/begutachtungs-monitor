import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StatementMeta } from '../shared/types'
import { loadLastGoodStatements, saveLastGoodStatements } from '../server/utils/parliament/lastgood'
import { STATEMENTS_CAP } from '../server/utils/parliament/list142'

function statement(overrides: Partial<StatementMeta> = {}): StatementMeta {
  return {
    citation: '476/SN-88/ME',
    date: '2026-04-08',
    submitterKind: 'organisation',
    submitterName: 'Arbeiterkammer Österreich',
    endorsements: 12,
    parliamentUrl: 'https://www.parlament.gv.at/gegenstand/XXVIII/SNME/3699',
    ...overrides,
  }
}

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'bm-lastgood-'))
  process.env.BM_STATE_DIR = dir
})

afterEach(() => {
  delete process.env.BM_STATE_DIR
  vi.restoreAllMocks()
})

/** The file the store is expected to write for one ME. */
function recordFile(gp: string, inr: number): string {
  return join(dir, 'statements', `${gp}-${inr}.json`)
}

describe('last-good statements store', () => {
  it('round-trips items and the fetch timestamp', async () => {
    const record = {
      items: [statement(), statement({ citation: '2/SN-88/ME' })],
      unlisted: 0,
      fetchedAt: '2026-08-27T06:15:00.000Z',
    }
    await saveLastGoodStatements('XXVIII', 88, record)

    expect(await loadLastGoodStatements('XXVIII', 88)).toEqual(record)
  })

  it('returns null when nothing was ever stored — without warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(await loadLastGoodStatements('XXVIII', 88)).toBeNull()
    expect(warn).not.toHaveBeenCalled()
  })

  it('keeps one record per ME and overwrites it on the next save', async () => {
    await saveLastGoodStatements('XXVIII', 88, {
      items: [statement()],
      unlisted: 0,
      fetchedAt: '2026-08-20T00:00:00.000Z',
    })
    await saveLastGoodStatements('XXVIII', 88, {
      items: [statement(), statement({ citation: '3/SN-88/ME' })],
      unlisted: 0,
      fetchedAt: '2026-08-27T00:00:00.000Z',
    })

    const loaded = await loadLastGoodStatements('XXVIII', 88)
    expect(loaded?.items).toHaveLength(2)
    expect(loaded?.fetchedAt).toBe('2026-08-27T00:00:00.000Z')
    // No temp files left behind, and no second record for the same ME.
    expect(await readdir(join(dir, 'statements'))).toEqual(['XXVIII-88.json'])
  })

  it('separates MEs and GPs', async () => {
    await saveLastGoodStatements('XXVIII', 88, {
      items: [statement()],
      unlisted: 0,
      fetchedAt: '2026-08-27T00:00:00.000Z',
    })

    expect(await loadLastGoodStatements('XXVIII', 89)).toBeNull()
    expect(await loadLastGoodStatements('XXVII', 88)).toBeNull()
  })

  it('drops a record written by an older version', async () => {
    await saveLastGoodStatements('XXVIII', 88, {
      items: [statement()],
      unlisted: 0,
      fetchedAt: '2026-08-27T00:00:00.000Z',
    })
    const file = recordFile('XXVIII', 88)
    const stored = JSON.parse(await readFile(file, 'utf8'))
    await writeFile(file, JSON.stringify({ ...stored, version: 0 }), 'utf8')

    expect(await loadLastGoodStatements('XXVIII', 88)).toBeNull()
  })

  it('treats a truncated or corrupt record as nothing stored', async () => {
    await saveLastGoodStatements('XXVIII', 88, {
      items: [statement()],
      unlisted: 0,
      fetchedAt: '2026-08-27T00:00:00.000Z',
    })
    const file = recordFile('XXVIII', 88)
    const raw = await readFile(file, 'utf8')
    await writeFile(file, raw.slice(0, Math.floor(raw.length / 2)), 'utf8')

    expect(await loadLastGoodStatements('XXVIII', 88)).toBeNull()
  })

  it('never serves an empty list as last-good — that is what the outage looks like', async () => {
    await mkdir(join(dir, 'statements'), { recursive: true })
    await writeFile(
      recordFile('XXVIII', 88),
      JSON.stringify({ version: 1, items: [], fetchedAt: '2026-08-27T00:00:00.000Z' }),
      'utf8',
    )

    expect(await loadLastGoodStatements('XXVIII', 88)).toBeNull()
  })

  it('refuses to build a path from anything but a GP code and a positive INR', async () => {
    for (const gp of ['../..', 'XXVIII/../..', '', 'xxviii']) {
      await saveLastGoodStatements(gp, 88, {
        items: [statement()],
        unlisted: 0,
        fetchedAt: '2026-08-27T00:00:00.000Z',
      })
      expect(await loadLastGoodStatements(gp, 88)).toBeNull()
    }
    for (const inr of [0, -1, 1.5, Number.NaN]) {
      await saveLastGoodStatements('XXVIII', inr, {
        items: [statement()],
        unlisted: 0,
        fetchedAt: '2026-08-27T00:00:00.000Z',
      })
      expect(await loadLastGoodStatements('XXVIII', inr)).toBeNull()
    }
    // Nothing was written at all — not even a state directory.
    await expect(readdir(join(dir, 'statements'))).rejects.toThrow()
  })

  /* Above STATEMENTS_CAP the record holds the institutions and counts the
   * rest (22.10.2026). Without the count a recalled record would present
   * 117 institutions as all of a draft's 106,183 Stellungnahmen. */
  it('round-trips the count of the rows a capped list did not read', async () => {
    const record = {
      items: [statement(), statement({ citation: '2/SN-88/ME' })],
      unlisted: 106_181,
      fetchedAt: '2026-10-22T06:00:00.000Z',
    }
    await saveLastGoodStatements('XXVII', 164, record)

    expect(await loadLastGoodStatements('XXVII', 164)).toEqual(record)
    expect(JSON.parse(await readFile(recordFile('XXVII', 164), 'utf8')).version).toBe(2)
  })

  /* Version 1 predates `unlisted`, and every record of it was a list read
   * whole — so it is read, as one, rather than dropped with the fallback it
   * is for. */
  it('reads a version-1 record as a whole list', async () => {
    await mkdir(join(dir, 'statements'), { recursive: true })
    await writeFile(
      recordFile('XXVIII', 88),
      JSON.stringify({ version: 1, items: [statement()], fetchedAt: '2026-09-18T00:00:00.000Z' }),
      'utf8',
    )

    expect(await loadLastGoodStatements('XXVIII', 88)).toEqual({
      items: [statement()],
      unlisted: 0,
      fetchedAt: '2026-09-18T00:00:00.000Z',
    })
  })

  /* A version-1 record above the cap is the whole list of a mass draft, or
   * at exactly 100,000 rows one `showAll` cut short (164/ME: 100,000 of
   * 106,183, 19 MB on disk). Either would bring back on the failure path
   * the load the cap took away — and the second would serve wrong counts. */
  it('refuses a record that holds more rows than the cap', async () => {
    await mkdir(join(dir, 'statements'), { recursive: true })
    const items = Array.from({ length: STATEMENTS_CAP + 1 }, (_, i) =>
      statement({ citation: `${i + 1}/SN-164/ME`, submitterKind: 'person', submitterName: null }))
    await writeFile(
      recordFile('XXVII', 164),
      JSON.stringify({ version: 1, items, fetchedAt: '2026-10-21T22:27:20.000Z' }),
      'utf8',
    )
    expect(await loadLastGoodStatements('XXVII', 164)).toBeNull()

    // At the cap it is a list like any other.
    await writeFile(
      recordFile('XXVII', 164),
      JSON.stringify({ version: 1, items: items.slice(0, STATEMENTS_CAP), fetchedAt: '2026-10-21T22:27:20.000Z' }),
      'utf8',
    )
    expect((await loadLastGoodStatements('XXVII', 164))?.items).toHaveLength(STATEMENTS_CAP)
  })

  it('treats a version-2 record without a sound `unlisted` as nothing stored', async () => {
    await mkdir(join(dir, 'statements'), { recursive: true })
    for (const unlisted of [undefined, -1, 1.5, '3', null]) {
      await writeFile(
        recordFile('XXVIII', 88),
        JSON.stringify({ version: 2, items: [statement()], unlisted, fetchedAt: '2026-10-22T00:00:00.000Z' }),
        'utf8',
      )
      expect(await loadLastGoodStatements('XXVIII', 88), String(unlisted)).toBeNull()
    }
  })

  /* What leaves the store is held against TODAY's classifier (22.10.2026).
   * A record of 18.09.2026, written three tightenings ago, went on serving
   * the names the classifier of that day let through — on exactly the
   * drafts list 142 had dropped, which is when the store is read. Synthetic
   * names; each shape is one the classifier stopped publishing. */
  it('withholds every stored name today\'s classifier would not print, and keeps the rows', async () => {
    await mkdir(join(dir, 'statements'), { recursive: true })
    const items = [
      statement({ citation: '1/SN-88/ME', submitterName: 'Arbeiterkammer Musterstadt' }),
      statement({ citation: '2/SN-88/ME', submitterName: 'Muster, Max; Universität Musterstadt' }),
      statement({ citation: '3/SN-88/ME', submitterName: 'Muster GmbH; Mag. Max Muster' }),
      statement({ citation: '4/SN-88/ME', submitterName: 'Musterverein Musterstadt*Obmann*Max Muster' }),
      statement({ citation: '5/SN-88/ME', submitterKind: 'person', submitterName: null }),
    ]
    await writeFile(
      recordFile('XXVIII', 88),
      JSON.stringify({ version: 1, items, fetchedAt: '2026-09-18T00:00:00.000Z' }),
      'utf8',
    )

    const loaded = await loadLastGoodStatements('XXVIII', 88)
    expect(loaded?.items.map((i) => [i.citation, i.submitterKind, i.submitterName])).toEqual([
      ['1/SN-88/ME', 'organisation', 'Arbeiterkammer Musterstadt'],
      ['2/SN-88/ME', 'person', null],
      ['3/SN-88/ME', 'person', null],
      ['4/SN-88/ME', 'person', null],
      ['5/SN-88/ME', 'person', null],
    ])
    // The rest of each row is public and stays: date, Zustimmungen, link.
    expect(loaded?.items[1]).toMatchObject({ date: '2026-04-08', endorsements: 12 })
  })

  /* Going forward the record carries list 142's TYP flag beside each name,
   * so a later classifier can apply its veto too — and the flag stays in
   * the store: what is served is the API's six fields. */
  it('stores the TYP flag, applies it on the way out, and never serves it', async () => {
    await saveLastGoodStatements('XXVIII', 88, {
      items: [
        { ...statement({ citation: '1/SN-88/ME', submitterName: 'Muster Energie GmbH' }), upstreamFlag: 'I' },
        { ...statement({ citation: '2/SN-88/ME', submitterName: 'Muster Energie GmbH' }), upstreamFlag: 'P' },
      ],
      unlisted: 0,
      fetchedAt: '2026-10-22T00:00:00.000Z',
    })
    const file = JSON.parse(await readFile(recordFile('XXVIII', 88), 'utf8')) as { items: { upstreamFlag?: string }[] }
    expect(file.items.map((i) => i.upstreamFlag)).toEqual(['I', 'P'])

    const loaded = await loadLastGoodStatements('XXVIII', 88)
    expect(loaded?.items.map((i) => i.submitterName)).toEqual(['Muster Energie GmbH', null])
    expect(loaded?.items.some((i) => 'upstreamFlag' in i)).toBe(false)
  })

  /**
   * Must stay the ONLY test that provokes an I/O failure: the warning is
   * emitted once per process and operation (warnOnce), so a second such
   * test would silently assert nothing.
   */
  it('a broken data directory degrades the fallback instead of throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // A file where the store wants its directory → ENOTDIR on mkdir and read.
    process.env.BM_STATE_DIR = join(dir, 'blocked')
    await writeFile(join(dir, 'blocked'), 'not a directory', 'utf8')

    await expect(
      saveLastGoodStatements('XXVIII', 88, {
        items: [statement()],
        unlisted: 0,
        fetchedAt: '2026-08-27T00:00:00.000Z',
      }),
    ).resolves.toBeUndefined()
    expect(await loadLastGoodStatements('XXVIII', 88)).toBeNull()
    // One warning per operation: save and load each report once.
    expect(warn).toHaveBeenCalledTimes(2)
  })
})
