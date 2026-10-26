import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import memoryDriver, { createMemoryLru, ENTRY_OVERHEAD, pack, unpack } from '../server/utils/cache/memoryDriver'

/**
 * The production memory of both cache layers (`server/utils/cache/memoryDriver.ts`).
 *
 * Three promises are held here: what it counts is what the heap holds, so
 * the budget in `nuxt.config.ts` means heap bytes; what goes in comes out
 * exactly, so no answer changes for being cached; and an entry leaves once
 * Nitro would no longer serve it — never before, which is what the last
 * block holds against the installed nitropack.
 */

const MB = 1024 * 1024
/** A cache entry as Nitro writes it: German text with „“ makes V8 keep the string at two bytes per character. */
const entry = (text: string) => JSON.stringify({ value: { titel: text }, mtime: 1 })

describe('pack', () => {
  it('round-trips every string JSON.stringify writes, byte for byte', () => {
    for (const text of [
      entry('Änderung des Allgemeinen Sozialversicherungsgesetzes („ASVG-Novelle“) – § 5 Abs. 2'),
      entry('ß, ä, ö, ü, €, 😀 and a lone surrogate \ud800 that JSON escapes'),
      entry(''),
      'plain ascii',
    ]) {
      expect(unpack(pack(text))).toBe(text)
    }
  })

  it('holds one byte per UTF-8 byte, whatever the text', () => {
    const text = entry('Bundesgesetz, mit dem das Allgemeine Sozialversicherungsgesetz geändert wird („ASVG-Novelle“) – '.repeat(100))
    const packed = pack(text)
    expect(packed.length).toBe(Buffer.byteLength(text))
    // One-byte: every character fits Latin-1, so V8 keeps it at a byte each.
    expect(/[Ā-￿]/.test(packed)).toBe(false)
    // The text itself is the two-byte case this exists for: 2 bytes per character.
    expect(/[Ā-￿]/.test(text)).toBe(true)
    expect(packed.length).toBeLessThan(text.length * 2 * 0.6)
  })
})

describe('the LRU', () => {
  it('counts key, UTF-8 bytes and the bookkeeping, and nothing else', () => {
    const lru = createMemoryLru({ maxSize: MB, max: 100 })
    const value = entry('„Entwurf“')
    lru.set('nitro:functions:gegenstand:XXVIII-ME-1.json', value)
    expect(lru.calculatedSize).toBe('nitro:functions:gegenstand:XXVIII-ME-1.json'.length + Buffer.byteLength(value) + ENTRY_OVERHEAD)
    lru.set('nitro:functions:gegenstand:XXVIII-ME-1.json', value)
    expect(lru.size).toBe(1)
    lru.delete('nitro:functions:gegenstand:XXVIII-ME-1.json')
    expect(lru.calculatedSize).toBe(0)
  })

  it('gives back exactly what it was given', () => {
    const lru = createMemoryLru({ maxSize: MB, max: 100 })
    const value = entry('Verordnung über „Höchstbeitragsgrundlage“ 2026 – 😀')
    lru.set('k', value)
    expect(lru.get('k')).toBe(value)
    expect(lru.get('missing')).toBeNull()
  })

  it('lets the entry used longest ago go first, a read counting as use', () => {
    const value = 'x'.repeat(1000)
    const per = 1 + 1000 + ENTRY_OVERHEAD
    const lru = createMemoryLru({ maxSize: per * 3, max: 100 })
    lru.set('a', value)
    lru.set('b', value)
    lru.set('c', value)
    lru.get('a')
    lru.set('d', value)
    expect(lru.keys()).toEqual(['c', 'a', 'd'])
    expect(lru.has('b')).toBe(false)
    expect(lru.calculatedSize).toBe(per * 3)
  })

  it('holds the entry count too', () => {
    const lru = createMemoryLru({ maxSize: MB, max: 2 })
    lru.set('a', '1')
    lru.set('b', '2')
    lru.set('c', '3')
    expect(lru.keys()).toEqual(['b', 'c'])
  })

  it('keeps nothing larger than the whole budget, and drops what stood under that key', () => {
    const lru = createMemoryLru({ maxSize: 2000, max: 100 })
    lru.set('k', 'small')
    lru.set('k', 'x'.repeat(5000))
    expect(lru.get('k')).toBeNull()
    expect(lru.calculatedSize).toBe(0)
  })
})

