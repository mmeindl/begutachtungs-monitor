/**
 * Cache keys that survive unstorage (`server/utils/cache/key.ts`): two
 * different inputs must never land on one storage key. Run against the
 * installed unstorage's own `normalizeKey`, which cuts at „?", maps `/` and
 * `\` to `:` and folds runs of `:` — first showing that a raw key does
 * collide, then that an encoded one does not.
 */
import { describe, expect, it } from 'vitest'
import { storageKeyOf } from '../server/utils/cache/key'
import { unstorageNormalizeKey } from './helpers/nitropack'

const normalizeKey = await unstorageNormalizeKey()

/** The storage key Nitro writes for a cached function's key (nitropack 2.13, `cacheKey`). */
const stored = (key: string) => normalizeKey(['/cache', 'nitro/functions', 'law-html', `${key}.json`].join(':'))

/** Pairs that differ only where unstorage does not look. */
const PAIRS: [string, string][] = [
  // The query: Oberösterreich's Landtag pages, 22.10.2026.
  ['https://www.land-oberoesterreich.gv.at/x.htm?jahr=2025&nummer=1', 'https://www.land-oberoesterreich.gv.at/x.htm?jahr=2026&nummer=1'],
  // A separator: a Bundesgesetzblatt number against its look-alike.
  ['BGBl. I Nr. 12/2026', 'BGBl. I Nr. 12:2026'],
  ['a\\b', 'a/b'],
  // A run of separators.
  ['https://ris.bka.gv.at//Dokumente/a', 'https://ris.bka.gv.at/Dokumente/a'],
  ['Gesetz::1', 'Gesetz:1'],
]

describe('storageKeyOf', () => {
  it('needs to exist: raw, each pair is one entry', () => {
    for (const [a, b] of PAIRS) expect(stored(a), `${a} / ${b}`).toBe(stored(b))
  })

  it('keeps every pair apart once encoded', () => {
    for (const [a, b] of PAIRS) expect(stored(storageKeyOf(a)), `${a} / ${b}`).not.toBe(stored(storageKeyOf(b)))
  })

  it('leaves nothing for unstorage to change', () => {
    for (const input of PAIRS.flat()) {
      const key = storageKeyOf(input)
      expect(normalizeKey(key)).toBe(key)
    }
  })

  it('never makes a dot segment unstorage would refuse', () => {
    const key = storageKeyOf('https://example.at/a/../b')
    expect(normalizeKey(key).split(':')).not.toContain('..')
  })

  it('leaves a plain token as it is', () => {
    expect(storageKeyOf('XXVIII-302')).toBe('XXVIII-302')
  })

  it('is one-to-one on short inputs — the encoding decodes to the input', () => {
    for (const input of PAIRS.flat()) expect(decodeURIComponent(storageKeyOf(input))).toBe(input)
  })

  it('hashes a long input to a bounded key that still tells inputs apart', () => {
    const articles = Array.from({ length: 40 }, (_, i) => `Artikel ${i + 1}~a~Änderung des Gesetzes Nr. ${i}/2026`).join('/')
    const a = storageKeyOf(`https://ris.bka.gv.at/a.pdf|${articles}`)
    const b = storageKeyOf(`https://ris.bka.gv.at/a.pdf|${articles}x`)
    expect(a.length).toBeLessThanOrEqual(180)
    expect(a).not.toBe(b)
    expect(normalizeKey(a)).toBe(a)
    // Same head, different hash.
    expect(a.slice(0, 100)).toBe(b.slice(0, 100))
  })

  it('never lets a short key look like a hashed one', () => {
    // `|` separates head and hash; the encoding never leaves it bare.
    expect(storageKeyOf(`${'x'.repeat(100)}|${'0'.repeat(64)}`)).not.toContain('|')
  })
})
