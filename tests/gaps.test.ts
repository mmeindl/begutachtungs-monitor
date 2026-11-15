import { describe, expect, it } from 'vitest'
import { GAP_LEAD_DE, gapDe, gapLabelDe, splitGap } from '../shared/utils/gaps'

describe('gap sentences — four lead words, by whose gap it is', () => {
  it('writes the sentence form and the label form', () => {
    expect(gapDe('notPublished', 'Diesen Entwurf führt das RIS nicht.')).toBe('Nicht veröffentlicht: Diesen Entwurf führt das RIS nicht.')
    expect(gapLabelDe('Kundmachung', 'unavailable')).toBe('Kundmachung: gerade nicht abrufbar')
    expect(gapLabelDe('Fundstelle der Stammfassung', 'unreadable')).toBe('Fundstelle der Stammfassung: nicht lesbar')
  })

  it('takes every lead word apart again, and leaves any other text alone', () => {
    for (const kind of Object.keys(GAP_LEAD_DE) as (keyof typeof GAP_LEAD_DE)[]) {
      expect(splitGap(gapDe(kind, 'die Liste.'))).toEqual({ kind, lead: GAP_LEAD_DE[kind], rest: 'die Liste.' })
    }
    expect(splitGap('Es liegt noch keine Regierungsvorlage vor.')).toBeNull()
    expect(splitGap('Nicht veröffentlicht')).toBeNull()
    expect(splitGap(null)).toBeNull()
  })

  // The `/datenlage` page is the key the lead words point to: its source-side
  // state carries the same word.
  it('shares its source word with /datenlage', async () => {
    const { DATENLAGE_STATE_META } = await import('../shared/utils/datenlage')
    expect(DATENLAGE_STATE_META.notPublished.label).toBe(GAP_LEAD_DE.notPublished.toLowerCase())
  })
})
