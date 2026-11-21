import { describe, expect, it } from 'vitest'
import type { ComparisonRow } from '../server/utils/annex/comparisonRows'
import { annexScope } from '../server/utils/kons/consolidate'

const rows = (...keys: string[]): Map<string, ComparisonRow[]> => new Map(keys.map((k) => [k, []]))

// Where the page looks an Artikel's rows up — lifted out of `consolidate` so
// the fault injection asks the annex the same way (21.11.2026); it keyed
// packages only, by a rule of its own.
describe('annexScope', () => {
  it('asks a package by the Artikel\'s key', () => {
    expect(annexScope(rows('Art 1#5', 'Art 2#5'), 'Art 1', true, new Set(['Art 1', 'Art 2'])).law).toBe('Art 1')
  })

  it('asks a single Novelle by its key where the annex files rows under it', () => {
    expect(annexScope(rows('Art 1#5', 'Art 2#1'), 'Art 1', false, new Set(['Art 1', 'Art 2'])).law).toBe('Art 1')
  })

  it('otherwise asks by the bare number, but never in the rows of another Artikel of the draft (144/ME XXVIII)', () => {
    const scope = annexScope(rows('#5', 'Art 2#1', 'Art 2#26'), 'Art 1', false, new Set(['Art 1', 'Art 2']))
    expect(scope.law).toBeUndefined()
    expect([...scope.rows.keys()]).toEqual(['#5'])
  })
})
