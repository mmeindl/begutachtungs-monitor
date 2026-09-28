import { describe, expect, it } from 'vitest'
import { diffUnitKey } from '../shared/utils/diffKey'

describe('diffUnitKey', () => {
  it('separates a removed and an inserted unit that share a Ziffer number', () => {
    // A Regierungsvorlage can drop the draft's Z 5 and introduce its own.
    // Keyed on article|id alone the two collide and one § heading appears on
    // the other change — which is exactly what happened on SNG 8/ME.
    const removed = { article: 'Änderung des SNG', id: 'Z5', change: 'removed' as const }
    const inserted = { article: 'Änderung des SNG', id: 'Z5', change: 'inserted' as const }
    expect(diffUnitKey(removed)).not.toBe(diffUnitKey(inserted))
  })

  it('is stable and treats a missing article as empty', () => {
    const unit = { article: null, id: '§5', change: 'changed' as const }
    expect(diffUnitKey(unit)).toBe('|§5|changed')
    expect(diffUnitKey(unit)).toBe(diffUnitKey({ ...unit }))
  })
})
