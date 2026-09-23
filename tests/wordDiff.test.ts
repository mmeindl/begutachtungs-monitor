import { describe, expect, it } from 'vitest'
import { diffTokens, isEditorialChange } from '../server/utils/diff/wordDiff'

describe('diffTokens', () => {
  it('finds word-level changes and a similarity', () => {
    const d = diffTokens('Die Frist beträgt sechs Wochen.', 'Die Frist beträgt acht Wochen.')
    expect(d.segments).toEqual([
      { type: 'equal', text: 'Die Frist beträgt' },
      { type: 'removed', text: 'sechs' },
      { type: 'inserted', text: 'acht' },
      { type: 'equal', text: 'Wochen.' },
    ])
    expect(d.similarity).toBeCloseTo(0.8, 5)
  })
})

describe('editorial vs substantive', () => {
  const seg = (a: string, b: string) => diffTokens(a, b).segments
  it('shifted cross-references and date formats are editorial', () => {
    expect(isEditorialChange(seg('Die Behörde gemäß § 15 Abs. 2 entscheidet.', 'Die Behörde gemäß § 16 Abs. 2 entscheidet.'))).toBe(true)
    expect(isEditorialChange(seg('in der Fassung vom 26.6.2024', 'in der Fassung vom 26.06.2024'))).toBe(true)
    expect(isEditorialChange(seg('nach den §§ 1 und 2', 'nach den §§ 1 bis 3'))).toBe(true)
    expect(isEditorialChange(seg('gilt Art. 3 lit. a;', 'gilt Art. 3 lit. b,'))).toBe(true)
  })
  it('a bare number is editorial only next to a citation word', () => {
    expect(isEditorialChange(seg('nach Abs. 6 gilt', 'nach Abs. 4 gilt'))).toBe(true)
    expect(isEditorialChange(seg('innerhalb von 6 Wochen', 'innerhalb von 4 Wochen'))).toBe(false)
    expect(isEditorialChange(seg('spätestens 2026 in Kraft', 'spätestens 2027 in Kraft'))).toBe(false)
  })
  it('one ordinary word is substantive, however long the paragraph', () => {
    const long = 'Wort '.repeat(150)
    expect(isEditorialChange(seg(`${long}Die Frist beträgt sechs Wochen.`, `${long}Die Frist beträgt acht Wochen.`))).toBe(false)
    expect(isEditorialChange(seg('Anlagen und Leitungen', 'Anlagen oder Leitungen'))).toBe(false)
    expect(isEditorialChange(seg('den §§ 1 bis 10', 'diesem Bundesgesetz mit Ausnahme der in'))).toBe(false)
  })
  it('a placeholder the Regierungsvorlage fills in is editorial', () => {
    expect(isEditorialChange(seg('Dem § 28 wird folgender Abs. XX angefügt', 'Dem § 28 wird folgender Abs. 69 angefügt'))).toBe(true)
    expect(isEditorialChange(seg('angefügt: "(xx) § 10 tritt in Kraft."', 'angefügt: "(69) § 10 tritt in Kraft."'))).toBe(true)
    expect(isEditorialChange(seg('tritt mit 1. Jänner 20xx in Kraft', 'tritt mit 1. Jänner 2026 in Kraft'))).toBe(true)
    // A lone X is a genuine blank, not a placeholder: naming the number is a decision.
    expect(isEditorialChange(seg('innerhalb von X Wochen', 'innerhalb von 6 Wochen'))).toBe(false)
  })
  it('the Fundstelle a law fills in at promulgation is editorial', () => {
    // Every law cites itself in its Inkrafttretens-Bestimmung, and the number
    // exists only once it is promulgated. Without the slash form these fell
    // through to `word`, which ends the check at once: the comparison
    // Plenarfassung → Kundmachung then reported 136 of 626 units as
    // substantive (Budgetbegleitgesetz 2025), where nothing but the citation
    // had been filled in (§12.33).
    expect(
      isEditorialChange(seg('in der Fassung des Bundesgesetzes BGBl. I Nr. xxx/2025 tritt', 'in der Fassung des Bundesgesetzes BGBl. I Nr. 50/2025 tritt')),
    ).toBe(true)
    expect(isEditorialChange(seg('BGBl. I Nr. xx/2025,', 'BGBl. I Nr. 44/2025,'))).toBe(true)
    expect(isEditorialChange(seg('BGBl. I Nr. xxx/xxxx', 'BGBl. I Nr. 60/2025'))).toBe(true)
    // And a citation replaced by ANOTHER one stays editorial too — not
    // because that is harmless but because the published definition says so
    // („nur Verweise, Zahlen, Daten oder Satzzeichen", /so-funktionierts).
    // The same rule as for the shifted cross-reference above.
    expect(isEditorialChange(seg('BGBl. I Nr. 12/2024 gilt', 'BGBl. I Nr. 50/2025 gilt'))).toBe(true)
  })
  it('articles and the case of a Novellierungsanweisung are editorial, logical connectives are not', () => {
    expect(isEditorialChange(seg('In § 28 wird folgender Abs. 69 angefügt', 'Dem § 28 wird folgender Abs. 69 angefügt'))).toBe(true)
    expect(isEditorialChange(seg('Nach Anlage 2 wird Anlage 3 eingefügt', 'Nach der Anlage 2 wird Anlage 3 eingefügt'))).toBe(true)
    expect(isEditorialChange(seg('die §§ 1 und 2 gelten', 'die §§ 1 oder 2 gelten'))).toBe(false)
    expect(isEditorialChange(seg('Nach § 5 wird § 5a eingefügt', 'Vor § 5 wird § 5a eingefügt'))).toBe(false)
  })
  it('a reworded Novellierungsanweisung stays substantive (88/ME, Anlage 3)', () => {
    expect(
      isEditorialChange(
        seg('Nach Anlage 2 wird folgende Anlage 3 samt Überschrift angefügt:', 'Nach der Anlage 2 wird folgende Anlage 3 eingefügt:'),
      ),
    ).toBe(false)
  })
  it('is false without segments', () => {
    expect(isEditorialChange(null)).toBe(false)
    expect(isEditorialChange([{ type: 'equal', text: 'x' }])).toBe(false)
  })
})
