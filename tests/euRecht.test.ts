import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { baseActCelexes, celexOf, eliOf, parseEuActCitations, readEuActCitations } from '../server/utils/eu/actCitations'
import { classifyVorblatt, classifyVorblattSentence, hasTextLayer, isVorblattDocument } from '../server/utils/eu/vorblatt'
import { readExplanationsEuSignal, readUmsetzungshinweis, type LawTextBlock } from '../server/utils/eu/umsetzungshinweis'
import { CELEX_RE, deadlineOf, parseTranspositionAnswer, transpositionQuery, transpositionUrl, type SparqlAnswer } from '../server/utils/eu/cellar'
import { combineVerdicts, decideEuMarker } from '../server/utils/eu/euMarker'

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

  it('does not resolve a short name, nor a directive cited without its organisation (AEV)', () => {
    const r = readUmsetzungshinweis(law['AEV, short name and amending directive']!)
    expect(r.signal).toBe('umsetzung')
    // „geändert durch die Richtlinie 2024/1785" and „Durchführungsbeschluss
    // 2023/2749" carry no (EU) and no suffix: a known gap of v1, kept visible.
    expect(r.acts.map((a) => a.celex)).toEqual(['32010L0075'])
  })

  it('reads plain text, one Absatz per line, and drops a national „Richtlinie"', () => {
    expect(readUmsetzungshinweis('§ 5. Mit dieser Verordnung wird die Richtlinie (EU) 2025/872 umgesetzt.').acts.map((a) => a.celex)).toEqual(['32025L0872'])
    const national = readUmsetzungshinweis('Mit dieser Verordnung werden die Richtlinien zur Erstellung dieser Maßnahmenpakete umgesetzt.')
    expect(national.signal).toBeNull()
    expect(national.dropped).toHaveLength(1)
  })

  it('skips the table of contents', () => {
    expect(readUmsetzungshinweis([{ kind: 'toc', text: '§ 21a. Umsetzungshinweis' }]).windows).toEqual([])
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
    for (const bad of ['32024L1069> . ?x ?y ?z', '32024F0584', '2024L1069', '32024L106', '']) {
      expect(CELEX_RE.test(bad), bad).toBe(false)
      expect(() => transpositionQuery(bad), bad).toThrow()
    }
  })

  it('reads several transposition dates, sorted, and takes the latest as the deadline (2024/1275)', () => {
    const r = parseTranspositionAnswer(cellar('32024L1275'))
    expect(r).toEqual({ found: true, dates: ['2025-01-01', '2026-05-29'], adopted: null, inForce: null })
    expect(deadlineOf(r.dates)).toEqual({ deadline: '2026-05-29', otherDates: ['2025-01-01'] })
  })

  it('reads the adoption and entry-into-force days beside the deadlines, once each across the multiplied rows', () => {
    const answer = { results: { bindings: [
      { d: { value: '2025-01-01' }, adopted: { value: '2024-04-24' }, inforce: { value: '2024-05-28' } },
      { d: { value: '2026-05-29' }, adopted: { value: '2024-04-24' }, inforce: { value: '2024-05-28' } },
    ] } }
    expect(parseTranspositionAnswer(answer)).toEqual({ found: true, dates: ['2025-01-01', '2026-05-29'], adopted: '2024-04-24', inForce: '2024-05-28' })
    expect(parseTranspositionAnswer({ results: { bindings: [{ adopted: { value: '2022-05-30' } }] } })).toEqual({ found: true, dates: [], adopted: '2022-05-30', inForce: null })
    expect(transpositionQuery('32024L1069')).toContain('cdm:work_date_document ?adopted')
  })

  it('tells a regulation without a date from an act EUR-Lex does not know', () => {
    expect(parseTranspositionAnswer(cellar('32022R0869'))).toEqual({ found: true, dates: [], adopted: null, inForce: null })
    // „Verordnung (EU) 2022/689" — a citation error in a draft, meant 2022/869.
    expect(parseTranspositionAnswer(cellar('32022R0689'))).toEqual({ found: false, dates: [], adopted: null, inForce: null })
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
