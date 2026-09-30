import { describe, expect, it } from 'vitest'
import { addressedParagraph, addressedParagraphOf, instructionParagraphs } from '../server/utils/lawtext/instructionAddress'
import type { LawDiffUnit } from '../shared/types'

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
    expect(instructionParagraphs('Die §§ 6 und 7 samt Überschriften entfallen.')).toEqual(['§ 6', '§ 7'])
    expect(instructionParagraphs('Die §§ 5 bis 7 entfallen.')).toEqual(['§ 5', '§ 6', '§ 7'])
    expect(instructionParagraphs('§ 5 Abs. 2 und 3 entfallen.')).toEqual(['§ 5'])
    expect(instructionParagraphs('Nach § 5 wird folgender § 5a samt Überschrift eingefügt:')).toEqual([])
  })

  it('returns null for an instruction it cannot read', () => {
    expect(addressedParagraph('Im Inhaltsverzeichnis wird nach dem Eintrag zu § 5 folgender Eintrag eingefügt:')).toBeNull()
    expect(addressedParagraph('§ 5 wird wie folgt geändert:')).toBeNull()
  })

  // 30.09.2026: the grammar refused the verb, the address is plain — every
  // line below is one the corpus had without a name (GP XXVI–XXVIII).
  it('reads the § of an instruction the grammar could not type', () => {
    expect(addressedParagraph('In § 5 Abs. 1 entfällt die Wort- und Zeichenfolge "nicht gemäß §§ 4 oder 4a erledigter", nach der Wortfolge "Antrag auf internationalen Schutz ist" wird das Wort "überdies" eingefügt.')).toBe('§ 5')
    expect(addressedParagraph('In § 12 entfallen die Absatzbezeichnung "(1)" und Abs. 2; das Zitat "§ 71 AVG" wird durch das Zitat "§ 33 VwGVG" ersetzt.')).toBe('§ 12')
    expect(addressedParagraph('In § 57 Abs. 1 entfällt in Z 2 der Punkt; folgender Schlussteil wird angefügt: "und sich seit der Erlassung"')).toBe('§ 57')
    expect(addressedParagraph('§ 382e erhält die Bezeichnung § 382c; dessen Abs. 2 bis 4 sowie die Absatzbezeichnung "(1)" entfallen.')).toBe('§ 382e')
  })

  it('leaves the forms of a refused instruction unread that would name the wrong §', () => {
    // The table of contents, in wordings the grammar does not know as one.
    expect(addressedParagraph('Der den § 56 betreffende Eintrag des Inhaltsverzeichnisses lautet:')).toBeNull()
    expect(addressedParagraph('Der Eintrag im Inhaltsverzeichnis zu § 39 lautet:')).toBeNull()
    // A § the instruction creates.
    expect(addressedParagraph('Der 1. Abschnitt des 2. Teils samt Überschriften wird ersetzt durch § 16 (neu) samt Überschrift:')).toBeNull()
    // A division beside a §, not the §.
    expect(addressedParagraph('Vor § 40 werden folgende Abschnittsbezeichnung und Abschnittsüberschrift eingefügt:')).toBeNull()
    expect(addressedParagraph('Die Abschnittsbezeichnung "Zweiter Abschnitt" vor § 555 entfällt.')).toBeNull()
    expect(addressedParagraph('§ 484 werden folgende Bezeichnung und Überschrift vorangestellt:')).toBeNull()
    // A § inside an Artikel of the law: which § 9a is not the name's guess.
    expect(addressedParagraph('In Art. I § 9a Abs. 7 wird vor dem Punkt die Wortfolge "und zu evaluieren" eingefügt.')).toBeNull()
  })

  it('reads no § out of a unit that is a § itself', () => {
    const unit = { id: '§48', toText: '(1) Die Regulierungsbehörde hat sicherzustellen, dass die Lieferanten ihren Pflichten gemäß § 47 nachkommen.', fromText: null, heading: null } as unknown as LawDiffUnit
    expect(addressedParagraphOf(unit)).toBeNull()
    expect(addressedParagraphOf({ ...unit, id: 'Z3', toText: 'In § 47 Abs. 1 wird das Wort "alt" durch das Wort "neu" ersetzt.' })).toBe('§ 47')
  })
})
