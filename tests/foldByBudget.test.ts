import { describe, expect, it } from 'vitest'
import { foldByBudget } from '../app/utils/foldByBudget'

const text = (n: number) => ({ kind: 'text' as const, text: 'x'.repeat(n) })
const heading = (n: number) => ({ kind: 'heading' as const, text: 'h'.repeat(n) })
const cut = (items: { kind: 'heading' | 'text'; text: string }[], budget: number) => foldByBudget(items, budget).visible.length

describe('foldByBudget', () => {
  it('shows everything that fits', () => {
    expect(cut([text(100), text(100)], 1400)).toBe(2)
    expect(foldByBudget([], 1400)).toEqual({ visible: [], folded: [] })
  })

  it('checks the budget before a paragraph is added, so a long one does not slip in', () => {
    expect(cut([text(1000), text(1000), text(10)], 1400)).toBe(1)
  })

  it('always shows the first paragraph, however long', () => {
    expect(cut([text(3000), text(10)], 1400)).toBe(1)
    // A heading before it does not count as that paragraph.
    expect(cut([heading(10), text(3000), text(10)], 1400)).toBe(2)
  })

  it('moves a heading at the cut into the fold with what stands below it', () => {
    const items = [text(1000), heading(10), text(1000)]
    expect(foldByBudget(items, 1400)).toEqual({ visible: [items[0]], folded: [items[1], items[2]] })
  })
})
