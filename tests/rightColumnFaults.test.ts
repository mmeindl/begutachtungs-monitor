import { describe, expect, it } from 'vitest'
import { bumpedDesignation, donorSentence, lastSentenceGone, raisedNumber, secondSentenceGone, swappedWord } from '../scripts/lib/rightColumnFaults'

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

  // „Zahl" took a label for a figure: on the Bund's PDF path 96 of the 115
  // the oracle let through were a Ziffer's or an Absatz's marker, 9 the §
  // number, 7 a division's number (21.11.2026). Rows of real annexes.
  it('raises a figure of the text, never a label or a placeholder', () => {
    // „23." after „fördern;" is a Ziffer; the first figure is the citation's.
    expect(raisedNumber('23. multifaktorielle Untersuchungsmethodik gemäß § 13 Abs. 2', 'fördern; ')).toBe('23. multifaktorielle Untersuchungsmethodik gemäß § 20 Abs. 2')
    // „hat zu bestimmen 1. die Art": a Ziffer after a word, too.
    expect(raisedNumber('1. die Art des Zivilflugplatzes (§§ 63 bis 65),', 'Der Bescheid hat zu bestimmen ')).toBe('1. die Art des Zivilflugplatzes (§§ 70 bis 65),')
    expect(raisedNumber('4. Abschnitt Technische Unterstützung § 22. (1) Sie ist verboten.')).toBeNull()
    expect(raisedNumber('in der Fassung des Bundesgesetzes BGBl. I Nr. xx/2026')).toBeNull()
    // A date's day is a figure of the text.
    expect(raisedNumber('tritt mit 1. Jänner 2027 in Kraft.')).toBe('tritt mit 8. Jänner 2027 in Kraft.')
  })

  it('moves the first label of a unit below the § by one', () => {
    expect(bumpedDesignation('§ 51. (1) bis (6) … (7) Abweichend von Abs. 3 Z 2 ist')).toBe('§ 51. (2) bis (6) … (7) Abweichend von Abs. 3 Z 2 ist')
    expect(bumpedDesignation('1. die Art des Zivilflugplatzes,', 'hat zu bestimmen ')).toBe('2. die Art des Zivilflugplatzes,')
    expect(bumpedDesignation('gemäß lit. b) und c) die Frist')).toBe('gemäß lit. b) und d) die Frist')
    expect(bumpedDesignation('4. Abschnitt Technische Unterstützung')).toBeNull()
  })

  it('drops a sentence, not a marker or a heading, and does not cut a date', () => {
    const marked = /(?<=[.;:!?])\s+(?=[A-ZÄÖÜ(„"])/
    expect(lastSentenceGone('(2) Die Frist beträgt vier Wochen. (3) Dieses Bundesgesetz tritt mit 1. Jänner 2027 in Kraft.', marked)).toBe('(2) Die Frist beträgt vier Wochen. (3)')
    expect(lastSentenceGone('Die Frist beträgt vier Wochen. Sie beginnt mit der Zustellung. Inkrafttreten', marked)).toBe('Die Frist beträgt vier Wochen. Inkrafttreten')
    expect(lastSentenceGone('Der Antrag ist schriftlich einzubringen. (3)', marked)).toBeNull()
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
