import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { baseActCelexes, baseActsOf, celexOf, eliOf, parseEuActCitations, readEuActCitations, unnamedAmendmentBases } from '../server/utils/eu/actCitations'
import { classifyVorblatt, classifyVorblattSentence, hasTextLayer, isVorblattDocument } from '../server/utils/eu/vorblatt'
import { isHintParagraph, readBundLaw, readExplanationsEuSignal, readUmsetzungshinweis, type LawTextBlock } from '../server/utils/eu/umsetzungshinweis'
import { euActSubject } from '../shared/utils/eu'
import { CELEX_RE, deadlineOf, parseTranspositionAnswer, transpositionQuery, transpositionUrl, type SparqlAnswer } from '../server/utils/eu/cellar'
import { combineVerdicts, decideEuMarker, lawTextMarker, newLawHint } from '../server/utils/eu/euMarker'
import { lawBlocksFromPdfPages } from '../server/utils/laender/draftPdfLaw'

/*
 * Fixtures from the Phase-A disk cache (`.cache/eu/`, 04.11.2026), read
 * through the production readers: the Vorblatt lines as `withPdf` + unpdf
 * extract them (a window around the EU heading, plus the first lines), the
 * law text as `parseRisXml` blocks around every window, three Cellar answers
 * as the SPARQL endpoint sent them. No test here touches the network.
 */
const FIXTURES = join(import.meta.dirname, 'fixtures', 'eu')
const vorblatt = JSON.parse(readFileSync(join(FIXTURES, 'vorblatt.json'), 'utf8')) as Record<string, { doc: string; lines: string[] }[]>
const law = JSON.parse(readFileSync(join(FIXTURES, 'law.json'), 'utf8')) as Record<string, LawTextBlock[]>
const cellar = (celex: string) => JSON.parse(readFileSync(join(FIXTURES, `cellar-${celex}.json`), 'utf8')) as SparqlAnswer

const celexes = (text: string, implemented = false) => parseEuActCitations(text, { implemented }).map((a) => a.celex)

describe('parseEuActCitations', () => {
  it('labels an act in its own form, every era (the Cellar\'s title and the drafts\' citations)', () => {
    const label = (t: string) => parseEuActCitations(t).map((a) => a.label)
    expect(label('Richtlinie 76/207/EG zur Verwirklichung')).toEqual(['Richtlinie 76/207/EWG'])
    expect(label('Richtlinie 92/43/EWG des Rates')).toEqual(['Richtlinie 92/43/EWG'])
    expect(label('Richtlinie 1999/62/EG über die Erhebung')).toEqual(['Richtlinie 1999/62/EG'])
    expect(label('Richtlinie 2000/43/EG zur Anwendung')).toEqual(['Richtlinie 2000/43/EG'])
    expect(label('Richtlinie 2009/43/EG zur Vereinfachung')).toEqual(['Richtlinie 2009/43/EG'])
    expect(label('Richtlinie 2010/41/EU zur Verwirklichung')).toEqual(['Richtlinie 2010/41/EU'])
    expect(label('Richtlinie 2014/36/EU über die Bedingungen')).toEqual(['Richtlinie 2014/36/EU'])
    expect(label('Richtlinie 2013/59/Euratom des Rates')).toEqual(['Richtlinie 2013/59/Euratom'])
    expect(label('Verordnung (EWG) Nr. 1408/71 zur Anwendung')).toEqual(['Verordnung (EWG) Nr. 1408/71'])
    expect(label('Verordnung (EG) Nr. 1907/2006')).toEqual(['Verordnung (EG) Nr. 1907/2006'])
  })

  it('reads „(EU) Nr. a/b" year first where only the first number fits „(EU)" (UVP-G, 05.11.2026)', () => {
    expect(celexes('Richtlinie (EU) Nr. 2018/2001 zur Förderung der Nutzung von Energie aus erneuerbaren Quellen')).toEqual(['32018L2001'])
    expect(celexes('Verordnung (EU) Nr. 1025/2012')).toEqual(['32012R1025'])
    expect(celexes('Verordnung (EG) Nr. 2018/2001')).toEqual(['32001R2018'])
  })

  it('reads the citation form since 2015 and builds CELEX, ELI and label', () => {
    const [act] = parseEuActCitations('Mit diesem Bundesgesetz wird die Richtlinie (EU) 2024/1069 des Europäischen Parlaments umgesetzt.')
    expect(act).toMatchObject({
      kind: 'richtlinie',
      year: 2024,
      number: 1069,
      celex: '32024L1069',
      eli: 'https://eur-lex.europa.eu/eli/dir/2024/1069/oj/deu',
      label: 'Richtlinie (EU) 2024/1069',
    })
  })

  it('reads the bare form since 2015: the kind word alone, year first', () => {
    expect(parseEuActCitations('geändert durch die Richtlinie 2024/1785 (ABl. L, 2024/1785, 15.07.2024)').map((a) => [a.celex, a.label])).toEqual([['32024L1785', 'Richtlinie (EU) 2024/1785']])
    expect(parseEuActCitations('Durchführungsbeschluss 2023/2749 über Schlussfolgerungen zu den besten verfügbaren Techniken').map((a) => [a.celex, a.label])).toEqual([['32023D2749', 'Durchführungsbeschluss (EU) 2023/2749']])
    expect(celexes('des Durchführungsbeschlusses 2025/1460 des Rates')).toEqual(['32025D1460'])
    expect(celexes('Delegierte Verordnung 2025/27 vom 30.10.2024')).toEqual(['32025R0027'])
    expect(celexes('Durchführungsverordnung 2023/138 der Kommission')).toEqual(['32023R0138'])
  })

  it('reads no bare form in a compound, before 2015, after this year, or with more behind the number', () => {
    // A national funding guideline: the kind word ends a compound.
    expect(celexes('nach der Förderrichtlinie 2024/12 des Landes')).toEqual([])
    expect(celexes('nach der Sonder-Richtlinie 2024/3')).toEqual([])
    // Before 2015 a/b is ambiguous without the organisation (number/year or year/number).
    expect(celexes('die Richtlinie 2014/36 über Saisonarbeitnehmer')).toEqual([])
    expect(celexes('Richtlinie 2009/73 umzusetzen')).toEqual([])
    expect(celexes(`Richtlinie ${new Date().getUTCFullYear() + 1}/1`)).toEqual([])
    // A Geschäftszahl, a decimal; the suffix form is read as before.
    expect(celexes('Richtlinie 2024/12/3')).toEqual([])
    expect(celexes('Richtlinie 2024/1.5')).toEqual([])
    expect(celexes('Richtlinie 2019/1937/EU')).toEqual(['32019L1937'])
  })

  it('reads the old forms: regulation number first after „Nr.", directive and decision with a suffix', () => {
    expect(parseEuActCitations('Verordnung (EG) Nr. 1907/2006').map((a) => [a.celex, a.label])).toEqual([['32006R1907', 'Verordnung (EG) Nr. 1907/2006']])
    expect(parseEuActCitations('Richtlinie 2009/43/EG zur Vereinfachung').map((a) => [a.celex, a.label])).toEqual([['32009L0043', 'Richtlinie 2009/43/EG']])
    expect(celexes('Beschluss Nr. 1313/2013/EU über ein Katastrophenschutzverfahren')).toEqual(['32013D1313'])
    expect(celexes('der Saisonarbeiter-Richtlinien (2014/36/EU)')).toEqual(['32014L0036'])
  })

  it('reads „Nr." in front of the new order as year first where the second number cannot be a year', () => {
    expect(celexes('Verordnung (EU) Nr. 2022/2065 über einen Binnenmarkt für digitale Dienste')).toEqual(['32022R2065'])
  })

  it('reads the abbreviations with a four-digit year, and keeps the variant labels', () => {
    expect(celexes('Umsetzung der RL 2019/1937 und der VO 2016/679')).toEqual(['32019L1937', '32016R0679'])
    expect(parseEuActCitations('Durchführungsverordnung (EU) 2019/947 der Kommission')[0]!.label).toBe('Durchführungsverordnung (EU) 2019/947')
    expect(parseEuActCitations('Delegierte Verordnung (EU) 2024/123')[0]!.label).toBe('Delegierte Verordnung (EU) 2024/123')
  })

  it('lets a list inherit the type of its first act', () => {
    expect(celexes('der Richtlinien (EU) 2022/2464 und (EU) 2023/2775 sowie 2014/95/EU')).toEqual(['32022L2464', '32023L2775', '32014L0095'])
  })

  it('drops acts named inside another act\'s title when asked which act is implemented', () => {
    const text = 'Richtlinie (EU) 2019/944 über gemeinsame Vorschriften für den Elektrizitätsbinnenmarkt und zur Änderung der Richtlinie 2012/27/EU'
    expect(celexes(text)).toEqual(['32019L0944', '32012L0027'])
    expect(celexes(text, true)).toEqual(['32019L0944'])
    expect(readEuActCitations(text, { implemented: true }).titleReferencesDropped).toBe(1)
  })

  it('keeps a national „Richtlinie" without an act number out', () => {
    expect(celexes('nach den Richtlinien des Bundesministers zur Förderung 2024')).toEqual([])
  })

  it('builds CELEX and ELI for every kind', () => {
    expect(celexOf('verordnung', 2016, 679)).toBe('32016R0679')
    expect(celexOf('beschluss', 2011, 833)).toBe('32011D0833')
    expect(eliOf('verordnung', 2016, 679)).toBe('https://eur-lex.europa.eu/eli/reg/2016/679/oj/deu')
    expect(eliOf('beschluss', 2011, 833)).toBe('https://eur-lex.europa.eu/eli/dec/2011/833/oj/deu')
  })
})

