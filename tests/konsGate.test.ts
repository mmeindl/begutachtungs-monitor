import { describe, expect, it } from 'vitest'
import { addressedLabels, addressedParagraphs, byParagraphOrder, gateParagraph } from '../server/utils/kons/konsGate'
import { parsePayload, type Instruction } from '../server/utils/kons/lawApply'
import { parseInstruction } from '../server/utils/kons/novao'

/** An instruction, the way the harness hands it to the module. */
function instr(line: string, payloadLines: string[] = []): Instruction[] {
  const parsed = parseInstruction(line)
  return parsed.ops.map((op) => ({ op, payload: parsePayload(payloadLines), line }))
}

describe('gateParagraph', () => {
  it('shows only what all three signals agree on', () => {
    expect(gateParagraph({ refused: false, plausible: true, oracle: 'bestätigt' })).toEqual({ show: true, cause: null })
  })

  // The measured negative result this module exists for: the refusal
  // detects that the engine did nothing, not that what it did is right
  // (12,6 % deviation with and without, 09.09.2026).
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

  // The order of causes is the order of responsibility: what we could not do
  // ourselves is not charged to the ressort's document.
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
    // § 22 before § 197 before § 285b — not the string order.
    expect(addressedParagraphs(instructions, [])).toEqual(['22', '197', '285b'])
  })

  // A refusal must NOT take the Paragraph out of the denominator: otherwise
  // „2 von 2" would stand over a list that hides half the draft.
  it('keeps a refused instruction in the denominator', () => {
    const instructions = instr('In § 5 Abs. 1 wird das Wort "A" durch das Wort "B" ersetzt.')
    expect(addressedParagraphs(instructions, ['In den §§ 9 und 10 wird etwas Unlesbares getan.'])).toEqual(['5', '9'])
  })

  it('counts a § the draft inserts, which the standing law does not have', () => {
    const instructions = instr('Nach § 5 wird folgender § 5a samt Überschrift eingefügt:', ['Neue Überschrift', '§ 5a. (1) Neuer Paragraph.'])
    expect(addressedParagraphs(instructions, [])).toContain('5a')
  })

  it('orders lettered §§ after their number', () => {
    expect([...['28a', '28', '9'].sort(byParagraphOrder)]).toEqual(['9', '28', '28a'])
  })

  it('is empty when a unit carries no instruction at all', () => {
    expect(addressedParagraphs([], [])).toEqual([])
  })
})

describe('addressedLabels — unter welchem Etikett das RIS den § führt', () => {
  it('keys an ordinary § by its bare designation', () => {
    const labels = addressedLabels(instr('§ 5 Abs. 1 lautet:', ['(1) Neu.']), [])
    expect(labels?.get('5')).toBe('§ 5')
  })

  // Under "§ 3" RIS carries no document in such a law at all — leaving the
  // Artikel off does not widen the search, it empties it (§12.12a).
  it('keys a § of a law divided into Artikel the way RIS prints it', () => {
    const labels = addressedLabels(instr('Art. II § 3 Abs. 2 lautet:', ['(2) Neu.']), [])
    expect(labels?.get('3')).toBe('Art. 2 § 3')
  })

  it('keys a refused line by the Artikel it names', () => {
    const labels = addressedLabels([], ['In Artikel II § 7 wird etwas Unlesbares getan.'])
    expect(labels?.get('7')).toBe('Art. 2 § 7')
  })

  // The stock is held by bare id, so two Artikel with a § 3 would put two
  // documents under one key and the first one fetched would answer for both.
  it('refuses where two Artikel of one law share a § number', () => {
    const both = [...instr('Art. II § 3 lautet:', ['§ 3. Neu.']), ...instr('Art. III § 3 lautet:', ['§ 3. Auch neu.'])]
    expect(addressedLabels(both, [])).toBeNull()
  })

  it('refuses where the same § is named once with and once without its Artikel', () => {
    const both = [...instr('Art. II § 3 lautet:', ['§ 3. Neu.']), ...instr('§ 3 lautet:', ['§ 3. Auch neu.'])]
    expect(addressedLabels(both, [])).toBeNull()
  })

  // It produces no operation and no node, so it cannot put a second document
  // into the stock — and refusing the Artikel over it cost 116/ME one of its
  // 65 laws.
  it('lets a refused line fill a gap but never contradict an instruction', () => {
    const labels = addressedLabels(instr('Art. II § 3 lautet:', ['§ 3. Neu.']), ['In § 3 wird etwas Unlesbares getan.'])
    expect(labels?.get('3')).toBe('Art. 2 § 3')
  })

  it('files a § an instruction creates under the Artikel that instruction addresses', () => {
    const labels = addressedLabels(instr('Nach Art. II § 12 wird folgender § 12a samt Überschrift eingefügt:', ['Neue Überschrift', '§ 12a. (1) Neu.']), [])
    expect(labels?.get('12a')).toBe('Art. 2 § 12a')
  })
})
