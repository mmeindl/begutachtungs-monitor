import { describe, expect, it } from 'vitest'
import { compareWords, diffTokens, isAddressOnlyDifference, isEditorialChange, renumberingOf, sameWording, tokenSimilarity } from '../server/utils/diff/wordDiff'
import { compareKey } from '../server/utils/lawtext/normalize'

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

  it('folds what the equality form folds: the space before a punctuation mark, and the hyphen inside a word', () => {
    // The two forms disagreed until 23.09.2026, so once a unit was „geändert"
    // for any other reason these counted as changed WORDS. Measured in
    // rv→bgbl over GP XXVIII: 51/ME, 58/ME and 60/ME reported substantive
    // changes that are nothing but this.
    expect(diffTokens('die Absatzbezeichnung "(1)" ;', 'die Absatzbezeichnung "(1)";').segments).toEqual([
      { type: 'equal', text: 'die Absatzbezeichnung "(1)";' },
    ])
    expect(diffTokens('mit 13 , und 14', 'mit 13, und 14').similarity).toBe(1)
    expect(diffTokens('der Bundes-Vergabekontrollkommission', 'der BundesVergabekontrollkommission').similarity).toBe(1)
    expect(diffTokens('die E-Mail-Adresse nach dem E-GoVG', 'die EMailAdresse nach dem EGoVG').similarity).toBe(1)
    // A dash BETWEEN words is not a hyphen inside one and stays a token.
    expect(diffTokens('Wien - Graz', 'Wien Graz').similarity).toBeLessThan(1)
  })
})

// The Begründungsvergleich's „unverändert" (22.10.2026): the same words in
// the same order, whatever the punctuation, spacing and hyphenation.
describe('sameWording', () => {
  it('lässt Satzzeichen, Leerzeichen und Bindestriche beiseite', () => {
    expect(sameWording('Härten zu vermeiden', 'Härten zu vermeiden,')).toBe(true)
    expect(sameWording('„Verbunds" (VBK)', 'Verbunds (VBK)')).toBe(true)
    expect(sameWording('z.B. nach Abs.2', 'z. B. nach Abs. 2')).toBe(true)
    expect(sameWording('die COVID-19 Pandemie', 'die COVID-19-Pandemie')).toBe(true)
    expect(sameWording('Blaue Karte EU-Richtlinie', 'Blaue-Karte-EU-Richtlinie')).toBe(true)
    expect(sameWording('(inter)ministeriellen', '[inter]ministeriellen')).toBe(true)
  })

  it('sieht jedes geänderte Wort, auch Groß- und Kleinschreibung', () => {
    expect(sameWording('ab Jänner 2026', 'ab April 2026')).toBe(false)
    expect(sameWording('die RAO.', 'die RAPG.')).toBe(false)
    expect(sameWording('Covid-19', 'COVID-19')).toBe(false)
    expect(sameWording('dass', 'daß')).toBe(false)
  })

  it('hält Zeichen, die für ein Wort stehen, und Zeichen in einer Zahl fest', () => {
    expect(sameWording('nach § 5', 'nach 5')).toBe(false)
    expect(sameWording('5 % der Fälle', '5 der Fälle')).toBe(false)
    expect(sameWording('1,5 Prozent', '15 Prozent')).toBe(false)
    expect(sameWording('BGBl. I Nr. 8/2020', 'BGBl. I Nr. 82020')).toBe(false)
    expect(sameWording('BGBl. I Nr. 8/2020.', 'BGBl. I Nr. 8/2020')).toBe(true)
  })
})

