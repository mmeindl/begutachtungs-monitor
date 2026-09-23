import { describe, expect, it } from 'vitest'
import { addressKey, expandRange, parseAddress, parseAddressList, parseInstruction, splitCompound, splitPayloadScope, type NovaoOp } from '../server/utils/kons/novao'

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

  it('marks "samt Überschrift" as a second place, not as a heading-only address', () => {
    const a = parseAddress('In § 22 samt Überschrift')!
    expect(a).toMatchObject({ para: '§ 22', heading: false, alsoHeading: true })
    // "Die Überschrift zu § 5" stays heading-*only*: one place, not two.
    expect(parseAddress('In der Überschrift zu § 5')).toMatchObject({ heading: true, alsoHeading: false })
  })

  it('gives a "samt Überschrift" target its own heading operation', () => {
    const parsed = parseInstruction('In § 22 samt Überschrift, § 23 Abs. 1 und § 25 Abs. 4 wird jeweils das Wort "Generalprokuratur" durch das Wort "Bundesstaatsanwaltschaft" ersetzt.')
    expect(parsed.reason).toBeNull()
    const headings = parsed.ops.filter((o) => 'target' in o && o.target.heading)
    expect(headings).toHaveLength(1)
    expect(headings[0]).toMatchObject({ target: { para: '§ 22', level: 'para', abs: null } })
    expect(parsed.ops).toHaveLength(4)
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

describe('Adressen über mehrere Paragraphen', () => {
  // "In den §§ 48 Abs. 13 und 217 Abs. 13": only the first Paragraph carries
  // its § sign, the rest stand as a bare number. That used to be read as
  // "§ 48 Abs. 217" — and where that Absatz happens to exist, the engine
  // changes standing law the instruction never named (18.09.2026).
  it('verweigert, wenn die aufgezählte Zahl eine eigene Komponente trägt', () => {
    expect(parseAddress('In den §§ 48 Abs. 13 und 217 Abs. 13')).toBeNull()
    expect(parseAddress('In den §§ 19 Abs. 1, 48 Abs. 13, 192 Abs. 1')).toBeNull()
    expect(parseAddress('In den §§ 30 Abs. 3 zweiter Satz, 32 Abs. 4 zweiter Satz')).toBeNull()
    expect(parseAddress('In den §§ 2 Z 3 und 17 Z 4')).toBeNull()
  })

  it('liest eine echte Aufzählung derselben Ebene weiterhin', () => {
    const a = parseAddress('In § 5 Abs. 1 und 2')
    expect(a?.para).toBe('§ 5')
    expect(a?.abs).toBe('1')
    expect(a?.siblings).toEqual(['2'])
    const z = parseAddress('In § 5 Abs. 1 Z 3, 4 und 7')
    expect(z?.z).toBe('3')
    expect(z?.siblings).toEqual(['4', '7'])
  })

  it('lässt zwei vollständig bezeichnete Paragraphen unberührt — die trägt parseAddressList', () => {
    const list = parseAddressList('In § 28 Abs. 3 und § 99 Abs. 1')
    expect(list?.map((a) => a.para)).toEqual(['§ 28', '§ 99'])
    expect(list?.every((a) => a.siblings.length === 0)).toBe(true)
  })
})

describe('parseAddressList — die Plural-Kurzschreibweise', () => {
  const keys = (t: string) => parseAddressList(t)?.map(addressKey)

  it('zerlegt „§§ X Abs. n und Y Abs. m" in zwei Paragraphen', () => {
    expect(keys('In den §§ 48 Abs. 13 und 217 Abs. 13')).toEqual(['§ 48 Abs. 13', '§ 217 Abs. 13'])
    expect(keys('In den §§ 19 Abs. 1, 48 Abs. 13, 192 Abs. 1')).toEqual(['§ 19 Abs. 1', '§ 48 Abs. 13', '§ 192 Abs. 1'])
  })

  it('unterscheidet ein weiteres Geschwister von einem weiteren Paragraphen', () => {
    // The 7 is an Absatz of § 20, the 193 a Paragraph of its own — the
    // difference stands after the number, not in the conjunction.
    const list = parseAddressList('In den §§ 20 Abs. 6 und 7 sowie 193 Abs. 6 und 7')
    expect(list?.map((a) => a.para)).toEqual(['§ 20', '§ 193'])
    expect(list?.[0]!.siblings).toEqual(['7'])
    expect(list?.[1]!.siblings).toEqual(['7'])
  })

  it('lässt einen Paragraphen, der sein Zeichen selbst trägt, unverändert', () => {
    expect(keys('In den §§ 184 Abs. 4 sowie in § 380 Abs. 1 Z 3')).toEqual(['§ 184 Abs. 4', '§ 380 Abs. 1 Z 3'])
  })

  it('zerlegt die Satz-Form, die keine nackte Zahl hinterlässt', () => {
    expect(keys('In den §§ 30 Abs. 3 zweiter Satz, 32 Abs. 4 zweiter Satz')).toEqual([
      '§ 30 Abs. 3 zweiter Satz',
      '§ 32 Abs. 4 zweiter Satz',
    ])
  })

  it('rührt eine echte Aufzählung auf Paragraphenebene nicht an', () => {
    const list = parseAddressList('In den §§ 23 und 24')
    expect(list).toHaveLength(1)
    expect(list?.[0]!.para).toBe('§ 23')
    expect(list?.[0]!.siblings).toEqual(['24'])
  })
})

describe('Operandenvokabular und ausgeschriebene Umbenennungen', () => {
  it('liest den Prozentsatz als Operanden', () => {
    const { ops } = parseInstruction('In § 4 Z 2 wird der Prozentsatz "65%" durch den Prozentsatz "50%" ersetzt.')
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ kind: 'replacePhrase', from: '65%', to: '50%' })
  })

  it('liest eine Umbenennung mit ausgeschriebenem Subjekt', () => {
    // "In § 213 erhält Abs. 4 die Absatzbezeichnung": the same renaming as
    // without a subject, and the address is already right — § 213 Abs. 4.
    const { ops } = parseInstruction('In § 213 erhält Abs. 4 die Absatzbezeichnung "(5)".')
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ kind: 'renumber', to: '(5)' })
    expect((ops[0] as { target: { para: string; abs: string } }).target).toMatchObject({ para: '§ 213', abs: '4' })
  })

  it('liest auch „der bisherige Abs. n"', () => {
    const { ops } = parseInstruction('In § 7 erhält der bisherige Abs. 8 die Absatzbezeichnung "(9)".')
    expect((ops[0] as { target: { abs: string } }).target).toMatchObject({ abs: '8' })
  })

  it('verweigert weiterhin „der bisherige Inhalt" — das ist keine Umbenennung', () => {
    // The whole Paragraph's text becomes Abs. 1: a level drawn in, not a new
    // number. A different operation, a different danger.
    const { ops, reason } = parseInstruction('In § 10 erhält der bisherige Inhalt die Absatzbezeichnung "(1)".')
    expect(ops.filter((o) => o.kind === 'renumber')).toHaveLength(0)
    expect(reason ?? 'nicht gelesen').toBeTruthy()
  })
})

