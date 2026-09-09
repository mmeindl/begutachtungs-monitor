import { describe, expect, it } from 'vitest'
import { addressKey, expandRange, parseAddress, parseInstruction, splitCompound, splitPayloadScope, type NovaoOp } from '../server/utils/novao'

/** The single operation of an instruction, or a failure that names the reason. */
function op(line: string): NovaoOp {
  const parsed = parseInstruction(line)
  expect(parsed.ops, `refused: ${parsed.reason}`).toHaveLength(1)
  return parsed.ops[0]!
}

describe('parseAddress', () => {
  it('reads the full ladder down to the sentence', () => {
    const a = parseAddress('§ 9 Abs. 1 Z 3 lit. b zweiter Satz')!
    expect(a).toMatchObject({ para: '§ 9', abs: '1', z: '3', lit: 'b', satz: 'zweiter', level: 'satz' })
    expect(addressKey(a)).toBe('§ 9 Abs. 1 Z 3 lit. b zweiter Satz')
  })

  it('keeps lettered ids as identifiers, never as numbers', () => {
    expect(parseAddress('§ 12b Abs. 2a')).toMatchObject({ para: '§ 12b', abs: '2a', level: 'abs' })
  })

  it('ignores references inside quoted operands', () => {
    // The Ausdruck is the operand; the target is § 12 Abs. 3, not Abs. 1 Z 1.
    const a = parseAddress('In § 12 Abs. 3 wird der Ausdruck "Abs. 1 Z 1 bis 5" durch den Ausdruck "Abs. 1 Z 1 bis 6" ersetzt.')!
    expect(a).toMatchObject({ para: '§ 12', abs: '3', z: null })
  })

  it('expands "und" lists and integer ranges', () => {
    expect(parseAddress('§ 5 Abs. 2 und 3')!.siblings).toEqual(['3'])
    expect(parseAddress('§ 5 Z 4 bis 7')!.siblings).toEqual(['5', '6', '7'])
  })

  it('expands a lettered range that shares its numeric stem', () => {
    expect(parseAddress('§ 6 Abs. 4a bis 4c')).toMatchObject({ abs: '4a', siblings: ['4b', '4c'] })
    expect(expandRange('4a', '4c')).toEqual(['4b', '4c'])
  })

  it('refuses a range it cannot expand rather than acting on the first target', () => {
    expect(expandRange('5', '4')).toBeNull()
    expect(expandRange('2a', '5c')).toBeNull()
    expect(parseAddress('§ 5 Abs. 2a bis 5c')).toBeNull()
  })

  it('returns null when nothing is addressed, and inherits from a container', () => {
    expect(parseAddress('wird wie folgt geändert')).toBeNull()
    const container = parseAddress('§ 12 wird wie folgt geändert')!
    expect(parseAddress('In Abs. 5 entfällt der letzte Satz', container)).toMatchObject({ para: '§ 12', abs: '5' })
  })
})

describe('splitPayloadScope', () => {
  it('cuts the address scope before the announced new unit', () => {
    // Reading "Abs. 4" as the target would have appended inside the wrong unit.
    expect(splitPayloadScope('Dem § 5 wird folgender Abs. 4 angefügt').scope.trim()).toBe('Dem § 5 wird')
    expect(op('Dem § 5 wird folgender Abs. 4 angefügt:')).toMatchObject({ kind: 'append', child: 'abs', childIds: ['4'] })
  })
})

