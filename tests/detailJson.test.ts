import { describe, expect, it } from 'vitest'
import {
  bgblOrderKey,
  extractBgblLink,
  isFilingOpen,
  findHandoff,
  findLastRvLink,
  findRvLinks,
  mapDocuments,
  mapInvitedBy,
  mapTextEvolution,
  parseShortinfo,
  parseStages,
} from '../server/utils/parliament/detailJson'

describe('findHandoff', () => {
  const step = (text: string, date: string | null = '2026-04-08') => ({
    date,
    text,
    links: [],
  })

  it('reads recipient and date from the Übermittlung stage', () => {
    expect(
      findHandoff([
        step('Einlangen im Nationalrat', '2026-01-27'),
        step('Übermittlung an das Bundesministerium für Justiz', '2026-02-27'),
      ]),
    ).toEqual({ date: '2026-02-27', recipient: 'das Bundesministerium für Justiz' })
  })

  it('passes any recipient wording through (BKA, Ministerinnenbüro)', () => {
    expect(findHandoff([step('Übermittlung an das Bundeskanzleramt')])?.recipient).toBe(
      'das Bundeskanzleramt',
    )
  })

  it('claims nothing without an Übermittlung stage', () => {
    expect(findHandoff([step('Ende der Begutachtungsfrist 21.08.2026')])).toBeNull()
  })
})

describe('parseStages', () => {
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
    expect(steps[0]!.date).toBeNull()
    expect(steps[0]!.text).toBe('Übermittlung an das Bundesministerium für Justiz')
  })
})