describe('an act inside another act\'s title is none of its own (titleSpanEnd)', () => {
  it('drops a citation in the title, up to its OJ reference or the sentence end (t-2026-734, RED III)', () => {
    expect(celexes('Mit diesem Gesetz werden begleitende Maßnahmen zur Durchführung der Durchführungsverordnung (EU) 2023/564 der Kommission vom 10. März 2023 betreffend den Inhalt und das Format der gemäß der Verordnung (EG) Nr. 1107/2009 des Europäischen Parlaments und des Rates von den beruflichen Verwendern geführten Aufzeichnungen über Pflanzenschutzmittel, ABl. Nr. L 74 vom 13.03.2023 S. 4, getroffen.', true)).toEqual(['32023R0564'])
    expect(celexes('Mit dem Entwurf wird die Richtlinie (EU) 2023/2413 des Europäischen Parlaments und des Rates vom 18. Oktober 2023 zur Änderung der Richtlinie (EU) 2018/2001, der Verordnung (EU) 2018/1999 und der Richtlinie 98/70/EG im Hinblick auf die Förderung von Energie aus erneuerbaren Quellen umgesetzt.', true)).toEqual(['32023L2413'])
    expect(celexes('die Verordnung (EU) 2019/1020 über Marktüberwachung sowie zur Änderung der Richtlinie 2004/42/EG und der Verordnungen (EG) Nr. 765/2008 und (EU) Nr. 305/2011, ABl. Nr. L 169 vom 25.06.2019 S. 1, und die Verordnung (EU) 2024/573', true)).toEqual(['32019R1020', '32024R0573'])
  })

  it('ends the title at the next item, the amendment phrase and a short name', () => {
    expect(celexes('1. Durchführungsverordnung (EU) 2023/564 der Kommission betreffend die Aufzeichnungen 2. Durchführungsverordnung (EU) 2025/2203 der Kommission zur Änderung der Durchführungsverordnung (EU) 2023/564', true)).toEqual(['32023R0564', '32025R2203'])
    expect(celexes('Dieses Gesetz dient der Umsetzung der Richtlinie (EU) 2018/2001 zur Förderung der Nutzung von Energie aus erneuerbaren Quellen, in der Fassung der Richtlinie (EU) 2024/1711', true)).toEqual(['32018L2001', '32024L1711'])
    expect(celexes('der Verordnung (EU) 2024/1309 über Maßnahmen zur Reduzierung der Kosten (Gigabit-Infrastrukturverordnung) und der Richtlinie (EU) 2018/1972', true)).toEqual(['32024R1309', '32018L1972'])
  })

  it('keeps a second act joined to the first, not to its title', () => {
    // „die delegierte RL" — an object of its own (Tabak- und Nikotinsucht-Gesetz).
    expect(celexes('der Durchführungsbeschluss (EU) 2016/586 der Kommission vom 14. April 2016 zu den technischen Normen sowie die delegierte RL (EU) 2022/2100 vom 29. Juni 2022 zur Änderung der RL 2014/40/EU', true)).toEqual(['32016D0586', '32022L2100'])
    // A genitive join before the title names any act: the Kulturgüterrückgabegesetz.
    expect(celexes('von der Verordnung (EG) Nr. 116/2009 des Rates vom 18. Dezember 2008 über die Ausfuhr von Kulturgütern und der Richtlinie 2014/60/EU des Europäischen Parlaments und des Rates abgedeckt', true)).toEqual(['32009R0116', '32014L0060'])
    // After an act of the title's own, the join continues the title.
    expect(celexes('Richtlinie (EU) 2018/645 zur Änderung der Richtlinie 2003/59/EG über die Grundqualifikation der Fahrer und der Richtlinie 2006/126/EG über den Führerschein, ABl. Nr. L 112 vom 02.05.2018', true)).toEqual(['32018L0645'])
  })
})

describe('baseActCelexes — base directive vs amending directive', () => {
  it('reads „X …, in der Fassung der Y" as X the base and Y the amendment (43/ME EABG)', () => {
    const text = '§ 3. Dieses Gesetz dient der Umsetzung der Richtlinie (EU) 2018/2001 zur Förderung der Nutzung von Energie aus erneuerbaren Quellen (Neufassung), ABl. Nr. L 328 vom 21.12.2018 S. 82, in der Fassung der Richtlinie (EU) 2024/1711, ABl. Nr. L 1711 vom 26.6.2024 S. 1.'
    expect([...baseActCelexes(text)]).toEqual(['32018L2001'])
  })

  it('reads „geändert durch die" the same way, across title references it dropped', () => {
    expect([...baseActCelexes('Richtlinie 2006/43/EG über Abschlussprüfungen, zur Änderung der Richtlinien 78/660/EWG und 83/349/EWG, ABl. Nr. L 157 vom 09.06.2006 S. 87, in der Fassung der Richtlinie (EU) 2023/2864')]).toEqual(['32006L0043'])
    expect([...baseActCelexes('Richtlinie 2010/75/EU, zuletzt geändert durch die Richtlinie (EU) 2024/1785')]).toEqual(['32010L0075'])
  })

  it('marks no base where two acts merely stand side by side', () => {
    expect([...baseActCelexes('der Richtlinie (EU) 2023/2864 und dem wirksamen Vollzug der Verordnung (EU) 2023/2859')]).toEqual([])
  })
})

