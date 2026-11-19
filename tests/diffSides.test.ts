import { describe, expect, it } from 'vitest'
import { NO_WORD_DIFF_DE, readsSideBySide, splitSegments } from '../app/utils/diffSides'
import { splitGap } from '../shared/utils/gaps'

describe('splitSegments', () => {
  it('hands both sides the same runs — the column filters, not this', () => {
    const segments = [
      { type: 'equal', text: 'a' },
      { type: 'removed', text: 'b' },
      { type: 'inserted', text: 'c' },
    ] as const
    const sides = splitSegments([...segments], 'alt', 'neu')
    expect(sides.from).toEqual([...segments])
    expect(sides.to).toEqual([...segments])
  })

  it('shows each version whole and unmarked where the word diff stopped at its ceiling (19.11.2026)', () => {
    // Marked whole, every word read as changed: 80/ME XXVIII Z 13, where four of 2.002 did.
    expect(splitSegments(null, 'alt', 'neu')).toEqual({
      from: [{ type: 'equal', text: 'alt' }],
      to: [{ type: 'equal', text: 'neu' }],
    })
  })

  it('says why, with the lead word of the monitor’s own ceiling', () => {
    expect(splitGap(NO_WORD_DIFF_DE)?.kind).toBe('outOfScope')
  })

  it('leaves a side empty rather than marking an empty string', () => {
    expect(splitSegments(null, null, 'neu').from).toEqual([])
    expect(splitSegments(null, '', 'neu').from).toEqual([])
    expect(splitSegments(null, 'alt', null).to).toEqual([])
  })
})

describe('readsSideBySide', () => {
  const seg = (type: 'equal' | 'removed' | 'inserted', n: number) => ({ type, text: 'x'.repeat(n) })

  it('keeps a few swapped words inline', () => {
    expect(readsSideBySide([seg('equal', 400), seg('removed', 20), seg('inserted', 25), seg('equal', 200)])).toBe(false)
  })

  it('keeps a pure addition inline, however large', () => {
    expect(readsSideBySide([seg('equal', 100), seg('inserted', 2000)])).toBe(false)
  })

  it('puts a recast passage side by side', () => {
    expect(readsSideBySide([seg('equal', 150), seg('removed', 300), seg('inserted', 280), seg('equal', 50)])).toBe(true)
  })

  it('keeps a short replacement inline even at a high share', () => {
    expect(readsSideBySide([seg('equal', 10), seg('removed', 30), seg('inserted', 30)])).toBe(false)
  })

  it('shows columns where the word diff hit its ceiling', () => {
    expect(readsSideBySide(null)).toBe(true)
  })
})
