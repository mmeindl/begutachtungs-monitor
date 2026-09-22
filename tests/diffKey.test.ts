import { describe, expect, it } from 'vitest'
import { unitKey } from '../shared/utils/diffKey'

describe('unitKey', () => {
  it('separates a removed and an inserted unit that share a Ziffer number', () => {
    // A Regierungsvorlage can drop the draft's Z 5 and introduce its own.
    // Keyed on article|id alone the two collide and one § heading appears on
    // the other change — which is exactly what happened on SNG 8/ME.
    const removed = { article: 'Änderung des SNG', id: 'Z5', change: 'removed' as const }
    const inserted = { article: 'Änderung des SNG', id: 'Z5', change: 'inserted' as const }
    expect(unitKey(removed)).not.toBe(unitKey(inserted))
  })

  it('is stable and treats a missing article as empty', () => {
    const unit = { article: null, id: '§5', change: 'changed' as const }
    expect(unitKey(unit)).toBe('|§5|changed')
    expect(unitKey(unit)).toBe(unitKey({ ...unit }))
  })
})
