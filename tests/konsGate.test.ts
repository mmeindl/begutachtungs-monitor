import { describe, expect, it } from 'vitest'
import { addressedParagraphs, byParagraphOrder, gateParagraph, paraId } from '../server/utils/konsGate'
import { parsePayload, type Instruction } from '../server/utils/lawApply'
import { parseInstruction } from '../server/utils/novao'

/** Eine Anweisung, wie der Prüfstand sie dem Modul gibt. */
function instr(line: string, payloadLines: string[] = []): Instruction[] {
  const parsed = parseInstruction(line)
  return parsed.ops.map((op) => ({ op, payload: parsePayload(payloadLines), line }))
}

describe('gateParagraph', () => {
  it('shows only what all three signals agree on', () => {
    expect(gateParagraph({ refused: false, plausible: true, oracle: 'bestätigt' })).toEqual({ show: true, cause: null })
  })

  // Das gemessene Negativergebnis, um dessentwillen es dieses Modul gibt: Die
  // Verweigerung erkennt, dass die Engine nichts getan hat, nicht, dass das
  // Getane richtig ist (12,6 % Abweichung mit und ohne, 09.09.2026).
  it('does not show an unverified paragraph, however clean the run was', () => {
    expect(gateParagraph({ refused: false, plausible: true, oracle: 'kein Anhang' })).toEqual({ show: false, cause: 'kein-anhang' })
    expect(gateParagraph({ refused: false, plausible: true, oracle: 'stumm' })).toEqual({ show: false, cause: 'anhang-schweigt' })
    expect(gateParagraph({ refused: false, plausible: true, oracle: 'fremd' })).toEqual({ show: false, cause: 'anhang-schweigt' })
    expect(gateParagraph({ refused: false, plausible: true, oracle: 'widersprochen' })).toEqual({ show: false, cause: 'anhang-widerspricht' })
  })

  it('never shows what the engine itself refused, even when the annex agrees', () => {
    expect(gateParagraph({ refused: true, plausible: true, oracle: 'bestätigt' })).toEqual({ show: false, cause: 'verweigert' })
    expect(gateParagraph({ refused: false, plausible: false, oracle: 'bestätigt' })).toEqual({ show: false, cause: 'unplausibel' })
  })

  // Die Reihenfolge der Gründe ist die Reihenfolge der Verantwortung: Was wir
  // selbst nicht konnten, wird nicht dem Dokument des Ressorts angelastet.
  it('blames our own refusal before the ressort document', () => {
    expect(gateParagraph({ refused: true, plausible: false, oracle: 'widersprochen' }).cause).toBe('verweigert')
  })
})

describe('addressedParagraphs — der Nenner der Anzeige', () => {
  it('counts every § an instruction names, in the order the law prints them', () => {
    const instructions = [
      ...instr('In § 285b Abs. 1 wird das Wort "A" durch das Wort "B" ersetzt.'),
      ...instr('§ 22 samt Überschrift lautet:', ['Neue Überschrift', '§ 22. (1) Neuer Text.']),
      ...instr('In § 197 Abs. 2 entfällt die Wortfolge "und".'),
    ]
    // § 22 vor § 197 vor § 285b — nicht die Zeichenkettenreihenfolge.
    expect(addressedParagraphs(instructions, [])).toEqual(['22', '197', '285b'])
  })

  // Eine Verweigerung darf den Paragraphen NICHT aus dem Nenner nehmen:
  // sonst stünde „2 von 2" über einer Liste, die den halben Entwurf verschweigt.
  it('keeps a refused instruction in the denominator', () => {
    const instructions = instr('In § 5 Abs. 1 wird das Wort "A" durch das Wort "B" ersetzt.')
    expect(addressedParagraphs(instructions, ['In den §§ 9 und 10 wird etwas Unlesbares getan.'])).toEqual(['5', '9'])
  })

  it('counts a § the draft inserts, which the standing law does not have', () => {
    const instructions = instr('Nach § 5 wird folgender § 5a samt Überschrift eingefügt:', ['Neue Überschrift', '§ 5a. (1) Neuer Paragraph.'])
    expect(addressedParagraphs(instructions, [])).toContain('5a')
  })

  it('reads a designation and orders lettered §§ after their number', () => {
    expect(paraId('§ 285b.')).toBe('285b')
    expect(paraId('Anl. 2')).toBe('2')
    expect([...['28a', '28', '9'].sort(byParagraphOrder)]).toEqual(['9', '28', '28a'])
  })

  it('is empty when a unit carries no instruction at all', () => {
    expect(addressedParagraphs([], [])).toEqual([])
  })
})