describe('parseInstruction', () => {
  it('distinguishes replacing a heading from replacing a § including it', () => {
    expect(op('Die Überschrift zu § 5 lautet:')).toMatchObject({ kind: 'replaceHeading' })
    expect(op('§ 5 lautet samt Überschrift:')).toMatchObject({ kind: 'replace', withHeading: true })
    expect(op('§ 5 lautet:')).toMatchObject({ kind: 'replace', withHeading: false })
  })

  it('reads phrase operations inside a unit, not as unit operations', () => {
    expect(op('In § 5 Abs. 1 entfällt die Wortfolge "auf Antrag".')).toMatchObject({ kind: 'deletePhrase', text: 'auf Antrag' })
    expect(op('§ 5 Abs. 1 entfällt.')).toMatchObject({ kind: 'delete' })
  })

  it('keeps the operand order of "ersetzt" and of "tritt an die Stelle"', () => {
    expect(op('In § 5 Abs. 1 wird die Wortfolge "alt" durch die Wortfolge "neu" ersetzt.')).toMatchObject({ from: 'alt', to: 'neu' })
    expect(op('In § 218 tritt an die Stelle der Wortfolge "alt" die Wortfolge "neu".')).toMatchObject({ from: 'alt', to: 'neu' })
    // Fronted new text is the one form that flips the order.
    expect(op('In § 218 tritt die Wortfolge "neu" an die Stelle der Wortfolge "alt".')).toMatchObject({ from: 'alt', to: 'neu' })
  })

  it('reads the anchor side of a phrase insertion', () => {
    expect(op('In § 9 Abs. 1 wird nach der Wortfolge "Eingriff" die Wortfolge "in das Grundrecht" eingefügt.')).toMatchObject({
      kind: 'insertPhrase',
      where: 'after',
      anchor: 'Eingriff',
      text: 'in das Grundrecht',
    })
  })

  it('resolves unquoted punctuation operands', () => {
    expect(op('In § 1 Abs. 4 Z 8 wird der Punkt am Ende durch einen Strichpunkt ersetzt.')).toMatchObject({ from: '.', to: ';' })
  })

  it('splits a line that carries two instructions', () => {
    const parsed = parseInstruction('In § 1 Abs. 4 Z 8 wird der Punkt am Ende durch einen Strichpunkt ersetzt sowie folgende Z 9 angefügt:')
    expect(parsed.ops.map((o) => o.kind)).toEqual(['replacePhrase', 'append'])
    // The second half has no address of its own and inherits the first one's.
    expect(parsed.ops[1]).toMatchObject({ target: { para: '§ 1', abs: '4' }, childIds: ['9'] })
    expect(splitCompound('§ 5 lautet:')).toHaveLength(1)
  })

  it('marks the table of contents as derivable, never applied', () => {
    expect(op('Im Inhaltsverzeichnis wird nach dem Eintrag zu § 5 folgender Eintrag eingefügt:')).toMatchObject({ kind: 'toc' })
  })

  it('refuses with a reason instead of guessing', () => {
    const parsed = parseInstruction('In § 5 Abs. 4 wird nach "§ 2 Abs. 1" ein Leerzeichen entfernt.')
    expect(parsed.ops).toHaveLength(0)
    expect(parsed.reason).toBeTruthy()
  })

  it('treats "wird wie folgt geändert" as a container, not a change', () => {
    expect(op('§ 5 wird wie folgt geändert:')).toMatchObject({ kind: 'container', target: { para: '§ 5' } })
  })
})

describe('laws organised in Artikel', () => {
  // "Art. II § 1" resolved to the document's first § — Art. 1's
  // Verfassungsbestimmung — and only missed editing it because that § had no
  // Abs. 5. Refused until the Artikel is part of a paragraph's identity.
  it('refuses a § addressed inside an Artikel', () => {
    expect(parseInstruction('Art. II § 1 Abs. 5 lautet:').ops).toHaveLength(0)
    expect(parseInstruction('In Art. 2 § 7 Abs. 1 entfällt die Wortfolge "und".').ops).toHaveLength(0)
  })

  it('still reads an Artikel address that names no §', () => {
    expect(parseInstruction('Art. 3 Abs. 2 lautet:').ops).toHaveLength(1)
  })

  it('still reads a citation of an EU article after the §', () => {
    const parsed = parseInstruction('In § 120 Abs. 1 wird die Wortfolge "Art. 9 der Verordnung (EG) Nr. 550/2004" durch die Wortfolge "Art. 10" ersetzt.')
    expect(parsed.ops).toHaveLength(1)
  })
})

