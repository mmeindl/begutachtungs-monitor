import { describe, expect, it } from 'vitest'
import { pickStatementDocument, statementPageUrl } from '../server/utils/mappers'

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