// The alignment tokenizes each unit once and scores the words (22.10.2026);
// the score has to stay the one `diffTokens` gives the two texts.
describe('tokenSimilarity über die Wörter', () => {
  const pairs: [string, string][] = [
    ['Die Frist beträgt sechs Wochen.', 'Die Frist beträgt acht Wochen.'],
    ['der Bundes-Vergabekontrollkommission', 'der BundesVergabekontrollkommission'],
    ['', ''],
    ['a b c', ''],
    // Above `MAX_DP_CELLS` (1.700 × 1.700): both fall back to the bag.
    [Array.from({ length: 1700 }, (_, i) => `wort${i}`).join(' '), Array.from({ length: 1700 }, (_, i) => (i % 10 === 0 ? `neu${i}` : `wort${i}`)).join(' ')],
  ]

  it('gibt für die Wörter beider Texte dieselbe Ähnlichkeit wie diffTokens', () => {
    for (const [a, b] of pairs) expect(tokenSimilarity(compareWords(a), compareWords(b))).toBe(diffTokens(a, b).similarity)
  })

  it('gibt unter der Schwelle die Obergrenze des Wortbeutels zurück, die unter der Schwelle bleibt', () => {
    // Two shared words in swapped order: the bag counts both (0,4), the LCS one (0,2).
    const a = 'eins zwei drei vier fünf'
    const b = 'zwei eins sechs sieben acht'
    expect(diffTokens(a, b).similarity).toBe(0.2)
    expect(tokenSimilarity(compareWords(a), compareWords(b))).toBe(0.2)
    expect(tokenSimilarity(compareWords(a), compareWords(b), 0.6)).toBe(0.4)
  })
})

