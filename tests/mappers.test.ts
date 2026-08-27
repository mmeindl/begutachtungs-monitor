import { describe, expect, it } from 'vitest'
import {
  absolutizeUrl,
  decodeEntities,
  extractBgblLink,
  extractLinks,
  findLastRvLink,
  intToRoman,
  mapConsultationRow,
  mapDocuments,
  mapInvitedBy,
  mapStatementRow,
  mapTextEvolution,
  normalizeOrgName,
  parseFristsort,
  parseGermanDate,
  parseShortinfo,
  parseStages,
  romanToInt,
  stripHtmlToText,
} from '../server/utils/mappers'

// Real list-81 row (sample from 2026-08-15, 133/ME XXVIII)
const LIST81_ROW = [
  'XXVIII', 'ME', 133, '03.08.2026', 'IFI Beitragsgesetz 2026', '133/ME', 'BMF',
  '/gegenstand/XXVIII/ME/133', '24.08.2026', 'MEG', '2026-08-03T00:00:00', 'J',
  0, 1, '20260824', '0000000133', 'Bundesministerium für Finanzen', 36188157,
]

// Real list-142 row (sample from 2026-08-15, 237/SN-126/ME)
const LIST142_PERSON_ROW = [
  'XXVIII', 'SNME', 4983, null, '07.07.2026', '2026-07-07T12:00:00',
  '<a href="/gegenstand/XXVIII/SNME/4983/" target="_blank">Dimitriadis, Ioannis (237/SN-126/ME)</a>',
  'XXVIII', '126', 'ME', '00000020260707', '20260707000000', 0,
  'Art:\nStellungnahme zu Ministerialentwurf\n<br />\nKürzel:\nSNME\n<br />\n',
  null, '237/SN-126/ME', '126/ME', '<a href="/gegenstand/XXVIII/SNME/4983?x=1">Link</a>',
  '/gegenstand/XXVIII/ME/126', 'P', 34842785, 237, '1',
]

describe('decodeEntities', () => {
  it('decodes normal numeric and named references', () => {
    expect(decodeEntities('&#65;&#x42;&amp;')).toBe('AB&')
  })

  it('never throws on out-of-range code points (fromCodePoint RangeError)', () => {
    expect(decodeEntities('a&#x110000;b')).toBe('ab')
    expect(decodeEntities('a&#99999999;b')).toBe('ab')
  })

  it('drops control characters and surrogates instead of synthesizing them', () => {
    expect(decodeEntities('a&#8;b')).toBe('ab')
    expect(decodeEntities('a&#xD800;b')).toBe('ab')
    expect(decodeEntities('a&#10;b')).toBe('a\nb')
  })
})

describe('parseFristsort', () => {
  it('parses yyyymmdd as number and string', () => {
    expect(parseFristsort(20260824)).toBe('2026-08-24')
    expect(parseFristsort('20260824')).toBe('2026-08-24')
  })

  it('empty/null/undefined → null', () => {
    expect(parseFristsort('')).toBeNull()
    expect(parseFristsort('   ')).toBeNull()
    expect(parseFristsort(null)).toBeNull()
    expect(parseFristsort(undefined)).toBeNull()
  })

  it('invalid values → null', () => {
    expect(parseFristsort(0)).toBeNull()
    expect(parseFristsort('abc')).toBeNull()
    expect(parseFristsort(20261301)).toBeNull() // month 13
    expect(parseFristsort(20260832)).toBeNull() // day 32
    expect(parseFristsort(2026)).toBeNull() // too short
    expect(parseFristsort('24.08.2026')).toBeNull() // display format
  })
})

describe('parseGermanDate', () => {
  it('dd.mm.yyyy → ISO', () => {
    expect(parseGermanDate('03.08.2026')).toBe('2026-08-03')
  })
  it('invalid → null', () => {
    expect(parseGermanDate('2026-08-03')).toBeNull()
    expect(parseGermanDate('99.99.2026')).toBeNull()
    expect(parseGermanDate(null)).toBeNull()
  })
})