describe('sub-units the address model has no level for (2026-09-23)', () => {
  // `NovaoAddress` ends at `lit` and `lawtext/konsTree.ts` has no level below
  // it either — RIS files "aa)" as a `lit` SIBLING of "a)". So an address that
  // named a sublit was read as if the word were not there and the operation
  // ran one level too high: a whole Litera rewritten or deleted, with no
  // refusal and both gate signals green. 18 sublit, 19 Teilstrich and 8
  // Spiegelstrich addresses in the 6.576-instruction corpus, 13 of them
  // whole-unit operations.
  it('refuses a Neufassung addressed at a sublit', () => {
    const parsed = parseInstruction('§ 7 Abs. 1 Z 2 lit. h sublit. bb lautet:')
    expect(parsed.ops).toEqual([])
    expect(parsed.reason).toBe('Untergliederung ohne eigene Ebene: sublit')
  })

  it('refuses a deletion addressed at a sublit — the case that deleted the Litera', () => {
    const parsed = parseInstruction('§ 5 Z 20 lit. a sublit. bb entfällt.')
    expect(parsed.ops).toEqual([])
    expect(parsed.reason).toMatch(/^Untergliederung ohne eigene Ebene: sublit/)
  })

  it('refuses a Teilstrich and a Spiegelstrich, which are no units of the tree at all', () => {
    expect(parseInstruction('In § 1 Abs. 1 Z 2 lautet der erste Teilstrich:').reason).toBe('Untergliederung ohne eigene Ebene: Teilstrich')
    expect(parseInstruction('In Anlage 2 Z 1 entfällt der vierte Spiegelstrich.').reason).toBe('Untergliederung ohne eigene Ebene: Spiegelstrich')
    expect(parseAddress('In § 5 Abs. 2 Teilstrich 4')).toBeNull()
  })

  // The word has to stand in the address. A quoted operand that carries it is
  // text, not a target, and an ordinary Litera address is untouched — this
  // refusal may not cost the level it is meant to protect.
  it('leaves lit. a alone, and reads the word only where it addresses', () => {
    expect(parseAddress('§ 5 Z 20 lit. a')).toMatchObject({ para: '§ 5', z: '20', lit: 'a', level: 'lit' })
    expect(op('§ 5 Z 20 lit. a lautet:')).toMatchObject({ kind: 'replace', target: { lit: 'a' } })
    expect(op('In § 5 Abs. 1 wird die Wortfolge "der zweite Spiegelstrich" durch die Wortfolge "die zweite Litera" ersetzt.')).toMatchObject({ kind: 'replacePhrase', target: { para: '§ 5', abs: '1' } })
  })
})

