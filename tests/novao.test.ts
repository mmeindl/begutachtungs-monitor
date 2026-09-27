import { describe, expect, it } from 'vitest'
import { addressKey, expandRange, opAddress, parseAddress, parseAddressList, parseInstruction, splitCompound, splitPayloadScope, type NovaoAddress, type NovaoOp } from '../server/utils/kons/novao'

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

  it('splits two text operations joined by a conjunction', () => {
    const parsed = parseInstruction('In § 21 Abs. 1 wird die Wortfolge "A B" durch das Wort "B" ersetzt und es entfällt die Wortfolge "C".')
    expect(parsed.reason).toBeNull()
    expect(parsed.ops.map((o) => o.kind)).toEqual(['replacePhrase', 'deletePhrase'])
  })

  it('leaves a conjunction inside an address or an operand list alone', () => {
    // Both carry their verb at the end, so neither half in front of the "und"
    // has one — the test that makes the wider split safe.
    expect(splitCompound('In § 12 Abs. 1 Z 1 und § 13 Abs. 1 wird das Wort "A" durch "B" ersetzt.')).toHaveLength(1)
    expect(splitCompound('In § 5 wird der Ausdruck "A" durch "B" und die Wortfolge "C" durch "D" ersetzt.')).toHaveLength(1)
  })

  it('carries every address of the first clause into the second', () => {
    // Carrying only the first wrote the insertion into both §§ and the
    // deletion into one — an instruction half carried out.
    const parsed = parseInstruction('In § 12 Abs. 1 und § 13 Abs. 1 wird nach dem Zitat "Abs. 4" das Zitat "46a" eingefügt und entfällt das Zitat "Abs. 2".')
    expect(parsed.reason).toBeNull()
    expect(parsed.ops.filter((o) => o.kind === 'deletePhrase')).toHaveLength(2)
    expect(parsed.ops.map((o) => ('target' in o ? o.target.para : null))).toEqual(['§ 12', '§ 13', '§ 12', '§ 13'])
  })

  it('reads a deletion by the role of its operands, not their order', () => {
    const several = parseInstruction('In § 131 Abs. 4 entfallen die Zitierungen "ABl. L 71" und "ABl. L 326".')
    expect(several.ops).toMatchObject([{ kind: 'deletePhrase', text: 'ABl. L 71' }, { kind: 'deletePhrase', text: 'ABl. L 326' }])
    // The anchor says where the text stands; deleting it removed the wrong one.
    const anchored = parseInstruction('In § 12 Abs. 1 entfällt nach dem Zitat "49 Abs. 1" das Zitat ", 2".')
    expect(anchored.ops).toMatchObject([{ kind: 'deletePhrase', text: ', 2' }])
  })

  it('does not pair a replacement with its anchor', () => {
    // "nach dem Ausdruck „AsylG 2005"" says where to look; pairing it with the
    // word wrote the citation over the word it was meant to find (BFA-VG § 14).
    expect(op('In § 14 wird nach dem Ausdruck "AsylG 2005" das Wort "und" durch einen Beistrich ersetzt.')).toMatchObject({ from: 'und', to: ',' })
  })

  it('reads a replacement whose second operand is named rather than quoted', () => {
    expect(op('In § 15 Abs. 1 Z 3 wird das Wort "oder" durch einen Punkt ersetzt.')).toMatchObject({ from: 'oder', to: '.' })
    expect(op('In § 15 Abs. 1 Z 2 wird der Strichpunkt am Ende durch das Wort " oder" ersetzt.')).toMatchObject({ from: ';', to: 'oder' })
  })

  it('separates two clauses at a comma as well', () => {
    // "… durch das Wort „sowie" ersetzt, entfällt die Z 6 und erhält die
    // bisherige Z 7 …": the replacement was carried out and the deletion
    // dropped while only "und" and ";" separated clauses (Ärztegesetz § 14).
    const parsed = parseInstruction('In § 14 Abs. 1 wird der Beistrich am Ende der Z 5 durch das Wort "sowie" ersetzt, entfällt die Z 6 und erhält die bisherige Z 7 die Ziffernbezeichnung "6." .')
    expect(parsed.reason).toBeNull()
    expect(parsed.ops.map((o) => o.kind)).toEqual(['replacePhrase', 'delete', 'renumber'])
  })

  it('names the unit an unresolvable address points at', () => {
    // The refusal is the same as before; the word is what makes the census
    // of 55 readable. No colon — the harness cuts its tally at one.
    const of = (line: string): string | null => parseInstruction(line).reason
    expect(of('Die Anhänge II und III entfallen.')).toBe('Anhang ohne eigene Ebene')
    expect(of('In der Tarifpost 9 Anmerkung 16 entfällt der letzte Satz.')).toBe('Tarifpost ohne eigene Ebene')
    expect(of('Der Titel lautet:')).toBe('Titel ohne eigene Ebene')
    // An Artikel of a directive standing in front of a § is refused by the
    // guard in `parseAddress`; the refusal now says what it saw.
    expect(of('In Umsetzung von Art. VI der Richtlinie wird in § 3 Abs. 1 die Wortfolge "A" gestrichen.')).toBe('Artikel in römischer Zahl ohne eigene Ebene')
    expect(of('Die Überschrift des 2. Hauptstücks lautet:')).toBe('Hauptstück ohne eigene Ebene')
    // A § the parser can read is not touched by any of this.
    expect(of('In § 5 Abs. 1 entfällt die Wortfolge "A".')).toBeNull()
  })

  it('keeps a sibling Absatz that stands inside a longer list', () => {
    // „In § 9, § 10 Abs. 1 und 2, § 11a …": the „2" carries no § of its own,
    // and the list reader dropped every part that carries none — so § 10 was
    // addressed in one of its two Absätze and the instruction reported
    // success. 27 of 219 such addresses over 300 Entwürfe (26.09.2026).
    const list = parseAddressList('In § 9, § 10 Abs. 1 und 2, § 11a')!
    expect(list.map((a) => addressKey(a))).toEqual(['§ 9', '§ 10 Abs. 1', '§ 11a'])
    expect(list[1]!.siblings).toEqual(['2'])
    // Standing alone it was always right, and stays so.
    expect(parseAddressList('In § 9 Abs. 1 und 2')![0]!.siblings).toEqual(['2'])
  })

  it('reads a schedule that names no number, and its unit in front of it', () => {
    // „Z 1 lit. d des Anhangs entfällt" — the law has exactly one Anhang, so
    // the definite article is the designation, and German puts the unit
    // first. Read from behind the designation the address was the whole
    // schedule, and the deletion would have taken it instead of the litera.
    expect(op('Z 1 lit. d des Anhangs entfällt.')).toMatchObject({ kind: 'delete', target: { para: 'Anhang', z: '1', lit: 'd' } })
    expect(op('Z 1 lit. c des Anhangs lautet:')).toMatchObject({ kind: 'replace', target: { para: 'Anhang', z: '1', lit: 'c' } })
    // A number behind it reads the same as it always did.
    expect(op('In Anlage 2 Z 3 entfällt die Wortfolge "A".')).toMatchObject({ target: { para: 'Anlage 2', z: '3' } })
  })

  it('reads an Artikel written in Roman as the unit RIS labels in arabic', () => {
    // „Dem Art. VI wird folgende Z 85 angefügt" (GGG) against RIS's „Art. 6"
    // — the same join `articleNumberKey` already does for „Art. II § 7".
    expect(op('Dem Art. VI wird folgende Z 85 angefügt:')).toMatchObject({ kind: 'append', target: { para: 'Art. 6' } })
    expect(op('Dem Art. VII wird folgender Abs. 28 angefügt:')).toMatchObject({ kind: 'append', target: { para: 'Art. 7' } })
    // An Artikel in front of a § stays the container it was.
    expect(op('In Art. II § 7 Abs. 1 entfällt die Wortfolge "A".')).toMatchObject({ target: { artikel: '2', para: '§ 7', abs: '1' } })
  })

  it('refuses a unit deletion that names a text', () => {
    // A unit deletion takes a whole Absatz out; a quotation says the clause
    // was about a text whose noun this parser has no word for.
    const parsed = parseInstruction('In § 5 Abs. 1 entfällt die Passage "auf Antrag".')
    expect(parsed.ops).toHaveLength(0)
    expect(parsed.reason).toMatch(/nennt einen Text/)
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
  // Abs. 5. Refused until 25.09.2026; now the Artikel is part of the address,
  // normalised to the arabic form RIS keys its documents by (§12.12a).
  it('carries the Artikel of a § addressed inside one', () => {
    expect(op('Art. II § 1 Abs. 5 lautet:')).toMatchObject({ target: { artikel: '2', para: '§ 1', abs: '5' } })
    expect(op('In Art. 2 § 7 Abs. 1 entfällt die Wortfolge "und".')).toMatchObject({ target: { artikel: '2', para: '§ 7', abs: '1' } })
  })

  it('reads the components out of the §, not out of the Artikel in front of it', () => {
    // `PARA_RE` matches "Artikel 1" too, so the arabic form is the dangerous
    // one: read from the start, "Artikel 1 § 2 Abs. 3" becomes "Art. 1 Abs. 3".
    expect(op('In Artikel 1 § 2 Abs. 3 entfällt die Wortfolge "und".')).toMatchObject({ target: { artikel: '1', para: '§ 2', abs: '3' } })
  })

  it('writes the Artikel into the key, so two Artikel never share one', () => {
    const [a] = parseAddressList('Art. II § 3 Abs. 2')!
    const [b] = parseAddressList('Art. III § 3 Abs. 2')!
    expect(addressKey(a!)).toBe('Art. 2 § 3 Abs. 2')
    expect(addressKey(b!)).toBe('Art. 3 § 3 Abs. 2')
  })

  it('carries the Artikel to the further §§ of one instruction', () => {
    // The Artikel is written once and holds for the rest of the list, exactly
    // like the § sign in the plural shorthand.
    const parsed = parseInstruction('In Artikel II § 8 und § 9 Abs. 1 wird folgender Satz angefügt: "Neu."')
    expect(parsed.ops).toHaveLength(2)
    expect(parsed.ops.map((o) => addressKey(opAddress(o)!))).toEqual(['Art. 2 § 8', 'Art. 2 § 9 Abs. 1'])
  })

  // Only the Artikel written DIRECTLY in front of the § is a container. One
  // standing further ahead is a citation, and `PARA_RE` would read it as the
  // target — "Art. 5 Abs. 1" instead of "§ 3 Abs. 1", a change to the wrong §.
  // So that shape keeps the refusal it always had.
  it('refuses a cited Artikel ahead of the §, rather than targeting it', () => {
    expect(parseInstruction('In Umsetzung von Art. 5 der Richtlinie wird in § 3 Abs. 1 die Wortfolge "alt" durch "neu" ersetzt.').ops).toHaveLength(0)
  })

  it('refuses a numeral it cannot read rather than guessing at it', () => {
    // "IIII" is no roman numeral; joining it to an Artikel would pick one.
    expect(parseInstruction('In Artikel IIII § 3 entfällt die Wortfolge "und".').ops).toHaveLength(0)
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

  it('liest „der bisherige Inhalt" als das unbezifferte Absatz, nie als den Paragraphen', () => {
    // The whole Paragraph's text becomes Abs. 1: a level drawn in, not a new
    // number for the §. Every word order lands on the Absatz without a
    // designation — „Der bisherige Inhalt des § 29 erhält …" ran as a
    // renumbering of § 29 to § 1 (Notariatsprüfungsgesetz, 26.09.2026).
    for (const line of [
      'In § 10 erhält der bisherige Inhalt die Absatzbezeichnung "(1)".',
      'Der bisherige Inhalt des § 29 erhält die Absatzbezeichnung "(1)" .',
      'Der Text des § 26 erhält die Absatzbezeichnung "(1)".',
      'Dem Text des § 26 wird die Absatzbezeichnung "(1)" vorangestellt.',
    ]) {
      const { ops, reason } = parseInstruction(line)
      expect(reason, line).toBeNull()
      expect(ops, line).toHaveLength(1)
      expect(ops[0], line).toMatchObject({ kind: 'renumber', to: '(1)', target: { abs: '', level: 'abs' } })
    }
  })

  it('verweigert jede andere Absatzbezeichnung für einen ganzen Paragraphen', () => {
    const { ops, reason } = parseInstruction('Der bisherige Inhalt des § 29 erhält die Absatzbezeichnung "(2)".')
    expect(ops).toEqual([])
    expect(reason).toMatch(/ganzen Paragraphen/)
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

describe('what the second half of a compound line keeps of the first (26.09.2026)', () => {
  const targets = (line: string) => parseInstruction(line).ops.map((o) => {
    const t = (o as { target: NovaoAddress }).target
    return { kind: o.kind, abs: t.abs, z: t.z, lit: t.lit, satz: t.satz, siblings: t.siblings }
  })

  it('keeps the Ziffer and the Litera where the second half names no place of its own', () => {
    // It kept the § and the Absatz only: the deletion ran across all of Abs. 1.
    expect(targets('In § 5 Abs. 1 Z 6 wird das Wort "a" durch das Wort "b" ersetzt und entfällt das Wort "c".')[1]).toMatchObject({ kind: 'deletePhrase', abs: '1', z: '6', lit: null })
    expect(targets('In § 5 Abs. 1 Z 6 lit. a wird das Wort "a" durch das Wort "b" ersetzt und entfällt das Wort "c".')[1]).toMatchObject({ abs: '1', z: '6', lit: 'a' })
  })

  it('keeps the siblings of the first half, and not its sentence', () => {
    expect(targets('In § 5 Abs. 1 und 2 wird das Wort "a" durch das Wort "b" ersetzt und entfällt das Wort "c".')[1]).toMatchObject({ abs: '1', siblings: ['2'] })
    // „nach dem zweiten Satz" is the anchor of the insertion, not the place of
    // the deletion behind it (Niederlassungs- und Aufenthaltsgesetz § 12).
    const parsed = parseInstruction('In § 12 Abs. 3 wird nach dem zweiten Satz der Satz "Neu." eingefügt; die Wortfolge "alt" entfällt.')
    expect(parsed.ops.at(-1)).toMatchObject({ kind: 'deletePhrase', target: { abs: '3', satz: null } })
  })

  it('replaces what lies below the place the second half names', () => {
    expect(targets('In § 5 Abs. 1 Z 6 lit. a wird das Wort "a" durch das Wort "b" ersetzt und in Z 7 entfällt das Wort "c".')[1]).toMatchObject({ abs: '1', z: '7', lit: null })
  })

  it('reads a sentence-only half against the Absatz, as before', () => {
    // „in Z 1 … und im Schlussteil …" means the Absatz's Schlussteil.
    expect(targets('In § 59 Abs. 4 Z 1 wird das Wort "a" durch das Wort "b" ersetzt; im Schlussteil entfällt das Wort "c".')[1]).toMatchObject({ abs: '4', z: null, satz: 'schluss' })
  })

  it('hands a renumbered unit on under its new designation', () => {
    // „In § 7 erhält Abs. 6 die Absatzbezeichnung ‚(5)' und wird …": one Absatz, called (5) by then.
    expect(targets('In § 7 erhält Abs. 6 die Absatzbezeichnung "(5)" und wird die Wortfolge "x" durch die Wortfolge "y" ersetzt.')[1]).toMatchObject({ kind: 'replacePhrase', abs: '5' })
    expect(targets('In § 32 entfällt Abs. 2; Abs. 3 erhält die Absatzbezeichnung "(2)" und lautet:')[2]).toMatchObject({ kind: 'replace', abs: '2' })
    // One level down, where the old reading replaced the whole Absatz.
    expect(targets('In § 5 Abs. 1 erhält Z 6 die Ziffernbezeichnung "5." und lautet:')[1]).toMatchObject({ kind: 'replace', abs: '1', z: '5' })
  })
})

describe('a clause that opens with its own payload appends to the place before it (26.09.2026)', () => {
  const last = (line: string) => {
    const parsed = parseInstruction(line)
    expect(parsed.reason, line).toBeNull()
    return parsed.ops.at(-1) as { kind: string; target: NovaoAddress; child: string; childIds: string[] }
  }

  it('appends new Ziffern to the Absatz, not to the Ziffer they follow', () => {
    // The address used to be read out of the payload: „Z 5", which does not exist yet.
    const op = last('In § 31a Abs. 1 wird der Punkt am Ende der Z 4 durch einen Strichpunkt ersetzt; folgende Z 5 und 6 werden angefügt:')
    expect(op).toMatchObject({ kind: 'append', child: 'z', target: { para: '§ 31a', abs: '1', z: null, level: 'abs' } })
    expect(last('In § 1 Abs. 4 Z 10 werden der Punkt am Ende durch einen Strichpunkt ersetzt sowie folgende Z 11 bis Z 17 angefügt:').target).toMatchObject({ abs: '4', z: null })
  })

  it('appends a Litera to the Ziffer, and an Absatz to the §', () => {
    expect(last('In § 21h Abs. 6 Z 2 wird der Punkt am Ende der lit. i durch einen Beistrich ersetzt und folgende lit. j angefügt:').target).toMatchObject({ abs: '6', z: '2', lit: null, level: 'z' })
    expect(last('Der Text des § 26 erhält die Absatzbezeichnung "(1)" ; folgender Abs. 2 wird angefügt:').target).toMatchObject({ para: '§ 26', abs: null, level: 'para' })
  })

  it('refuses where the place before names several units at the host level', () => {
    const parsed = parseInstruction('In § 5 Abs. 1 und 2 wird das Wort "a" durch das Wort "b" ersetzt; folgende Z 9 wird angefügt:')
    expect(parsed.reason).toMatch(/nicht eindeutig/)
  })
})

describe('two quotations under two „durch" (26.09.2026)', () => {
  it('refuses to pair them into one replacement', () => {
    // Each replacement has one operand in words; the two quotes belong to different pairs.
    const parsed = parseInstruction('In § 81 Abs. 1 wird das Wort " oder" durch einen Beistrich und der Punkt durch das Wort " , oder" ersetzt.')
    expect(parsed.ops.filter((o) => o.kind === 'replacePhrase' && o.from === ' oder' && o.to === ' , oder')).toEqual([])
    expect(parsed.reason).toMatch(/Paarbildung/)
  })

  it('reads them as two replacements where each names its own place', () => {
    // Fremdenpolizeigesetz 2005 § 81, read by `splitPlaces` since the same day.
    const parsed = parseInstruction('In § 81 Abs. 1 wird in Z 1 das Wort " oder" durch einen Beistrich und in Z 2 der Punkt durch das Wort " , oder" ersetzt.')
    expect(parsed.reason).toBeNull()
    expect(parsed.ops.map((o) => (o.kind === 'replacePhrase' ? [o.target.z, o.to] : null))).toEqual([['1', ','], ['2', ', oder']])
  })
})

describe('one verb, several places (26.09.2026)', () => {
  const read = (line: string) => parseInstruction(line).ops.map((o) => {
    const t = (o as { target: NovaoAddress }).target
    return `${o.kind} ${t.abs ?? '-'}/${t.z ?? '-'}/${t.satz ?? '-'}`
  })

  it('gives each operation the place in front of it', () => {
    // AsylG 2005 § 59 Abs. 4: read as the Schlussteil of Z 1, which does not exist.
    expect(read('In § 59 Abs. 4 wird in Z 1 die Wortfolge "a" durch die Wortfolge "b" und im Schlussteil der Ausdruck "c" durch den Ausdruck "d" ersetzt.')).toEqual(['replacePhrase 4/1/-', 'replacePhrase 4/-/schluss'])
    expect(read('In § 9 Abs. 2 entfällt in Z 2 die Wortfolge "a" und im Schlussteil die Wortfolge "b" .')).toEqual(['deletePhrase 2/2/-', 'deletePhrase 2/-/schluss'])
  })

  it('shares one operation between two places in a row', () => {
    // Transparenzdatenbankgesetz 2012 § 40b Abs. 2.
    expect(read('In § 40b Abs. 2 wird im Einleitungsteil und in der Z 6 der Ausdruck "a" jeweils durch die Wortfolge "b" ersetzt.')).toEqual(['replacePhrase 2/-/einleitung', 'replacePhrase 2/6/-'])
  })

  it('leaves a line whole where only the first operation names a place', () => {
    expect(read('In § 5 Abs. 1 wird in Z 1 das Wort "a" durch das Wort "b" und das Wort "c" durch das Wort "d" ersetzt.')).toEqual(['replacePhrase 1/1/-', 'replacePhrase 1/1/-'])
  })

  it('reads the Schlussteil behind a Litera as the Ziffer\'s', () => {
    // Ärztegesetz 1998 § 59 Abs. 1 Z 3: lit. f joins the Ziffer's list.
    expect(read('In § 59 Abs. 1 Z 3 wird in der lit. e der Beistrich durch den Ausdruck " , sowie" ersetzt; der Schlussteil lautet:').at(-1)).toBe('replace 1/3/schluss')
  })
})

describe('one address names one place (26.09.2026)', () => {
  const places = (line: string) => {
    const parsed = parseInstruction(line)
    return parsed.ops.map((o) => {
      const t = (o as { target: NovaoAddress }).target
      return [t.para, t.abs, t.z, t.lit, t.siblings.join(',') || null].map((x) => x ?? '-').join(' ')
    })
  }

  it('reads a sibling that repeats its designator', () => {
    // „In § 139a Abs. 1 und Abs. 2 wird jeweils …" changed Abs. 1 and reported success.
    expect(places('In § 5 Abs. 1 und Abs. 2 wird das Wort "x" durch das Wort "y" ersetzt.')).toEqual(['§ 5 1 - - 2'])
    expect(places('In § 1 Z 7 und Z 7a wird jeweils nach dem Wort "x" das Wort "y" eingefügt.')).toEqual(['§ 1 - 7 - 7a'])
  })

  it('reads a chain of siblings however it is joined', () => {
    // `parseAddressList` hands „Abs. 1, Abs. 2 und Abs. 3" back as „… und … und …".
    expect(places('In § 14a Abs. 1, Abs. 2 und Abs. 3 wird das Wort "x" durch das Wort "y" ersetzt.')).toEqual(['§ 14a 1 - - 2,3'])
    expect(places('In § 55 werden die Abs. 1, 1a, 2, 3 und 4 durch folgende Abs. 1 bis 4 ersetzt:')).toEqual(['§ 55 1 - - 1a,2,3,4'])
  })

  it('reads Litera letters as siblings', () => {
    // „§ 21c Z 1 lit. b, c, e und f entfällt." deleted lit. b alone.
    expect(places('§ 21c Z 1 lit. b, c, e und f entfällt.')).toEqual(['§ 21c - 1 b c,e,f'])
    expect(places('In § 5 Abs. 1 Z 2 lit. a und lit. b wird das Wort "x" durch das Wort "y" ersetzt.')).toEqual(['§ 5 1 2 a b'])
    // „und im Schlussteil" is no Litera „im".
    expect(places('In § 5 Abs. 1 Z 2 lit. a und im Schlussteil wird das Wort "x" durch das Wort "y" ersetzt.')[0]).toBe('§ 5 1 2 a -')
  })

  it('reads a place that opens a higher level as a place of its own', () => {
    // KFG § 48: „§ 48 Abs. 1 Z 2 und Abs. 4" lost the Abs. 4.
    expect(places('In § 48 Abs. 1 Z 2 und Abs. 4 wird jeweils das Wort "x" durch das Wort "y" ersetzt.')).toEqual(['§ 48 1 2 - -', '§ 48 4 - - -'])
    // Pflichtschulabschluss-Prüfungs-Gesetz § 6: read as „Abs. 3 Z 1", a place neither names.
    expect(places('In § 6 Abs. 3 und Abs. 6 Z 1 wird das Zitat "a" jeweils durch das Zitat "b" ersetzt.')).toEqual(['§ 6 3 - - -', '§ 6 6 1 - -'])
  })

  it('refuses a place the reading would leave out or fuse', () => {
    expect(parseInstruction('In § 5 Abs. 1 und Z 3 wird das Wort "x" durch das Wort "y" ersetzt.').ops).toEqual([])
    expect(parseInstruction('In § 5 Abs. 1 und 2 werden der Punkt am Ende der Z 3 durch einen Strichpunkt ersetzt.').ops).toEqual([])
  })
})

describe('„der Halbsatz ‚…‘" is the noun of a quotation (27.09.2026)', () => {
  it('reads it like „die Wortfolge"', () => {
    // Zahnärztegesetz § 19 Abs. 2.
    const parsed = parseInstruction('In § 19 Abs. 2 wird nach dem Wort "ermöglichen" der Halbsatz " , wobei eine erste Kopie unentgeltlich ist" eingefügt.')
    expect(parsed.reason).toBeNull()
    expect(parsed.ops[0]).toMatchObject({ kind: 'insertPhrase', anchor: 'ermöglichen', where: 'after', target: { abs: '2', satz: null } })
  })

  it('reads the mark at the end as the anchor', () => {
    // Zahnärztegesetz § 22 Abs. 2: six full stops in the Absatz, and the one meant is the last.
    const parsed = parseInstruction('In § 22 Abs. 2 wird vor dem Punkt am Ende der Halbsatz " , sofern Standards betroffen sind" eingefügt.')
    expect(parsed.ops[0]).toMatchObject({ kind: 'insertPhrase', anchor: '.', where: 'before', atEnd: true })
    // The same form with the unit named behind „am Ende" (Amt für Betrugsbekämpfung § 3 Z 2).
    expect(parseInstruction('In § 3 Z 2 wird vor dem Strichpunkt am Ende der lit. h die Wortfolge "und x" eingefügt.').ops[0]).toMatchObject({ anchor: ';', atEnd: true, target: { z: '2', lit: 'h' } })
  })

  it('leaves „folgender Halbsatz angefügt" to the append branch', () => {
    expect(parseInstruction('Dem § 27 Abs. 1 lit. b wird folgender Halbsatz angefügt:').ops[0]).toMatchObject({ kind: 'append' })
  })

  it('still refuses a Halbsatz as an address', () => {
    expect(parseInstruction('§ 169 Abs. 5 erster Halbsatz lautet:').ops).toEqual([])
  })
})
