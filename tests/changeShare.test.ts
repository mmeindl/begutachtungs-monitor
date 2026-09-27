import { describe, expect, it } from 'vitest'
import { ownChangeShare } from '../shared/utils/changeShare'

describe('ownChangeShare', () => {
  it('counts the draft units the later text changed or dropped, editorial changes not', () => {
    // 30/ME (XXVII): 15 units, 3 changed, none editorial, none removed.
    expect(ownChangeShare({ unchanged: 12, changed: 3, editorial: 0, removed: 0 })).toEqual({ changed: 3, own: 15, share: 0.2 })
    expect(ownChangeShare({ unchanged: 5, changed: 4, editorial: 2, removed: 1 })).toEqual({ changed: 3, own: 10, share: 0.3 })
  })

  it('does not count what only the later text carries', () => {
    // Inserted units are no part of the draft.
    expect(ownChangeShare({ unchanged: 2, changed: 0, editorial: 0, removed: 0 })!.share).toBe(0)
  })

  it('has no share without units of the draft', () => {
    expect(ownChangeShare({ unchanged: 0, changed: 0, editorial: 0, removed: 0 })).toBeNull()
  })
})
