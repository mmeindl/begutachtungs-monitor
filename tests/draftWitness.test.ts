import { describe, expect, it } from 'vitest'
import { renditionOfPages, witnessVerdict, type WitnessInstruction } from '../server/utils/kons/draftWitness'
import type { ComparisonRow } from '../server/utils/annex/comparisonRows'

/**
 * The second witness alone, on a word fault the fault injection found
 * shown by it (20.11.2026): the result's „Behörde" turned into the word
 * another line of the § writes.
 */
const changed = (current: string, proposed: string): ComparisonRow => ({
  kind: 'pair', law: null, heading: null, gld: '§ 21.', para: '§ 21.', paraAfter: '§ 21.', current, proposed,
  change: 'changed', elided: false, segments: null, editorial: false, elisionRange: false,
})

describe('witnessVerdict', () => {
  const before = 'Nach diesem Gesetz ist die zuständige Behörde und prüft den Antrag binnen einer Woche. Das Luftfahrzeug wird jährlich geprüft.'
  const line = 'In § 21 wird das Wort „Luftfahrzeug“ durch das Wort „Lufttüchtigkeit“ ersetzt.'
  const touching: WitnessInstruction[] = [{ op: { kind: 'replacePhrase', target: { para: '21' } as never, from: 'Luftfahrzeug', to: 'Lufttüchtigkeit', everywhere: false, eachUnit: false, wordBound: true }, line, payload: [] }]
  const pdf = renditionOfPages([`1 von 3\n5. ${line}`])
  const annex = [changed(before, 'Nach diesem Gesetz ist die zuständige Behörde und prüft den Antrag binnen einer Woche. Das Lufttüchtigkeit wird jährlich geprüft.')]

  it('shows no result where the payload stands more often than the instruction wrote it', () => {
    const faulted = 'Nach diesem Gesetz ist die zuständige Lufttüchtigkeit und prüft den Antrag binnen einer Woche. Das Lufttüchtigkeit wird jährlich geprüft.'
    expect(witnessVerdict('21', before, faulted, annex, touching, pdf)).toEqual({ released: false, reason: 'nicht-neuer-text' })
  })

  it('says why without a rendition', () => {
    expect(witnessVerdict('21', before, before, annex, touching, null)).toEqual({ released: false, reason: 'keine-fassung' })
  })

  it('ties no place at the very end of what our reader read: a payload cut short at a line\'s end', () => {
    const standing = 'Eins gilt für alle Fälle. Nachher gilt Vier für alle Fälle.'
    const cut = 'Drei gilt ab dem heutigen Tag so lange, bis der Verstoß endet und die Behörde'
    const insert: WitnessInstruction[] = [{ op: { kind: 'insertAfter', anchor: { para: '21', abs: '1' } as never, child: 'abs', childIds: ['3'], where: 'after' }, line: 'In § 21 wird nach Abs. 1 folgender Abs. 3 eingefügt:', payload: [cut] }]
    const full = renditionOfPages(['7. In § 21 wird nach Abs. 1 folgender Abs. 3 eingefügt:\n„(3) Drei gilt ab dem heutigen Tag so lange, bis der Verstoß endet und die Behörde entschieden hat.“'])
    const rows = [changed('(1) Eins gilt für alle Fälle. (4) Nachher gilt Vier für alle Fälle.', '(1) Eins gilt für alle Fälle. (3) Drei gilt ab dem heutigen Tag nie. (4) Nachher gilt Vier für alle Fälle.')]
    expect(witnessVerdict('21', standing, `Eins gilt für alle Fälle. ${cut} Nachher gilt Vier für alle Fälle.`, rows, insert, full)).toEqual({ released: false, reason: 'rand' })
  })

  it('counts the payload\'s own occurrences in the wording it replaces as gone (119/ME, LFG § 21)', () => {
    const standing = 'Nach diesem Gesetz ist die zuständige Behörde und prüft die Maßnahmen der Verkehrssicherheit, der Lufttüchtigkeit oder der Betriebstüchtigkeit jährlich.'
    const from = 'Verkehrssicherheit, der Lufttüchtigkeit oder der Betriebstüchtigkeit'
    const wide = 'In § 21 wird die Wortfolge „Verkehrssicherheit, der Lufttüchtigkeit oder der Betriebstüchtigkeit“ durch das Wort „Lufttüchtigkeit“ ersetzt.'
    const ins: WitnessInstruction[] = [{ op: { kind: 'replacePhrase', target: { para: '21' } as never, from, to: 'Lufttüchtigkeit', everywhere: false, eachUnit: false, wordBound: true }, line: wide, payload: [] }]
    const faulted = 'Nach diesem Gesetz ist die zuständige Lufttüchtigkeit und prüft die Maßnahmen der Lufttüchtigkeit jährlich.'
    const rows = [changed(standing, 'Nach diesem Gesetz ist die zuständige Behörde und prüft die Maßnahmen der Lufttüchtigkeit jährlich.')]
    expect(witnessVerdict('21', standing, faulted, rows, ins, renditionOfPages([`16. ${wide}`])).released).toBe(false)
  })

  it('places a phrase payload only where the standing text held the old wording between the same words (ApoBetrO § 60a)', () => {
    const standing = 'Die Aufzeichnungen gemäß Abs. 1 bis 4 sind elektronisch zu führen. Die Pflicht gemäß Abs. 3 gilt immer weiter. Nach Abs. 2 gilt Eins.'
    const lines = ['In § 21 wird die Zeichenfolge „bis 4“ durch die Zeichenfolge „und 2“ ersetzt.', 'In § 21 wird die Zeichenfolge „Abs. 3“ durch die Zeichenfolge „Abs. 2“ ersetzt.', 'In § 21 entfällt der Satz „Nach Abs. 2 gilt Eins.“']
    const phrase = (from: string, to: string, line: string): WitnessInstruction => ({ op: { kind: 'replacePhrase', target: { para: '21' } as never, from, to, everywhere: false, eachUnit: false, wordBound: true }, line, payload: [] })
    const ins: WitnessInstruction[] = [phrase('bis 4', 'und 2', lines[0]!), phrase('Abs. 3', 'Abs. 2', lines[1]!), { op: { kind: 'deletePhrase', target: { para: '21' } as never, text: 'Nach Abs. 2 gilt Eins.', eachUnit: false, wordBound: true }, line: lines[2]!, payload: [] }]
    const right = 'Die Aufzeichnungen gemäß Abs. 1 und 2 sind elektronisch zu führen. Die Pflicht gemäß Abs. 2 gilt immer weiter.'
    const faulted = right.replace('Abs. 1 und 2', 'Abs. 2 und 2')
    const rows = [changed(standing, right)]
    expect(witnessVerdict('21', standing, faulted, rows, ins, renditionOfPages([lines.map((l, i) => `${i + 1}. ${l}`).join('\n')])).released).toBe(false)
  })

  it('needs the whole new text holding a place in the PDF: a word lost elsewhere in it may leave our wording equal to the annex\'s', () => {
    const standing = 'Eins gilt für alle Fälle der Welt.'
    const misread = 'Drei gilt ab dem Jahr 2024 und bis zum Ende für alle Fälle der Welt.'
    const ins: WitnessInstruction[] = [{ op: { kind: 'append', target: { para: '21' } as never, child: 'abs', childIds: ['3'] }, line: 'Dem § 21 wird folgender Abs. 3 angefügt:', payload: [misread] }]
    const pdf = renditionOfPages(['9. Dem § 21 wird folgender Abs. 3 angefügt:\n„(3) Drei gilt ab dem Jahr 2024 und bis zum Ende nicht für alle Fälle der Welt.“'])
    const rows = [changed('', '(3) Drei gilt ab dem Jahr 2025 und bis zum Ende für alle Fälle der Welt.')]
    expect(witnessVerdict('21', standing, `${standing} ${misread}`, rows, ins, pdf)).toEqual({ released: false, reason: 'nicht-im-pdf' })
  })
})
