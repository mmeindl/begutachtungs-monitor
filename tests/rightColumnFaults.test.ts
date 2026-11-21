import { describe, expect, it } from 'vitest'
import { lastSentenceGone, raisedNumber, swappedWord } from '../scripts/lib/rightColumnFaults'

// The reader's faults both harnesses inject into a right column's new text
// (landGuard.ts for the Länder, faultInjection.ts for the Bund's annex gate,
// 21.11.2026): one edit each, and null where there is nothing to break, so a
// try is counted only where the fault went in.
describe('right-column faults', () => {
  const text = 'Der Beitrag beträgt 120 Euro. Er ist bis Ende März zu entrichten.'
  const split = /(?<=[.;:!?])\s+(?=[A-ZÄÖÜ])/

  it('raises the first number by seven', () => {
    expect(raisedNumber(text)).toBe('Der Beitrag beträgt 127 Euro. Er ist bis Ende März zu entrichten.')
    expect(raisedNumber('Ohne Zahl.')).toBeNull()
  })

  it('swaps the longest word for one no draft uses', () => {
    // A word with a mark attached („entrichten.") is not one: the edit keeps the punctuation.
    expect(swappedWord(text)).toBe('Der Bewilligungsvoraussetzung beträgt 120 Euro. Er ist bis Ende März zu entrichten.')
    expect(swappedWord('Ab 1. Mai.')).toBeNull()
  })

  it('drops the last sentence, by the splitter the caller passes', () => {
    expect(lastSentenceGone(text, split)).toBe('Der Beitrag beträgt 120 Euro.')
    expect(lastSentenceGone('Nur ein Satz.', split)).toBeNull()
  })
})