describe('lifetimes', () => {
  function clock() {
    let t = 1_000_000
    return { now: () => t, advance: (ms: number) => { t += ms } }
  }

  it('drops an entry once its ttl has passed — not a moment before', () => {
    const c = clock()
    const lru = createMemoryLru({ maxSize: MB, max: 100 }, c.now)
    lru.set('k', 'v', 1800)
    c.advance(1800 * 1000)
    expect(lru.get('k')).toBe('v')
    c.advance(1)
    expect(lru.get('k')).toBeNull()
    expect(lru.calculatedSize).toBe(0)
  })

  it('keeps an entry without a ttl — the swr ones — until the budget needs its room', () => {
    const c = clock()
    const lru = createMemoryLru({ maxSize: MB, max: 100 }, c.now)
    lru.set('k', 'v')
    lru.set('k0', 'v', 0)
    c.advance(365 * 24 * 3600 * 1000)
    expect(lru.get('k')).toBe('v')
    expect(lru.get('k0')).toBe('v')
  })

  it('frees what expired unread, on the next read or write after a minute', () => {
    const c = clock()
    const lru = createMemoryLru({ maxSize: MB, max: 100 }, c.now)
    for (let i = 0; i < 10; i++) lru.set(`old-${i}`, 'x'.repeat(100), 60)
    lru.set('fresh', 'y')
    c.advance(61 * 1000)
    expect(lru.size).toBe(11)
    lru.get('fresh')
    expect(lru.size).toBe(1)
    expect(lru.calculatedSize).toBe('fresh'.length + 1 + ENTRY_OVERHEAD)
  })
})

describe('the unstorage driver', () => {
  it('takes the ttl Nitro passes with a write, in seconds', () => {
    const driver = memoryDriver({ maxSize: MB, max: 100 })
    driver.setItem('k', '{"value":1}', { ttl: 60 })
    driver.setItem('j', '{"value":2}')
    expect(driver.getItem('k')).toBe('{"value":1}')
    expect(driver.hasItem('j')).toBe(true)
    // The read moved `k` behind `j`: least recently used first.
    expect(driver.getKeys()).toEqual(['j', 'k'])
    expect(driver.getInstance().calculatedSize).toBeGreaterThan(0)
    driver.removeItem('k')
    expect(driver.getItem('k')).toBeNull()
    driver.clear()
    expect(driver.getKeys()).toEqual([])
  })
})

describe('what the lifetimes rest on: nitropack', () => {
  /** nitropack's cached-function runtime as installed — reached through Nuxt, which brings it. */
  function nitroCacheSource(): string {
    const root = join(import.meta.dirname, '..')
    const fromNuxt = createRequire(realpathSync(join(root, 'node_modules', 'nuxt', 'package.json')))
    const fromServer = createRequire(realpathSync(fromNuxt.resolve('@nuxt/nitro-server/package.json')))
    return readFileSync(join(dirname(fromServer.resolve('nitropack/package.json')), 'dist', 'runtime', 'internal', 'cache.mjs'), 'utf8')
  }

  it('passes maxAge as the ttl of a write, and only where swr is off', () => {
    // If an swr entry got a ttl, the driver would drop the stale value SWR
    // serves while it rebuilds — the Länder lists' verdicts among them.
    expect(nitroCacheSource()).toMatch(/if \(opts\.maxAge && !opts\.swr\) \{\s*setOpts = \{ ttl: opts\.maxAge \};\s*\}/)
  })

  it('stamps mtime before the write, and counts an entry older than maxAge as expired', () => {
    const source = nitroCacheSource()
    expect(source).toMatch(/entry\.mtime = Date\.now\(\);[\s\S]{0,400}useStorage\(\)\.setItem\(cacheKey, entry, setOpts\)/)
    expect(source).toMatch(/ttl && Date\.now\(\) - \(entry\.mtime \|\| 0\) > ttl/)
  })
})
