import { describe, expect, it } from 'vitest'
import { addressedLabels, addressedParagraphs, byParagraphOrder, gateParagraph, refusedUnits } from '../server/utils/kons/konsGate'
import { unitKey } from '../server/utils/text/designation'
import { instructionsFromUnits, parsePayload, type Instruction } from '../server/utils/kons/lawApply'
import { createdUnits, parseInstruction, refusedAddresses } from '../server/utils/kons/novao'

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
    // Every § the refused line names, not its first one (22.10.2026).
    expect(addressedParagraphs(instructions, ['In den §§ 9 und 10 wird etwas Unlesbares getan.'])).toEqual(['5', '9', '10'])
  })

  it('counts and fetches every § of a list, not the first one only', () => {
    // „Die §§ 12a und 13 entfallen" failed on § 13, which was never fetched (AsylG 2005).
    expect(addressedParagraphs(instr('Die §§ 12a und 13 entfallen samt Überschriften.'), [])).toEqual(['12a', '13'])
    expect(addressedParagraphs(instr('Die §§ 34a bis 34c samt Überschriften lauten:', ['§ 34a. A.', '§ 34b. B.', '§ 34c. C.']), [])).toEqual(['34a', '34b', '34c'])
    expect([...addressedLabels(instr('Die §§ 12a und 13 entfallen samt Überschriften.'), [])!.values()]).toEqual(['§ 12a', '§ 13'])
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

describe('refusedUnits — was nicht als sauber gelten darf (26.09.2026)', () => {
  it('marks every § a refused line names, not the first one only', () => {
    // KFG: the line was refused and §§ 24a, 40, 87 stood clean.
    const line = 'In § 24 Abs. 2 Z 2, § 24a Abs. 2 lit. b, § 40 Abs. 1 lit. a und § 87 Abs. 1 wird etwas Unlesbares geändert.'
    expect([...refusedUnits([], [line], unitKey)].sort()).toEqual(['24', '24a', '40', '87'])
  })

  it('keys a schedule the way the page does', () => {
    expect([...refusedUnits(['Anl. 1', '§ 5'], [], unitKey)].sort()).toEqual(['5', 'Anl. 1'])
  })
})

describe('a refused line locks every unit it names, not its first § (22.10.2026)', () => {
  // `refusedAddresses` gives up on these on purpose — for the annex no address
  // beats a wrong one. The gate fell back on the first §, and the others
  // stood clean with the change missing.
  const sorted = (s: Iterable<string>): string[] => [...s].sort(byParagraphOrder)

  it('Bäderhygieneverordnung: refused over the sublit., seven §§ named', () => {
    const line = 'In § 2 Z 19, § 7 Abs. 1 Z 2 lit. b, lit. c sublit. aa, § 21 Abs. 1 und 6, § 27 Abs. 2, § 28 Abs. 2 und 3, § 31 Abs. 1, der Überschrift zu § 103 und § 103 Abs. 1 und 2 entfällt jeweils der Klammerausdruck "(Whirl Pools)" .'
    expect(refusedAddresses(line)).toBeNull()
    expect(sorted(refusedUnits([], [line], unitKey))).toEqual(['2', '7', '21', '27', '28', '31', '103'])
    expect(addressedParagraphs([], [line])).toEqual(['2', '7', '21', '27', '28', '31', '103'])
  })

  it('reads the plural shorthand as the grammar does: a number with a component of its own is a §', () => {
    // BVergG: the 5 is an Absatz of § 184, the 5, 7 and 8 Ziffern of § 380.
    const bvergg = 'In den §§ 184 Abs. 4 und 5, 360 Abs. 5 und 380 Abs. 1 Z 1, 5, 7 und 8 sowie Abs. 2 wird die Wortfolge "der Bundesminister für Verfassung, Reformen, Deregulierung und" jeweils durch die Wortfolge "die Bundesministerin für" ersetzt.'
    expect(sorted(refusedUnits([], [bvergg], unitKey))).toEqual(['184', '360', '380'])
    // ASVG: „erster Satz" between them does not end the list.
    const asvg = 'In den §§ 92 Abs. 2, 254 Abs. 6, Abs. 7 erster Satz und Z 2 sowie Abs. 8 erster Satz und 814 Abs. 2 Z 2 wird jeweils das Wort "Teilpension" durch das Wort "Anteilspension" ersetzt.'
    expect(sorted(refusedUnits([], [asvg], unitKey))).toEqual(['92', '254', '814'])
  })

  it('reads a long ascending list to its end, a Litera behind a Litera included', () => {
    // Finanzstrafgesetz: the list stopped at „lit. a und c", and „61 Abs. 1,
    // 80, 81" read as Absätze 80 and 81 of § 61.
    const line = 'In den §§ 58 Abs. 2, 59 Abs. 1, 2 und 3, 60 Abs. 1, 61 Abs. 1, 80, 81, 82 Abs. 1 und 3, 88 Abs. 1 lit. a und c, Abs. 3 und 5, 90 Abs. 2, 95 und 115 wird etwas Unlesbares.'
    expect(sorted(refusedUnits([], [line], unitKey))).toEqual(['58', '59', '60', '61', '80', '81', '82', '88', '90', '95', '115'])
    // Behind a Ziffer a larger number stays a Ziffer: definitions run long.
    expect(sorted(refusedUnits([], ['In den §§ 2 Z 5, 12 und 19 sowie 4 Abs. 2 wird etwas Unlesbares.'], unitKey))).toEqual(['2', '4'])
  })

  it('locks what a refused insertion announces, not the references of its new text', () => {
    // Refused over a table: „§ 43" is the anchor, §§ 44 to 52 are the line's.
    expect(sorted(refusedUnits([], ['Nach § 43 werden folgende §§ 44 bis 52 samt Überschriften eingefügt:'], unitKey))).toEqual(['43', '44', '45', '46', '47', '48', '49', '50', '51', '52'])
    expect(createdUnits('Nach der Anlage 4 zu § 30 wird folgende Anlage 5 zu § 14 eingefügt:')).toEqual(['Anlage 5'])
  })

  it('reads a range, but never a Ziffer behind a single § as a §', () => {
    expect(sorted(refusedUnits([], ['Die §§ 7 bis 9 werden etwas Unlesbares.'], unitKey))).toEqual(['7', '8', '9'])
    expect(sorted(refusedUnits([], ['In § 5 Abs. 1 Z 2 und 3 lit. a wird etwas Unlesbares.'], unitKey))).toEqual(['5'])
  })

  it('locks a schedule a refused line names', () => {
    expect(sorted(refusedUnits([], ['In Anlage 2 Teil IV Z 3 entfällt der 2. Spiegelstrich.'], unitKey))).toEqual(['Anl. 2'])
  })

  it('locks the new number of a refused renumbering, quoted or not', () => {
    // Read as § 43 alone, the line left the standing § 44 clean for „Dem
    // neuen § 44 wird folgender Abs. 6 angefügt".
    expect(sorted(refusedUnits([], ['Der bisherige § 43 erhält die Bezeichnung § 44 .'], unitKey))).toEqual(['43', '44'])
    expect(sorted(refusedUnits([], ['Die §§ 5 bis 9 erhalten die Paragrafenbezeichnungen "6." bis "10." und etwas Unlesbares.'], unitKey))).toEqual(['5', '6', '7', '8', '9', '10'])
    expect(sorted(refusedUnits([], ['Der bisherige § 9 wird zu § 16.'], unitKey))).toEqual(['9', '16'])
    // A renamed Ziffer stays inside its §: „4." to „8." are no §§.
    expect(sorted(refusedUnits([], ['In § 107 erhalten die Z 5 bis 9 die Ziffernbezeichnungen "4." bis "8." und etwas Unlesbares.'], unitKey))).toEqual(['107'])
  })

  it('leaves a citation behind an operand’s noun out where the grammar has no reading', () => {
    // Fiskalratgesetz, BGBl. I Nr. 29/2026: § 3 and § 2 are what the line
    // cites, § 9 what it changes. Locked, § 3 was withheld for nothing.
    const line = 'In § 9 wird das Zitat § 3 Abs. 3 durch das Zitat § 2 Abs. 3 ersetzt.'
    expect(refusedAddresses(line)).toBeNull()
    expect(sorted(refusedUnits([], [line], unitKey))).toEqual(['9'])
    expect(sorted(refusedUnits([], ['In § 108a Abs. 1 Z 2 wird der Verweis auf § 18a durch den Verweis §§ 98a bis 98h ersetzt.'], unitKey))).toEqual(['108a'])
  })

  it('keeps the grammar’s reading where it has one, so an operand’s citation stays out', () => {
    const line = 'In § 73 Abs. 2 wird der Verweis auf § 20 Abs. 6 durch den Verweis auf § 20 Abs. 4 ersetzt.'
    expect(refusedAddresses(line)).toEqual(['§ 73'])
    expect(sorted(refusedUnits([], [line], unitKey))).toEqual(['73'])
  })

  it('locks the container § of a refused sub-instruction', () => {
    // Glücksspielgesetz: „c) In Abs. 5 wird der Verweis auf ‚§ 16 Abs. 4 bis
    // 6' hinzugefügt." names no § of its own; the first-§ fallback locked the
    // citation § 16 and left the § it changes clean.
    const unit = { article: null, articleNumber: null, id: 'Z5', heading: null, quotedHeadings: [], stammnorm: null, text: '', blocks: [
      { kind: 'novao' as const, cls: '', text: '5. § 14 wird wie folgt geändert:', gld: null },
      { kind: 'novao' as const, cls: '', text: 'a) In Abs. 2 wird das Wort "alt" durch das Wort "neu" ersetzt.', gld: null },
      { kind: 'novao' as const, cls: '', text: 'c) In Abs. 5 wird der Verweis auf "§ 16 Abs. 4 bis 6" hinzugefügt.', gld: null },
    ] }
    const { instructions, refused } = instructionsFromUnits([unit])
    expect(refused.map((r) => r.inherited?.para)).toEqual(['§ 14'])
    // § 16 stays locked: the reading before is the floor.
    expect(sorted(refusedUnits([], refused, unitKey))).toEqual(['14', '16'])
    expect(addressedParagraphs(instructions, refused)).toEqual(['14', '16'])
    // The bare line, as a caller without the container hands it over, reads as before.
    expect(sorted(refusedUnits([], refused.map((r) => r.line), unitKey))).toEqual(['16'])
  })

  it('never locks less than the reading before, which also looked into quotations', () => {
    // A Verordnung that quotes its own §: „Der bisherige ‚§ 7' erhält …".
    expect(sorted(refusedUnits([], ['Der bisherige "§ 7" erhält die Bezeichnung "§ 8" und lautet:'], unitKey))).toEqual(['7', '8'])
  })

  it('labels every § of a refused line, under the Artikel it names', () => {
    const labels = addressedLabels([], ['In Artikel II § 8 und § 9 Abs. 1 wird etwas Unlesbares getan.'])
    expect(labels?.get('8')).toBe('Art. 2 § 8')
    expect(labels?.get('9')).toBe('Art. 2 § 9')
  })
})

describe('an Abschnitt is no § of its number (02.10.2026)', () => {
  // Universitätsgesetz 2002, Asylgesetz 2005, …: a refused line on „Abschnitt
  // 3" locked § 3 under the bare number, loaded it, and counted it.
  it('keys a division apart, and neither counts nor fetches it', () => {
    expect(unitKey('Abschnitt 4')).toBe('Abschnitt 4')
    expect(unitKey('§ 4')).toBe('4')
    expect([...refusedUnits(['Abschnitt 4'], ['Die Überschrift des 4. Abschnitts lautet:'], unitKey)]).toEqual(['Abschnitt 4'])
    const instructions = [...instr('Die Überschrift des 4. Abschnitts lautet:'), ...instr('§ 5 lautet:')]
    expect(addressedParagraphs(instructions, [])).toEqual(['5'])
    expect([...(addressedLabels(instructions, []) ?? new Map()).keys()]).toEqual(['5'])
  })
})