describe('findRvLinks / findLastRvLink', () => {
  const SPLIT = [
    { date: '01.06.2021', text: 'RV (<a href="/gegenstand/XXVII/I/471">471 d.B.</a>)' },
    { date: '01.07.2021', text: 'RV (<a href="/gegenstand/XXVII/I/733">733 d.B.</a>)' },
  ]

  it('keeps every RV in stage order, each with its stage date', () => {
    expect(findRvLinks(parseStages(SPLIT))).toEqual([
      {
        gp: 'XXVII',
        inr: 471,
        label: '471 d.B.',
        url: 'https://www.parlament.gv.at/gegenstand/XXVII/I/471',
        date: '2021-06-01',
      },
      {
        gp: 'XXVII',
        inr: 733,
        label: '733 d.B.',
        url: 'https://www.parlament.gv.at/gegenstand/XXVII/I/733',
        date: '2021-07-01',
      },
    ])
  })

  it('takes the LAST RV link (ME→RV is 1:n)', () => {
    expect(findLastRvLink(parseStages(SPLIT))?.inr).toBe(733)
  })

  it('ignores non-RV links (SNME, ME) → null', () => {
    const trace = parseStages([
      { text: '<a href="/gegenstand/XXVIII/SNME/3699">SN</a> <a href="/gegenstand/XXVIII/ME/88">ME</a>' },
    ])
    expect(findRvLinks(trace)).toEqual([])
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

  /* The RV's text carries the same upstream title as the draft's own —
   * unrenamed, one page shows "Gesetzestext" twice for two different PDFs. */
  const RAW_RV_DOCS = [
    {
      title: 'Gesetzestext',
      documents: [
        { link: '/dokument/XXVIII/I/476/fname_1753703.pdf', type: 'PDF' },
        { link: '/dokument/XXVIII/I/476/fnameorig_1753703.html', type: 'HTML' },
      ],
    },
    {
      title: 'Geändert im Ausschuss',
      documents: [{ link: '/dokument/XXVIII/I/476/fname_1760001.pdf', type: 'PDF' }],
    },
  ]

  it('names the stations, not the documents', () => {
    expect(mapTextEvolution(RAW_RV_DOCS).map((v) => [v.station, v.label])).toEqual([
      ['Regierungsvorlage', 'Regierungsvorlage (PDF)'],
      ['Regierungsvorlage', 'Regierungsvorlage (HTML)'],
      ['Geändert im Ausschuss', 'Geändert im Ausschuss (PDF)'],
    ])
  })

  it('drops what merely repeats the draft: without an RV upstream relists the ME text', () => {
    const meUrls = new Set(mapDocuments(RAW_DOCS).flatMap((d) => d.formats.map((f) => f.url)))
    expect(mapTextEvolution([RAW_DOCS[1]!], meUrls)).toEqual([])
  })

  it('keeps genuine later versions when the draft URLs are excluded', () => {
    const meUrls = new Set(mapDocuments(RAW_DOCS).flatMap((d) => d.formats.map((f) => f.url)))
    expect(mapTextEvolution(RAW_RV_DOCS, meUrls)).toHaveLength(3)
  })

  it('types the station, so the comparison can select it', () => {
    expect(mapTextEvolution(RAW_RV_DOCS).map((v) => v.stationId)).toEqual(['rv', 'rv', 'ausschuss'])
  })

  it('types no station for a document that is not a version of the text', () => {
    // The EU proportionality assessment for regulated professions travels in
    // the same upstream list (171/ME and 309/ME XXVII). It keeps its row in
    // the document list — nothing disappears from the page — but a §
    // comparison would make paragraphs out of an annex, so it is never
    // offered as a side to compare.
    const versions = mapTextEvolution([
      { title: 'Verhältnismäßigkeitsprüfung', documents: [{ link: '/dokument/XXVII/I/1435/f_1.html', type: 'HTML' }] },
      { title: 'Geändert im Plenum', documents: [{ link: '/dokument/XXVII/I/1435/f_2.html', type: 'HTML' }] },
    ])
    expect(versions.map((v) => [v.station, v.stationId])).toEqual([
      ['Verhältnismäßigkeitsprüfung', null],
      ['Geändert im Plenum', 'plenum'],
    ])
  })
})

describe('isFilingOpen', () => {
  it('reads upstream\'s statementsstate as the open/closed flag', () => {
    // 132/ME with a running Frist and the newest GP-XXVIII Vorlagen: "1".
    expect(isFilingOpen({ statementsstate: '1' })).toBe(true)
    expect(isFilingOpen({ statementsstate: 1 })).toBe(true)
    // The enacted 2238 d.B. and the closed 95/ME: "0".
    expect(isFilingOpen({ statementsstate: '0' })).toBe(false)
    expect(isFilingOpen({ statementsstate: 0 })).toBe(false)
  })

  it('reads anything else as closed — a door to a closed room costs more than a missing one', () => {
    expect(isFilingOpen({})).toBe(false)
    expect(isFilingOpen(null)).toBe(false)
    expect(isFilingOpen(undefined)).toBe(false)
    expect(isFilingOpen({ statementsstate: 'true' })).toBe(false)
    expect(isFilingOpen({ statementsstate: '11' })).toBe(false)
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
    expect(extractBgblLink([BGBLLINKS[1]!])).toBeNull()
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

describe('bgblOrderKey', () => {
  it('orders by year first, then by the number inside it', () => {
    const a = bgblOrderKey('Bundesgesetzblatt I Nr. 81/2026')!
    const b = bgblOrderKey('Bundesgesetzblatt I Nr. 78/2026')!
    const c = bgblOrderKey('Bundesgesetzblatt I Nr. 5/2027')!
    expect(a).toBeGreaterThan(b)
    expect(c).toBeGreaterThan(a)
  })

  /* The reason this key exists: publication order is NOT decision order.
   * 443 d.B. was decided on 03.06.2026 and published as 81/2026, after laws
   * decided six weeks later (measured 2026-09-18). */
  it('puts a later-published law ahead of a later-decided one', () => {
    expect(bgblOrderKey('Bundesgesetzblatt I Nr. 81/2026')!).toBeGreaterThan(
      bgblOrderKey('Bundesgesetzblatt I Nr. 62/2026')!,
    )
  })

  it('accepts the short spelling as well', () => {
    expect(bgblOrderKey('BGBl. I Nr. 37/2026')).toBe(bgblOrderKey('Bundesgesetzblatt I Nr. 37/2026'))
  })

  /* Teil II and III run their own number series — interleaving them would
   * order two sequences as one, and "Gesetz geworden" is Teil I anyway. */
  it('refuses everything that is not Teil I', () => {
    expect(bgblOrderKey('Bundesgesetzblatt II Nr. 250/2026')).toBeNull()
    expect(bgblOrderKey('Bundesgesetzblatt III Nr. 12/2026')).toBeNull()
    expect(bgblOrderKey('Bundesgesetzblatt Nr. 620/1989')).toBeNull()
  })

  it('says null rather than guessing', () => {
    expect(bgblOrderKey(null)).toBeNull()
    expect(bgblOrderKey('')).toBeNull()
    expect(bgblOrderKey('Kunsttext')).toBeNull()
  })
})
