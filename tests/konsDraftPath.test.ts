import { describe, expect, it } from 'vitest'
import { draftPathOf, type DraftPathCase } from '../scripts/lib/konsDraftPath'

/**
 * The bench on the path a reader meets (23.11.2026). Only a § whose
 * instruction went into the law unchanged, on the same text in force, has one
 * right answer; everything else is counted apart and never scored.
 */
const at = (key: string, over: Partial<Extract<DraftPathCase, { amended: true }>> = {}): DraftPathCase => ({
  key, me: '1/ME', law: 'Gesetz', id: key, amended: true, lines: 1, sameInstruction: true, sameStock: true, identical: true, ...over,
})

describe('draftPathOf', () => {
  it('scores only the same instruction on the same text', () => {
    const r = draftPathOf([
      at('a'),
      at('b', { identical: false }),
      at('c', { sameInstruction: false, identical: false }),
      at('d', { sameStock: false, identical: false }),
      at('e', { lines: 0 }),
      { key: 'f', me: '1/ME', law: 'Gesetz', id: 'f', amended: false },
    ], 1, 0)
    expect(r).toMatchObject({ shown: 6, comparable: 2, identical: 1, instructionChanged: 1, stockMoved: 1, noInstructionLine: 1, notAmended: 1 })
    expect(r.differs).toEqual([{ me: '1/ME', law: 'Gesetz', id: 'b' }])
  })

  it('takes a § new in the law as comparable: there is no text before it to have moved', () => {
    expect(draftPathOf([at('a', { sameStock: null })], 1, 0)).toMatchObject({ comparable: 1, identical: 1 })
  })

  it('counts a § once, by its strongest reading, however many Bundesgesetzblätter carry it', () => {
    const r = draftPathOf([
      { key: 'a', me: '1/ME', law: 'Gesetz', id: 'a', amended: false },
      at('a', { sameInstruction: false, identical: false }),
      at('a'),
    ], 1, 0)
    expect(r).toMatchObject({ shown: 1, comparable: 1, identical: 1, instructionChanged: 0, notAmended: 0 })
  })

  it('never counts a changed instruction as a miss, even where the text differs', () => {
    const r = draftPathOf([at('a', { sameInstruction: false, identical: false })], 1, 0)
    expect(r.comparable).toBe(0)
    expect(r.differs).toEqual([])
  })

  // Dropped unsaid until 23.11.2026: a § of the page in none of the classes.
  it('accounts for every § shown: the classes add up to the total', () => {
    const base = { me: '1/ME', law: 'Gesetz' }
    const r = draftPathOf([
      at('a'),
      at('b', { sameInstruction: false }),
      { ...base, key: 'c', id: 'c', amended: false },
      { ...base, key: 'd', id: 'd', amended: 'unread' },
      { ...base, key: 'e', id: 'e', amended: 'noLaw' },
      { ...base, key: 'f', id: 'f', amended: 'notEnacted' },
    ], 1, 0)
    expect(r).toMatchObject({ shown: 6, enactedUnread: 1, noLawJoined: 1, notEnacted: 1 })
    expect(r.comparable + r.instructionChanged + r.stockMoved + r.noInstructionLine + r.notAmended + r.enactedUnread + r.noLawJoined + r.notEnacted!).toBe(r.shown)
  })

  it('takes a proven absence over „no law", and any Bundesgesetzblatt that names the § over the absence', () => {
    const base = { key: 'a', me: '1/ME', law: 'Gesetz', id: 'a' }
    expect(draftPathOf([{ ...base, amended: 'noLaw' }, { ...base, amended: 'notEnacted' }], 1, 0)).toMatchObject({ notEnacted: 1, noLawJoined: 0 })
    expect(draftPathOf([{ ...base, amended: 'notEnacted' }, { ...base, amended: false }], 1, 0)).toMatchObject({ notAmended: 1, notEnacted: 0 })
  })

  it('lets a law that was joined outrank a Bundesgesetzblatt that names no law for the §', () => {
    const base = { key: 'a', me: '1/ME', law: 'Gesetz', id: 'a' }
    expect(draftPathOf([{ ...base, amended: 'noLaw' }, { ...base, amended: false }], 1, 0)).toMatchObject({ notAmended: 1, noLawJoined: 0 })
    expect(draftPathOf([{ ...base, amended: 'unread' }, at('a')], 1, 0)).toMatchObject({ comparable: 1, enactedUnread: 0 })
  })
})
