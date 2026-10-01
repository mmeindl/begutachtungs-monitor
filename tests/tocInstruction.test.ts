import { describe, expect, it } from 'vitest'
import { draftUnits } from '../server/utils/annex/annexDraft'
import { refusedUnits } from '../server/utils/kons/konsGate'
import { NO_PARAGRAPH_ADDRESSED, addressedUnits, isTocInstruction, parseInstruction } from '../server/utils/kons/novao'
import { addressedParagraph } from '../server/utils/lawtext/instructionAddress'
import type { TextBlock } from '../server/utils/lawtext/lawUnits'
import { unitKey } from '../server/utils/text/designation'

const instruction = (text: string): TextBlock => ({ kind: 'novao', cls: 'absatz/novao1', text, gld: null })
const quoted = (text: string, gld: string | null = null): TextBlock => ({ kind: 'abs', cls: 'absatz/abs', text, gld })

/**
 * The table of contents in every wording the corpus carries (01.10.2026), and
 * the three readers that have to agree on it: the gate's refusal bookkeeping,
 * the annex's addresses and the § names. Each line named a real § before.
 */
const TOC_LINES = [
  // Already `toc` at the head.
  'Im Inhaltsverzeichnis entfällt der Eintrag zu § 17; die Einträge zu den §§ 18 und 19 lauten:',
  'Im Inhaltverzeichnis wird nach dem Eintrag zu § 33 folgender Eintrag eingefügt:',
  // Further in — refused as a phrase, and still § 50, § 21b, § 25.
  '2. Der Eintrag zu § 50 im Inhaltsverzeichnis lautet:',
  'Der Eintrag im Inhaltsverzeichnis zu § 21b lautet:',
  'Der den § 56 betreffende Eintrag des Inhaltsverzeichnisses lautet:',
  'Im Inhaltalsverzeichnis lautet der Eintrag zu § 25:',
  // Typed as an operation on the §: a renumbering, a replacement, a deletion, an insertion.
  'Die § 15 betreffende Zeile im Inhaltsverzeichnis erhält die Paragraphenbezeichnung "16." und die § 16 betreffende Zeile lautet:',
  'Die Überschrift des 8. Abschnitts im Inhaltsverzeichnis lautet:',
  'Im 3. Abschnitt des Inhaltsverzeichnisses entfällt im § 12 die Wortfolge "nachgewiesener Kenntnisse" , im 4. Abschnitt des Inhaltsverzeichnisses entfällt die Wort- und Ziffernfolge "§ 24. Strafbestimmungen" .',
  'Vor § 1 wird folgendes Inhaltsverzeichnis eingefügt:',
  'Nach dem Inhaltsverzeichnis zum 5. Abschnitt und vor dem Inhaltsverzeichnis zum 6. Abschnitt wird nach § 32 folgender Abschnitt 5a samt Überschrift eingefügt:',
]

describe('isTocInstruction — one predicate for the table of contents (01.10.2026)', () => {
  it.each(TOC_LINES)('names no § in any reader: %s', (line) => {
    expect(isTocInstruction(line)).toBe(true)
    expect(parseInstruction(line).ops.every((op) => op.kind === 'toc')).toBe(true)
    expect([...refusedUnits([], [line], unitKey)]).toEqual([])
    expect(addressedUnits(line)).toMatchObject({ paras: [], reason: NO_PARAGRAPH_ADDRESSED })
    expect(addressedParagraph(line)).toBeNull()
  })

  it('leaves an Anlage its own table of contents', () => {
    // Hitzeschutzverordnung: the table is part of the Anlage's text.
    const line = 'In Anlage 2 werden im Inhaltsverzeichnis in Teil IV die Zeilen "7. Reproduktionstoxische Arbeitsstoffe" und "8. Natürliche UV-Strahlung" angefügt.'
    expect(isTocInstruction(line)).toBe(false)
    expect([...refusedUnits([], [line], unitKey)]).toEqual(['Anl. 2'])
    expect(addressedUnits(line).paras).toEqual(['Anlage 2'])
  })

  it('keeps the § of a clause that is not on the table', () => {
    // Cut into clauses, only the one on the table is skipped.
    const cut = 'Im 3. Abschnitt des Inhaltsverzeichnisses entfällt der Eintrag zu § 12; in § 40 Abs. 2 wird das Wort "alt" durch das Wort "neu" ersetzt.'
    expect(parseInstruction(cut).ops.map((op) => op.kind)).toEqual(['toc', 'replacePhrase'])
    expect(addressedUnits(cut).paras).toEqual(['§ 40'])
    // Uncut, the clause holds a second instruction, and a refused line that
    // changes a § must still lock it — the entry's § with it, which costs a
    // §, never shows a wrong one.
    const uncut = 'Im 3. Abschnitt des Inhaltsverzeichnisses entfällt der Eintrag zu § 12 und in § 40 Abs. 2 wird etwas Unlesbares geändert.'
    expect(isTocInstruction(uncut)).toBe(false)
    expect([...refusedUnits([], [uncut], unitKey)]).toContain('40')
  })

  it('reads „Zeile" and „Eintrag" as the table only behind a clause on it', () => {
    expect(isTocInstruction('In der Anlage 1 in der Tabelle lautet die Zeile betreffend den Lehrberuf Glasbautechnik:')).toBe(false)
    expect(isTocInstruction('In Anlage 2 wird nach dem Eintrag für Hexan folgender Eintrag eingefügt:')).toBe(false)
  })

  it('takes a quoted „Inhaltsverzeichnis" for the operand it is', () => {
    expect(isTocInstruction('In § 5 wird das Wort "Inhaltsverzeichnis" durch das Wort "Übersicht" ersetzt.')).toBe(false)
  })

  it('files no annex unit on the table under a §, nor its lettered lines and payload', () => {
    // Börsegesetz 2018 and NAG on GP XXVIII: the entries are not the §§.
    const units = draftUnits([
      instruction('1. Das Inhaltsverzeichnis wird wie folgt geändert:'),
      instruction('a) nach dem Eintrag zu § 20 wird folgender Eintrag eingefügt:'),
      quoted('Übergangsbestimmung', '§ 20a.'),
      instruction('b) der Eintrag zu § 123 lautet:'),
      instruction('2. Im Inhaltsverzeichnis wird nach dem Eintrag zu § 19 folgender Eintrag eingefügt:'),
      quoted('Aufenthaltstitel', '§ 19a.'),
      instruction('3. § 19a lautet:'),
      quoted('Die Behörde entscheidet.', '§ 19a.'),
    ])
    expect(units.map((u) => [u.id, u.paras, u.reason])).toEqual([
      ['Z1', [], NO_PARAGRAPH_ADDRESSED],
      ['Z2', [], NO_PARAGRAPH_ADDRESSED],
      ['Z3', ['§ 19a', '§ 19a.'], null],
    ])
  })
})