describe('mapConsultationRow', () => {
  it('maps a real list-81 row completely', () => {
    expect(mapConsultationRow(LIST81_ROW)).toEqual({
      gp: 'XXVIII',
      inr: 133,
      citation: '133/ME',
      title: 'IFI Beitragsgesetz 2026',
      ministryCode: 'BMF',
      ministryName: 'Bundesministerium für Finanzen',
      arrivedAt: '2026-08-03',
      deadline: '2026-08-24',
      active: true,
      statementCount: 1,
      parliamentUrl: 'https://www.parlament.gv.at/gegenstand/XXVIII/ME/133',
    })
  })

  it('AKTIV "N" → active false, empty Fristsort → deadline null', () => {
    const row = [...LIST81_ROW]
    row[11] = 'N'
    row[14] = ''
    const mapped = mapConsultationRow(row)
    expect(mapped.active).toBe(false)
    expect(mapped.deadline).toBeNull()
  })
})

describe('normalizeOrgName', () => {
  it('collapses whitespace runs and normalizes separator spacing', () => {
    expect(
      normalizeOrgName('Universität Wien / Rechtswissenschaftliche Fakultät ; Institut'),
    ).toBe('Universität Wien / Rechtswissenschaftliche Fakultät; Institut')
    expect(normalizeOrgName('Kammer  für   Arbeiter,und Angestellte')).toBe(
      'Kammer für Arbeiter, und Angestellte',
    )
  })

  it('never merges distinct names — display cleanup only', () => {
    expect(normalizeOrgName('Rechtswisssenschaftliche Fakultät')).toBe(
      'Rechtswisssenschaftliche Fakultät',
    )
  })
})

describe('mapStatementRow', () => {
  it('maps a person row without leaking the name', () => {
    expect(mapStatementRow(LIST142_PERSON_ROW)).toEqual({
      citation: '237/SN-126/ME',
      date: '2026-07-07',
      submitterKind: 'person',
      submitterName: null,
      endorsements: 0,
      parliamentUrl: 'https://www.parlament.gv.at/gegenstand/XXVIII/SNME/4983',
    })
  })

  it('maps an organisation row with name and endorsements', () => {
    const row = [...LIST142_PERSON_ROW]
    row[2] = 5000
    row[6] =
      '<a href="/gegenstand/XXVIII/SNME/5000/" target="_blank">Vegane Gesellschaft Österreich (300/SN-126/ME)</a>'
    row[12] = 12
    row[15] = '300/SN-126/ME'
    expect(mapStatementRow(row)).toEqual({
      citation: '300/SN-126/ME',
      date: '2026-07-07',
      submitterKind: 'organisation',
      submitterName: 'Vegane Gesellschaft Österreich',
      endorsements: 12,
      parliamentUrl: 'https://www.parlament.gv.at/gegenstand/XXVIII/SNME/5000',
    })
  })

  it('maps a non-public row (placeholder instead of a link)', () => {
    const row = [...LIST142_PERSON_ROW]
    row[2] = 5240
    row[6] = 'Nicht-öffentliche Stellungnahme (410/SN-126/ME)'
    row[15] = '410/SN-126/ME'
    const mapped = mapStatementRow(row)
    expect(mapped.submitterKind).toBe('nonpublic')
    expect(mapped.submitterName).toBeNull()
  })

  it('falls back to the display date when the ISO date is missing', () => {
    const row = [...LIST142_PERSON_ROW]
    row[5] = null
    expect(mapStatementRow(row).date).toBe('2026-07-07')
  })
})

describe('parseStages / extractLinks', () => {
  it('strips HTML and extracts absolute links (real RV stage)', () => {
    const steps = parseStages([
      { date: '11.03.2026', text: 'Einlangen im Nationalrat' },
      {
        date: '22.04.2026',
        text: 'Regierungsvorlage (<a href="/gegenstand/XXVIII/I/474">474 d.B.</a>)',
      },
    ])
    expect(steps).toEqual([
      { date: '2026-03-11', text: 'Einlangen im Nationalrat', links: [] },
      {
        date: '2026-04-22',
        text: 'Regierungsvorlage (474 d.B.)',
        links: [
          { label: '474 d.B.', url: 'https://www.parlament.gv.at/gegenstand/XXVIII/I/474' },
        ],
      },
    ])
  })

  it('stage without a date → date null; entities are decoded', () => {
    const steps = parseStages([{ text: '&Uuml;bermittlung an das Bundesministerium f&uuml;r Justiz' }])
    expect(steps[0].date).toBeNull()
    expect(steps[0].text).toBe('Übermittlung an das Bundesministerium für Justiz')
  })

  it('extractLinks keeps absolute URLs and uses the URL as label fallback', () => {
    const links = extractLinks('<a href="https://www.ris.bka.gv.at/x">RIS</a> und <a href=\'/pfad\'></a>')
    expect(links).toEqual([
      { label: 'RIS', url: 'https://www.ris.bka.gv.at/x' },
      { label: 'https://www.parlament.gv.at/pfad', url: 'https://www.parlament.gv.at/pfad' },
    ])
  })
})

