import { describe, expect, it } from 'vitest'
import {
  mapStatementRow,
  mapStoredStatementRow,
  pickStatementDocument,
  recheckStoredStatement,
  servedStatement,
  statementPageUrl,
  statementRowMatchesParent,
  type StoredStatement,
} from '../server/utils/parliament/list142'
import { classifySubmitter } from '../server/utils/parliament/privacy'
import { ORG_ALLOWLIST } from '../server/utils/parliament/orgAllowlist'

// Real list-142 row (sample from 2026-08-15, 237/SN-126/ME); the submitter
// is a private person, so the name here is synthetic and the shape is not.
const LIST142_PERSON_ROW = [
  'XXVIII', 'SNME', 4983, null, '07.07.2026', '2026-07-07T12:00:00',
  '<a href="/gegenstand/XXVIII/SNME/4983/" target="_blank">Musteriadis, Ioannis (237/SN-126/ME)</a>',
  'XXVIII', '126', 'ME', '00000020260707', '20260707000000', 0,
  'Art:\nStellungnahme zu Ministerialentwurf\n<br />\nKürzel:\nSNME\n<br />\n',
  null, '237/SN-126/ME', '126/ME', '<a href="/gegenstand/XXVIII/SNME/4983?x=1">Link</a>',
  '/gegenstand/XXVIII/ME/126', 'P', 34842785, 237, '1',
]

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
    row[19] = 'I' // upstream's TYP flag: an institution filed this
    expect(mapStatementRow(row)).toEqual({
      citation: '300/SN-126/ME',
      date: '2026-07-07',
      submitterKind: 'organisation',
      submitterName: 'Vegane Gesellschaft Österreich',
      endorsements: 12,
      parliamentUrl: 'https://www.parlament.gv.at/gegenstand/XXVIII/SNME/5000',
    })
  })

  /* The GDPR half of the row: column 19 is upstream's own organisation/person
   * flag and it can only ever suppress a name. A real case from the corpus
   * comparison of 2026-09-16 — the naming segment is a company, the person
   * stands behind it (name synthetic here), and only the flag sees them. */
  it('lets the TYP flag suppress a name the string alone would publish', () => {
    const row = [...LIST142_PERSON_ROW]
    row[6] =
      '<a href="/gegenstand/XXVIII/SNME/4983/">Windland Energieerzeugungs GmbH; Max Mustermann (237/SN-126/ME)</a>'

    row[19] = 'I'
    expect(mapStatementRow(row).submitterKind).toBe('organisation')

    row[19] = 'P'
    expect(mapStatementRow(row)).toMatchObject({ submitterKind: 'person', submitterName: null })
  })

  it('maps a Stellungnahme on a Regierungsvorlage (item type SN, bare citation)', () => {
    // Real row, 2238 d.B. XXVII (2026-09-15): type SN, citation without the
    // "-95/ME" tail, page under /SN/.
    const row = [
      'XXVII', 'SN', 277139, null, '19.12.2023', '2023-12-19T12:00:00',
      '<a href="/gegenstand/XXVII/SN/277139/" target="_blank">Forum Informationsfreiheit (277139/SN)</a>',
      'XXVII', '2238', 'I', '00000420231219', '20231219000004', 4,
      'Art:\nStellungnahme\n<br />\nKürzel:\nSN\n<br />\n',
      null, '277139/SN', '2238/I', null, '/gegenstand/XXVII/I/2238', 'I', 11233010, 277139, '1',
    ]
    expect(mapStatementRow(row)).toEqual({
      citation: '277139/SN',
      date: '2023-12-19',
      submitterKind: 'organisation',
      submitterName: 'Forum Informationsfreiheit',
      endorsements: 4,
      parliamentUrl: 'https://www.parlament.gv.at/gegenstand/XXVII/SN/277139',
    })
  })

  it('files the three institutions of 313 d.B. as organisations', () => {
    // Real rows, list 142 for XXVIII 313/I (read 2026-09-27): all 21 carry
    // `I` in column 19, and these three were counted as "Privatperson" —
    // 18 + 3 on the panel where upstream says 21 + 0.
    const rv313 = (sn: number, date: string, submitter: string) => [
      'XXVIII', 'SN', sn, null, date.split('-').reverse().join('.'), `${date}T12:00:00`,
      `<a href="/gegenstand/XXVIII/SN/${sn}/" target="_blank">${submitter} (${sn}/SN)</a>`,
      'XXVIII', '313', 'I', `000000${date.replaceAll('-', '')}`, `${date.replaceAll('-', '')}000000`, 0,
      'Art:\nStellungnahme zu Gesetzesinitiativen und sonstigen Gegenständen\n<br />\nKürzel:\nSN\n<br />\n',
      null, `${sn}/SN`, '313/I', null, '/gegenstand/XXVIII/I/313', 'I', 27825448, sn, '1',
    ]
    for (const [row, name] of [
      [rv313(872, '2025-12-02', 'Energie-Control ; Recht'), 'Energie-Control; Recht'],
      [rv313(813, '2025-11-28', 'Österreichs E-Wirtschaft; Energiepolitik & Strategie'), 'Österreichs E-Wirtschaft; Energiepolitik & Strategie'],
      [rv313(882, '2025-12-02', 'Parlamentarisches Datenschutzkomitee'), 'Parlamentarisches Datenschutzkomitee'],
    ] as const) {
      expect(mapStatementRow([...row]), name).toMatchObject({ submitterKind: 'organisation', submitterName: name })
    }
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

/* The guard on a filtered list-142 response. It reads the parent's path in
 * column 18 AND the three dimensions the request actually filters by —
 * columns 7/8/9, `BEZUG_GP_CODE`/`BEZUG_INR`/`BEZUG_ITYP`. Column 0 is the
 * Gesetzgebungsperiode of the Stellungnahme itself and says nothing about
 * the filter. */
describe('statementRowMatchesParent', () => {
  it('accepts a row of the parent that was asked for', () => {
    expect(statementRowMatchesParent(LIST142_PERSON_ROW, 'XXVIII', 'ME', 126)).toBe(true)
  })

  it('rejects a row of another parent', () => {
    expect(statementRowMatchesParent(LIST142_PERSON_ROW, 'XXVIII', 'ME', 127)).toBe(false)
    expect(statementRowMatchesParent(LIST142_PERSON_ROW, 'XXVII', 'ME', 126)).toBe(false)
    expect(statementRowMatchesParent(LIST142_PERSON_ROW, 'XXVIII', 'I', 126)).toBe(false)
  })

  /* The filter keys themselves have to name the parent too — the path is one
   * reading of the filter, these are the other. Populated on 100 % of the
   * 6.828 saved rows of GP XXVIII (read 23.09.2026). */
  it('reads the three BEZUG columns, not only the link', () => {
    for (const [index, wrong] of [[7, 'XXVII'], [8, '127'], [9, 'I']] as const) {
      const row = [...LIST142_PERSON_ROW]
      row[index] = wrong
      expect(statementRowMatchesParent(row, 'XXVIII', 'ME', 126)).toBe(false)
    }
    // The number arrives as a string today; a numeric column is the same fact.
    const numeric = [...LIST142_PERSON_ROW]
    numeric[8] = 126
    expect(statementRowMatchesParent(numeric, 'XXVIII', 'ME', 126)).toBe(true)
  })

  /* A row whose link says one parent and whose dimensions say another is not
   * a row this code can classify — and a guard that picked a winner would be
   * choosing which of two upstream columns to believe. */
  it('treats a disagreement between the two readings as a failed filter', () => {
    const row = [...LIST142_PERSON_ROW]
    row[18] = '/gegenstand/XXVIII/ME/127'
    expect(statementRowMatchesParent(row, 'XXVIII', 'ME', 126)).toBe(false)
    expect(statementRowMatchesParent(row, 'XXVIII', 'ME', 127)).toBe(false)
  })

  /* THE PRODUCTION 502 (verified live 23.09.2026): a Stellungnahme filed
   * after the next period convened carries the NEW period in column 0 while
   * belonging to a draft of the old one. XXVII 351/ME took 3 such rows and
   * 352/ME 4, after GP XXVIII convened on 24.10.2024, and the old check —
   * `row[0] === gp` — refused them, so the endpoint answered 502 and the
   * detail page degraded with no last-good record it could ever have
   * written. Synthetic row, column 6 is not a real submitter. */
  it('accepts a statement filed after the next Gesetzgebungsperiode convened', () => {
    const row = [
      'XXVIII', 'SNME', 90001, null, '06.11.2024', '2024-11-06T12:00:00',
      '<a href="/gegenstand/XXVIII/SNME/90001/">Muster GmbH (12/SN-351/ME)</a>',
      'XXVII', '351', 'ME', '00000020241106', '20241106000000', 0,
      'Art:\nStellungnahme zu Ministerialentwurf\n<br />\n',
      null, '12/SN-351/ME', '351/ME', null, '/gegenstand/XXVII/ME/351', 'I', 34842786, 12, '1',
    ]
    expect(row[0]).toBe('XXVIII')
    expect(statementRowMatchesParent(row, 'XXVII', 'ME', 351)).toBe(true)
  })

  it('tolerates a trailing slash and refuses a missing column', () => {
    const withSlash = [...LIST142_PERSON_ROW]
    withSlash[18] = '/gegenstand/XXVIII/ME/126/'
    expect(statementRowMatchesParent(withSlash, 'XXVIII', 'ME', 126)).toBe(true)

    const without = [...LIST142_PERSON_ROW]
    without[18] = null
    expect(statementRowMatchesParent(without, 'XXVIII', 'ME', 126)).toBe(false)
    expect(statementRowMatchesParent([], 'XXVIII', 'ME', 126)).toBe(false)
  })
})

const PAGE = statementPageUrl('XXVII', 'SNME', 81457)

describe('pickStatementDocument', () => {
  it('finds the uploaded PDF on a Ministerialentwurf Stellungnahme', () => {
    // 51/SN-95/ME (Presseclub Concordia), detail JSON of 2026-09-15.
    const groups = [
      {
        title: 'Stellungnahme zu Entwurf (elektr. übermittelte Version)',
        documents: [{ link: '/dokument/XXVII/SNME/81457/imfname_942193.pdf', type: 'PDF' }],
      },
    ]
    expect(pickStatementDocument(groups, PAGE)).toEqual({
      kind: 'pdf',
      url: 'https://www.parlament.gv.at/dokument/XXVII/SNME/81457/imfname_942193.pdf',
    })
  })

  it('accepts the extension-less s3 links of Regierungsvorlage Stellungnahmen', () => {
    // 277139/SN on 2238 d.B.: type says PDF, the path does not.
    const groups = [
      { title: 'Stellungnahme', documents: [{ link: '/PtWeb/api/s3serv/file/72332170-5868-40cf-9309-b3d05527b6e9', type: 'PDF' }] },
    ]
    expect(pickStatementDocument(groups, PAGE).url).toBe(
      'https://www.parlament.gv.at/PtWeb/api/s3serv/file/72332170-5868-40cf-9309-b3d05527b6e9',
    )
  })

  it('skips a PDF link off the upstream allowlist — the page stands in', () => {
    const groups = [
      {
        title: 'Stellungnahme',
        documents: [
          { link: 'http://127.0.0.1:3000/internal.pdf', type: 'PDF' },
          { link: '/dokument/XXVII/SNME/81457/imfname_942193.pdf', type: 'PDF' },
        ],
      },
    ]
    expect(pickStatementDocument(groups, PAGE).url).toBe(
      'https://www.parlament.gv.at/dokument/XXVII/SNME/81457/imfname_942193.pdf',
    )
    expect(pickStatementDocument([{ title: 'x', documents: [{ link: 'https://evil.example/a.pdf', type: 'PDF' }] }], PAGE)).toEqual({
      kind: 'page',
      url: PAGE,
    })
  })

  it('falls back to the page for web-form submissions and odd payloads', () => {
    expect(pickStatementDocument([], PAGE)).toEqual({ kind: 'page', url: PAGE })
    expect(pickStatementDocument(null, PAGE)).toEqual({ kind: 'page', url: PAGE })
    expect(pickStatementDocument([{ title: 'x', documents: [{ link: '/a.html', type: 'HTML' }] }], PAGE).kind).toBe('page')
    expect(pickStatementDocument([{ title: 'x', documents: [{ link: null, type: 'PDF' }] }], PAGE).kind).toBe('page')
  })

  it('builds the page URL for both item types', () => {
    expect(statementPageUrl('XXVII', 'SN', 277139)).toBe('https://www.parlament.gv.at/gegenstand/XXVII/SN/277139')
  })
})

/* The same GDPR path for a row the last-good store kept (22.10.2026). A
 * record outlives the classifier that wrote it — the local records of
 * 18.09.2026 still carried 289 names three tightenings had stopped — so
 * every name is held against TODAY's classifier on the way out.
 *
 * The invariant: a stored name is served only where today's classifier
 * prints exactly that name — for the name itself under the stored flag, or
 * for an allowlist entry under it. Every name here is synthetic. */
describe('recheckStoredStatement', () => {
  const stored = (submitterName: string | null, over: Partial<StoredStatement> = {}): StoredStatement => ({
    citation: '12/SN-88/ME',
    date: '2026-09-18',
    submitterKind: 'organisation',
    submitterName,
    endorsements: 3,
    parliamentUrl: 'https://www.parlament.gv.at/gegenstand/XXVIII/SNME/12',
    ...over,
  })

  it('serves a name today\'s classifier prints exactly as stored', () => {
    expect(recheckStoredStatement(stored('Arbeiterkammer Musterstadt'))).toEqual(servedStatement(stored('Arbeiterkammer Musterstadt')))
    expect(recheckStoredStatement(stored('Musterverband für Musterwesen; Abteilung Recht', { upstreamFlag: 'I' })).submitterName)
      .toBe('Musterverband für Musterwesen; Abteilung Recht')
  })

  /* The shapes the classifier stopped publishing after 18.09.2026, each as
   * an older one stored it. The row stays — date, citation, Zustimmungen and
   * the link are public — and only the name goes. */
  it('withholds a name today\'s classifier no longer publishes, and keeps the row', () => {
    for (const name of [
      'Muster, Max; Universität Musterstadt', // a person in front of an affiliation
      'Musterverein Musterstadt; Obmann Max Muster', // a function before a name
      'Musterverein Musterstadt*Obmann*Max Muster', // the separator of GP XXVI
      'Muster GmbH; Mag. Max Muster', // the person behind the organisation's head
      'Max Muster e.U.', // the sole trader
    ]) {
      expect(recheckStoredStatement(stored(name)), name).toEqual({
        ...servedStatement(stored(name)),
        submitterKind: 'person',
        submitterName: null,
      })
    }
  })

  /* Shortening a stale name to what today's rules print from it would
   * publish a cut nobody classified: the raw string it came from is gone. */
  it('does not shorten a stale name to today\'s print of it', () => {
    expect(classifySubmitter('Muster GmbH; Mag. Max Muster').name).toBe('Muster GmbH')
    expect(recheckStoredStatement(stored('Muster GmbH; Mag. Max Muster')).submitterName).toBeNull()
  })

  it('applies the veto of the stored TYP flag, and the string rules alone without one', () => {
    expect(recheckStoredStatement(stored('Muster Energie GmbH', { upstreamFlag: 'P' })).submitterName).toBeNull()
    expect(recheckStoredStatement(stored('Muster Energie GmbH', { upstreamFlag: 'I' })).submitterName).toBe('Muster Energie GmbH')
    expect(recheckStoredStatement(stored('Muster Energie GmbH')).submitterName).toBe('Muster Energie GmbH')
    // Anything but the two documented values is no flag, as in the mapper.
    expect(recheckStoredStatement(stored('Muster Energie GmbH', { upstreamFlag: 'X' as never })).submitterName).toBe('Muster Energie GmbH')
  })

  /* An allowlist display name is printed for another string than itself,
   * and where the staff filed privately the flag vetoes it once it stands
   * alone — the case the allowlist outranks the flag for. Both are real
   * entries of `ORG_ALLOWLIST`, both organisations. */
  it('keeps an allowlist display name where today\'s classifier prints it under that flag', () => {
    expect(classifySubmitter('Österreichische Patentanwaltskammer', 'P').kind).toBe('person')
    expect(recheckStoredStatement(stored('Österreichische Patentanwaltskammer', { upstreamFlag: 'P' })).submitterName)
      .toBe('Österreichische Patentanwaltskammer')
    expect(classifySubmitter('TU Wien, Studienkommission Raumplanung').kind).toBe('person')
    expect(recheckStoredStatement(stored('TU Wien, Studienkommission Raumplanung')).submitterName)
      .toBe('TU Wien, Studienkommission Raumplanung')
  })

  it('never serves a name from a person\'s or a non-public row, whatever the record says', () => {
    expect(recheckStoredStatement(stored('Muster, Max', { submitterKind: 'person' }))).toMatchObject({ submitterKind: 'person', submitterName: null })
    expect(recheckStoredStatement(stored('Musterverein', { submitterKind: 'nonpublic' }))).toMatchObject({ submitterKind: 'nonpublic', submitterName: null })
    expect(recheckStoredStatement(stored(null))).toMatchObject({ submitterKind: 'person', submitterName: null })
  })

  it('serves the six fields of the API and nothing stored beside them', () => {
    const row = recheckStoredStatement({ ...stored('Arbeiterkammer Musterstadt', { upstreamFlag: 'I' }), extra: 'x' } as StoredStatement)
    expect(Object.keys(row).sort()).toEqual(['citation', 'date', 'endorsements', 'parliamentUrl', 'submitterKind', 'submitterName'])
  })

  /* The invariant, over every shape above plus every allowlist entry under
   * every flag and a run of mutations of each. */
  it('serves a stored name only where today\'s classifier prints exactly that name', () => {
    const names = [
      'Arbeiterkammer Musterstadt', 'Muster Energie GmbH', 'Muster GmbH; Mag. Max Muster', 'Max Muster e.U.',
      'Muster, Max; Universität Musterstadt', 'Musterverein Musterstadt*Obmann*Max Muster', 'Muster, Max',
      ...[...ORG_ALLOWLIST].flatMap(([key, display]) => [key, display ?? key]),
    ]
    const variants = names.flatMap((n) => [n, `${n}; Mag. Max Muster`, `Muster, Max; ${n}`, n.toUpperCase(), `${n} (1010 Wien)`])
    const allowlistPrints = (flag: 'I' | 'P' | null) =>
      new Set([...ORG_ALLOWLIST.keys()].map((k) => classifySubmitter(k, flag)).filter((v) => v.kind === 'organisation').map((v) => v.name))
    for (const flag of ['I', 'P', null] as const) {
      const viaAllowlist = allowlistPrints(flag)
      for (const name of variants) {
        const served = recheckStoredStatement(stored(name, { upstreamFlag: flag })).submitterName
        if (served === null) continue
        expect(served).toBe(name)
        const verdict = classifySubmitter(name, flag)
        expect(verdict.name === name || viaAllowlist.has(name), `${flag} ${name}`).toBe(true)
      }
    }
  })

  /* The other direction, which the invariant alone does not hold: a row
   * mapped by today's classifier must come back unchanged, or the fallback
   * shows organisations as „Privatperson" that the live page names. Through
   * the mapper, with each shape under each flag. */
  it('changes nothing in a row today\'s classifier stored', () => {
    const submitters = [
      'Vegane Gesellschaft Musterland', 'Musterverband für Musterwesen ; Abteilung Recht',
      'Musterverband für Musterwesen; Mag. Max Muster', 'Muster GmbH; Mag. Max Muster', 'Muster, Max',
      'Nicht-öffentliche Stellungnahme', 'Patentanwaltskammer, Österr.', '(TU Wien), Studienkommission Raumplanung',
      'Vier Pfoten; Stiftung für Tierschutz', 'epicenter.works',
    ]
    for (const typ of ['I', 'P', null]) {
      for (const submitter of submitters) {
        const row = [...LIST142_PERSON_ROW]
        row[6] = `<a href="/gegenstand/XXVIII/SNME/4983/">${submitter} (237/SN-126/ME)</a>`
        row[19] = typ
        const kept = mapStoredStatementRow(row)
        expect(recheckStoredStatement(kept), `${typ} ${submitter}`).toEqual(mapStatementRow(row))
      }
    }
  })
})

describe('mapStoredStatementRow', () => {
  it('keeps the TYP flag beside an organisation\'s name, and nowhere else', () => {
    const org = [...LIST142_PERSON_ROW]
    org[6] = '<a href="/gegenstand/XXVIII/SNME/4983/">Vegane Gesellschaft Musterland (237/SN-126/ME)</a>'
    org[19] = 'I'
    expect(mapStoredStatementRow(org)).toEqual({ ...mapStatementRow(org), upstreamFlag: 'I' })
    expect(mapStoredStatementRow(LIST142_PERSON_ROW)).toEqual(mapStatementRow(LIST142_PERSON_ROW))
    expect('upstreamFlag' in mapStoredStatementRow(LIST142_PERSON_ROW)).toBe(false)
  })
})