describe('sentence addresses (2026-09-09)', () => {
  // 46 of 459 instructions in the harness corpus address sentences, in 26
  // surface forms; only "der zweite Satz" was read. The rest fell back to
  // the whole Absatz — "entfallen die letzten beiden Sätze" deleted § 169
  // Abs. 3 of the Luftfahrtgesetz outright.
  it('reads every declension, the numeric form and the runs', () => {
    expect(parseAddress('In § 5 Abs. 2 entfällt der zweite Satz')).toMatchObject({ satz: 'zweiter', satzCount: 1, level: 'satz' })
    expect(parseAddress('In § 5 Abs. 2 wird im zweiten Satz')).toMatchObject({ satz: 'zweiter', satzCount: 1 })
    expect(parseAddress('In § 23 Abs. 1 wird am Ende des zweiten Satzes')).toMatchObject({ satz: 'zweiter' })
    expect(parseAddress('In § 99 Abs. 1 2. Satz wird')).toMatchObject({ satz: 'zweiter', satzCount: 1 })
    expect(parseAddress('§ 134a Abs. 3 erster und zweiter Satz lautet')).toMatchObject({ satz: 'erster', satzCount: 2 })
    expect(parseAddress('In § 24j Abs. 2 lauten die ersten beiden Sätze')).toMatchObject({ satz: 'erster', satzCount: 2 })
    expect(parseAddress('In § 169 Abs. 3 entfallen die letzten beiden Sätze')).toMatchObject({ satz: 'letzter', satzCount: 2 })
  })

  it('reads the Einleitungssatz and the Schlussteil as parts of the unit', () => {
    expect(parseAddress('In § 40 Abs. 1 lautet der Einleitungssatz')).toMatchObject({ satz: 'einleitung', level: 'satz' })
    expect(parseAddress('In § 18 Abs. 2 entfällt der Schlusssatz')).toMatchObject({ satz: 'schluss' })
    expect(parseAddress('Im Schlussteil des § 169 Abs. 1 wird')).toMatchObject({ para: '§ 169', abs: '1', satz: 'schluss' })
  })

  it('refuses a sentence word it cannot place instead of widening to the Absatz', () => {
    expect(parseAddress('§ 169 Abs. 5 erster Halbsatz lautet')).toBeNull()
    expect(parseAddress('In § 5 Abs. 2 entfallen die Sätze')).toBeNull()
    // Non-consecutive pair: which sentences?
    expect(parseAddress('§ 5 Abs. 3 erster und dritter Satz lautet')).toBeNull()
    expect(parseInstruction('In § 18 Abs. 2 entfällt der Halbsatz nach dem Beistrich.').ops).toHaveLength(0)
  })

  it('leaves "folgender Satz" in the payload announcement alone', () => {
    expect(op('Dem § 5 Abs. 1 wird folgender Satz angefügt:')).toMatchObject({ kind: 'append', child: 'satz', target: { satz: null } })
  })

  it('names the sentence in the address key', () => {
    expect(addressKey(parseAddress('In § 40 Abs. 1 lautet der Einleitungssatz')!)).toBe('§ 40 Abs. 1 Einleitungssatz')
    expect(addressKey(parseAddress('In § 24j Abs. 2 lauten die ersten beiden Sätze')!)).toBe('§ 24j Abs. 2 erster Satz +1')
  })
})

