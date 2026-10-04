import { describe, expect, it } from 'vitest'
import {
  readCommitteeConsultation,
  findBundesratArrival,
  findBundesratDecisionDate,
  findCommitteeReport,
  findHouseDecisionDate,
  findNoPromulgation,
  findPlenaryAmendments,
  amendedStationsOf,
  bgblOrderKey,
  bundlesOtherDrafts,
  otherBundledDrafts,
  extractBgblLink,
  isFilingOpen,
  isVorlageFilingOpen,
  isVorlageGpEnded,
  parseVote,
  findHandoff,
  findComparisonRvLink,
  findLastRvLink,
  findRvLinks,
  mapDocuments,
  mapInvitedBy,
  mapTextEvolution,
  parseShortinfo,
  parseStages,
} from '../server/utils/parliament/detailJson'
import { bgblShort } from '../shared/utils/format'

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

  it('reads /gegenstand/ only on Parliament\'s host', () => {
    const trace = parseStages([
      { text: '<a href="https://www.ris.bka.gv.at/gegenstand/XXVIII/I/1">1 d.B.</a>' },
      { text: '<a href="https://evil.example/gegenstand/XXVIII/I/2">2 d.B.</a>' },
    ])
    expect(findRvLinks(trace)).toEqual([])
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

describe('findComparisonRvLink', () => {
  // 26/ME XXVIII: three Vorlagen on one day, each a different law, and the
  // draft's text-evolution list carries the Gesetzestext of 130.
  const SPLIT_SAME_DAY = parseStages([
    { date: '18.06.2025', text: 'RV (<a href="/gegenstand/XXVIII/I/128">128 d.B.</a>)' },
    { date: '18.06.2025', text: 'RV (<a href="/gegenstand/XXVIII/I/130">130 d.B.</a>)' },
    { date: '18.06.2025', text: 'RV (<a href="/gegenstand/XXVIII/I/129">129 d.B.</a>)' },
  ])
  const TEXT_130 = 'https://www.parlament.gv.at/dokument/XXVIII/I/130/fnameorig_1693606.html'

  it('takes the Vorlage whose Gesetzestext the draft carries, not the latest', () => {
    expect(findLastRvLink(SPLIT_SAME_DAY)?.inr).toBe(129)
    expect(findComparisonRvLink(SPLIT_SAME_DAY, TEXT_130)?.inr).toBe(130)
  })

  it('falls back to the latest without a text, or with one no stage links', () => {
    expect(findComparisonRvLink(SPLIT_SAME_DAY, null)?.inr).toBe(129)
    expect(findComparisonRvLink(SPLIT_SAME_DAY, 'https://www.parlament.gv.at/dokument/XXVIII/I/999/x.html')?.inr).toBe(129)
    expect(findComparisonRvLink(SPLIT_SAME_DAY, 'https://www.parlament.gv.at/dokument/XXVIII/ME/26/x.html')?.inr).toBe(129)
  })

  it('does not match a number from another period', () => {
    expect(findComparisonRvLink(SPLIT_SAME_DAY, 'https://www.parlament.gv.at/dokument/XXVII/I/130/x.html')?.inr).toBe(129)
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

  it('drops a format whose link fails the upstream allowlist, and a group left empty', () => {
    expect(
      mapDocuments([
        {
          title: 'Gesetzestext',
          documents: [
            { link: 'https://evil.example/x.pdf', type: 'PDF' },
            { link: '/dokument/XXVIII/ME/88/fnameorig_1744270.html', type: 'HTML' },
          ],
        },
        { title: 'Kurzinformation', documents: [{ link: 'javascript:alert(1)', type: 'PDF' }] },
      ]),
    ).toEqual([
      {
        title: 'Gesetzestext',
        formats: [{ type: 'html', url: 'https://www.parlament.gv.at/dokument/XXVIII/ME/88/fnameorig_1744270.html' }],
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

describe('isVorlageGpEnded', () => {
  it('judges a carried-over Vorlage by ITS period, not the draft\'s', () => {
    // XXVII/352/ME → 127 d.B./XXVIII. GP: the draft's period is over, the Vorlage's runs.
    expect(isVorlageGpEnded('XXVIII', 'XXVIII')).toBe(false)
    // The next period change: a Vorlage of XXVIII once XXIX convened.
    expect(isVorlageGpEnded('XXVIII', 'XXIX')).toBe(true)
  })

  it('reads the table, so a stale current GP cannot revive an ended period', () => {
    expect(isVorlageGpEnded('XXVII', 'XXVII')).toBe(true)
  })

  it('never claims „beendet" without a current GP to compare against', () => {
    expect(isVorlageGpEnded('XXVIII', null)).toBe(false)
  })
})

describe('isVorlageFilingOpen', () => {
  const open = { statementsstate: '1' }

  it('judges a carried-over Vorlage by ITS period, not the draft\'s', () => {
    // XXVII/352/ME → 127 d.B./XXVIII. GP: the draft's period is over, the
    // Vorlage's runs. Judged by the draft's GP, an open form read as closed
    // on the detail page while the station map called it open.
    expect(isVorlageFilingOpen(open, 'XXVIII', 'XXVIII')).toBe(true)
  })

  it('closes a Vorlage that lapsed with its period, whatever a stale flag says', () => {
    expect(isVorlageFilingOpen(open, 'XXVII', 'XXVIII')).toBe(false)
    // The table knows XXVII's successor, so even a stale current GP agrees.
    expect(isVorlageFilingOpen(open, 'XXVII', 'XXVII')).toBe(false)
  })

  it('opens nothing the flag does not open', () => {
    expect(isVorlageFilingOpen({ statementsstate: '0' }, 'XXVIII', 'XXVIII')).toBe(false)
    // What the Vorlagen before August 2021 carry instead of 0/1 (1 d.B. XXVII, read 01.10.2026).
    expect(
      isVorlageFilingOpen({ statementsstate: '9 Begutachtung erst ab 1.8.2021 bei dem Doktyp "RV" möglich' }, 'XXVII', 'XXVII'),
    ).toBe(false)
    expect(isVorlageFilingOpen(null, 'XXVIII', 'XXVIII')).toBe(false)
  })

  it('keeps the flag when the running period is unknown — gpHasEnded\'s safe direction', () => {
    expect(isVorlageFilingOpen(open, 'XXVIII', null)).toBe(true)
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
      // Upgraded: upstream still sends http, RIS serves https.
      url: 'https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=BgblAuth&Dokumentnummer=BGBLA_2026_I_37',
    })
    expect(extractBgblLink([...BGBLLINKS].reverse())).toEqual(extractBgblLink(BGBLLINKS))
  })

  it('a BgblAuth link off the upstream allowlist is no entry', () => {
    expect(
      extractBgblLink([{ title: 'Bundesgesetzblatt I Nr. 37/2026', link: 'https://evil.example/Dokument.wxe?Abfrage=BgblAuth' }]),
    ).toBeNull()
    expect(extractBgblLink([{ title: 'x', link: 'javascript:alert(1)//Abfrage=BgblAuth' }])).toBeNull()
  })

  it('no BgblAuth entry / no links → null', () => {
    expect(extractBgblLink([BGBLLINKS[1]!])).toBeNull()
    expect(extractBgblLink([])).toBeNull()
    expect(extractBgblLink(null)).toBeNull()
  })

  /* 2446 d.B. (XXVII, out of 300/ME), read live 23.09.2026: the Teil is
     missing from the title and stands in the link. One upstream typo took the
     law out of „Zuletzt Gesetz geworden" (`bgblOrderKey` refuses a citation
     without a Teil), printed „BGBl. Nr. 42/2024" and made the RIS lookup,
     which searches by exactly that short form, come back empty. */
  it('takes the Teil from the link when the title leaves it out', () => {
    expect(
      extractBgblLink([
        {
          title: 'Bundesgesetzblatt Nr. 42/2024',
          link: 'http://www.ris.bka.gv.at/Dokument.wxe?Abfrage=BgblAuth&Dokumentnummer=BGBLA_2024_I_42',
        },
      ])?.number,
    ).toBe('Bundesgesetzblatt I Nr. 42/2024')
  })

  it('makes the repaired citation sortable and short-formable again', () => {
    const repaired = extractBgblLink([
      {
        title: 'Bundesgesetzblatt Nr. 42/2024',
        link: 'http://www.ris.bka.gv.at/Dokument.wxe?Abfrage=BgblAuth&Dokumentnummer=BGBLA_2024_I_42',
      },
    ])!.number
    expect(bgblOrderKey(repaired)).toBe(bgblOrderKey('Bundesgesetzblatt I Nr. 42/2024'))
    expect(bgblShort(repaired!)).toBe('BGBl. I Nr. 42/2024')
  })

  it('leaves a correct title exactly as upstream wrote it', () => {
    expect(extractBgblLink(BGBLLINKS)!.number).toBe('Bundesgesetzblatt I Nr. 37/2026')
    // Teil II keeps its own series — the link decides that too.
    expect(
      extractBgblLink([
        {
          title: 'Bundesgesetzblatt II Nr. 250/2026',
          link: 'http://www.ris.bka.gv.at/Dokument.wxe?Abfrage=BgblAuth&Dokumentnummer=BGBLA_2026_II_250',
        },
      ])!.number,
    ).toBe('Bundesgesetzblatt II Nr. 250/2026')
  })

  it('claims nothing about a link that carries no Dokumentnummer', () => {
    /* Without the structured field there is nothing to check the title
       against, so the title travels as it stands. */
    expect(
      extractBgblLink([
        { title: 'Bundesgesetzblatt Nr. 620/1989', link: 'http://www.ris.bka.gv.at/Dokument.wxe?Abfrage=BgblAuth&Dokumentnummer=BGBL_620_1989' },
      ])!.number,
    ).toBe('Bundesgesetzblatt Nr. 620/1989')
    expect(
      extractBgblLink([{ title: null, link: 'http://www.ris.bka.gv.at/Dokument.wxe?Abfrage=BgblAuth' }])!.number,
    ).toBeNull()
  })
})

/**
 * Which stations a Regierungsvorlage published a changed text at — read from
 * ITS list, because the draft's mirror of the same list belongs to one
 * Vorlage among several (ME→RV is 1:n, §13.4).
 */
describe('amendedStationsOf', () => {
  const group = (title: string) => ({
    title,
    documents: [{ link: `/dokument/XXVIII/I/129/${title}.html`, type: 'HTML' }],
  })

  /* 129 d.B. (XXVIII), the Vorlage whose Kundmachung 26/ME's page states. */
  it('names both houses in procedural order, whatever order upstream lists them in', () => {
    expect(amendedStationsOf([group('Gesetzestext'), group('Geändert im Ausschuss'), group('Geändert im Plenum')]))
      .toEqual(['ausschuss', 'plenum'])
    expect(amendedStationsOf([group('Geändert im Plenum'), group('Geändert im Ausschuss')]))
      .toEqual(['ausschuss', 'plenum'])
  })

  /* An empty array is an answer — "this Vorlage published no changed text" —
     and it is what lets the page say „Text unverändert beschlossen". */
  it('answers with an empty list when the Vorlage published no changed text', () => {
    expect(amendedStationsOf([group('Gesetzestext')])).toEqual([])
    expect(amendedStationsOf([])).toEqual([])
    expect(amendedStationsOf(null)).toEqual([])
  })

  it('never counts the Vorlage\'s own text, nor a document that is not law text', () => {
    // The Vorlage's Gesetzestext is what the two stations are changes TO, and
    // a Verhältnismäßigkeitsprüfung is no version of the law at all.
    expect(amendedStationsOf([group('Gesetzestext'), group('Verhältnismäßigkeitsprüfung')])).toEqual([])
  })
})

describe('parseVote', () => {
  const club = (text: string, infavor: boolean) => ({ text, code: text[0], fraction: 1, infavor })

  /* 474 d.B. (XXVIII), the Vorlage out of 88/ME — read live 24.09.2026. */
  it('splits the clubs into the two sides upstream flags them as', () => {
    expect(parseVote({
      result: [
        club('FPÖ', false), club('ÖVP', true), club('SPÖ', true),
        club('NEOS', true), club('GRÜNE', false),
      ],
      infavor: true,
      code: 'fVSNg',
      text: 'Dafür: V, S, N, Dagegen: F, G',
    })).toEqual({ infavor: ['ÖVP', 'SPÖ', 'NEOS'], against: ['FPÖ', 'GRÜNE'], passed: true })
  })

  /* XXVII/474 d.B.: two clubs for it, and it still failed — it needed a
     two-thirds majority. `passed` is upstream's flag, never a headcount of
     ours. */
  it('takes whether the vote carried from upstream, not from the sides', () => {
    const v = parseVote({
      result: [club('ÖVP', true), club('GRÜNE', true), club('SPÖ', false), club('FPÖ', false), club('NEOS', false)],
      infavor: false,
    })
    expect(v?.passed).toBe(false)
    expect(v?.infavor).toEqual(['ÖVP', 'GRÜNE'])
  })

  /* Shape 2: upstream's prose vocabulary with no club record behind it —
     „Namentliche Abstimmung" (2 of 110 voted Vorlagen in GP XXVIII),
     „mehrstimmig", „Einstimmig". The comment beside them is a sentence in
     shifting formats, so nothing is read out of it. */
  it('answers null where upstream kept a word instead of the clubs', () => {
    expect(parseVote({
      result: [],
      infavor: true,
      code: '_namen',
      text: 'Namentliche Abstimmung',
      comment: 'abgegebene Stimmen: 176; davon Ja-Stimmen: 105, Nein-Stimmen: 71',
    })).toBeNull()
    expect(parseVote({ result: [], infavor: true, code: '_mehr', text: 'mehrstimmig', comment: 'dafür: V, F, N, tlw. P' })).toBeNull()
  })

  /* A Vorlage that has not been voted on carries `vote: null` — all 13
     GP-XXVIII Vorlagen without one were still in Behandlung. */
  it('answers null for a Vorlage that has not been voted on', () => {
    expect(parseVote(null)).toBeNull()
    expect(parseVote(undefined)).toBeNull()
    expect(parseVote({})).toBeNull()
  })

  it('drops nameless entries and treats anything but an explicit true as against', () => {
    expect(parseVote({ result: [{ text: '  ', infavor: true }, { text: 'SPÖ', infavor: null }, club('ÖVP', true)] }))
      .toEqual({ infavor: ['ÖVP'], against: ['SPÖ'], passed: false })
    expect(parseVote({ result: [{ infavor: true }] })).toBeNull()
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

describe('readCommitteeConsultation (27.09.2026)', () => {
  // RV 313 of GP XXVIII as its Verlauf records it, shortened to three addressees.
  const phases = [
    { name: 'Einlangen NR', stages: [{ date: '20.11.2025', text: 'Einlangen im Nationalrat' }] },
    {
      name: 'Ausschussberatungen NR',
      stages: [
        { date: '20.11.2025', text: 'Ausschuss für Wirtschaft, Industrie und Energie: Beschlussfassung auf Einholung schriftlicher Stellungnahmen im Rahmen eines "Ausschussbegutachtungsverfahrens"' },
        { date: '20.11.2025', text: 'Antrag auf Ausschussbegutachtung der Vorlage (<a href="/gegenstand/XXVIII/AUA/52">52/AUA</a>)' },
        { date: '20.11.2025', text: 'Antrag auf Einholung einer Stellungnahme von Bundeskanzleramt - angenommen' },
        { date: '20.11.2025', text: 'Antrag auf Einholung einer Stellungnahme von Amt der Tiroler Landesregierung - angenommen' },
        { date: '20.11.2025', text: 'Antrag auf Einholung einer Stellungnahme von Österreichischer Gewerkschaftsbund - angenommen' },
      ],
    },
  ]

  it('reads the committee, the day and how many it wrote to', () => {
    expect(readCommitteeConsultation(phases)).toEqual({ committee: 'Ausschuss für Wirtschaft, Industrie und Energie', date: '2025-11-20', invited: 3 })
  })

  it('reads nothing where no consultation was decided — a rejected motion leaves no decision', () => {
    const rejected = [{ stages: [{ date: '15.01.2024', text: 'Antrag auf Ausschussbegutachtung - abgelehnt' }, { date: '15.01.2024', text: 'In der Sitzung vom 15. Jänner 2024 vertagt.' }] }]
    expect(readCommitteeConsultation(rejected)).toBeNull()
    expect(readCommitteeConsultation(null)).toBeNull()
  })
})

// The Vorlage names every draft it absorbed (docs/architecture.md §12.33):
// 129 d.B. XXVIII lists twelve, 186 d.B. only 1/ME.
describe('bundlesOtherDrafts', () => {
  it('true where the Vorlage names another Ministerialentwurf', () => {
    const pre = [{ gp_code: 'XXVIII', ityp: 'ME', inr: 12 }, { gp_code: 'XXVIII', ityp: 'ME', inr: 17 }]
    expect(bundlesOtherDrafts(pre, 'XXVIII', 17)).toBe(true)
  })

  it('false where it names only this one', () => {
    expect(bundlesOtherDrafts([{ gp_code: 'XXVIII', ityp: 'ME', inr: '1' }], 'XXVIII', 1)).toBe(false)
  })

  it('a draft of an earlier period is another draft', () => {
    expect(bundlesOtherDrafts([{ gp_code: 'XXVII', ityp: 'ME', inr: 1 }, { gp_code: 'XXVIII', ityp: 'ME', inr: 1 }], 'XXVIII', 1)).toBe(true)
  })

  it('null where the record says nothing — no proof in either direction', () => {
    expect(bundlesOtherDrafts(undefined, 'XXVIII', 1)).toBeNull()
    expect(bundlesOtherDrafts([], 'XXVIII', 1)).toBeNull()
    expect(bundlesOtherDrafts([{ gp_code: 'XXVIII', ityp: 'A', inr: 5 }], 'XXVIII', 1)).toBeNull()
  })
})

describe('findCommitteeReport (02.10.2026)', () => {
  // RV 80 of GP XXVIII as its Verlauf records it, shortened — plus a
  // Fristsetzung stage („…für Berichterstattung") that is not a report.
  const phases = [
    { name: 'Einlangen NR', stages: [{ date: '04.04.2025', text: 'Einlangen im Nationalrat' }] },
    {
      name: 'Ausschussberatungen NR',
      stages: [
        { date: '10.04.2025', text: 'Justizausschuss: Fristsetzung für Berichterstattung: 19.09.2025' },
        { date: '05.06.2025', text: 'Justizausschuss: Bericht <a href="/gegenstand/XXVIII/I/145">145 d.B.</a>' },
      ],
    },
    {
      name: 'Ausschussberatungen BR',
      stages: [{ date: '24.06.2025', text: 'Justizausschuss des Bundesrates: Bericht <a href="/gegenstand/BR/I-BR/11666">11666/BR d.B.</a>' }],
    },
  ]

  it("reads the Nationalrat committee's report, not the Bundesrat's", () => {
    expect(findCommitteeReport(phases)).toEqual({ label: '145 d.B.', url: 'https://www.parlament.gv.at/gegenstand/XXVIII/I/145' })
  })

  it('is null without a report, and without a Verlauf', () => {
    expect(findCommitteeReport([phases[0]!, phases[2]!])).toBeNull()
    expect(findCommitteeReport(null)).toBeNull()
  })
})

describe('findPlenaryAmendments (02.10.2026)', () => {
  // RV 129 of GP XXVIII as its Verlauf records it, names shortened.
  const plenary = (stages: { date: string; text: string }[]) => [{ name: 'Plenarberatungen NR', stages }]
  const agenda = { date: '09.07.2025', text: 'Auf der <a href="/dokument/XXVIII/NRSITZ/35/TO_1.html">Tagesordnung</a> der <a href="/gegenstand/XXVIII/NRSITZ/35">35. Sitzung des Nationalrates</a>' }
  const motion = (nr: number, outcome: string) => ({
    date: '09.07.2025',
    text: `35. Sitzung des Nationalrates: Abänderungsantrag der Abgeordneten <a href="/person/1">A. B.</a>, Kolleginnen und Kollegen (<a href="/gegenstand/XXVIII/AA/${nr}">AA-${nr}</a>)<br><b>${outcome}</b><br>Dafür: ÖVP, SPÖ, NEOS, GRÜNE, dagegen: FPÖ`,
  })
  const third = { date: '09.07.2025', text: '35. Sitzung des Nationalrates: Gesetzesvorschlag in dritter Lesung <b>angenommen</b>' }
  const session = { label: '35. Sitzung des Nationalrates', url: 'https://www.parlament.gv.at/gegenstand/XXVIII/NRSITZ/35' }

  it('reads the adopted motions by number, and the session', () => {
    expect(findPlenaryAmendments(plenary([agenda, motion(19, 'angenommen'), motion(20, 'abgelehnt'), motion(21, 'angenommen'), third]))).toEqual({
      session,
      amendments: [
        { label: 'AA-19', url: 'https://www.parlament.gv.at/gegenstand/XXVIII/AA/19' },
        { label: 'AA-21', url: 'https://www.parlament.gv.at/gegenstand/XXVIII/AA/21' },
      ],
    })
  })

  it('keeps the session where no motion was adopted, and is null without a plenary phase', () => {
    expect(findPlenaryAmendments(plenary([agenda, motion(20, 'abgelehnt'), third]))).toEqual({ session, amendments: [] })
    expect(findPlenaryAmendments([{ name: 'Ausschussberatungen NR', stages: [] }])).toBeNull()
  })
})

describe('findHouseDecisionDate (03.10.2026)', () => {
  // 525 d.B. of GP XXVIII as its Verlauf records it, shortened — the
  // Bundesrat's own „Beschluss im Bundesrat" a week later included.
  const einlangen = { name: 'Einlangen NR', stages: [{ date: '10.06.2026', text: 'Einlangen im Nationalrat' }] }
  const decision = { date: '07.07.2026', text: 'Beschluss im Nationalrat <a href="/gegenstand/XXVIII/BNR/192">192/BNR</a>' }
  const nrPlenary = (stages: { date: string; text: string }[]) => ({ name: 'Plenarberatungen NR', stages })
  const nrStages = [
    { date: '07.07.2026', text: '87. Sitzung des Nationalrates: Gesetzesvorschlag in dritter Lesung <b>angenommen</b>' },
    decision,
    { date: '09.07.2026', text: 'Übermittlung des Beschlusses an den Bundesrat' },
  ]
  const brPlenary = {
    name: 'Plenarberatungen BR',
    stages: [{ date: '15.07.2026', text: 'Beschluss im Bundesrat <a href="/gegenstand/XXVIII/BNR/192">192/BNR</a>' }],
  }

  it("reads the day of the Nationalrat's decision", () => {
    expect(findHouseDecisionDate([einlangen, nrPlenary(nrStages), brPlenary])).toBe('2026-07-07')
  })

  it('is null without the plenary phase, or without the decision stage', () => {
    expect(findHouseDecisionDate([einlangen])).toBeNull()
    expect(findHouseDecisionDate([einlangen, nrPlenary(nrStages.filter((s) => s !== decision))])).toBeNull()
    expect(findHouseDecisionDate(null)).toBeNull()
  })

  it("does not take the Bundesrat's decision for the Nationalrat's", () => {
    expect(findHouseDecisionDate([einlangen, brPlenary])).toBeNull()
  })
})

/* 80 d.B. of GP XXVIII as its Verlauf records it, shortened and without
 * names: decided in both chambers, then not promulgated, and Parliament
 * says why and what came instead (read 03.10.2026). */
const brArrival = {
  name: 'Einlangen BR',
  stages: [
    { date: '11.07.2025', text: 'Einlangen im Bundesrat (Frist: 05.09.2025)' },
    { date: '11.07.2025', text: 'Mitwirkungsrecht des Bundesrates' },
  ],
}
const brPlenary80 = {
  name: 'Plenarberatungen BR',
  stages: [
    { date: '17.07.2025', text: 'Auf der Tagesordnung der <a href="/gegenstand/BR/BRSITZ/980">980. Sitzung</a>' },
    { date: '17.07.2025', text: '980. Sitzung: Antrag, keinen Einspruch zu erheben, <b>angenommen</b>' },
    { date: '17.07.2025', text: 'Beschluss im Bundesrat <a href="/gegenstand/XXVIII/BNR/48">48/BNR</a>' },
    {
      date: '24.09.2025',
      text: 'Keine Kundmachung des Gesetzesbeschlusses aufgrund eines Formalfehlers sowie Einbringung eines neuen Antrages (416/A) (<a href="/gegenstand/XXVIII/GO/615">615/GO</a>)',
    },
  ],
}
/* XXVII/1435 d.B.: the same procedure up to the Bundesrat's Beschluss, and
 * nothing after it — never promulgated, and the record does not say so. */
const brPlenary1435 = {
  name: 'Plenarberatungen BR',
  stages: [
    { date: '29.06.2022', text: '942. Sitzung: Antrag, keinen Einspruch zu erheben, <b>angenommen</b><br>Einhellig' },
    { date: '29.06.2022', text: 'Beschluss im Bundesrat <a href="/gegenstand/XXVII/BNR/550">550/BNR</a>' },
  ],
}
const nrPlenary80 = {
  name: 'Plenarberatungen NR',
  stages: [{ date: '10.07.2025', text: 'Beschluss im Nationalrat <a href="/gegenstand/XXVIII/BNR/48">48/BNR</a>' }],
}

describe('findBundesratArrival / findBundesratDecisionDate (03.10.2026)', () => {
  it('reads the Bundesrat half of the procedure', () => {
    const phases = [nrPlenary80, brArrival, brPlenary80]
    expect(findBundesratArrival(phases)).toBe('2025-07-11')
    expect(findBundesratDecisionDate(phases)).toBe('2025-07-17')
  })

  it("is null before the Bundesrat has it, and never takes the Nationalrat's stages", () => {
    expect(findBundesratArrival([nrPlenary80])).toBeNull()
    expect(findBundesratDecisionDate([nrPlenary80])).toBeNull()
    expect(findBundesratDecisionDate(null)).toBeNull()
  })
})

describe('findNoPromulgation (03.10.2026)', () => {
  it('reads the stage, the stated cause and the stated successor', () => {
    expect(findNoPromulgation([nrPlenary80, brArrival, brPlenary80], 'XXVIII')).toEqual({
      date: '2025-09-24',
      reason: 'formalfehler',
      successorAntrag: { gp: 'XXVIII', inr: 416, citation: '416/A' },
    })
  })

  it('names no cause and no successor the stage does not name', () => {
    const bare = { name: 'Plenarberatungen BR', stages: [{ date: '01.10.2025', text: 'Keine Kundmachung des Gesetzesbeschlusses' }] }
    expect(findNoPromulgation([bare], 'XXVIII')).toEqual({ date: '2025-10-01', reason: 'unbekannt', successorAntrag: null })
  })

  it('is null where the record says nothing — XXVII/1435 d.B.', () => {
    expect(findNoPromulgation([brArrival, brPlenary1435], 'XXVII')).toBeNull()
    expect(findNoPromulgation(undefined, 'XXVII')).toBeNull()
  })
})

describe('otherBundledDrafts', () => {
  it('lists every other draft, not this one, and nothing that is no draft', () => {
    const pre = [{ gp_code: 'XXVIII', ityp: 'ME', inr: '17' }, { gp_code: 'XXVIII', ityp: 'ME', inr: 18 }, { gp_code: 'XXVIII', ityp: 'A', inr: 5 }, { gp_code: 'XXVII', ityp: 'ME', inr: 17 }]
    expect(otherBundledDrafts(pre, 'XXVIII', 17)).toEqual([{ gp: 'XXVIII', inr: 18 }, { gp: 'XXVII', inr: 17 }])
    expect(otherBundledDrafts(undefined, 'XXVIII', 17)).toEqual([])
  })
})
