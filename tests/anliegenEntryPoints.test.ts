import { describe, expect, it } from 'vitest'
import { VOLKSBEGEHREN_FIRST_GP, volksbegehrenOfVorlage } from '../server/utils/parliament/anliegen'
import { pageKindOf } from '../server/utils/parliament/vorlageDetailAssembly'
import { anliegenPath } from '../shared/utils/anliegen'
import { NOT_FOLLOWED_DE, notFollowedOf, notFollowedVolksbegehrenDe } from '../app/utils/notFollowed'

/**
 * The doors into the Anliegen an das Parlament that are not pages of their
 * own (step 4 of `docs/research/umsetzungsplan-petitionen-volksbegehren.md`):
 * the old address of a Volksbegehren, and the refusal text that named what
 * the monitor follows.
 */
describe('the old address of a Volksbegehren, /entwuerfe/<gp>/vorlage/<nr>', () => {
  it('stays without a Vorlage page of its own (`pageKindOf`)', () => {
    expect(pageKindOf('I', 'VOLKBG')).toBeNull()
  })

  it('leads to its Anliegen page from GP XXII on', () => {
    const vb = volksbegehrenOfVorlage('XXVIII', 'I', 98, 'VOLKBG')
    expect(vb).toEqual({ root: { gp: 'XXVIII', kind: 'volksbegehren', inr: 98 }, followed: true })
    expect(anliegenPath(vb!.root)).toBe('/anliegen/XXVIII/volksbegehren/98')
    expect(volksbegehrenOfVorlage(VOLKSBEGEHREN_FIRST_GP, 'I', 1, ' VOLKBG ')?.followed).toBe(true)
  })

  it('is refused before GP XXII, with the first period followed', () => {
    expect(volksbegehrenOfVorlage('XXI', 'I', 1, 'VOLKBG')).toEqual({ root: { gp: 'XXI', kind: 'volksbegehren', inr: 1 }, followed: false })
    expect(volksbegehrenOfVorlage('XX', 'I', 12, 'VOLKBG')?.followed).toBe(false)
  })

  it('touches nothing that is no Volksbegehren: the document type decides, never the type I alone', () => {
    expect(volksbegehrenOfVorlage('XXVIII', 'I', 98, 'RV')).toBeNull()
    expect(volksbegehrenOfVorlage('XXVIII', 'I', 98, 'EBR')).toBeNull()
    expect(volksbegehrenOfVorlage('XXVIII', 'I', 98, null)).toBeNull()
    expect(volksbegehrenOfVorlage('XXVIII', 'A', 98, 'VOLKBG')).toBeNull()
  })
})

describe('the refusal of an item the monitor does not follow', () => {
  it('leads to an Anliegen page as it leads to a draft’s, and nowhere else', () => {
    const page = { statusCode: 404, data: { parliamentUrl: 'https://www.parlament.gv.at/gegenstand/XXVIII/I/98', followedAt: '/anliegen/XXVIII/volksbegehren/98' } }
    expect(notFollowedOf(page)?.followedAt).toBe('/anliegen/XXVIII/volksbegehren/98')
    expect(notFollowedOf({ data: { followedAt: '/anliegenx/XXVIII/volksbegehren/98' } })).toBeNull()
    expect(notFollowedOf({ data: { followedAt: '//evil.example/anliegen/XXVIII/volksbegehren/98' } })).toBeNull()
  })

  it('carries the first period of an Anliegen it does not follow, only as a period', () => {
    const api = { statusCode: 404, data: { statusCode: 404, data: { parliamentUrl: 'https://www.parlament.gv.at/gegenstand/XXI/I/1', followedAt: null, anliegenFrom: 'XXII' } } }
    expect(notFollowedOf(api)).toEqual({ parliamentUrl: 'https://www.parlament.gv.at/gegenstand/XXI/I/1', followedAt: null, anliegenFrom: 'XXII' })
    const bad = { data: { parliamentUrl: 'https://www.parlament.gv.at/gegenstand/XXI/I/1', followedAt: null, anliegenFrom: '<b>XXII</b>' } }
    expect(notFollowedOf(bad)).toEqual({ parliamentUrl: 'https://www.parlament.gv.at/gegenstand/XXI/I/1', followedAt: null })
  })

  it('no longer lists Petitionen, Bürgerinitiativen and Volksbegehren as not followed', () => {
    expect(NOT_FOLLOWED_DE.text).toMatch(/folgt .*Petitionen, Bürgerinitiativen und Volksbegehren im Nationalrat und Petitionen an den Bundesrat als Anliegen an das Parlament\./)
    expect(NOT_FOLLOWED_DE.anliegenLink.href).toBe('/anliegen')
  })

  it('says for an old Volksbegehren from when the monitor follows them, and why not before', () => {
    const text = notFollowedVolksbegehrenDe('XXII')
    expect(text).toContain('ab der XXII. Gesetzgebungsperiode')
    expect(text).toMatch(/zu lückenhaft/)
  })
})
