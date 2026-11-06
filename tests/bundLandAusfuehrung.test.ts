import { describe, expect, it } from 'vitest'
import {
  ausfuehrungDocumentsOf,
  grundsatzActOf,
  nominativeName,
  readAusfuehrung,
  readAusfuehrungAll,
  ausfuehrungSentences,
  vereinbarungActOf,
  type AusfuehrungDocument,
} from '../server/utils/bund-land/ausfuehrung'

/** A draft PDF of one page. */
const pdf = (text: string): AusfuehrungDocument => ({ pages: [text], explanations: null })
/** Erläuterungen with one general passage. */
const erl = (text: string): AusfuehrungDocument => ({ pages: null, explanations: { general: [{ heading: null, text: [text] }], particular: [] } })

// Excerpts from the Länder corpus of GP XXVIII (§12.66 Nachtrag 10), shortened.

describe('Grundsatzgesetz: the enacting clause (strong)', () => {
  it('reads Steiermark\'s clause with the amending Kundmachung as the act (stmk-bf3fc21b)', () => {
    const [a] = readAusfuehrung([pdf('Gesetz vom …, mit dem das Steiermärkische Kinderbildungs- und -betreuungsgesetz geändert wird Der Landtag Steiermark hat in Ausführung des Anstellungserfordernisse-Grundsatzgesetzes, BGBl. Nr. 406/1968, in der Fassung BGBl. I Nr. 44/2025, beschlossen: Artikel 1')])
    expect(a).toMatchObject({ kind: 'grundsatzgesetz', strength: 'strong', document: 0, inExplanations: false, act: { name: 'Anstellungserfordernisse-Grundsatzgesetz', bgbl: { number: 44, year: 2025 }, partial: false } })
  })

  it('marks „teilweise" as partial and takes the latest citation (stmk-205a2d0d)', () => {
    const [a] = readAusfuehrung([pdf('Der Landtag Steiermark hat – teilweise in Ausführung des Sozialhilfe-Grundsatzgesetzes, BGBl. I Nr. 41/2019, zuletzt in der Fassung BGBl. I Nr. 25/2025 – beschlossen: Artikel 1')])
    expect(a?.act).toEqual({ name: 'Sozialhilfe-Grundsatzgesetz', bgbl: { number: 25, year: 2025 }, partial: true })
  })

  it('reads the act of the first law in a list, by its segment (ktn-23491)', () => {
    const [a] = readAusfuehrung([pdf('Der Landtag von Kärnten hat – teilweise in Ausführung der Grundsatzbestimmungen des Bundesgesetzes über Krankenanstalten und Kuranstalten - KAKuG, BGBl. Nr. 1/1957, in der Fassung des Bundesgesetzes BGBl. I Nr. 24/2024, des Zahnärztegesetzes - ZÄG, BGBl. I Nr. 126/2005, in der Fassung des Bundesgesetzes BGBl. I Nr. 201/2022 – beschlossen:')])
    expect(a?.act).toEqual({ name: 'Krankenanstalten- und Kuranstaltengesetz', bgbl: { number: 24, year: 2024 }, partial: true })
  })

  it('does not read an enacting clause in the Erläuterungen', () => {
    const all = readAusfuehrungAll([erl('Der Landtag Steiermark hat in Ausführung des Schulorganisationsgesetzes, BGBl. Nr. 242/1962, in der Fassung BGBl. I Nr. 2/2026, beschlossen:')])
    expect(all.find((a) => a.strength === 'strong')).toBeUndefined()
  })
})