describe('editorial vs substantive', () => {
  const seg = (a: string, b: string) => diffTokens(a, b).segments
  /** The renumbering `diffLawUnits` hands over: bare § id of the earlier version → bare § id of the later one. */
  const renumbered = (...entries: [string, string][]) => ({ renumbered: new Map(entries) })

  it('a shifted cross-reference is editorial only where THIS comparison renumbered the §', () => {
    // The alignment paired the unit § 15 with the unit § 16, so a reference
    // that follows is the consequence and nothing else.
    expect(isEditorialChange(seg('Die Behörde gemäß § 15 Abs. 2 entscheidet.', 'Die Behörde gemäß § 16 Abs. 2 entscheidet.'), renumbered(['15', '16']))).toBe(true)
    // Without that evidence the very same change is a changed norm. Four of
    // them stood badged „redaktionell" over GP XXVIII until 23.09.2026, and
    // three classes close them: a reference into ANOTHER law can never be in
    // the map (27/ME Z4 § 48 → § 48a BAO, 4/ME Z3 a shrunk UGB range), …
    expect(isEditorialChange(seg('Die Behörde gemäß § 15 Abs. 2 entscheidet.', 'Die Behörde gemäß § 16 Abs. 2 entscheidet.'))).toBe(false)
    expect(isEditorialChange(seg('sind die §§ 277 bis 286 UGB anzuwenden', 'sind die §§ 277 bis 285 UGB anzuwenden'), renumbered(['15', '16']))).toBe(false)
    // … an Abs./Z address is not a unit of this comparison, so a diff of
    // Novellierungsanordnungen establishes nothing about it (30/ME Z12), …
    expect(isEditorialChange(seg('In § 49c Abs. 4 Z 1 wird', 'In § 49b Abs. 1a Z 10 wird'), renumbered(['15', '16']))).toBe(false)
    // … and a reference one side does not carry at all has no pair (32/ME § 1,
    // a Verfassungsbestimmung that gained „§ 169 Abs. 7").
    expect(isEditorialChange(seg('§§ 104, 105 und 106 sind Verfassungsbestimmungen', '§§ 104, 105, 169 Abs. 7 und 106 sind Verfassungsbestimmungen'), renumbered(['104', '104']))).toBe(false)
    // A date is not a reference and answers before the rule.
    expect(isEditorialChange(seg('in der Fassung vom 26.6.2024', 'in der Fassung vom 26.06.2024'))).toBe(true)
    // A number that did NOT change needs no renumbering: `bare` strips the
    // punctuation, so „(2);" against „(2)," arrives here as 2 against 2
    // (61/ME Z6).
    expect(isEditorialChange(seg('lautet Abs. (2);', 'lautet Abs. (2),'))).toBe(true)
    // A range that grows is a changed norm unless the diff moved the member.
    expect(isEditorialChange(seg('nach den §§ 1 und 2', 'nach den §§ 1 bis 3'), renumbered(['2', '3']))).toBe(true)
    expect(isEditorialChange(seg('nach den §§ 1 und 2', 'nach den §§ 1 bis 3'))).toBe(false)
    // A lit. is an address inside a §, never a unit of this comparison.
    expect(isEditorialChange(seg('gilt Art. 3 lit. a;', 'gilt Art. 3 lit. b,'))).toBe(false)
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
    expect(isEditorialChange(seg('nach § 6 gilt', 'nach § 4 gilt'), renumbered(['6', '4']))).toBe(true)
    expect(isEditorialChange(seg('innerhalb von 6 Wochen', 'innerhalb von 4 Wochen'), renumbered(['6', '4']))).toBe(false)
    expect(isEditorialChange(seg('spätestens 2026 in Kraft', 'spätestens 2027 in Kraft'))).toBe(false)
    // The residual class, named rather than hidden: the map is keyed by the
    // bare number, so an Abs. that happens to carry the number of a renumbered
    // § reads as explained. It needs a draft that renumbers §§ wholesale.
    expect(isEditorialChange(seg('nach Abs. 6 gilt', 'nach Abs. 4 gilt'), renumbered(['6', '4']))).toBe(true)
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
    // Directly beside the change the same words still mean what the list says
    // — and then the renumbering has to carry it, as everywhere else.
    expect(isEditorialChange(seg('gilt der Satz 5 sinngemäß', 'gilt der Satz 7 sinngemäß'), renumbered(['5', '7']))).toBe(true)
    expect(isEditorialChange(seg('Nach Anlage 2 ist vorzugehen', 'Nach Anlage 3 ist vorzugehen'), renumbered(['2', '3']))).toBe(true)
    // And behind the first member of a range, which is what the strict
    // one-token rule would have lost.
    expect(isEditorialChange(seg('nach den §§ 1 und 2', 'nach den §§ 1 bis 3'), renumbered(['2', '3']))).toBe(true)
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
    // had been filled in.
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
    // A Fundstelle replaced by ANOTHER one is a different version of a
    // different law, and no renumbering of ours explains it — substantive
    // since 23.09.2026, when the published definition gained its condition
    // („Verweise nur dort, wo sie einer Umnummerierung in diesem Vergleich
    // folgen", /so-funktionierts).
    expect(isEditorialChange(seg('BGBl. I Nr. 12/2024 gilt', 'BGBl. I Nr. 50/2025 gilt'))).toBe(false)
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
  it('a space only one side sets is no changed word: the unit key forgives it, so the verdict does (19.11.2026)', () => {
    // 41/ME Börsegesetz Z 53, 116/ME Wasserstoffförderungsgesetz Z 8 on rv/plenum → Kundmachung:
    // the Fundstelle filled in, and the closing quote lost its space — „geändert"
    // where the same unit without the space (Z 52) was „redaktionell".
    expect(isEditorialChange(seg('BGBl. I Nr. xx/202x treten mit 6. Juni 2026 in Kraft. "', 'BGBl. I Nr. 27/2026 treten mit 6. Juni 2026 in Kraft."'))).toBe(true)
    expect(isEditorialChange(seg('BGBl. I Nr. xx/202x treten mit 6. Juni 2026 in Kraft.', 'BGBl. I Nr. 27/2026 treten mit 6. Juni 2026 in Kraft.'))).toBe(true)
    // 30/ME Börsegesetz Z 2: a word split by a space, beside a real change.
    expect(isEditorialChange(seg('des Börseunternehmensgemäß § 5', 'des Börseunternehmens gemäß § 5'))).toBe(true)
    // The segments themselves stay: the difference is shown, only the badge forgives it.
    expect(seg('in Kraft. "', 'in Kraft."')!.filter((x) => x.type !== 'equal').map((x) => x.text)).toEqual(['Kraft. "', 'Kraft."'])
    // But never a space between two digits: „1 3" is not „13".
    expect(isEditorialChange(seg('binnen 1 3 Wochen', 'binnen 13 Wochen'))).toBe(false)
    expect(isEditorialChange(seg('gemäß Z 1 - 3 Wochen', 'gemäß Z 13 Wochen'))).toBe(false)
    // Nor a minus sign: „-18" is not „18" spaced differently (19.11.2026).
    expect(isEditorialChange(seg('des Börseunternehmensgemäß bei -18 °C', 'des Börseunternehmens gemäß bei 18 °C'))).toBe(false)
    // And a real word beside a spacing difference keeps the unit substantive.
    expect(isEditorialChange(seg('sechs Wochen in Kraft. "', 'acht Wochen in Kraft."'))).toBe(false)
  })
  it('a Fundstelle with its citation word glued on is still a placeholder (19.11.2026)', () => {
    // 116/ME Umweltförderungsgesetz Z 3, 14/ME Bildungsdokumentationsgesetz Z 24.
    expect(isEditorialChange(seg('Resilienzgesetzes, BGBl. I Nr.xxx/2026, unbeschadet', 'Resilienzgesetzes, BGBl. I Nr. 62/2026, unbeschadet'))).toBe(true)
    expect(isEditorialChange(seg('des Bundesgesetzes BGBl. I Nr.xxx/2025 treten', 'des Bundesgesetzes BGBl. I Nr. 28/2025 treten'))).toBe(true)
    // A glued REAL number replaced by another is still a different Fundstelle.
    expect(isEditorialChange(seg('BGBl. I Nr.12/2024 gilt', 'BGBl. I Nr. 50/2025 gilt'))).toBe(false)
  })
  it('a changed sign is a changed word: mathematical and currency signs, %, ‰ and ° (20.11.2026)', () => {
    // Filed as punctuation by their Unicode class, each of these read
    // „redaktionell" alone. Over the station pairs of GP XXVIII every such
    // sign standing as a token is the substance of its sentence („138,4 €",
    // „5 %", „90 ± 30", „Eiweißausscheidung > 1g/l", „ERef = 5 kV/m").
    expect(isEditorialChange(seg('beträgt höchstens 5 % jährlich', 'beträgt höchstens 5 ‰ jährlich'))).toBe(false)
    expect(isEditorialChange(seg('Eiweißausscheidung > 50 mg', 'Eiweißausscheidung < 50 mg'))).toBe(false)
    expect(isEditorialChange(seg('eine Toleranz von + 2 mm', 'eine Toleranz von − 2 mm'))).toBe(false)
    expect(isEditorialChange(seg('ERef = 5 kV/m', 'ERef ≠ 5 kV/m'))).toBe(false)
    expect(isEditorialChange(seg('mit 90 ± 30 Impulsen', 'mit 90 + 30 Impulsen'))).toBe(false)
    expect(isEditorialChange(seg('Gebühr von 500 € zu zahlen', 'Gebühr von 500 % zu zahlen'))).toBe(false)
    expect(isEditorialChange(seg('Gebühr von 500 €. Sie', 'Gebühr von 500 $. Sie'))).toBe(false)
    expect(isEditorialChange(seg('geneigt um 5 ° nach', 'geneigt um 5 nach'))).toBe(false)
    // A sign inside quotation marks or brackets is the same sign.
    expect(isEditorialChange(seg('Hypertonie (> 140/90mmHg)', 'Hypertonie (< 140/90mmHg)'))).toBe(false)
    expect(isEditorialChange(seg('der Betrag "100 €" durch', 'der Betrag "100 %" durch'))).toBe(false)
  })
  it('the unit key and the badge read a separator between two digits alike (20.11.2026)', () => {
    // The filled Fundstelle makes each unit changed for another reason, so
    // the badge answers for the separator alone — and must forgive exactly
    // what `compareKey` forgives.
    const pairs: [string, string][] = [
      ['Z 1 3', 'Z 13'],
      ['§§ 3-5', '§§ 35'],
      ['3 000 Euro', '30 00 Euro'],
      ['§§ 3-5', '§§ 3 - 5'],
      ['§§ 3 -5', '§§ 3- 5'],
      ['Covid-19', 'Covid 19'],
      ['die E-Mail', 'die EMail'],
      ['€ 35,82 1) € 88,05', '€ 35,821) € 88,05'],
      ['10.121,40 1)2) 13.094,50', '10.121,401)2) 13.094,50'],
      ['+ 4 1)', '+ 41)'],
    ]
    for (const [a, b] of pairs) {
      const forgiven = isEditorialChange(seg(`BGBl. I Nr. xxx/2026 gilt ${a} weiter`, `BGBl. I Nr. 31/2026 gilt ${b} weiter`))
      expect({ a, b, forgiven }).toEqual({ a, b, forgiven: compareKey(a) === compareKey(b) })
    }
  })
  it('punctuation, quotation marks, a bullet and a filled placeholder stay editorial beside the signs (20.11.2026)', () => {
    // A comma for a semicolon behind a designation: the number stays the number.
    expect(isEditorialChange(seg('nach Abs. 1 Z 2; und', 'nach Abs. 1 Z 2, und'))).toBe(true)
    // A quotation mark or a full stop one side sets alone.
    expect(isEditorialChange(seg('tritt mit 1. Juli 2026 in Kraft. "', 'tritt mit 1. Juli 2026 in Kraft.'))).toBe(true)
    expect(isEditorialChange(seg('Abs. 2 lautet: » § 5 gilt', 'Abs. 2 lautet: § 5 gilt'))).toBe(true)
    // A list bullet is layout (43/ME § 61, „anhand folgender Formel: •").
    expect(isEditorialChange(seg('folgender Formel: • B', 'folgender Formel: B'))).toBe(true)
    // The Fundstelle filled at promulgation.
    expect(isEditorialChange(seg('BGBl. I Nr. xxx/2026 tritt', 'BGBl. I Nr. 31/2026 tritt'))).toBe(true)
  })
})

describe('isAddressOnlyDifference', () => {
  const seg = (a: string, b: string) => diffTokens(a, b).segments
  it('recognises two instructions that differ only in the § they address (74/ME)', () => {
    // ME Z127 against RV Z50: every word the same, similarity 0,86 — and the
    // one thing that tells them apart is the paragraph being deleted.
    expect(isAddressOnlyDifference(seg('§ 63 entfällt samt Überschrift.', '§ 4a entfällt samt Überschrift.'))).toBe(true)
    expect(isAddressOnlyDifference(seg('§ 12 Abs. 3 lautet:', '§ 12 Abs. 4 lautet:'))).toBe(true)
  })
  it('is false where anything but the address moved', () => {
    // The same instruction, reworded: that IS the same instruction.
    expect(isAddressOnlyDifference(seg('§ 6 entfällt samt Überschrift.', 'Der bisherige § 6 entfällt samt Überschrift.'))).toBe(false)
    // Identical texts, and a text with no number in the change at all.
    expect(isAddressOnlyDifference(seg('§ 63 entfällt samt Überschrift.', '§ 63 entfällt samt Überschrift.'))).toBe(false)
    expect(isAddressOnlyDifference(seg('§ 63 entfällt samt Überschrift.', '§ 63 entfällt.'))).toBe(false)
    // A connective in the change already makes it more than an address.
    expect(isAddressOnlyDifference(seg('§§ 1 und 2 entfallen.', '§§ 1 bis 3 entfallen.'))).toBe(false)
    expect(isAddressOnlyDifference(null)).toBe(false)
  })
})

describe('diffTokens — die Anzeigeform trägt den Bindestrich', () => {
  // Between 23.09. and 25.09.2026 the diff aligned on the folded form AND
  // built its segments from it, so the page published „BundesKinder- und
  // Jugendhilfegesetzes" for „Bundes-Kinder- und Jugendhilfegesetzes" — the
  // law's own name misspelt in a law text (126/ME § 9).
  it('shows a hyphenated word as the document writes it', () => {
    expect(diffTokens('', 'Art. 20 Abs. 2 B-VG gilt sinngemäß.').segments).toEqual([
      { type: 'inserted', text: 'Art. 20 Abs. 2 B-VG gilt sinngemäß.' },
    ])
  })

  it('keeps the inner hyphen of a word that only one side carries', () => {
    const d = diffTokens('bei einem Kinder- und Jugendhilfeträger', 'bei einem Kinder- und Jugendhilfeträger nach dem Bundes-Kinder- und Jugendhilfegesetz')
    expect(d.segments).toEqual([
      { type: 'equal', text: 'bei einem Kinder- und Jugendhilfeträger' },
      { type: 'inserted', text: 'nach dem Bundes-Kinder- und Jugendhilfegesetz' },
    ])
  })

  // The 23.09.2026 measurement, unchanged: Parliament's HTML sets a soft
  // hyphen where the law has a hard one, and a unit must not turn substantive
  // over it. Equal words come from the EARLIER text, so the reader sees the
  // spelling of the document that carried the word.
  it('still counts a word that differs only in hyphenation as unchanged', () => {
    const d = diffTokens('die E-Mail-Adresse der Bundes-Vergabekontrollkommission', 'die EMailAdresse der BundesVergabekontrollkommission')
    expect(d.similarity).toBe(1)
    expect(d.segments).toEqual([{ type: 'equal', text: 'die E-Mail-Adresse der Bundes-Vergabekontrollkommission' }])
  })

  it('still folds the leader dots and the space before a punctuation mark', () => {
    const d = diffTokens('monatlich........................ 13 , und', 'monatlich 13, und')
    expect(d.similarity).toBe(1)
    expect(d.segments).toEqual([{ type: 'equal', text: 'monatlich 13, und' }])
  })
})

describe('diffTokens — die Auslassung der Beilage', () => {
  // 660 of 1.375 omissions were deleted from the display and 715 kept, purely
  // because the old rule saw „..." and not „…" (25.09.2026). The reader lost
  // the one mark saying that unchanged text stands here.
  it('shows the omission instead of swallowing it', () => {
    const d = diffTokens('§ 41. (1) bis (3) ... (4) alte Fassung', '§ 41. (1) bis (3) ... (4) neue Fassung')
    expect(d.segments!.map((s) => s.text).join(' ')).toContain('...')
  })

  it('counts the same omission in two spellings as unchanged', () => {
    const d = diffTokens('§ 41. (1) bis (3) ... (4) Text', '§ 41. (1) bis (3) … (4) Text')
    expect(d.similarity).toBe(1)
    expect(d.segments).toEqual([{ type: 'equal', text: '§ 41. (1) bis (3) ... (4) Text' }])
  })

  it('still drops a column filler of either spelling', () => {
    const d = diffTokens('monatlich........................ 1,21 Euro', 'monatlich………………………… 1,21 Euro')
    expect(d.similarity).toBe(1)
    expect(d.segments).toEqual([{ type: 'equal', text: 'monatlich 1,21 Euro' }])
  })
})

// One builder for the § comparison and the Begründungsvergleich (22.10.2026).
describe('renumberingOf', () => {
  it('liest nur umnummerierte Paragraphen, je späterem Artikel', () => {
    const map = renumberingOf([
      { fromId: '§5', toId: '§6', article: 'A' },
      // A Ziffer renumbers too, and no reference in a law points at one.
      { fromId: 'Z1', toId: 'Z2', article: 'A' },
      { fromId: '§7', toId: '§7', article: 'A' },
      { fromId: '§3', toId: '§4', article: null },
    ])
    expect([...map.keys()]).toEqual(['A', ''])
    expect([...map.get('A')!]).toEqual([['5', '6']])
    expect([...map.get('')!]).toEqual([['3', '4']])
  })
})

describe('diffTokens past the ceiling, for a caller that only shows the diff (19.11.2026)', () => {
  /** n distinct words, „w0 w1 …", with some replaced. */
  const text = (n: number, replace: (i: number) => string | null = () => null) =>
    Array.from({ length: n }, (_, i) => replace(i) ?? `w${i}`).join(' ')
  const changed = (segments: { type: string; text: string }[] | null) => (segments ?? []).filter((s) => s.type !== 'equal').map((s) => `${s.type === 'removed' ? '-' : '+'}${s.text}`)
  /** The earlier and the later text the runs spell out. */
  const sides = (segments: { type: string; text: string }[]) => ({
    from: segments.filter((s) => s.type !== 'inserted').map((s) => s.text).join(' '),
    to: segments.filter((s) => s.type !== 'removed').map((s) => s.text).join(' '),
  })
  /** An independent LCS length, row by row. */
  const lcs = (a: string[], b: string[]): number => {
    let prev: number[] = new Array<number>(b.length + 1).fill(0)
    for (const x of a) {
      const row: number[] = [0]
      for (let j = 1; j <= b.length; j++) row[j] = x === b[j - 1] ? prev[j - 1]! + 1 : Math.max(prev[j]!, row[j - 1]!)
      prev = row
    }
    return prev[b.length]!
  }

  it('marks the one changed word of a long unit, where the ceiling showed none (80/ME Z 13)', () => {
    // 2.002 words a side and four changed: past MAX_DP_CELLS the page drew both versions whole.
    const a = text(2000)
    const b = text(2000, (i) => (i === 1234 ? 'Fernabsatzvertrag' : null))
    expect(diffTokens(a, b).segments).toBeNull()
    const d = diffTokens(a, b, { beyondCeiling: true })
    expect(changed(d.segments)).toEqual(['-w1234', '+Fernabsatzvertrag'])
    expect(sides(d.segments!)).toEqual({ from: a, to: b })
    expect(d.similarity).toBeCloseTo(1999 / 2000, 6)
  })

  it('aligns a middle too large for the matrix in linear memory, optimally, removed words first', () => {
    // Every 40th word replaced and every 97th dropped: the common start and end are short,
    // so the middle stays above MAX_DP_CELLS and goes through Hirschberg's split.
    const a = text(2400)
    const b = text(2400, (i) => (i % 97 === 5 ? '' : i % 40 === 7 ? `neu${i}` : null)).replace(/ {2,}/g, ' ')
    const d = diffTokens(a, b, { beyondCeiling: true })
    expect(d.segments).not.toBeNull()
    expect(sides(d.segments!)).toEqual({ from: a, to: b })
    const equalWords = d.segments!.filter((s) => s.type === 'equal').reduce((n, s) => n + s.text.split(' ').length, 0)
    expect(equalWords).toBe(lcs(a.split(' '), b.split(' ')))
    // Inside a run between two equal words, never an inserted word before a removed one.
    for (let k = 1; k < d.segments!.length; k++) expect(d.segments![k - 1]!.type === 'inserted' && d.segments![k]!.type === 'removed').toBe(false)
  })

  it('still stops where even the linear path would take too long, and only on request goes past the matrix', () => {
    const a = text(6000)
    const b = text(6000, (i) => `x${i}`)
    expect(diffTokens(a, b, { beyondCeiling: true }).segments).toBeNull()
    // Below the ceiling the option changes nothing.
    expect(diffTokens('Die Frist beträgt sechs Wochen.', 'Die Frist beträgt acht Wochen.', { beyondCeiling: true })).toEqual(diffTokens('Die Frist beträgt sechs Wochen.', 'Die Frist beträgt acht Wochen.'))
  })
})
