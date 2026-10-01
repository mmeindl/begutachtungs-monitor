import { describe, expect, it } from 'vitest'
import { parseExplanationsHtml, passagesByArticleParagraph, passagesByParagraph } from '../server/utils/explanations/explanationsHtml'

/** An Erläuterungen document as Parliament emits it from Word. */
function doc(...paragraphs: string[]): string {
  return `<html><body>${paragraphs.map((p) => `<p class=MsoNormal>${p}</p>`).join('')}</body></html>`
}

describe('parseExplanationsHtml', () => {
  it('splits the general part from the passages of the special part', () => {
    const parsed = parseExplanationsHtml(
      doc(
        'Allgemeiner Teil',
        'Mit dem Entwurf wird die Richtlinie umgesetzt.',
        'Besonderer Teil',
        'Zu Z 4 (§ 54c Abs. 1a und 1b):',
        'Die Änderung dient der Klarstellung.',
        'Zu Z 5 (§ 60):',
        'Redaktionelle Anpassung.',
      ),
    )
    expect(parsed.general).toEqual(['Mit dem Entwurf wird die Richtlinie umgesetzt.'])
    expect(parsed.special.map((p) => p.paragraphs)).toEqual([['§ 54c'], ['§ 60']])
    expect(parsed.special[0]!.text).toEqual(['Die Änderung dient der Klarstellung.'])
  })

  // A fifth of the documents print no „Besonderer Teil" heading and simply
  // start with „Zu § 1:" — the same finding
  // `explanations/risExplanations.ts` made on the RIS XML.
  it('starts the special part at the first address heading, with no divider', () => {
    const parsed = parseExplanationsHtml(doc('Allgemeiner Teil', 'Vorbemerkung.', 'Zu § 1:', 'Begründung zu § 1.'))
    expect(parsed.general).toEqual(['Vorbemerkung.'])
    expect(parsed.special).toHaveLength(1)
    expect(parsed.special[0]!.paragraphs).toEqual(['§ 1'])
  })

  // „B e s o n d e r e r  T e i l" — letterspaced headings are the rule in
  // these documents (§12.29).
  it('recognises a letter-spaced part heading', () => {
    const parsed = parseExplanationsHtml(doc('B e s o n d e r e r  T e i l', 'Zu § 2:', 'Text.'))
    expect(parsed.general).toEqual([])
    expect(parsed.special[0]!.paragraphs).toEqual(['§ 2'])
  })

  // Prose that happens to cite a Paragraph opens no passage — otherwise the
  // next §'s reasoning would hang at the wrong address.
  it('does not open a passage on prose that merely cites a §', () => {
    const parsed = parseExplanationsHtml(doc('Allgemeiner Teil', 'Zum Verhältnis zu § 5 ist zu sagen: nichts.'))
    expect(parsed.special).toEqual([])
    expect(parsed.general).toHaveLength(1)
  })

  it('leaves an orphan paragraph of the special part unattributed', () => {
    const parsed = parseExplanationsHtml(doc('Besonderer Teil', 'Ein Absatz ohne Adresse.', 'Zu § 3:', 'Begründung.'))
    expect(parsed.special).toHaveLength(1)
    expect(parsed.special[0]!.text).toEqual(['Begründung.'])
  })
})

describe('passagesByParagraph', () => {
  it('keys the passages by the § number both sides form', () => {
    const parsed = parseExplanationsHtml(doc('Besonderer Teil', 'Zu § 12:', 'Begründung zu zwölf.', 'Zu §§ 12 bis 14:', 'Gemeinsame Begründung.'))
    const byPara = passagesByParagraph(parsed)
    expect([...byPara.keys()].sort()).toEqual(['12', '13', '14'])
    expect(byPara.get('12')).toHaveLength(2)
  })

  /**
   * The enumeration, read since 22.09.2026: „Zu §§ 12 und 13" explains both
   * Paragraphen in one breath, and before that only the first one got the
   * passage. Shared code with the RIS path, which is why it was measured
   * there (`pnpm corpus:erlaeuterungen -- --join`, §12.30).
   */
  it('reads an enumeration as well as a range', () => {
    const byPara = passagesByParagraph(parseExplanationsHtml(doc('Besonderer Teil', 'Zu §§ 12 und 13:', 'Gemeinsame Begründung.')))
    expect([...byPara.keys()].sort()).toEqual(['12', '13'])
  })
})

/** The same, with the Word class of each paragraph — the Artikel mark depends on it. */
function classed(...paragraphs: [cls: string, text: string][]): string {
  return `<html><body>${paragraphs.map(([cls, p]) => `<p class=${cls}>${p}</p>`).join('')}</body></html>`
}

