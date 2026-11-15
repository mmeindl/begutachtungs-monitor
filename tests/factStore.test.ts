import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createFactStore } from '../server/utils/cache/factStore'

/*
 * The store on a real disk, in a temp directory (`BM_STATE_DIR`, as
 * `stateDir` reads it on every call). What is tested is the key: which keys
 * name a file, and that a refused one is neither read nor written.
 */
let dir = ''
let before: string | undefined

beforeAll(async () => {
  before = process.env.BM_STATE_DIR
  dir = await mkdtemp(join(tmpdir(), 'bm-factstore-'))
  process.env.BM_STATE_DIR = dir
})

afterAll(async () => {
  if (before === undefined) delete process.env.BM_STATE_DIR
  else process.env.BM_STATE_DIR = before
  await rm(dir, { recursive: true, force: true })
})

const CELEX_KEY = /^3\d{4}[LRDF]\d{4}$/

describe('createFactStore', () => {
  it('keys by GP code by default, and refuses anything else', async () => {
    const store = createFactStore<string>({ subdir: 'by-gp', shape: 1, readerVersion: 1, label: 'test' })
    const file = { ...store.empty(), builtAt: '2026-11-15T00:00:00.000Z', entries: { a: { fingerprint: 'f', readAt: '2026-11-15T00:00:00.000Z', fact: 'x' } } }
    expect(await store.save('XXVIII', file)).toBe(true)
    expect((await store.load('XXVIII'))?.entries.a?.fact).toBe('x')
    expect(await store.save('32024L1069', file)).toBe(false)
    expect(await store.save('../XXVIII', file)).toBe(false)
    expect(await store.load('xxviii')).toBeNull()
    expect(await readdir(join(dir, 'by-gp'))).toEqual(['XXVIII.json'])
  })

  it('takes a custom pattern: its keys name files, others are refused', async () => {
    const store = createFactStore<string>({ subdir: 'by-act', shape: 1, readerVersion: 1, label: 'test', keyPattern: CELEX_KEY })
    const file = store.empty()
    expect(await store.save('32024L1069', file)).toBe(true)
    expect(await store.load('32024L1069')).toMatchObject({ version: 1001, entries: {} })
    // A GP code is no longer a key here, and neither is a path.
    expect(await store.save('XXVIII', file)).toBe(false)
    expect(await store.save('../x', file)).toBe(false)
    expect(await store.save('../32024L1069', file)).toBe(false)
    expect(await store.load('../x')).toBeNull()
    expect(await readdir(join(dir, 'by-act'))).toEqual(['32024L1069.json'])
  })

  it('trusts the pattern alone: an unanchored one lets a path through, so patterns must be anchored', () => {
    // Documents the contract rather than the store: the key is joined into
    // the path as it is, so only an anchored pattern keeps it in its directory.
    expect(/\d{4}/.test('../../x1234')).toBe(true)
    expect(CELEX_KEY.test('../../x1234')).toBe(false)
  })
})
