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
    // The comma the sentence puts behind the date is the sentence's, not the
    // date's — the test ran on the raw token (77/ME and 79/ME, ABl. L 275).
    expect(isEditorialChange(seg('ABl. Nr. L 275 vom 30.10.2023 , S. 1', 'ABl. Nr. L 275 vom 30.10.2023, S. 1'))).toBe(true)
    expect(isEditorialChange(seg('nach den §§ 1 und 2', 'nach den §§ 1 bis 3'))).toBe(true)
    expect(isEditorialChange(seg('gilt Art. 3 lit. a;', 'gilt Art. 3 lit. b,'))).toBe(true)
  })
  it('a date is editorial when it is respelled, substantive when it moves', () => {
    // The three numeric-date units of GP XXVIII, ME→RV (23.09.2026): two are
    // zero padding, one corrects the date of an ABl. Fundstelle.
    expect(isEditorialChange(seg('mit Wirkung vom 26.6.2024', 'mit Wirkung vom 26.06.2024'))).toBe(true)
    expect(isEditorialChange(seg('mit Wirkung vom 16.1.2023', 'mit Wirkung vom 16.01.2023'))).toBe(true)
    expect(isEditorialChange(seg('ABl. Nr. L 123 vom 20.4.2021 S. 5', 'ABl. Nr. L 123 vom 30.4.2021 S. 5'))).toBe(false)
    // The verdict the old rule got wrong in the direction that matters: six
    // months of Inkrafttreten badged „redaktionell".
    expect(isEditorialChange(seg('tritt mit 1.1.2027 in Kraft', 'tritt mit 1.7.2027 in Kraft'))).toBe(false)
    // It was substantive before only because of the full stop, which
    // `NUMBER_RE` now accepts — so the calendar has to carry it.
    expect(isEditorialChange(seg('Ablauf des 31.12.2026.', 'Ablauf des 31.12.2036.'))).toBe(false)
    // A date that fills a placeholder stays editorial: there the draft left a
    // blank rather than naming a different day. It is the YEAR the drafts
    // leave open — a fully dotted "xx.xx.xxxx" occurs 0 times in the 88 ME→RV
    // pairs and the 84 rv→bgbl drafts of GP XXVIII (23.09.2026), so
    // `isPlaceholder` is not widened to it on a guess.
    expect(isEditorialChange(seg('tritt mit 1. Jänner 20xx in Kraft', 'tritt mit 1. Jänner 2027 in Kraft'))).toBe(true)
  })
  it('a bare number is editorial only next to a citation word', () => {
    expect(isEditorialChange(seg('nach Abs. 6 gilt', 'nach Abs. 4 gilt'))).toBe(true)
    expect(isEditorialChange(seg('innerhalb von 6 Wochen', 'innerhalb von 4 Wochen'))).toBe(false)
    expect(isEditorialChange(seg('spätestens 2026 in Kraft', 'spätestens 2027 in Kraft'))).toBe(false)
  })
  it('a citation word one word back is a noun, not a reference', () => {
    // `CITATION_WORDS` holds five ordinary nouns, and the adjacency test read
    // the last TWO words before the change — so a rate and an amount came out
    // „redaktionell" (23.09.2026).
    expect(isEditorialChange(seg('Der Satz beträgt 5 vH.', 'Der Satz beträgt 7 vH.'))).toBe(false)
    expect(isEditorialChange(seg('Der Teil beträgt 500 Euro.', 'Der Teil beträgt 700 Euro.'))).toBe(false)
    // The controls, substantive before and after.
    expect(isEditorialChange(seg('Der Beitragssatz beträgt 5 vH', 'Der Beitragssatz beträgt 7 vH'))).toBe(false)
    expect(isEditorialChange(seg('Nach Abs. 3 sind 500 Euro zu zahlen', 'Nach Abs. 3 sind 700 Euro zu zahlen'))).toBe(false)
    // Directly beside the change the same words still mean what the list says.
    expect(isEditorialChange(seg('gilt der Satz 5 sinngemäß', 'gilt der Satz 7 sinngemäß'))).toBe(true)
    expect(isEditorialChange(seg('Nach Anlage 2 ist vorzugehen', 'Nach Anlage 3 ist vorzugehen'))).toBe(true)
    // And behind the first member of a range, which is what the strict
    // one-token rule would have lost.
    expect(isEditorialChange(seg('nach den §§ 1 und 2', 'nach den §§ 1 bis 3'))).toBe(true)
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
    // The ressorts do not agree on the blank letter: rv→bgbl over GP XXVIII
    // writes "yyy" and "202Y" as often as "xxx" (45/ME, 63/ME, 77/ME, 79/ME,
    // measured 23.09.2026).
    expect(isEditorialChange(seg('BGBl. I Nr. yyy/2026 tritt', 'BGBl. I Nr. 36/2026 tritt'))).toBe(true)
    expect(isEditorialChange(seg('BGBl. I Nr. yyy/202Y,', 'BGBl. I Nr. 28/2026,'))).toBe(true)
    expect(isEditorialChange(seg('BGBl. I Nr. xxx/yyyy gilt', 'BGBl. I Nr. 70/2025 gilt'))).toBe(true)
    // A lone blank letter stays a blank the way a lone "X" does.
    expect(isEditorialChange(seg('innerhalb von y Wochen', 'innerhalb von 6 Wochen'))).toBe(false)
    // The FILLED Fundstelle at the end of a sentence: `isPlaceholder` strips
    // the full stop, `NUMBER_RE` did not, so "31/2026." was a word — and one
    // word ends the check (69/ME, seven times in one Inkrafttretensbestimmung).
    expect(isEditorialChange(seg('des Bundesgesetzes BGBl. I Nr. xxx/2026.', 'des Bundesgesetzes BGBl. I Nr. 31/2026.'))).toBe(true)
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
