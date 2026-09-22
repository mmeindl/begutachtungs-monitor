import { describe, expect, it } from 'vitest'
import { draftUnits } from '../server/utils/annex/annexDraft'
import type { TextBlock } from '../server/utils/lawtext/lawUnits'
import { addressedUnits, parseInstruction, refusedAddresses } from '../server/utils/novao'

const instruction = (text: string): TextBlock => ({ kind: 'novao', cls: 'absatz/novao1', text, gld: null })
const quoted = (text: string, gld: string | null = null): TextBlock => ({ kind: 'abs', cls: 'absatz/abs', text, gld })
const article = (text: string): TextBlock => ({ kind: 'article', cls: 'ueberschrift/g1', text, gld: null })
const section = (text: string): TextBlock => ({ kind: 'section', cls: 'ueberschrift/g1min', text, gld: null })
const clause = (text: string): TextBlock => ({ kind: 'abs', cls: 'absatz/promkleinlsatz', text, gld: null })

/** The §§ one instruction addresses, in the designations it writes. */
const paras = (line: string): string[] => addressedUnits(line).paras

describe('addressedUnits', () => {
  it('takes the § an instruction names', () => {
    expect(paras('§ 5 Abs. 2 lautet:')).toEqual(['§ 5'])
  })

  it('takes every § of a range, because the annex shows each of them', () => {
    // "§§ 7 bis 14" is one instruction and eight provisions; only the first
    // of them would otherwise have a reference of its own.
    expect(paras('Die §§ 7 bis 10 werden durch folgende Bestimmungen ersetzt:')).toEqual(['§ 7', '§ 8', '§ 9', '§ 10'])
  })

  it('takes every § of an enumeration', () => {
    expect(paras('In § 17 und § 29 wird jeweils die Wortfolge "alt" durch die Wortfolge "neu" ersetzt.')).toEqual(['§ 17', '§ 29'])
  })

  it('takes the § an insertion creates, not only its anchor', () => {
    // `lawTitles.addressedParagraph` refuses this on purpose — § 5's standing
    // heading must not name § 5a. Here it is the opposite: the payload's words
    // are evidence for exactly the § it installs.
    expect(paras('Nach § 5 wird folgender § 5a samt Überschrift eingefügt:')).toEqual(['§ 5', '§ 5a'])
  })

  it('takes both designations of a renumbering, and pairs them', () => {
    // The annex prints the § as the standing law designates it while every
    // later instruction addresses its new number; without the pair one
    // provision reads as two.
    const found = addressedUnits('Der bisherige § 3 erhält die Paragraphenbezeichnung "§ 4." .')
    expect(found.paras).toEqual(['§ 3', '§ 4.'])
    expect(found.aliases).toEqual([['§ 3', '§ 4.']])
  })

  it('reads an Anlage as an Anlage, not as a §', () => {
    expect(paras('Anlage 2 lautet:')).toEqual(['Anlage 2'])
    expect(paras('Nach Anlage 1 wird folgende Anlage 1a angefügt:')).toEqual(['Anlage 1', 'Anlage 1a'])
  })

  it('addresses nothing for an instruction that only touches the table of contents', () => {
    // Derived from the law text, so it is text of no § — and it must weaken
    // the check rather than fail one.
    const found = addressedUnits('Das Inhaltsverzeichnis wird wie folgt geändert:')
    expect(found.paras).toEqual([])
    expect(found.reason).not.toBeNull()
  })

  it('reports why it could not address an instruction, rather than guessing', () => {
    const found = addressedUnits('In den Bestimmungen dieses Bundesgesetzes wird der Ausdruck umgestellt.')
    expect(found.paras).toEqual([])
    expect(found.reason).toBeTruthy()
  })
})

