import { describe, expect, it } from 'vitest'
import { BADGE_CLASS, BADGE_ORDER, GUTTER_CLASS, badgeCounts, badgeLabels } from '../app/utils/diffBadges'

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
