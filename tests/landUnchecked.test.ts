import { describe, expect, it } from 'vitest'
import { landUncheckedMarks, landUncheckedNote } from '../app/utils/landUnchecked'

describe('„nicht geprüft" at a Land\'s § whose new text was not held against the draft (20.11.2026)', () => {
  it('finds each mark at its unit by law, number and kind of change', () => {
    const marks = landUncheckedMarks([{ law: 'Oö. Beispielgesetz', id: '§5', change: 'changed', reason: 'unassigned' }, { law: null, id: '§7', change: 'inserted', reason: 'long' }])
    expect(marks.get('Oö. Beispielgesetz|§5|changed')).toBe('unassigned')
    expect(marks.get('|§7|inserted')).toBe('long')
    // A removed § 7 of the same law is another unit.
    expect(marks.has('|§7|removed')).toBe(false)
    expect(landUncheckedMarks(undefined).size).toBe(0)
  })

  it('says what was not checked once, and each reason once, in the order first met', () => {
    expect(landUncheckedNote([])).toBeNull()
    expect(landUncheckedNote(['long', 'unassigned', 'long'])).toBe('Nicht geprüft, ob der neue Text Wort für Wort im Entwurf steht: für den wortweisen Abgleich ist der Text zu lang; den neuen Text konnte der Monitor keiner Anweisung des Entwurfs sicher zuordnen.')
    expect(landUncheckedNote(['draftUnread'])).toBe('Nicht geprüft, ob der neue Text Wort für Wort im Entwurf steht: den Gesetzestext des Entwurfs fand der Monitor nicht oder konnte ihn nicht lesen.')
    expect(landUncheckedNote(['wording'])).toMatch(/eine Anweisung des Entwurfs konnte der Monitor nicht Wort für Wort lesen\.$/)
  })
})
