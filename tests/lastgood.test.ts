import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StatementMeta } from '../shared/types'
import { loadLastGoodStatements, saveLastGoodStatements } from '../server/utils/lastgood'

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
      fetchedAt: '2026-08-20T00:00:00.000Z',
    })
    await saveLastGoodStatements('XXVIII', 88, {
      items: [statement(), statement({ citation: '3/SN-88/ME' })],
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
      fetchedAt: '2026-08-27T00:00:00.000Z',
    })

    expect(await loadLastGoodStatements('XXVIII', 89)).toBeNull()
    expect(await loadLastGoodStatements('XXVII', 88)).toBeNull()
  })

  it('drops a record written by an older version', async () => {
    await saveLastGoodStatements('XXVIII', 88, {
      items: [statement()],
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
        fetchedAt: '2026-08-27T00:00:00.000Z',
      })
      expect(await loadLastGoodStatements(gp, 88)).toBeNull()
    }
    for (const inr of [0, -1, 1.5, Number.NaN]) {
      await saveLastGoodStatements('XXVIII', inr, {
        items: [statement()],
        fetchedAt: '2026-08-27T00:00:00.000Z',
      })
      expect(await loadLastGoodStatements('XXVIII', inr)).toBeNull()
    }
    // Nothing was written at all — not even a state directory.
    await expect(readdir(join(dir, 'statements'))).rejects.toThrow()
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
        fetchedAt: '2026-08-27T00:00:00.000Z',
      }),
    ).resolves.toBeUndefined()
    expect(await loadLastGoodStatements('XXVIII', 88)).toBeNull()
    // One warning per operation: save and load each report once.
    expect(warn).toHaveBeenCalledTimes(2)
  })
})