describe('draftUnits', () => {
  it('files each instruction under the law of its Artikel', () => {
    // The law key is `LawUnit.article` — the same string `DraftArticle.key`
    // carries, which is how the annex's rows are attributed.
    const units = draftUnits([
      article('Artikel 1'),
      section('Änderung des Aktiengesetzes'),
      clause('Das Aktiengesetz, BGBl. Nr. 98/1965, wird wie folgt geändert:'),
      instruction('1. § 5 lautet: "Der Vorstand entscheidet."'),
      article('Artikel 2'),
      section('Änderung des GmbH-Gesetzes'),
      clause('Das GmbH-Gesetz, BGBl. Nr. 58/1906, wird wie folgt geändert:'),
      instruction('1. § 5 lautet: "Die Geschäftsführung entscheidet."'),
    ])
    expect(units.map((u) => [u.law, u.id, u.paras])).toEqual([
      ['Änderung des Aktiengesetzes', 'Z1', ['§ 5']],
      ['Änderung des GmbH-Gesetzes', 'Z1', ['§ 5']],
    ])
    // Two § 5 of one package, kept apart — 15,1 % of § designations in the
    // multi-law annexes recur in another law of the same draft.
    expect(units[0]!.text).toContain('Vorstand')
    expect(units[0]!.text).not.toContain('Geschäftsführung')
  })

  it('takes the § from a quoted Gliederungssymbol when the instruction line hides it', () => {
    // A "lautet:"-payload prints the §§ it rewrites, and that is an address
    // no instruction grammar has to read.
    const units = draftUnits([
      instruction('1. Die Überschrift des 2. Abschnitts samt der folgenden Bestimmung lautet:'),
      quoted('Die Behörde entscheidet.', '§ 12a.'),
    ])
    expect(units).toHaveLength(1)
    expect(units[0]!.paras).toContain('§ 12a.')
    expect(units[0]!.text).toContain('§ 12a.')
  })

  it('keeps a lettered sub-instruction inside its container and under its §', () => {
    const units = draftUnits([
      instruction('2. § 8 wird wie folgt geändert:'),
      instruction('a) In Abs. 3 wird die Wortfolge "alt" durch die Wortfolge "neu" ersetzt.'),
      instruction('b) Abs. 4 entfällt.'),
    ])
    expect(units).toHaveLength(1)
    expect(units[0]!.paras).toEqual(['§ 8'])
    expect(units[0]!.text).toContain('neu')
  })

  it('names the reason an instruction addressed nothing, so a miss can only weaken', () => {
    const units = draftUnits([instruction('1. Im gesamten Gesetzestext wird der Ausdruck ersetzt.')])
    expect(units[0]!.paras).toEqual([])
    expect(units[0]!.reason).toBeTruthy()
  })

  it('reads a Stammgesetz § from its own symbol', () => {
    const units = draftUnits([quoted('Dieses Bundesgesetz regelt den Zugang.', '§ 1.')])
    expect(units[0]!.paras).toEqual(['§ 1.'])
  })
})

/**
 * The §§ an instruction names although its *operation* could not be typed
 * (`novao.refusedAddresses`). Measured over GP XXVIII on 2026-09-11: of the 731
 * units the PDF corpus filed in the general bag, only 185 failed on the
 * address — the other 546 had one `parseAddressList` had already read, and
 * `parseOne` dropped it because the verb or the operands were not understood.
 */
