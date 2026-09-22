import { describe, expect, it } from 'vitest'
import { jaccardSimilarity } from '../server/utils/lawtext/lawNames'

describe('jaccardSimilarity', () => {
  it('is 1 for the same tokens and 0 for none in common', () => {
    expect(jaccardSimilarity(new Set(['a', 'b']), new Set(['b', 'a']))).toBe(1)
    expect(jaccardSimilarity(new Set(['a']), new Set(['b']))).toBe(0)
  })

  it('counts shared over all distinct tokens', () => {
    expect(jaccardSimilarity(new Set(['a', 'b']), new Set(['b', 'c']))).toBeCloseTo(1 / 3, 10)
  })

  it('answers 0 where one side has nothing to compare', () => {
    expect(jaccardSimilarity(new Set(), new Set(['a']))).toBe(0)
    expect(jaccardSimilarity(new Set(['a']), new Set())).toBe(0)
  })
})