describe('Grundsatzgesetz: a sentence (medium)', () => {
  it('reads „Umsetzung der grundsatzgesetzlichen Bestimmungen" close together (ooe-2024-16082)', () => {
    const [a] = readAusfuehrung([erl('Die Novelle des Oö. Krankenanstaltengesetzes dient im Wesentlichen der Umsetzung der grundsatzgesetzlichen Bestimmungen des Bundesgesetzes über Krankenanstalten und Kuranstalten (KAKuG), welche im Rahmen des VUG 2024 geändert wurden.')])
    expect(a).toMatchObject({ kind: 'grundsatzgesetz', strength: 'medium', act: { name: 'Krankenanstalten- und Kuranstaltengesetz', bgbl: null } })
  })

  it('reads change, execution and act around a Grundsatz term (ooe-2025-16109), the line break\'s hyphen closed', () => {
    const [a] = readAusfuehrung([erl('Durch das Bundesgesetz, mit dem das Schulunterrichtsgesetz, das Anstellungserfordernisse- Grundsatzgesetz und das Hochschulgesetz 2005 geändert werden, BGBl. I Nr. 44/2025, wurden die fachlichen Anstellungserfordernisse für Elementarpädagoginnen erweitert. Diese Änderungen sind landesgesetzlich umzusetzen.')])
    expect(a?.act).toEqual({ name: 'Anstellungserfordernisse-Grundsatzgesetz', bgbl: { number: 44, year: 2025 }, partial: false })
  })

  it('takes the citation before the name where the sentence leads with it (ktn-23057)', () => {
    const [a] = readAusfuehrung([erl('Im Zuge der mit BGBl. I Nr. 2/2026 bewirkten Novelle des Schulorganisationsgesetzes wurden unter anderem die grundsatzgesetzlichen Rahmenbedingungen für die Durchführung der Deutschförderklassen geändert.')])
    expect(a?.act).toMatchObject({ name: 'Schulorganisationsgesetz', bgbl: { number: 2, year: 2026 } })
  })

  it('names the law the citation belongs to, not the one that amended it (bgld-eec72)', () => {
    expect(grundsatzActOf('Großteils erfolgt dies in Ausführung der Grundsatzbestimmungen des mit dem Vereinbarungsumsetzungsgesetz 2024 novellierten Kranken- und Kuranstaltengesetz - KAKuG, BGBl. Nr. 1/1957, in der Fassung des Bundesgesetzes BGBl. I Nr. 24/2024.'))
      .toEqual({ name: 'Krankenanstalten- und Kuranstaltengesetz', bgbl: { number: 24, year: 2024 } })
  })
})

describe('Grundsatzgesetz: exclusions', () => {
  it('reads no competence statement without a citation (w-2026006)', () => {
    expect(readAusfuehrungAll([erl('Die Zuständigkeit ergibt sich aus Art. 14 Abs. 3 lit. a B-VG; die Angelegenheit ist Bundessache in der Grundsatzgesetzgebung, die Änderung setzt die Ausführungsgesetzgebung um.')])).toEqual([])
  })

  it('reads no repeal or past (sbg-34683)', () => {
    expect(readAusfuehrungAll([erl('Als Folge des Entfalles der Bundeskompetenz für die Grundsatzgesetzgebung im Bereich der Bodenreform mit BGBl Nr 14/2019 erscheint die Aufrechterhaltung dieser Bestimmung nicht mehr geboten.')])).toEqual([])
  })

  it('reads no pending Bund draft', () => {
    expect(readAusfuehrungAll([erl('Der Begutachtungsentwurf des Bundes zur Änderung des Sozialhilfe-Grundsatzgesetzes sieht eine Umsetzung bis 2027 vor.')])).toEqual([])
  })

  it('takes no act from a bare citation outside the signal sentence (50/2025 in a reference list)', () => {
    const [a] = readAusfuehrung([
      pdf('§ 20 Verweisungen Verweisungen auf Bundesgesetze beziehen sich auf: 1. Informationsfreiheits-Anpassungsgesetz, BGBl. I Nr. 50/2025; 2. Schulpflichtgesetz 1985, BGBl. Nr. 76/1985.'),
      erl('Die Novelle des Oö. Krankenanstaltengesetzes dient im Wesentlichen der Umsetzung der grundsatzgesetzlichen Bestimmungen des Bundesgesetzes über Krankenanstalten und Kuranstalten (KAKuG).'),
    ])
    expect(a?.act.bgbl).toBeNull()
  })

  it('reads nothing from a reference list alone', () => {
    expect(readAusfuehrungAll([pdf('Verweisungen auf Bundesgesetze beziehen sich auf: 1. Informationsfreiheits-Anpassungsgesetz, BGBl. I Nr. 50/2025; 2. Datenschutzgesetz, BGBl. I Nr. 165/1999.')])).toEqual([])
  })
})