describe('unnamedAmendmentBases — an amending act cited without its number (28/ME)', () => {
  const GEWO = '(119) Durch das Bundesgesetz BGBl. I Nr. xxx/xxxx wird die Richtlinie zur Änderung der Richtlinie 2009/138/EG betreffend die Aufnahme und Ausübung der Versicherungs- und der Rückversicherungstätigkeit (Solvabilität II), der Richtlinie 2014/65/EU über Märkte für Finanzinstrumente, und der Richtlinie (EU) 2015/849 zur Verhinderung der Nutzung des Finanzsystems zum Zwecke der Geldwäsche und der Terrorismusfinanzierung, ABl. Nr. L 334 vom 27.12.2019 S. 155 umgesetzt.'

  it('keeps every act of the unnamed act\'s title, and reads each as its base', () => {
    expect(parseEuActCitations(GEWO, { implemented: true, withoutReferences: true }).map((a) => a.celex)).toEqual(['32009L0138', '32014L0065', '32015L0849'])
    expect([...unnamedAmendmentBases(GEWO)]).toEqual(['32009L0138', '32014L0065', '32015L0849'])
    // A base whatever else is named — the implemented act is not named at all.
    expect([...baseActsOf([GEWO], parseEuActCitations(GEWO))]).toEqual(['32009L0138', '32014L0065', '32015L0849'])
  })

  it('ends at the title: an act joined as an object of its own is implemented', () => {
    const text = 'Mit diesem Bundesgesetz werden die Richtlinie zur Änderung der Richtlinie 2014/65/EU über Märkte für Finanzinstrumente, ABl. Nr. L 334 vom 27.12.2019 S. 155, und die Richtlinie (EU) 2024/790 umgesetzt.'
    expect([...unnamedAmendmentBases(text)]).toEqual(['32014L0065'])
  })

  it('is no base where the text also names the act as its own', () => {
    expect([...unnamedAmendmentBases('Durch diese Verordnung werden die Richtlinie 2014/65/EU und die Richtlinie zur Änderung der Richtlinie 2014/65/EU umgesetzt.')]).toEqual([])
  })

  it('leaves the bases of an amending act that only amends a named base a title reference (Vergaberechtsgesetz)', () => {
    const text = 'Dieses Bundesgesetz dient der Umsetzung der Richtlinie 2009/33/EG über die Förderung sauberer Straßenfahrzeuge, ABl. Nr. L 120 vom 15.5.2009 S. 5, zuletzt geändert durch den Beschluss zur Änderung der Richtlinien 2009/12/EG, 2009/33/EG und (EU) 2022/1999 des Europäischen Parlaments und des Rates.'
    expect(parseEuActCitations(text, { implemented: true }).map((a) => a.celex)).toEqual(['32009L0033'])
    expect([...unnamedAmendmentBases(text)]).toEqual([])
  })

  it('needs the kind word alone — a numbered act\'s title stays a title reference', () => {
    const text = 'wird die Richtlinie (EU) 2019/2177 zur Änderung der Richtlinie 2009/138/EG umgesetzt'
    expect(parseEuActCitations(text, { implemented: true }).map((a) => a.celex)).toEqual(['32019L2177'])
    expect([...unnamedAmendmentBases(text)]).toEqual([])
  })
})