describe('findLastRvLink', () => {
  it('takes the LAST RV link (ME→RV is 1:n)', () => {
    const trace = parseStages([
      { date: '01.06.2021', text: 'RV (<a href="/gegenstand/XXVII/I/471">471 d.B.</a>)' },
      { date: '01.07.2021', text: 'RV (<a href="/gegenstand/XXVII/I/733">733 d.B.</a>)' },
    ])
    expect(findLastRvLink(trace)).toEqual({
      gp: 'XXVII',
      inr: 733,
      label: '733 d.B.',
      url: 'https://www.parlament.gv.at/gegenstand/XXVII/I/733',
    })
  })

  it('ignores non-RV links (SNME, ME) → null', () => {
    const trace = parseStages([
      { text: '<a href="/gegenstand/XXVIII/SNME/3699">SN</a> <a href="/gegenstand/XXVIII/ME/88">ME</a>' },
    ])
    expect(findLastRvLink(trace)).toBeNull()
  })
})

describe('mapDocuments / mapTextEvolution', () => {
  const RAW_DOCS = [
    { title: 'Kurzinformation', documents: [{ link: '/dokument/XXVIII/ME/88/imfname_1744315.pdf', type: 'PDF' }] },
    {
      title: 'Gesetzestext',
      documents: [
        { link: '/dokument/XXVIII/ME/88/fname_1744270.pdf', type: 'PDF' },
        { link: '/dokument/XXVIII/ME/88/fnameorig_1744270.html', type: 'HTML' },
      ],
    },
  ]

  it('maps documents with pdf/html formats and absolute URLs', () => {
    expect(mapDocuments(RAW_DOCS)).toEqual([
      {
        title: 'Kurzinformation',
        formats: [
          { type: 'pdf', url: 'https://www.parlament.gv.at/dokument/XXVIII/ME/88/imfname_1744315.pdf' },
        ],
      },
      {
        title: 'Gesetzestext',
        formats: [
          { type: 'pdf', url: 'https://www.parlament.gv.at/dokument/XXVIII/ME/88/fname_1744270.pdf' },
          { type: 'html', url: 'https://www.parlament.gv.at/dokument/XXVIII/ME/88/fnameorig_1744270.html' },
        ],
      },
    ])
  })

  it('skips unknown formats and empty groups', () => {
    expect(mapDocuments([{ title: 'X', documents: [{ link: '/a.docx', type: 'DOCX' }] }])).toEqual([])
    expect(mapDocuments(null)).toEqual([])
  })

  it('flattens the text evolution into labeled links', () => {
    expect(mapTextEvolution([RAW_DOCS[1]])).toEqual([
      { label: 'Gesetzestext (PDF)', url: 'https://www.parlament.gv.at/dokument/XXVIII/ME/88/fname_1744270.pdf' },
      { label: 'Gesetzestext (HTML)', url: 'https://www.parlament.gv.at/dokument/XXVIII/ME/88/fnameorig_1744270.html' },
    ])
  })
})

describe('extractBgblLink', () => {
  // Real bgbllinks of RV 474 d.B. (XXVIII), sample from 2026-08-15
  const BGBLLINKS = [
    {
      title: 'Bundesgesetzblatt I Nr. 37/2026',
      link: 'http://www.ris.bka.gv.at/Dokument.wxe?Abfrage=BgblAuth&Dokumentnummer=BGBLA_2026_I_37',
    },
    {
      title: 'Kunsttext',
      link: 'http://www.ris.bka.gv.at/Ergebnis.wxe?Abfrage=Bundesnormen&Kundmachungsnummer=37%2f2026',
    },
  ]

  it('selects the BgblAuth entry, never blindly [0]', () => {
    expect(extractBgblLink(BGBLLINKS)).toEqual({
      number: 'Bundesgesetzblatt I Nr. 37/2026',
      url: 'http://www.ris.bka.gv.at/Dokument.wxe?Abfrage=BgblAuth&Dokumentnummer=BGBLA_2026_I_37',
    })
    expect(extractBgblLink([...BGBLLINKS].reverse())).toEqual(extractBgblLink(BGBLLINKS))
  })

  it('no BgblAuth entry / no links → null', () => {
    expect(extractBgblLink([BGBLLINKS[1]])).toBeNull()
    expect(extractBgblLink([])).toBeNull()
    expect(extractBgblLink(null)).toBeNull()
  })
})

