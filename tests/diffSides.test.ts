import { describe, expect, it } from 'vitest'
import { splitSegments } from '../app/utils/diffSides'

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

  it('marks each version whole where the word diff hit its ceiling', () => {
    expect(splitSegments(null, 'alt', 'neu')).toEqual({
      from: [{ type: 'removed', text: 'alt' }],
      to: [{ type: 'inserted', text: 'neu' }],
    })
  })

  it('leaves a side empty rather than marking an empty string', () => {
    expect(splitSegments(null, null, 'neu').from).toEqual([])
    expect(splitSegments(null, '', 'neu').from).toEqual([])
    expect(splitSegments(null, 'alt', null).to).toEqual([])
  })
})