describe('the Vorblatt', () => {
  const one = (label: string, i = 0) => classifyVorblatt(vorblatt[label]![i]!.lines)

  it('recognises the Vorblatt by its document name', () => {
    for (const name of ['Vorblatt und WFA', 'WFA samt Vorblatt', 'Vorblatt + WFV', 'WF mit Vorblatt', 'begVorblatt_WFA', 'Ergbnisdokument', 'wirkungsorientierte Folgenabschätzung']) {
      expect(isVorblattDocument(name), name).toBe(true)
    }
    for (const name of ['Erläuterungen', 'Textgegenüberstellung', 'Begleitschreiben', 'Entwurf']) expect(isVorblattDocument(name), name).toBe(false)
  })

  it('reads the tool sentence „dient der Umsetzung einer EU-Richtlinie" (147/ME)', () => {
    expect(one('147/ME Anti-SLAPP')).toEqual({ sentence: 'Das Vorhaben dient der Umsetzung einer EU-Richtlinie.', cls: 'umsetzung' })
  })

  it('reads the combined sentence of 30/ME as an implementation, not as flanking', () => {
    const r = one('30/ME Finanzmarktsammelgesetz')
    expect(r.sentence).toMatch(/flankierenden Regelungen zu Verordnungen .* und dient der Umsetzung mehrerer Richtlinien/)
    expect(r.cls).toBe('umsetzung')
  })

  it('reads „geht über eine verpflichtende Umsetzung … hinaus" verbatim (71/ME)', () => {
    expect(one('71/ME TNRSG')).toEqual({
      sentence: 'Das Vorhaben geht über eine verpflichtende Umsetzung zwingender Vorschriften des Unionsrechtes hinaus',
      cls: 'ueber-umsetzung',
    })
  })

  it('reads flanking and „in scope, but no implementation"', () => {
    expect(one('81/ME AußWG').cls).toBe('flankierend-vo')
    expect(one('eu-keine-umsetzung, footer after the sentence').cls).toBe('eu-keine-umsetzung')
  })

  it('stops the section at the page footer and the next heading', () => {
    expect(one('eu-keine-umsetzung, footer after the sentence').sentence).toBe(
      'Die vorgesehenen Regelungen fallen in den Anwendungsbereich des Rechts der Europäischen Union, dienen aber nicht der Erfüllung unionsrechtlicher Vorgaben',
    )
  })

  it('reads through a page footer between the heading and the sentence', () => {
    // The layout an independent pdftotext reading met: the heading is the
    // last line of a page, the footer follows, the sentence opens the next.
    const lines = vorblatt['eu-keine-umsetzung, footer after the sentence']![0]!.lines
    const at = lines.findIndex((l) => /Verhältnis zu den Rechtsvorschriften/.test(l))
    const moved = [...lines.slice(0, at + 1), '2 von 10', 'Seite 3', ...lines.slice(at + 1).filter((l) => !/^\s*\d+ von \d+\s*$/.test(l))]
    expect(classifyVorblatt(moved).cls).toBe('eu-keine-umsetzung')
    expect(classifyVorblatt(moved).sentence).not.toMatch(/von 10|Seite/)
  })

  it('reads two contradicting WFAs of one draft apart (135/ME)', () => {
    expect(vorblatt['135/ME Industriestrompreisgesetz']!.map((d) => classifyVorblatt(d.lines).cls)).toEqual(['eu-keine-umsetzung', 'umsetzung'])
  })

  it('reads a ressort\'s own words for an implementation, even with only a short name (AEV)', () => {
    const r = one('AEV, free text with a short name')
    expect(r.cls).toBe('frei-umsetzung')
    expect(parseEuActCitations(r.sentence!)).toEqual([])
  })

  it('classes the free-text answers', () => {
    expect(classifyVorblattSentence('Unionsrecht wird nicht tangiert.')).toBe('frei-nein')
    expect(classifyVorblattSentence('Die Regelungen stehen im Einklang mit der Richtlinie 2005/36/EG.')).toBe('frei-nein')
    expect(classifyVorblattSentence('Der Entwurf sieht ausschließlich Maßnahmen vor, zu denen der Bund aufgrund zwingender Vorschriften des Unionsrechts verpflichtet ist.')).toBe('nur-zwingend')
    expect(classifyVorblattSentence('Klimaziele 2040.')).toBe('freitext')
  })

  it('finds the heading without „den" (Burgenland, Wien)', () => {
    const r = classifyVorblatt(['Vorblatt', 'Verhältnis zu Rechtsvorschriften der Europäischen Union:', 'Die vorgesehenen Regelungen fallen nicht in den Anwendungsbereich des Rechts der Europäischen Union.', 'Besonderheiten des Normerzeugungsverfahrens:', 'Keine.'])
    expect(r).toEqual({ sentence: 'Die vorgesehenen Regelungen fallen nicht in den Anwendungsbereich des Rechts der Europäischen Union.', cls: 'nicht-eu' })
  })

  it('ends a Land\'s EU section at its next heading, not in the Besonderer Teil (Burgenland, Oberösterreich)', () => {
    const ooe = classifyVorblatt([
      'V. Verhältnis zu Rechtsvorschriften der Europäischen Union',
      'Diesem Gesetzentwurf stehen - soweit ersichtlich - keine zwingenden unionsrechtlichen Vorschriften entgegen.',
      'VI. Auswirkungen auf die verschiedenen Gruppen der Gesellschaft, insbesondere auf Frauen und Männer',
      'Keine.',
      'B. Besonderer Teil',
      'Mit Art. II wird die Richtlinie (EU) 2024/1275 umgesetzt.',
    ])
    expect(ooe).toEqual({ sentence: 'Diesem Gesetzentwurf stehen - soweit ersichtlich - keine zwingenden unionsrechtlichen Vorschriften entgegen.', cls: 'frei-nein' })
    const bgld = classifyVorblatt([
      'Verhältnis zu Rechtsvorschriften der Europäischen Union:',
      'Bestimmungen des Unionsrechts werden durch den vorliegenden Entwurf nicht berührt.',
      'Besonderheiten des Normsetzungsverfahrens:',
      'Keine.',
    ])
    expect(bgld.sentence).toBe('Bestimmungen des Unionsrechts werden durch den vorliegenden Entwurf nicht berührt.')
  })

  it('reads Steiermark\'s negation as a no, not as free text (04.11.2026)', () => {
    expect(classifyVorblattSentence('Der Entwurf dient nicht der Durchführung oder Umsetzung von Unionsrecht.')).toBe('frei-nein')
    expect(classifyVorblattSentence('Der Entwurf dient nicht der Durchführung oder Umsetzung des Rechts der Europäischen Union.')).toBe('frei-nein')
    // A negated list of directives is still a no.
    expect(classifyVorblattSentence('Mit dem Entwurf werden keine Richtlinien umgesetzt.')).toBe('frei-nein')
  })

  it('reads the list form and a long act title as an implementation, a regulation „durchgeführt" as flanking', () => {
    expect(classifyVorblattSentence('Mit dem Entwurf werden folgende Richtlinien umgesetzt: 1. Richtlinie (EU) 2024/1499 des Rates vom 7. Mai 2024 über Standards für Gleichbehandlungsstellen im Bereich der Gleichbehandlung von Personen ungeachtet ihrer Rasse oder ethnischen Herkunft; 2. Richtlinie (EU) 2024/1500 des Europäischen Parlaments und des Rates vom 14. Mai 2024 über Standards für Gleichbehandlungsstellen.')).toBe('frei-umsetzung')
    expect(classifyVorblattSentence('Mit dem Entwurf werden folgende Richtlinien umgesetzt: 1. Richtlinie 2009/147/EG des Europäischen Parlamentes und des Rates vom 30. November 2009 über die Erhaltung der wildlebenden Vogelarten (Vogelschutz-Richtlinie – VS- Richtlinie), ABl. Nr. L 20 vom 26.1.2010, S. 7, zuletzt geändert durch die Verordnung (EU) 2019/1010.')).toBe('frei-umsetzung')
    // The title pushes „umgesetzt" 230 characters behind „Richtlinie".
    expect(classifyVorblattSentence('Mit dem Entwurf wird die Richtlinie 2012/18/EU des Europäischen Parlaments und des Rates vom 4. Juli 2012 zur Beherrschung der Gefahren schwerer Unfälle mit gefährlichen Stoffen, zur Änderung und anschließenden Aufhebung der Richtlinie 96/82/EG des Rates („Seveso III-Richtlinie“) umgesetzt.')).toBe('frei-umsetzung')
    expect(classifyVorblattSentence('Mit dem Entwurf werden folgende Verordnungen durchgeführt: 1. Durchführungsverordnung (EU) 2023/564 der Kommission betreffend den Inhalt und das Format der gemäß der Verordnung (EG) Nr. 1107/2009 des Europäischen Parlaments und des Rates von den beruflichen Verwendern geführten Aufzeichnungen über Pflanzenschutzmittel.')).toBe('flankierend-vo')
    expect(classifyVorblattSentence('Im Hinblick auf die Änderung des Steiermärkischen Notifikationsgesetzes 2017 (Artikel 4) wird mit dem Entwurf die Verordnung (EU) 2023/988 des Europäischen Parlaments und des Rates vom 10. Mai 2023 über die allgemeine Produktsicherheit, ABl. L 135 vom 23.5.2023, S. 1, durchgeführt.')).toBe('flankierend-vo')
    // Oberösterreich: the act as a compound, the subject before the verb, the list after it.
    expect(classifyVorblattSentence('Dieser Gesetzesnovelle stehen - soweit ersichtlich - keine zwingenden unionsrechtlichen Vorschriften entgegen. Vielmehr werden mit der vorliegenden Novelle die baurechtlich relevanten Bestimmungen der EU-Gebäuderichtlinie umgesetzt.')).toBe('frei-umsetzung')
    // bgld-c372: the „no" phrase („im Einklang") before the yes must not win over „Umsetzung folgender".
    expect(classifyVorblattSentence('Der Entwurf steht im Einklang mit den Rechtsvorschriften der Europäischen Union. Der vorliegende Entwurf dient der Umsetzung folgender Rechtsakte der Europäischen Union: - Richtlinie 2023/970/EU zur Stärkung der Anwendung des Grundsatzes des gleichen Entgelts.')).toBe('frei-umsetzung')
    expect(classifyVorblattSentence('Folgende unionsrechtliche Vorschriften werden unmittelbar durch das vorliegende Landesgesetz umgesetzt: - Richtlinie (EU) 2024/1499 des Rates vom 7. Mai 2024 über Standards für Gleichbehandlungsstellen.')).toBe('frei-umsetzung')
    // A national guideline is no EU act.
    expect(classifyVorblattSentence('Mit dem Entwurf wird die OIB-Richtlinie 6 umgesetzt.')).toBe('freitext')
    // A past implementation, and a sentence that ends before „umgesetzt", say nothing new.
    expect(classifyVorblattSentence('Die Richtlinie 2005/36/EG wurde bereits mit BGBl. I Nr. 12/2020 umgesetzt.')).not.toBe('frei-umsetzung')
    expect(classifyVorblattSentence('Mit dem Entwurf wird die Richtlinie 2005/36/EG zitiert. Sie ist seit Jahren umgesetzt.')).not.toBe('frei-umsetzung')
  })

  it('reads the Länder\'s house phrases for „no" (04.11.2026)', () => {
    for (const no of [
      'Diesem Landesgesetz stehen - soweit ersichtlich - keine zwingenden unionsrechtlichen Vorschriften entgegen.',
      'Das Unionsrecht steht dem Vorhaben nicht entgegen.',
      'Der Entwurf steht im Einklang mit den Rechtsvorschriften der Europäischen Union.',
      'Die Regelungen der Novelle stehen mit den Rechtsvorschriften der Europäischen Union im Einklang.',
      'Unionsrechtliche Berührungspunkte liegen nicht vor.',
      'Dieser Verordnungsentwurf steht mit keinen zwingenden unionsrechtlichen Vorschriften im Widerspruch.',
      'Durch den vorliegenden Verordnungsentwurf werden keine Rechtsvorschriften der Europäischen Union berührt.',
    ]) expect(classifyVorblattSentence(no), no).toBe('frei-nein')
  })

  it('finds no section without the heading, and no text layer in a scan', () => {
    expect(classifyVorblatt(['Vorblatt', 'Ziele', 'Ziel 1: irgendwas'])).toEqual({ sentence: null, cls: null })
    expect(hasTextLayer(['1 von 3', '', '2 von 3'])).toBe(false)
    expect(hasTextLayer(vorblatt['147/ME Anti-SLAPP']![0]!.lines)).toBe(true)
  })
})