describe('parseShortinfo / mapInvitedBy', () => {
  it('maps shortinfo HTML to typed heading/paragraph blocks', () => {
    expect(
      parseShortinfo({
        teil1: '<h4>Ziel</h4>\n\n<p>Entlastung der B&uuml;rgerinnen/B&uuml;rger</p>\n',
        teil2: '<h4>Inhalt</h4>\n\n<p>Senkung des Umsatzsteuersatzes</p>',
      }),
    ).toEqual([
      { kind: 'heading', text: 'Ziel' },
      { kind: 'paragraph', text: 'Entlastung der Bürgerinnen/Bürger' },
      { kind: 'heading', text: 'Inhalt' },
      { kind: 'paragraph', text: 'Senkung des Umsatzsteuersatzes' },
    ])
  })

  // Shape of 8/ME: a trailing &nbsp; in the heading, a real <ul> for Inhalt,
  // and a third section name the ministry made up.
  it('keeps <ul> items as a list and tolerates free-text headings', () => {
    expect(
      parseShortinfo({
        teil1:
          '<h4>Inhalt&nbsp;</h4>\n<ul class="unordered-list">\n\t<li>Ermittlungsbefugnis (&sect; 11 Abs. 1 Z 8 SNG)</li>\n\t<li>Aktualisierung der Verweise</li>\n</ul>',
        teil2: '<h4>Hauptgesichtspunkte des Entwurfs</h4>\n<p>Erster Absatz.<br />\nZweiter Absatz.</p>',
      }),
    ).toEqual([
      { kind: 'heading', text: 'Inhalt' },
      {
        kind: 'list',
        items: ['Ermittlungsbefugnis (§ 11 Abs. 1 Z 8 SNG)', 'Aktualisierung der Verweise'],
      },
      { kind: 'heading', text: 'Hauptgesichtspunkte des Entwurfs' },
      { kind: 'paragraph', text: 'Erster Absatz.' },
      { kind: 'paragraph', text: 'Zweiter Absatz.' },
    ])
  })

  it('keeps text that sits outside any block tag', () => {
    expect(parseShortinfo({ teil1: 'Loser Text ohne Tags' })).toEqual([
      { kind: 'paragraph', text: 'Loser Text ohne Tags' },
    ])
  })

  it('empty shortinfo → empty block list', () => {
    expect(parseShortinfo(null)).toEqual([])
    expect(parseShortinfo({ teil1: '', teil2: null })).toEqual([])
    expect(parseShortinfo({ teil1: '<h4></h4><p>  </p>' })).toEqual([])
  })

  it('finds "Übermittelt von" in names[]', () => {
    expect(
      mapInvitedBy([
        { funktext: 'Sonstiges', name: 'X' },
        { funktext: 'Übermittelt von', name: 'Dr. Markus Marterbauer' },
      ]),
    ).toBe('Dr. Markus Marterbauer')
    expect(mapInvitedBy([])).toBeNull()
    expect(mapInvitedBy(null)).toBeNull()
  })
})

describe('helpers', () => {
  it('absolutizeUrl', () => {
    expect(absolutizeUrl('/gegenstand/XXVIII/ME/133')).toBe(
      'https://www.parlament.gv.at/gegenstand/XXVIII/ME/133',
    )
    expect(absolutizeUrl('https://example.org/x')).toBe('https://example.org/x')
  })

  it('stripHtmlToText decodes numeric entities', () => {
    expect(stripHtmlToText('<p>&#167; 5 &amp; &#x00A7; 6</p>')).toBe('§ 5 & § 6')
  })

  it('Roman numerals: round trip and strict rejection', () => {
    expect(romanToInt('XXVIII')).toBe(28)
    expect(intToRoman(28)).toBe('XXVIII')
    expect(romanToInt('XIV')).toBe(14)
    expect(romanToInt('IIX')).toBeNull()
    expect(romanToInt('abc')).toBeNull()
  })
})
