import { describe, expect, it } from 'vitest'
import { donorSentence, lastSentenceGone, raisedNumber, secondSentenceGone, swappedWord } from '../scripts/lib/rightColumnFaults'

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

  // The Bund's L and the donor of R-alt and U (21.11.2026), asked of the Länder too.
  const words = (t: string) => t.split(/\s+/).filter((w) => /\p{L}{3,}/u.test(w))
  const site = 'Die Behörde hat den Antrag binnen vier Wochen zu prüfen und das Ergebnis mitzuteilen. Eine Verlängerung der Frist ist einmal zulässig, wenn die Partei zustimmt. Die Entscheidung ergeht schriftlich und ist der Partei zuzustellen.'

  it('L: loses the second sentence of a column with three sentences and thirty words', () => {
    expect(secondSentenceGone(site, split, words)).toBe('Die Behörde hat den Antrag binnen vier Wochen zu prüfen und das Ergebnis mitzuteilen. Die Entscheidung ergeht schriftlich und ist der Partei zuzustellen.')
    // Two sentences, or a second below six words: no site, so no try is counted.
    expect(secondSentenceGone(text, split, words)).toBeNull()
    expect(secondSentenceGone('Die Behörde hat den Antrag binnen vier Wochen zu prüfen und das Ergebnis der Partei mitzuteilen. Das gilt. Die Entscheidung ergeht schriftlich und ist der Partei samt Begründung zuzustellen.', split, words)).toBeNull()
  })

  it('takes the first sentence of eight words as the donor', () => {
    expect(donorSentence(site, split, words)).toBe('Die Behörde hat den Antrag binnen vier Wochen zu prüfen und das Ergebnis mitzuteilen.')
    expect(donorSentence('Kurz. Auch kurz.', split, words)).toBeNull()
  })
})