describe('readUmsetzungshinweis', () => {
  it('reads the Umsetzungshinweis of 147/ME', () => {
    const r = readUmsetzungshinweis(law['147/ME Anti-SLAPP']!)
    expect(r.signal).toBe('umsetzung')
    expect(r.acts.map((a) => a.label)).toEqual(['Richtlinie (EU) 2024/1069'])
  })

  it('names the old directive an amendment restates — whether it is new is the law in force\'s question (81/ME)', () => {
    const r = readUmsetzungshinweis(law['81/ME AußWG']!)
    expect(r.acts.map((a) => a.celex)).toEqual(['32009L0043'])
    expect(r.windows[0]!.text).toMatch(/^"\(2\) Mit diesem Bundesgesetz wird die Richtlinie 2009\/43\/EG/)
  })

  it('reads a base and its amendment in one sentence (43/ME)', () => {
    const r = readUmsetzungshinweis(law['43/ME EABG']!)
    expect(r.acts.map((a) => a.celex)).toEqual(['32018L2001', '32024L1711'])
    expect([...baseActCelexes(r.windows[0]!.text)]).toEqual(['32018L2001'])
  })

  it('reads a regulation under „Umsetzungshinweis" as flanking, and the cumulative hint of a Sammelnovelle (30/ME)', () => {
    const r = readUmsetzungshinweis(law['30/ME Finanzmarktsammelgesetz']!)
    expect(r.windows[0]!.signal).toBe('durchfuehrung')
    expect(r.windows[0]!.acts.map((a) => a.celex)).toEqual(['32023R2631'])
    expect(r.signal).toBe('umsetzung')
    // The title references of 2006/43/EG („zur Änderung der Richtlinien 78/660/EWG …") are not acts of the draft.
    expect(r.acts.map((a) => a.celex)).not.toContain('31978L0660')
    expect(r.acts.map((a) => a.celex)).toContain('32023L2864')
  })

  it('does not resolve a short name, but reads a directive and a decision cited without organisation (AEV)', () => {
    const r = readUmsetzungshinweis(law['AEV, short name and amending directive']!)
    expect(r.signal).toBe('umsetzung')
    // „IE-Richtlinie" stays unread (D7); „geändert durch die Richtlinie
    // 2024/1785" and „Durchführungsbeschluss 2023/2749" are the bare form
    // (05.11.2026), and 2010/75 is the base 2024/1785 amends.
    expect(r.acts.map((a) => a.celex)).toEqual(['32010L0075', '32024L1785', '32023D2749'])
    expect([...baseActCelexes(r.windows[0]!.text)]).toContain('32010L0075')
  })

  it('reads plain text, one Absatz per line, and drops a national „Richtlinie"', () => {
    expect(readUmsetzungshinweis('§ 5. Mit dieser Verordnung wird die Richtlinie (EU) 2025/872 umgesetzt.').acts.map((a) => a.celex)).toEqual(['32025L0872'])
    const national = readUmsetzungshinweis('Mit dieser Verordnung werden die Richtlinien zur Erstellung dieser Maßnahmenpakete umgesetzt.')
    expect(national.signal).toBeNull()
    expect(national.dropped).toHaveLength(1)
  })

  it('reads a Land § whose title the PDF reader joined to its first sentence (Tirol, t-2026-588)', () => {
    // Thirteen lines of the draft PDF's text layer (`tirol-588-durchfuehrung.txt`):
    // the PDF reader gives one block „§ 13b Durchführung von Unionsrecht Durch
    // dieses Gesetz werden …" — a Land's § without the Bund's period.
    const pages = [readFileSync(join(FIXTURES, 'tirol-588-durchfuehrung.txt'), 'utf8')]
    const blocks = lawBlocksFromPdfPages(pages)!
    expect(blocks.some((b) => b.text.startsWith('§ 13b Durchführung von Unionsrecht Durch dieses Gesetz'))).toBe(true)
    const r = readUmsetzungshinweis(blocks)
    expect(r.signal).toBe('durchfuehrung')
    expect(r.acts.map((a) => a.celex)).toEqual(['32024R1028'])
  })

  it('reads „dient der Umsetzung folgender Richtlinien" as implementing (sbg-35373)', () => {
    const r = readUmsetzungshinweis([
      { kind: 'para_head', text: 'Umsetzungshinweis' },
      { kind: 'abs', gld: '§ 17a', text: 'Dieses Gesetz dient der Umsetzung folgender Richtlinien:' },
      { kind: 'ziff', text: '1. Richtlinie (EU) 2024/1499 über Standards für Gleichbehandlungsstellen;' },
    ])
    expect(r.signal).toBe('umsetzung')
  })

  it('takes the deciding signal only from a window that names an act', () => {
    const r = readUmsetzungshinweis([
      { kind: 'abs', text: 'Mit diesem Bundesgesetz wird die IE-Richtlinie umgesetzt.', gld: '§ 3.' },
      { kind: 'para_head', text: 'Unionsrecht' },
      { kind: 'abs', text: 'Soweit in diesem Bundesgesetz auf die Richtlinie (EU) 2019/1937 verwiesen wird, ist sie in der geltenden Fassung anzuwenden.', gld: '§ 4.' },
    ])
    expect(r.signal).toBe('umsetzung')
    expect(r.actSignal).toBe('bezug')
    expect(r.acts.map((a) => a.celex)).toEqual(['32019L1937'])
  })

  it('reads a hint list to its end, past twelve Ziffern, and stops at the next § (bgld-c372)', () => {
    const years = [2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2016, 2019]
    const blocks: LawTextBlock[] = [
      { kind: 'para_head', text: 'Umsetzungshinweise' },
      { kind: 'abs', gld: '§ 65.', text: 'Durch dieses Gesetz werden folgende Richtlinien der Europäischen Union umgesetzt:' },
      ...years.map((y, n) => ({ kind: 'ziff', text: `${n + 1}. Richtlinie ${y}/${n + 1}/EG über etwas, ABl. Nr. L 1 vom 01.01.${y} S. 1,` })),
      { kind: 'ziff', text: '18. Richtlinie (EU) 2024/1500 über Standards für Gleichbehandlungsstellen.' },
      // A Land PDF gives the next § as an Absatz without a heading block.
      { kind: 'abs', gld: '§ 66.', text: 'Soweit in diesem Gesetz auf die Verordnung (EU) 2016/679 verwiesen wird, ist sie in der geltenden Fassung anzuwenden.' },
    ]
    const r = readUmsetzungshinweis(blocks)
    expect(r.acts).toHaveLength(18)
    expect(r.acts.at(-1)!.celex).toBe('32024L1500')
    expect(r.acts.map((a) => a.celex)).not.toContain('32016R0679')
  })

  it('keeps a hint\'s second Absatz in its window, where the § goes on (32/ME: „(2) … werden folgende Verordnungen durchgeführt")', () => {
    const r = readUmsetzungshinweis([
      { kind: 'abs', gld: '§ 2.', text: '(1) Durch dieses Bundesgesetz werden folgende Richtlinien umgesetzt:' },
      { kind: 'ziff', gld: '1.', text: 'Richtlinie (EU) 2019/944 mit gemeinsamen Vorschriften für den Elektrizitätsbinnenmarkt;' },
      { kind: 'abs', gld: '(2)', text: 'Durch dieses Bundesgesetz werden folgende Verordnungen durchgeführt:' },
      { kind: 'ziff', gld: '1.', text: 'Verordnung (EU) 2019/943 über den Elektrizitätsbinnenmarkt.' },
      { kind: 'abs', gld: '§ 3.', text: 'Die Verordnung (EU) 2024/1991 bleibt unberührt.' },
    ])
    expect(r.acts.map((a) => a.celex)).toEqual(['32019L0944', '32019R0943'])
  })

  it('skips the table of contents', () => {
    expect(readUmsetzungshinweis([{ kind: 'toc', text: '§ 21a. Umsetzungshinweis' }]).windows).toEqual([])
  })

  it('names only the act „umgesetzt" governs — an act introduced by „nach der", „gemäß", „aufgrund" is a reference (bgld-c372, 05.11.2026)', () => {
    const r = readUmsetzungshinweis([
      { kind: 'abs', text: '(2) Die Landesregierung hat durch Verordnung nähere Vorschriften zu erlassen, soweit dies zur Umsetzung der Richtlinie (EU) Nr. 2016/2102 über den barrierefreien Zugang erforderlich ist. Dabei ist festzulegen, dass Inhalte den Teilen von harmonisierten Normen, deren Referenzen nach der Verordnung (EU) Nr. 1025/2012 im Amtsblatt der Europäischen Union veröffentlicht wurden, entsprechen, oder einer nach Art. 6 Abs. 4 der Richtlinie (EU) Nr. 2016/2102 festgelegten Fassung.' },
    ])
    expect(r.acts.map((a) => a.celex)).toEqual(['32016L2102'])
    expect(readUmsetzungshinweis('Mit diesem Gesetz wird die Richtlinie (EU) 2019/1152 umgesetzt. Das Verfahren aufgrund der Richtlinie (EU) 2015/1535 wurde durchgeführt.').acts.map((a) => a.celex)).toEqual(['32019L1152'])
  })

  it('keeps an enumeration after the signal whole', () => {
    const r = readUmsetzungshinweis([
      { kind: 'abs', gld: '§ 65.', text: 'Durch dieses Gesetz werden folgende Richtlinien der Europäischen Union umgesetzt:' },
      { kind: 'ziff', gld: '1.', text: 'Richtlinie 2000/43/EG zur Anwendung des Gleichbehandlungsgrundsatzes, ABl. Nr. L 180 vom 19.07.2000 S 22,' },
      { kind: 'ziff', gld: '2.', text: 'Richtlinie (EU) 2024/1499 über Standards für Gleichbehandlungsstellen, ABl. L 2024/1499, 29.5.2024.' },
    ])
    expect(r.acts.map((a) => a.celex)).toEqual(['32000L0043', '32024L1499'])
  })
})

describe('the Bund\'s quoted hint Ziffer (readBundLaw, isHintParagraph)', () => {
  // BEGUT_45BB5DFC, the AEV Verbrennungsgas, as RIS blocks it: straight quotes, the number in the text.
  const AEV: LawTextBlock[] = [
    { kind: 'novao', text: '24. § 5 werden folgende Absätze 7 und 8 angefügt:' },
    { kind: 'abs', text: '"(7) § 1 Abs. 1 Z 9 in der Fassung der Verordnung BGBl. II Nr. xxx/2023 tritt mit dem der Kundmachung folgenden Tag in Kraft."' },
    { kind: 'novao', text: '25. § 6 Abs. 2 wird folgende Z 3 angefügt' },
    { kind: 'ziff', text: '"3. Durchführungsbeschluss 2019/2010 der Kommission vom 12. November 2019 über Schlussfolgerungen zu den besten verfügbaren Techniken (BVT) gemäß der IE-RL in Bezug auf die Abfallverbrennung (Abl. Nr. L 312/55 vom 3. Dezember 2019)."' },
    { kind: 'novao', text: '26. In Anlage A wird die Wortfolge "Dioxine und Furane" ersetzt.' },
  ]

  it('reads the Ziffer a Novellierungsanordnung quotes into a §, as a window marked quoted at that instruction', () => {
    expect(readUmsetzungshinweis(AEV).acts).toEqual([])
    const r = readBundLaw(AEV)
    expect(r.acts.map((a) => a.celex)).toEqual(['32019D2010'])
    expect(r.windows[0]).toMatchObject({ start: 2, signal: 'durchfuehrung', quoted: true })
  })

  it('reads an article before the act, a Durchführungsrichtlinie, a delegated directive and a Spiegelstrich (05.11.2026)', () => {
    const quoted = (instruction: string, entry: string) => readBundLaw([{ kind: 'novao', text: instruction }, { kind: 'ziff', text: entry }]).acts.map((a) => a.celex)
    expect(quoted('5. Im § 27 wird nach der Z 77 folgende Z 78 eingefügt:', '"78. Die Richtlinie (EU) 2024/884 zur Änderung der Richtlinie 2012/19/EU, ABl. L vom 19. 03. 2024,"')).toEqual(['32024L0884'])
    expect(quoted('11. In § 24 wird folgende Z 3 angefügt:', '"3. die delegierte Richtlinie (EU) 2024/1262 der Kommission vom 13. März 2024 zur Änderung der Richtlinie 2010/63/EU."')).toEqual(['32024L1262'])
    expect(quoted('2. In § 12 wird folgende Z 8 angefügt:', '"8. Durchführungsrichtlinie (EU) 2025/145 zur Änderung der Durchführungsrichtlinie 2014/98/EU."')).toEqual(['32025L0145'])
    expect(quoted('2. In § 5 wird folgender Spiegelstrich angefügt:', '"- Richtlinie (EU) 2023/175 zur Änderung der Richtlinie 2009/32/EG, ABl. Nr. L 25 vom 27.1.2023 S. 67."')).toEqual(['32023L0175'])
  })

  it('takes „Umsetzung von Gemeinschaftsrecht" for a hint heading (EAG-VO § 27)', () => {
    expect(isHintParagraph('Umsetzung von Gemeinschaftsrecht § 27. Mit dieser Verordnung werden 3. die Entscheidung 2005/618/EG …')).toBe(true)
  })

  it('skips a quoted list that introduces itself as references', () => {
    expect(readBundLaw([
      { kind: 'novao', text: '3. § 15 lautet:' },
      { kind: 'abs', gld: '§ 15.', text: '"Soweit in dieser Verordnung auf andere Rechtsvorschriften verwiesen wird, sind diese in folgender Fassung anzuwenden:' },
      { kind: 'ziff', text: '1. Verordnung (EU) 2016/792 über harmonisierte Verbraucherpreisindizes."' },
    ]).acts).toEqual([])
  })

  it('takes a § of the law in force for a hint by its own words, not by the act titles it lists', () => {
    expect(isHintParagraph('Umsetzungshinweis § 106. Dieses Bundesgesetz dient der Umsetzung folgender Richtlinien der Europäischen Union: 1. Richtlinie 96/23/EG …')).toBe(true)
    expect(isHintParagraph('Bezugnahme auf Unionsrecht § 45. Durch dieses Bundesgesetz werden folgende Richtlinien in österreichisches Recht umgesetzt: 1. Richtlinie 2005/29/EG …')).toBe(true)
    expect(isHintParagraph('§ 1. (1) Diese Verordnung dient der Durchführung der Bestimmungen der Delegierten Verordnung (EU) 2019/2090 …')).toBe(true)
    // Börsegesetz 2018 § 190: a reference list whose items' titles say „zur Umsetzung der …".
    expect(isHintParagraph('§ 190. (5) Soweit in diesem Bundesgesetz auf Verordnungen der Europäischen Union verwiesen wird, sind diese in der nachfolgend genannten Fassung anzuwenden: 19. Verordnung (EU) 2018/1212 zur Festlegung von Mindestanforderungen zur Umsetzung der Bestimmungen der Richtlinie 2007/36/EG in Bezug auf die Identifizierung der Aktionäre, ABl. Nr. L 223 vom 04.09.2018 S. 1; 20. Verordnung (EG) Nr. 2273/2003 zur Durchführung der Richtlinie 2003/6/EG, ABl. Nr. L 336 vom 22.12.2003 S. 33.')).toBe(false)
  })
})

describe('readExplanationsEuSignal — whether only, never which act', () => {
  it('reads an implementation in the Allgemeiner Teil (NLAV, which names the base directive)', () => {
    const r = readExplanationsEuSignal([{ heading: null, text: ['Es besteht nunmehr daher das Erfordernis, die Richtlinie (EU) 2018/2001 in Bezug auf die Erweiterung der Nachhaltigkeitsanforderungen umzusetzen.'] }])
    expect(r.signal).toBe('umsetzung')
    expect(Object.keys(r)).not.toContain('acts')
  })

  it('ignores a programme\'s „Umsetzungsfrist" and a national Richtlinie', () => {
    expect(readExplanationsEuSignal([{ heading: null, text: ['Es gilt eine Umsetzungsfrist von 48 Monaten ab Gewährung der Förderung.'] }]).signal).toBeNull()
    const r = readExplanationsEuSignal([{ heading: null, text: ['Mit dem Entwurf werden die Richtlinien des Fonds bis Ende 2026 umgesetzt.'] }])
    expect(r.signal).toBeNull()
    expect(r.unanchored).toBe(1)
  })

  it('gives no signal from a negated sentence, and keeps a positive one beside it (Steiermark, 04.11.2026)', () => {
    const read = (...text: string[]) => readExplanationsEuSignal([{ heading: 'Allgemeiner Teil', text }])
    expect(read('Der Entwurf dient nicht der Durchführung oder Umsetzung von Unionsrecht.').signal).toBeNull()
    expect(read('Der Entwurf dient nicht der Durchführung oder Umsetzung des Rechts der Europäischen Union.').signal).toBeNull()
    expect(read('Mit dem Entwurf wird keine Umsetzung einer Richtlinie der Europäischen Union vorgenommen.').signal).toBeNull()
    expect(read('Die Richtlinie (EU) 2024/1499 wird mit diesem Entwurf nicht umgesetzt.').signal).toBeNull()
    expect(read('Der Entwurf dient nicht der Umsetzung von Unionsrecht. Mit § 5 wird jedoch die Richtlinie (EU) 2024/1499 umgesetzt.').signal).toBe('umsetzung')
    expect(read('Der Entwurf dient nicht der Umsetzung von Unionsrecht.', 'Diese Novelle dient der Umsetzung der Richtlinie (EU) 2023/1791.').signal).toBe('umsetzung')
    // The negated sentence's „Unionsrecht" anchors nothing beside it.
    expect(readExplanationsEuSignal([{ heading: null, text: ['Der Entwurf dient nicht der Umsetzung von Unionsrecht. Mit dem Entwurf werden die Richtlinien des Fonds umgesetzt.'] }]).signal).toBeNull()
    // „nicht nur" is a yes.
    expect(read('Der Entwurf dient nicht nur der Umsetzung der Richtlinie (EU) 2023/1791, sondern auch der Verwaltungsvereinfachung.').signal).toBe('umsetzung')
  })
})

describe('the Cellar', () => {
  it('puts only a validated CELEX into a query', () => {
    expect(transpositionQuery('32024L1069')).toContain('<http://publications.europa.eu/resource/celex/32024L1069>')
    expect(transpositionUrl('32024L1069')).toMatch(/^https:\/\/publications\.europa\.eu\/webapi\/rdf\/sparql\?query=/)
    // A Rahmenbeschluss is an act of the Cellar too (05.11.2026).
    expect(CELEX_RE.test('32009F0315')).toBe(true)
    expect(transpositionQuery('32009F0315')).toContain('/celex/32009F0315>')
    for (const bad of ['32024L1069> . ?x ?y ?z', '32024X0584', '2024L1069', '32024L106', '']) {
      expect(CELEX_RE.test(bad), bad).toBe(false)
      expect(() => transpositionQuery(bad), bad).toThrow()
    }
  })

  it('reads several transposition dates, sorted, and takes the latest as the deadline (2024/1275)', () => {
    const r = parseTranspositionAnswer(cellar('32024L1275'))
    expect(r).toEqual({ found: true, dates: ['2025-01-01', '2026-05-29'], adopted: null, inForce: null, title: null })
    expect(deadlineOf(r.dates)).toEqual({ deadline: '2026-05-29', otherDates: ['2025-01-01'] })
  })

  it('reads the adoption and entry-into-force days beside the deadlines, once each across the multiplied rows', () => {
    const answer = { results: { bindings: [
      { d: { value: '2025-01-01' }, adopted: { value: '2024-04-24' }, inforce: { value: '2024-05-28' } },
      { d: { value: '2026-05-29' }, adopted: { value: '2024-04-24' }, inforce: { value: '2024-05-28' } },
    ] } }
    expect(parseTranspositionAnswer(answer)).toEqual({ found: true, dates: ['2025-01-01', '2026-05-29'], adopted: '2024-04-24', inForce: '2024-05-28', title: null })
    expect(parseTranspositionAnswer({ results: { bindings: [{ adopted: { value: '2022-05-30' } }] } })).toEqual({ found: true, dates: [], adopted: '2022-05-30', inForce: null, title: null })
    expect(transpositionQuery('32024L1069')).toContain('cdm:work_date_document ?adopted')
  })

  it('asks for the German expression\'s full title, and reads the first one there is, trimmed', () => {
    const q = transpositionQuery('32024L1069')
    expect(q).toContain('SELECT ?d ?adopted ?inforce ?title WHERE')
    expect(q).toContain('?e cdm:expression_belongs_to_work ?w')
    expect(q).toContain('?e cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/DEU>')
    expect(q).toContain('?e cdm:expression_title ?title')
    expect(q).not.toContain('expression_title_short')
    const title = 'Richtlinie (EU) 2024/1069 des Europäischen Parlaments und des Rates vom 11. April 2024 über den Schutz von Personen, die sich öffentlich beteiligen, vor offensichtlich unbegründeten Klagen oder missbräuchlichen Gerichtsverfahren („strategische Klagen gegen öffentliche Beteiligung")'
    const answer = { results: { bindings: [
      { d: { value: '2026-05-07' }, adopted: { value: '2024-04-11' }, title: { value: '  ' } },
      { d: { value: '2026-05-07' }, adopted: { value: '2024-04-11' }, title: { value: ` ${title}\n` } },
    ] } }
    expect(parseTranspositionAnswer(answer)).toEqual({ found: true, dates: ['2026-05-07'], adopted: '2024-04-11', inForce: null, title })
  })

  it('tells a regulation without a date from an act EUR-Lex does not know', () => {
    expect(parseTranspositionAnswer(cellar('32022R0869'))).toEqual({ found: true, dates: [], adopted: null, inForce: null, title: null })
    // „Verordnung (EU) 2022/689" — a citation error in a draft, meant 2022/869.
    expect(parseTranspositionAnswer(cellar('32022R0689'))).toEqual({ found: false, dates: [], adopted: null, inForce: null, title: null })
    expect(deadlineOf([])).toBeNull()
  })

  it('deduplicates, and refuses a malformed answer rather than reading it as „no date"', () => {
    const dup = { results: { bindings: [{ d: { value: '2026-05-29' } }, { d: { value: '2025-01-01' } }, { d: { value: '2026-05-29' } }] } }
    expect(parseTranspositionAnswer(dup).dates).toEqual(['2025-01-01', '2026-05-29'])
    expect(() => parseTranspositionAnswer({} as SparqlAnswer)).toThrow()
  })
})

describe('decideEuMarker', () => {
  const noLaw = { signal: null, acts: [] }

  it('takes the Vorblatt\'s class where one Vorblatt or several agree', () => {
    expect(decideEuMarker({ vorblatt: ['umsetzung'], law: noLaw, explanations: null })).toMatchObject({ marker: 'umsetzung', source: 'vorblatt' })
    expect(decideEuMarker({ vorblatt: ['umsetzung', 'frei-umsetzung'], law: noLaw, explanations: null }).marker).toBe('umsetzung')
    expect(decideEuMarker({ vorblatt: ['flankierend-vo'], law: noLaw, explanations: null }).marker).toBe('flankierend-vo')
    expect(decideEuMarker({ vorblatt: ['ueber-umsetzung'], law: noLaw, explanations: null }).marker).toBe('ueber-umsetzung')
  })

  it('puts nothing on the page for the no-classes and for „only mandatory measures"', () => {
    for (const cls of ['nicht-eu', 'eu-keine-umsetzung', 'nur-zwingend', 'frei-nein', 'freitext'] as const) {
      expect(decideEuMarker({ vorblatt: [cls], law: noLaw, explanations: 'umsetzung' }).marker, cls).toBeNull()
    }
  })

  it('lets the Vorblatt overrule a law-text hint (MTD-Gesetz: cumulative hint, Vorblatt says no)', () => {
    const acts = parseEuActCitations('Richtlinie 2005/36/EG')
    expect(decideEuMarker({ vorblatt: ['nicht-eu'], law: { signal: 'umsetzung', acts }, explanations: null }).marker).toBeNull()
  })

  it('shows nothing for contradicting Vorblätter unless the law text names an act (135/ME)', () => {
    expect(decideEuMarker({ vorblatt: ['eu-keine-umsetzung', 'umsetzung'], law: noLaw, explanations: null })).toEqual({ marker: null, source: null, contradicting: true })
    const acts = parseEuActCitations('Richtlinie (EU) 2024/1069')
    expect(decideEuMarker({ vorblatt: ['eu-keine-umsetzung', 'umsetzung'], law: { signal: 'umsetzung', acts }, explanations: null })).toEqual({ marker: 'umsetzung', source: 'gesetzestext', contradicting: true })
    const vo = parseEuActCitations('Verordnung (EU) 2023/1114')
    expect(decideEuMarker({ vorblatt: ['nicht-eu', 'flankierend-vo'], law: { signal: 'durchfuehrung', acts: vo }, explanations: null }).marker).toBe('flankierend-vo')
  })

  it('asks the Erläuterungen only where no Vorblatt can be read', () => {
    expect(decideEuMarker({ vorblatt: [], law: noLaw, explanations: 'umsetzung' })).toMatchObject({ marker: 'umsetzung', source: 'erlaeuterungen' })
    expect(decideEuMarker({ vorblatt: [], law: noLaw, explanations: null }).marker).toBeNull()
  })

  it('lets the law text\'s hint decide before the prose where no Vorblatt speaks and it names an act (t-2026-588)', () => {
    const vo = parseEuActCitations('Verordnung (EU) 2024/1028')
    expect(decideEuMarker({ vorblatt: [], law: { signal: 'durchfuehrung', acts: vo }, explanations: 'umsetzung' })).toEqual({ marker: 'flankierend-vo', source: 'gesetzestext', contradicting: false })
    const rl = parseEuActCitations('Richtlinie (EU) 2024/1069')
    expect(decideEuMarker({ vorblatt: [], law: { signal: 'umsetzung', acts: rl }, explanations: null })).toEqual({ marker: 'umsetzung', source: 'gesetzestext', contradicting: false })
  })

  it('leaves the decision to the prose where the hint names no act, or only refers', () => {
    const rl = parseEuActCitations('Richtlinie (EU) 2019/1937')
    expect(decideEuMarker({ vorblatt: [], law: { signal: 'umsetzung', acts: [] }, explanations: 'durchfuehrung' })).toMatchObject({ marker: 'flankierend-vo', source: 'erlaeuterungen' })
    expect(decideEuMarker({ vorblatt: [], law: { signal: 'bezug', acts: rl }, explanations: null }).marker).toBeNull()
  })
})

describe('a window whose acts are all bases of an unnamed amending act decides nothing', () => {
  it('reads the 28/ME window as umsetzung, with no act of its own to decide on', () => {
    const r = readUmsetzungshinweis('(119) Durch das Bundesgesetz BGBl. I Nr. xxx/xxxx wird die Richtlinie zur Änderung der Richtlinie 2009/138/EG betreffend die Aufnahme (Solvabilität II), der Richtlinie 2014/65/EU über Märkte für Finanzinstrumente, ABl. Nr. L 334 vom 27.12.2019 S. 155 umgesetzt.')
    expect(r.signal).toBe('umsetzung')
    expect(r.windows[0]!.base).toEqual(['32009L0138', '32014L0065'])
    expect(r.actSignal).toBeNull()
    expect(lawTextMarker(newLawHint(r.windows))).toBeNull()
    expect(lawTextMarker(newLawHint(r.windows, () => true))).toBeNull()
  })
})

describe('newLawHint — a restated hint decides nothing (rule D4 before the decision)', () => {
  // Tirol's t-v9cd2d26…: the Richtlinie restated, the Verordnung new.
  const windows = [
    { signal: 'umsetzung' as const, acts: parseEuActCitations('Durch diese Verordnung wird die Richtlinie (EU) 2018/2001 umgesetzt.') },
    { signal: 'durchfuehrung' as const, acts: parseEuActCitations('begleitende Maßnahmen zur Durchführung der Verordnung (EU) 2024/1309') },
    { signal: 'umsetzung' as const, acts: [] },
  ]

  it('reads every window that names an act where the law in force was not asked', () => {
    expect(newLawHint(windows)).toEqual({ signal: 'umsetzung', acts: [...windows[0]!.acts, ...windows[1]!.acts] })
  })

  it('reads only windows with an act new to the law in force — unknown counts as new', () => {
    const isNew = (celex: string) => (celex === '32018L2001' ? false : true)
    expect(lawTextMarker(newLawHint(windows, isNew))).toBe('flankierend-vo')
    expect(lawTextMarker(newLawHint(windows, () => null))).toBe('umsetzung')
    expect(lawTextMarker(newLawHint(windows, () => false))).toBeNull()
  })
})

describe('combineVerdicts — is the act new to the draft (rule D4)', () => {
  it('is new where any law of the draft gains it, old where every readable one names it, unknown otherwise', () => {
    expect(combineVerdicts(undefined, false)).toBe(false)
    expect(combineVerdicts(false, true)).toBe(true)
    expect(combineVerdicts(null, true)).toBe(true)
    expect(combineVerdicts(null, false)).toBe(false)
    expect(combineVerdicts(undefined, null)).toBeNull()
  })
})

describe('euActSubject', () => {
  it('keeps what the title says after the name and date, the first word lower case', () => {
    expect(euActSubject('Richtlinie (EU) 2024/1069 des Europäischen Parlaments und des Rates vom 11. April 2024 über den Schutz von Personen, die sich öffentlich beteiligen, vor offensichtlich unbegründeten Klagen oder missbräuchlichen Gerichtsverfahren („strategische Klagen gegen öffentliche Beteiligung")'))
      .toBe('über den Schutz von Personen, die sich öffentlich beteiligen, vor offensichtlich unbegründeten Klagen oder missbräuchlichen Gerichtsverfahren („strategische Klagen gegen öffentliche Beteiligung")')
    expect(euActSubject('Verordnung (EU) 2022/2554 des Rates vom 14. Dezember 2022 zur Gewährleistung einer hohen Betriebsstabilität'))
      .toBe('zur Gewährleistung einer hohen Betriebsstabilität')
    expect(euActSubject('Richtlinie (EU) 2023/2225 des Europäischen Parlaments und des Rates vom 1. März 2023 zur Änderung der Richtlinie 2008/48/EG'))
      .toBe('zur Änderung der Richtlinie 2008/48/EG')
  })

  it('matches the no-break space EUR-Lex writes in the date, and keeps those inside the subject', () => {
    expect(euActSubject('Verordnung (EU) 2023/2631 des Europäischen Parlaments und des Rates vom 22.\u00a0November 2023 zur Änderung der Verordnung (EU) Nr.\u00a0909/2014 (Text von Bedeutung für den EWR)'))
      .toBe('zur Änderung der Verordnung (EU) Nr.\u00a0909/2014')
  })

  it('drops the EEA note, with or without its parentheses', () => {
    const gdpr = euActSubject('Verordnung (EU) 2016/679 des Europäischen Parlaments und des Rates vom 27. April 2016 zum Schutz natürlicher Personen bei der Verarbeitung personenbezogener Daten, zum freien Datenverkehr und zur Aufhebung der Richtlinie 95/46/EG (Datenschutz-Grundverordnung) (Text von Bedeutung für den EWR)')
    expect(gdpr).toBe('zum Schutz natürlicher Personen bei der Verarbeitung personenbezogener Daten, zum freien Datenverkehr und zur Aufhebung der Richtlinie 95/46/EG (Datenschutz-Grundverordnung)')
    expect(euActSubject('Richtlinie (EU) 2024/1 vom 2. Jänner 2024 über etwas Text von Bedeutung für den EWR ')).toBe('über etwas')
    // The note with a period inside the parentheses, and with a space before the closing one — both occur.
    expect(euActSubject('Verordnung (EU) 2018/1999 des Europäischen parlaments und des Rates vom 11. Dezember 2018 über das Governance-System (Text von Bedeutung für den EWR.)')).toBe('über das Governance-System')
    expect(euActSubject('Verordnung (EU) 2024/1 vom 1. März 2024 über etwas (Text von Bedeutung für den EWR. )')).toBe('über etwas')
  })

  it('gives the whole title where no date stands, and null for none', () => {
    expect(euActSubject('Beschluss über die Annahme eines Protokolls (Text von Bedeutung für den EWR)')).toBe('Beschluss über die Annahme eines Protokolls')
    expect(euActSubject(null)).toBeNull()
    expect(euActSubject('')).toBeNull()
    expect(euActSubject('(Text von Bedeutung für den EWR)')).toBeNull()
  })
})