describe('addressedUnits on a refused instruction', () => {
  it('keeps the § of an instruction whose operands could not be paired', () => {
    // "4 Operanden, Paarbildung unklar" — 40 units on the PDF path. The two
    // substitutions are not applicable; the § is not in doubt.
    const line = 'In § 4 Abs. 2 wird nach der Wortfolge "Vorgaben des Abschnittes II" die Wortfolge "und VI" eingefügt, das Wort "Gesamtabwassers" durch das Wort "Abwassers" und das Wort "Gesamtabwasserstrom" durch das Wort "Abwasserstrom" ersetzt.'
    expect(parseInstruction(line).ops).toHaveLength(0)
    expect(paras(line)).toEqual(['§ 4'])
  })

  it('keeps the § of an instruction whose verb it does not know', () => {
    const line = 'Dem Text des § 5 wird die Absatzbezeichnung "(1)" vorangestellt; folgender Abs. 2 wird angefügt:'
    expect(parseInstruction(line).ops).toHaveLength(0)
    expect(paras(line)).toEqual(['§ 5'])
  })

  it('keeps the § of a bare address that opens its quoted text', () => {
    // "§ 19 Abs. 3 erster Satz:" — the colon is the verb; 8 units on the PDF path.
    expect(paras('§ 19 Abs. 3 erster Satz:')).toEqual(['§ 19'])
  })

  it('never reads the address beside an operation that was typed', () => {
    // A `toc` op says on purpose that it addresses no §, and the fallback must
    // not undo that: the entry to § 11 is derived from § 11, not text of it.
    const found = addressedUnits('Im Inhaltsverzeichnis lautet der Eintrag zu § 11:')
    expect(found.paras).toEqual([])
    expect(found.reason).toBeTruthy()
  })

  it('refuses a line that orders nothing, because its §§ are then citations', () => {
    // Law text RIS tagged as a Novellierungsanordnung (`absatz typ="novao1"`).
    // Read as an address it would file a quoted list under § 5 of its law.
    const line = 'der Regierungsberater gemäß § 5 Abs. 1 Bundes-Krisensicherheitsgesetz (B-KSG), BGBl. I Nr. 89/2023.'
    expect(refusedAddresses(line)).toBeNull()
    expect(paras(line)).toEqual([])
  })

  it('liest beide Paragraphen der Plural-Kurzschreibweise', () => {
    // "In den §§ 156 Abs. 2 und 317 Abs. 2 …": the second half carries no §
    // sign. This used to yield § 156 alone, and filing the unit there would
    // have taken its words out of the general bag § 317 lives on — so the
    // guard below refused the line outright (four such units in the
    // Bundesvergabegesetz). Since `parseAddressList` resolves the shorthand
    // (18.09.2026) both §§ come out and the unit is filed under both, which
    // is the answer the guard was standing in for.
    const line = 'In den §§ 156 Abs. 2 und 317 Abs. 2 wird nach der Wortfolge "durchgeführt wird" jeweils die Wortfolge ", eine Rahmenvereinbarung abgeschlossen wird" und nach der Wortfolge "erteilt werden soll" die Wortfolge "bzw." eingefügt.'
    expect(refusedAddresses(line)).toEqual(['§ 156', '§ 317'])
  })

  it('verweigert einen Plural, den die Zerlegung nicht auflösen kann', () => {
    // The guard stays: where the shorthand cannot be split, one designation
    // out of a plural line is still the wrong answer, not half of one.
    const line = 'In den §§ 156 und wird die Wortfolge "a" durch die Wortfolge "b" ersetzt.'
    expect(refusedAddresses(line)).toBeNull()
  })

  it('reads a "§§" inside a quoted operand as an operand, not as a plural target', () => {
    // The same guard on the raw text cost seven sound units: the plural sign
    // stands inside the phrase the instruction replaces.
    const line = 'In § 52f wird die Wortfolge "vom Finanzamt Österreich" durch die Wortfolge "von der Glücksspielaufsichtsbehörde" ersetzt und nach der Wortfolge "gemäß §§ 52b oder 52c" die Wortfolge "und dem Amt für Betrugsbekämpfung" eingefügt.'
    expect(paras(line)).toEqual(['§ 52f'])
  })

  it('refuses a compound whose other half does not resolve', () => {
    // The unit's text covers both halves, so filing it under one half's § takes
    // those words from the other's.
    expect(refusedAddresses('In § 5 wird das Wort "alt" ersetzt; im gesamten Gesetzestext wird der Ausdruck ersetzt.')).toBeNull()
  })

  it('still lands an instruction with no readable address in the general bag', () => {
    const found = addressedUnits('In der Tarifpost 1 lautet die Anmerkung 9:')
    expect(found.paras).toEqual([])
    expect(found.reason).toBeTruthy()
  })
})
