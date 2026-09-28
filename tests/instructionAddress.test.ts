import { describe, expect, it } from 'vitest'
import { addressedParagraph, addressedParagraphs } from '../server/utils/lawtext/instructionAddress'

describe('addressedParagraph', () => {
  it('names the § an instruction edits', () => {
    expect(addressedParagraph('§ 218 Abs. 1 lautet:')).toBe('§ 218')
    expect(addressedParagraph('In § 9 Abs. 1 wird die Wortfolge "alt" durch die Wortfolge "neu" ersetzt.')).toBe('§ 9')
    expect(addressedParagraph('Dem § 60 wird folgender Abs. 44 angefügt:')).toBe('§ 60')
  })

  it('refuses the anchor of a newly created §', () => {
    // "Nach § 5 wird folgender § 5a eingefügt" addresses § 5, but the change
    // is § 5a — § 5's heading would be a real name on the wrong paragraph.
    expect(addressedParagraph('Nach § 5 wird folgender § 5a samt Überschrift eingefügt:')).toBeNull()
    // A sub-unit lands inside the named §, so its heading does fit.
    expect(addressedParagraph('In § 5 wird nach Abs. 2 folgender Abs. 3 eingefügt:')).toBe('§ 5')
  })

  it('refuses when one instruction spans several paragraphs', () => {
    expect(addressedParagraph('In § 17 Abs. 4, § 19 Abs. 1 und § 46 Abs. 2 wird jeweils die Wortfolge "a" durch die Wortfolge "b" ersetzt.')).toBeNull()
    // One address with a sibling, and the sibling is a § of its own.
    expect(addressedParagraph('Die §§ 6 und 7 samt Überschriften entfallen.')).toBeNull()
    expect(addressedParagraph('Die §§ 5 bis 7 entfallen.')).toBeNull()
  })

  it('keeps the § when the siblings sit below it', () => {
    expect(addressedParagraph('§ 5 Abs. 2 und 3 entfallen.')).toBe('§ 5')
    expect(addressedParagraph('In § 9 Abs. 1 und 2 wird das Wort "alt" durch das Wort "neu" ersetzt.')).toBe('§ 9')
  })

  it('lists every § for the pairing sets', () => {
    expect(addressedParagraphs('Die §§ 6 und 7 samt Überschriften entfallen.')).toEqual(['§ 6', '§ 7'])
    expect(addressedParagraphs('Die §§ 5 bis 7 entfallen.')).toEqual(['§ 5', '§ 6', '§ 7'])
    expect(addressedParagraphs('§ 5 Abs. 2 und 3 entfallen.')).toEqual(['§ 5'])
    expect(addressedParagraphs('Nach § 5 wird folgender § 5a samt Überschrift eingefügt:')).toEqual([])
  })

  it('returns null for an instruction it cannot read', () => {
    expect(addressedParagraph('Im Inhaltsverzeichnis wird nach dem Eintrag zu § 5 folgender Eintrag eingefügt:')).toBeNull()
    expect(addressedParagraph('§ 5 wird wie folgt geändert:')).toBeNull()
  })
})