describe('Vereinbarung gemäß Art. 15a B-VG', () => {
  it('reads § 1 of the draft (stmk-65568995) with the agreement\'s subject and BGBl', () => {
    const [a] = readAusfuehrung([pdf('1. Abschnitt Allgemeine Bestimmungen § 1 Ziele (1) Mit diesem Landesgesetz werden die das Land treffenden Verpflichtungen aus der Vereinbarung gemäß Art. 15a B-VG über die Etablierung einer gebietskörperschaftenübergreifenden Transparenzdatenbank, BGBl. I Nr. 138/2024, umgesetzt.')])
    expect(a).toMatchObject({ kind: 'vereinbarung', strength: 'strong', act: { name: 'über die Etablierung einer gebietskörperschaftenübergreifenden Transparenzdatenbank', bgbl: { number: 138, year: 2024 } } })
  })

  it('reads „Erfüllung der (geänderten) Vereinbarung" (sbg-31782)', () => {
    const [a] = readAusfuehrung([erl('Der Gesetzesvorschlag dient in erster Linie der Erfüllung der (geänderten) Vereinbarung gemäß Art 15a B-VG zwischen dem Bund und den Ländern über Sozialbetreuungsberufe (kundgemacht im Landesgesetzblatt am 23. Jänner 2025, LGBl Nr 10/2025).')])
    expect(a).toMatchObject({ kind: 'vereinbarung', strength: 'strong', act: { name: 'über Sozialbetreuungsberufe', bgbl: null } })
  })

  it('reads „Anpassung an den Wortlaut der Vereinbarung" (bgld-cb2e)', () => {
    expect(readAusfuehrung([erl('Es erfolgt eine Anpassung an den Wortlaut der Vereinbarung gemäß Art. 15a B-VG zwischen dem Bund und den Ländern über Sozialbetreuungsberufe.')])[0]?.strength).toBe('strong')
  })

  it('reads Steiermark\'s fixed line on the Volksabstimmung (stmk-5958e4f6)', () => {
    expect(readAusfuehrung([erl('Besonderheiten des Normerzeugungsverfahrens Gesetzesbeschluss unterliegt gemäß Art. 72 Abs. 2 L-VG nicht einer Volksabstimmung wegen Umsetzung einer Vereinbarung gemäß Art. 15a B-VG.')])[0]).toMatchObject({ kind: 'vereinbarung', strength: 'strong', act: { name: null } })
  })

  it('reads „Zielsteuerung-Gesundheit" as the subject', () => {
    expect(vereinbarungActOf('Ausführung der mit den Vereinbarungen gemäß Art. 15a B-VG Zielsteuerung-Gesundheit sowie Organisation und Finanzierung des Gesundheitswesens vorgegebenen legistischen Maßnahmen.').name).toBe('Zielsteuerung-Gesundheit')
  })

  it('reads no definition, no funds, no negotiation', () => {
    expect(readAusfuehrungAll([erl('Die Begriffsbestimmung in § 2 Z 3 entspricht der Vereinbarung gemäß Art. 15a B-VG über die Elementarpädagogik.')])).toEqual([])
    expect(readAusfuehrungAll([erl('Der Zweckzuschuss des Bundes nach der Vereinbarung gemäß Art. 15a B-VG über die Elementarpädagogik wird für den Ausbau verwendet.')])).toEqual([])
    expect(readAusfuehrungAll([erl('Die Verhandlungen über eine neue Vereinbarung gemäß Art. 15a B-VG werden umgesetzt, sobald sie abgeschlossen sind.')])).toEqual([])
  })

  it('finds a medium agreement but does not show it (bgld-f43b)', () => {
    const docs = [pdf('(1) Die Kostenhöchstsätze für die Erfüllung der Aufgaben nach § 6 richten sich nach der Vereinbarung zwischen dem Bund und den Ländern gemäß Art. 15a B-VG über gemeinsame Maßnahmen zur vorübergehenden Grundversorgung, die entsprechend anzuwenden ist.')]
    expect(readAusfuehrungAll(docs)).toMatchObject([{ kind: 'vereinbarung', strength: 'medium' }])
    expect(readAusfuehrung(docs)).toEqual([])
  })
})