describe('a word operand is a word, not a substring (2026-09-23)', () => {
  // "das Wort X" names a lexical unit, "die Wortfolge X" a stretch of text.
  // The engine matched both as substrings, so "das Wort ‚Amt'" hit inside
  // "Amtsstelle". `kons/lawApply.ts` is where that is decided, and only this
  // module can see which noun the instruction used.
  it('marks Wort and Worte, and leaves Wortfolge literal', () => {
    expect(op('In § 5 Abs. 1 wird das Wort "Amt" durch das Wort "Behörde" ersetzt.')).toMatchObject({ kind: 'replacePhrase', from: 'Amt', to: 'Behörde', wordBound: true })
    expect(op('In § 5 Abs. 1 wird die Wortfolge "Amt" durch die Wortfolge "Behörde" ersetzt.')).toMatchObject({ kind: 'replacePhrase', wordBound: false })
    expect(op('In § 5 Abs. 1 entfallen die Worte "und der Partei".')).toMatchObject({ kind: 'deletePhrase', wordBound: true })
  })

  it('reads the noun in front of the operand it searches for, not the first one in the line', () => {
    // What is searched for is the anchor, and the anchor is the "Wort"; the
    // inserted text is a Wortfolge and says nothing about how to find it.
    expect(op('In § 5 Abs. 1 wird nach dem Wort "Behörde" die Wortfolge "am Sitz der Partei" eingefügt.')).toMatchObject({ kind: 'insertPhrase', anchor: 'Behörde', wordBound: true })
    // The other way round: what is searched for is the Wortfolge.
    expect(op('In § 5 Abs. 1 wird die Wortfolge "die Behörde" durch das Wort "Bezirksverwaltungsbehörde" ersetzt.')).toMatchObject({ kind: 'replacePhrase', from: 'die Behörde', wordBound: false })
  })
})
