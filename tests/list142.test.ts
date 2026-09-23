import { describe, expect, it } from 'vitest'
import {
  mapStatementRow,
  pickStatementDocument,
  statementPageUrl,
} from '../server/utils/parliament/list142'

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
