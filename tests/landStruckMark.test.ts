import { describe, expect, it } from 'vitest'
import type { LawDiffUnit } from '../shared/types'
import { landUncheckedNote } from '../app/utils/landUnchecked'
import { struckNotHeld, withoutDraftRules } from '../server/utils/laender/landTguGuard'
import type { StrictCheck } from '../server/utils/laender/landTguStrict'

/** What a Land's § strikes sets „nicht geprüft", and never withholds it (23.11.2026). */
const holds = (over: Partial<StrictCheck> = {}): StrictCheck => ({ state: 'holds', reason: null, notInDraft: [], notShown: [], newWords: 5, draftWords: 5, struckNotInDraft: [], ...over })
const by = (over: Partial<NonNullable<StrictCheck['struck']>> = {}): NonNullable<StrictCheck['struck']> => ({ named: 0, rewritten: 0, repealed: 0, byPosition: 0, notation: 0, ...over })

describe('struckNotHeld', () => {
  it('marks struck words no instruction strikes, whatever the new text says', () => {
    expect(struckNotHeld(holds({ struckNotInDraft: ['Wort'] }))).toBe(true)
  })

  it('leaves a § whose new words hold and whose struck text the draft accounts for', () => {
    expect(struckNotHeld(holds({ struck: by({ byPosition: 3 }) }))).toBe(false)
  })

  it('without a new word, asks that the draft names what is struck', () => {
    expect(struckNotHeld(holds({ newWords: 0, struck: by({ named: 4 }) }))).toBe(false)
    expect(struckNotHeld(holds({ newWords: 0, struck: by({ repealed: 4 }) }))).toBe(false)
    expect(struckNotHeld(holds({ newWords: 0, struck: by({ byPosition: 4 }) }))).toBe(true)
    expect(struckNotHeld(holds({ newWords: 0, struck: by({ named: 2, byPosition: 2 }) }))).toBe(true)
    expect(struckNotHeld(holds({ newWords: 0 }))).toBe(true)
  })

  it('says nothing of a § that does not hold: that one has its own answer', () => {
    expect(struckNotHeld(holds({ state: 'differs', struckNotInDraft: ['Wort'] }))).toBe(false)
    expect(struckNotHeld(undefined)).toBe(false)
  })
})

describe('Kärnten', () => {
  it('marks every § shown as changed or new, and no other', () => {
    const unit = (id: string, change: LawDiffUnit['change']) => ({ article: 'G', id, change }) as LawDiffUnit
    expect(withoutDraftRules([unit('1', 'changed'), unit('2', 'inserted'), unit('3', 'unchanged'), unit('4', 'removed')])).toEqual([
      { law: 'G', id: '1', change: 'changed', reason: 'noDraftCheck' },
      { law: 'G', id: '2', change: 'inserted', reason: 'noDraftCheck' },
    ])
  })
})

describe('landUncheckedNote', () => {
  it('says what was not checked in the words that fit it', () => {
    expect(landUncheckedNote(['struck'])).toMatch(/^Nicht geprüft, ob der Entwurf streicht, was hier gestrichen ist: /)
    expect(landUncheckedNote(['noDraftCheck'])).toMatch(/^Nicht geprüft, ob der neue Text Wort für Wort im Entwurf steht: Kärnten/)
    const both = landUncheckedNote(['wording', 'struck'])!
    expect(both).toContain('Wort für Wort im Entwurf steht: eine Anordnung')
    expect(both).toContain('Nicht geprüft, ob der Entwurf streicht')
    expect(landUncheckedNote([])).toBeNull()
  })
})