describe('renumbering (2026-09-09)', () => {
  it('reads every spelling and number of the noun, and a run', () => {
    expect(op('Der bisherige § 10 erhält die Paragrafenbezeichnung "§ 11."')).toMatchObject({ kind: 'renumber', to: '§ 11.', toLast: null })
    expect(op('Die §§ 5 bis 7 erhalten die Paragraphenbezeichnungen "§ 7." bis "§ 9."')).toMatchObject({ kind: 'renumber', to: '§ 7.', toLast: '§ 9.', target: { siblings: ['6', '7'] } })
  })

  it('splits the compound whose second half is a renumbering', () => {
    // "Ziffernbezeichnungen" did not count as a verb, so the line was not
    // split and the renumbering silently dropped (LMSVG § 107).
    const parsed = parseInstruction('In § 107 entfällt Z 4; die Z 5 bis 9 erhalten die Ziffernbezeichnungen "4." bis "8".')
    expect(parsed.ops.map((o) => o.kind)).toEqual(['delete', 'renumber'])
    expect(parsed.ops[1]).toMatchObject({ target: { para: '§ 107', z: '5', siblings: ['6', '7', '8', '9'] }, to: '4.', toLast: '8' })
  })

  it('refuses several new designations it cannot pair', () => {
    expect(parseInstruction('Die §§ 5 und 9 erhalten die Bezeichnungen "§ 6." und "§ 10."').ops).toHaveLength(0)
  })
})

describe('what "jeweils" means (2026-09-09)', () => {
  it('is every occurrence only for a single place', () => {
    expect(op('In § 5 wird jeweils das Wort "alt" durch das Wort "neu" ersetzt.')).toMatchObject({ everywhere: true })
    const two = parseInstruction('In § 28 Abs. 3 und § 99 Abs. 1 wird jeweils die Wortfolge "alt" durch die Wortfolge "neu" ersetzt.')
    expect(two.ops).toHaveLength(2)
    expect(two.ops.every((o) => o.kind === 'replacePhrase' && !o.everywhere)).toBe(true)
    expect(op('In § 5 Abs. 1 und 2 wird jeweils das Wort "alt" durch das Wort "neu" ersetzt.')).toMatchObject({ everywhere: false })
  })

  it('appends to every named place', () => {
    const parsed = parseInstruction('§ 3 Abs. 1 und § 4 Abs. 1 wird jeweils folgender Satz angefügt:')
    expect(parsed.ops.map((o) => o.kind === 'append' && o.target.para)).toEqual(['§ 3', '§ 4'])
  })
})

describe('a comma set before the inserted phrase (2026-09-09)', () => {
  it('carries the comma into the inserted text', () => {
    // The Beistrich is unquoted, so reading only the quoted pair dropped it.
    expect(op('In § 131 Abs. 5 wird nach dem Wort "vorzuschreiben" ein Beistrich gesetzt und danach die Wortfolge "außer der Status" eingefügt.')).toMatchObject({
      kind: 'insertPhrase',
      anchor: 'vorzuschreiben',
      text: ', außer der Status',
    })
  })
})

describe('the explicit run form is marked', () => {
  it('sets run only for "durch folgende … ersetzt"', () => {
    expect(op('§ 5 lautet:')).toMatchObject({ kind: 'replace', run: false })
    expect(op('Die §§ 7 bis 9 werden durch folgende §§ 7 bis 14 ersetzt:')).toMatchObject({ kind: 'replace', run: true })
  })
})

describe('forms from the held-out corpus (2026-09-09)', () => {
  it('reads the Wegfall of a designation as a renumbering to nothing, not as a deletion', () => {
    // "entfällt die Absatzbezeichnung „(1)“" deleted § 33 Abs. 1 of the Tierschutzgesetz.
    expect(op('In § 33 Abs. 1 entfällt die Absatzbezeichnung "(1)".')).toMatchObject({ kind: 'renumber', to: '', target: { abs: '1' } })
  })

  it('places a § appended "nach § X" behind it, not inside it', () => {
    expect(op('Nach § 408a wird folgender § 408b samt Überschrift angefügt:')).toMatchObject({ kind: 'insertAfter', child: 'para', childIds: ['408b'], where: 'after' })
  })

  it('reads the third comma form', () => {
    expect(op('In § 5 Abs. 1 wird nach der Wortfolge "S. 1" ein Beistrich sowie die Wortfolge "in der jeweils geltenden Fassung" angefügt.')).toMatchObject({ kind: 'insertPhrase', text: ', in der jeweils geltenden Fassung' })
  })
})