describe('the Artikel of a passage (27.09.2026)', () => {
  it('takes it from the passage heading itself', () => {
    const parsed = parseExplanationsHtml(doc('Besonderer Teil', 'Zu Art. 2 Z 1 (§ 5):', 'Text.'))
    expect(parsed.special[0]!.article).toBe('2')
  })

  it('carries the Artikel heading down to the passages under it, in either form', () => {
    const parsed = parseExplanationsHtml(
      classed(
        ['MsoNormal', 'Besonderer Teil'],
        ['83ErlText', 'Zu Artikel 3 (Bibliothekenverbund)'],
        ['MsoNormal', 'Zu Z 8 (§ 4):'],
        ['MsoNormal', 'Text.'],
        ['41UeberschrArt', 'Artikel IV'],
        ['MsoNormal', 'Zu Z 1 (§ 4):'],
        ['MsoNormal', 'Text.'],
      ),
    )
    expect(parsed.special.filter((p) => p.paragraphs.length).map((p) => p.article)).toEqual(['3', '4'])
    expect([...passagesByArticleParagraph(parsed).keys()]).toEqual(['3|4', '4|4'])
  })

  it('does not take a citation in prose for an Artikel heading', () => {
    // 143/ME: „Art. 15 der Richtlinie 2019/790" as a text line put § 86 UrhG
    // under an Artikel 15 in the measurement; 184 such blocks over GP XXVII.
    const parsed = parseExplanationsHtml(
      classed(
        ['MsoNormal', 'Besonderer Teil'],
        ['83ErlText', 'Zu Artikel 1 (Änderung des Urheberrechtsgesetzes)'],
        ['83ErlText', 'Art. 15 der Richtlinie 2019/790'],
        ['MsoNormal', 'Zu Z 20 (§ 86):'],
        ['MsoNormal', 'Text.'],
      ),
    )
    expect(parsed.special.find((p) => p.paragraphs.includes('§ 86'))!.article).toBe('1')
  })

  it('gives a heading over several Artikel none, and ends the mark above it', () => {
    const parsed = parseExplanationsHtml(
      doc('Besonderer Teil', 'Zu Art. 1 (Änderung des KfzStG)', 'Zu Art. 1 Z 5 sowie zu Art. 13 Z 1 bis 3 (§ 6 und § 7 KfzStG):', 'Text.', 'Zu Z 7 (§ 9):', 'Text.'),
    )
    expect(parsed.special.map((p) => p.article)).toEqual(['1', null, null])
    expect(passagesByArticleParagraph(parsed).size).toBe(0)
  })

  it('starts over at a part heading', () => {
    const parsed = parseExplanationsHtml(doc('Besonderer Teil', 'Zu Art. 2 (Änderung des X)', 'Allgemeiner Teil', 'Prosa.', 'Besonderer Teil', 'Zu Z 1 (§ 3):', 'Text.'))
    expect(parsed.special.at(-1)!.article).toBeNull()
  })
})

describe('the Artikel heading in force — section and law (01.10.2026)', () => {
  it('keeps the section of the Artikel heading where a passage names the Artikel of another numbering', () => {
    // 129 d.B. XXVIII keeps 24/ME's numbering inside its own Artikel heading.
    const parsed = parseExplanationsHtml(
      doc(
        'Besonderer Teil',
        'Zu Artikel 25 (Änderung des Bundes-Sportförderungsgesetzes 2017):',
        'Zu Z 47 (§ 39 BSFG 2017):',
        'Text.',
        'Zu Art. 3 Z 48 (§ 40 BSFG 2017 samt Überschrift):',
        'Text.',
        'Zu Z 49 (§ 44 Abs. 7 BSFG 2017):',
        'Text.',
      ),
    )
    expect(parsed.special.map((p) => [p.article, p.section])).toEqual([
      ['25', ['25']],
      ['25', ['25']],
      ['3', ['25']],
      ['3', ['25']],
    ])
    expect(parsed.special[2]!.law).toBe('Änderung des Bundes-Sportförderungsgesetzes 2017')
  })

  it('names every Artikel of a heading over several, none for a range, and no law for either', () => {
    const parsed = parseExplanationsHtml(
      doc(
        'Besonderer Teil',
        'Zu Artikel 23 (Änderung des KommAustria-Gesetzes) und Artikel 24 (Änderung des ORF-Gesetzes):',
        'Zu Art. 1 Z 1 (§ 6 Abs. 2 KOG) und zu Art. 2 Z 1 (§ 6a Abs. 2 ORF-G):',
        'Text.',
        'Zu Artikel 88 bis 102 (Änderungen des SPG, …):',
        'Text.',
        'Zu Art. 5, 8 und 9 (Änderung des DSt, der NO und der RAO)',
        'Text.',
      ),
    )
    expect(parsed.special.map((p) => p.section)).toEqual([['23', '24'], ['23', '24'], null, ['5', '8', '9']])
    expect(parsed.special.map((p) => p.law)).toEqual([null, null, null, null])
  })

  it('reads the law of an Artikel heading without a number, nested brackets kept (22/ME XXVIII)', () => {
    const law = 'Änderung des Bundesgesetzes über die Einrichtung einer Dokumentations- und Informationsstelle für Sektenfragen (Bundesstelle für Sektenfragen)'
    const parsed = parseExplanationsHtml(doc('Besonderer Teil', `Zu Art. X1 (${law}):`, 'Zu Z 1', 'Text.'))
    expect(parsed.special.map((p) => p.law)).toEqual([law, law])
    expect(parsed.special[1]!.section).toBeNull()
  })
})