describe('both kinds on one draft (sbg-34196)', () => {
  it('reports a Grundsatzgesetz and an agreement from one sentence', () => {
    const got = readAusfuehrung([erl('1.4. Folgende Änderungen werden zur Anpassung an Grundsatzgesetzgebung des Bundes und Art 15a - Vereinbarungen vorgesehen: Erweiterung der anerkannten Ausbildungsabschlüsse für den Einsatz als pädagogische Fachkraft.')])
    expect(got.map((a) => a.kind)).toEqual(['grundsatzgesetz', 'vereinbarung'])
  })
})

describe('helpers', () => {
  it('protects abbreviation stops and splits before a capital', () => {
    expect(ausfuehrungSentences('Gemäß Art. 15a B-VG gilt dies. Der Landtag hat beschlossen: § 1 lautet')).toEqual(['Gemäß Art. 15a B-VG gilt dies.', 'Der Landtag hat beschlossen:', '§ 1 lautet'])
  })

  it('puts a name in the nominative', () => {
    expect(nominativeName('AnstellungserfordernisseGrundsatzgesetzes')).toBe('Anstellungserfordernisse-Grundsatzgesetz')
    expect(nominativeName('Sozialhilfe-Grundsatzgesetz-Novelle')).toBe('Sozialhilfe-Grundsatzgesetz')
    expect(nominativeName('Schulorganisationsgesetzes')).toBe('Schulorganisationsgesetz')
    expect(nominativeName('ElWOG 2010')).toBe('Elektrizitätswirtschafts- und -organisationsgesetz 2010')
  })

  it('takes the EU fact\'s input in the draft\'s order, the Erläuterungen on their own document', () => {
    const docs = ausfuehrungDocumentsOf({
      land: 'sbg',
      documents: [{ title: 'Entwurf', url: 'a' }, { title: 'Erläuterungen', url: 'b' }, { title: 'Anlage', url: 'c' }],
      pages: new Map([['b', ['Erl']]]),
      explanations: { available: true, general: [{ heading: 'I', text: ['x'] }], particular: [], url: 'b' },
      draft: { url: 'a', pages: ['Text'] },
    })
    expect(docs).toEqual([
      { url: 'a', title: 'Entwurf', pages: ['Text'], explanations: null },
      { url: 'b', title: 'Erläuterungen', pages: ['Erl'], explanations: { general: [{ heading: 'I', text: ['x'] }], particular: [] } },
    ])
  })
})

describe('an agreement\'s subject ends before a participle', () => {
  it('reads „über die Kinder- und Jugendhilfe" (bgld-5bc8)', () => {
    expect(vereinbarungActOf('Die der Kundmachung betreffend die Vereinbarung gemäß Art. 15a B-VG über die Kinder- und Jugendhilfe geschuldeten landesrechtlichen Bestimmungen werden umgesetzt.').name).toBe('über die Kinder- und Jugendhilfe')
  })
})
