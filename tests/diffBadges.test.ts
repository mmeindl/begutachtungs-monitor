import { describe, expect, it } from 'vitest'
import { BADGE_CLASS, BADGE_ORDER, GUTTER_CLASS, badgeCounts, badgeLabels, paragraphBadge } from '../app/utils/diffBadges'

const counts = (over: Partial<Record<string, number>> = {}) => ({
  unchanged: 0,
  changed: 0,
  editorial: 0,
  inserted: 0,
  removed: 0,
  ...over,
} as Record<'unchanged' | 'changed' | 'editorial' | 'inserted' | 'removed', number>)

describe('badgeLabels', () => {
  it('keeps each section its own word for a removed unit', () => {
    expect(badgeLabels('entfallen').removed).toBe('entfallen')
    expect(badgeLabels('entfällt').removed).toBe('entfällt')
  })

  it('says the same thing about the other four either way', () => {
    const a = badgeLabels('entfallen')
    const b = badgeLabels('entfällt')
    for (const badge of ['changed', 'editorial', 'unchanged', 'inserted'] as const) {
      expect(a[badge]).toBe(b[badge])
    }
    expect(a.changed).toBe('geändert')
    expect(a.editorial).toBe('redaktionell')
    expect(a.unchanged).toBe('unverändert')
    expect(a.inserted).toBe('neu')
  })
})

describe('badgeCounts', () => {
  const labels = badgeLabels('entfallen')

  it('counts strongest event first and gives a zero no pill', () => {
    expect(badgeCounts(counts({ unchanged: 12, changed: 3, inserted: 1 }), labels)).toEqual([
      { badge: 'inserted', count: 1, label: 'neu' },
      { badge: 'changed', count: 3, label: 'geändert' },
      { badge: 'unchanged', count: 12, label: 'unverändert' },
    ])
  })

  it('says nothing about a group with no counts at all', () => {
    expect(badgeCounts(counts(), labels)).toEqual([])
  })
})

describe('the tables', () => {
  it('cover every badge the order knows', () => {
    for (const badge of BADGE_ORDER) {
      expect(BADGE_CLASS[badge]).toBeTruthy()
      expect(GUTTER_CLASS[badge]).toBeTruthy()
    }
    expect(BADGE_ORDER).toHaveLength(Object.keys(BADGE_CLASS).length)
  })
})

describe('paragraphBadge — a § counted once (02.10.2026)', () => {
  const of = (...b: Parameters<typeof paragraphBadge>[0] extends ReadonlySet<infer T> ? T[] : never) => paragraphBadge(new Set(b))

  it('calls a § new or gone only when all of it is', () => {
    expect(of('inserted')).toBe('inserted') // § 8a, 115/ME: fourteen new Absätze, one new §
    expect(of('removed')).toBe('removed')
    expect(of('unchanged')).toBe('unchanged')
  })

  it('calls an existing § with new or dropped Absätze changed, not new', () => {
    expect(of('changed', 'inserted')).toBe('changed') // § 8, 115/ME
    expect(of('unchanged', 'inserted')).toBe('changed')
    expect(of('unchanged', 'removed')).toBe('changed')
    expect(of('removed', 'inserted')).toBe('changed') // § 18b, 33/ME: replaced
  })

  it('keeps a § that only moved commas editorial', () => {
    expect(of('editorial')).toBe('editorial')
    expect(of('unchanged', 'editorial')).toBe('editorial')
    expect(of('changed', 'editorial')).toBe('changed')
  })
})
