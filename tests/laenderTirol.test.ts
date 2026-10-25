import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isTirolDocumentUrl, parseTirolList, parseTirolRecord, parseTirolVoSearch, tirolDocumentUrl, tirolFilingEmail, tirolRecordUrl, tirolVoOf } from '../server/utils/laender/tirol'
import { LandSourceError } from '../server/utils/laender/gate'

const fixture = (name: string) => readFileSync(new URL(`./fixtures/laender/${name}`, import.meta.url), 'utf8')
const LIST = fixture('tirol-liste-2026-10-23.html')
const BEGUTACHTUNG = fixture('tirol-landtag-2026-722-2026-10-23.html')
const VORLAGE = fixture('tirol-landtag-2026-573-2026-10-23.html')
const KUNDGEMACHT = fixture('tirol-landtag-2026-135-2026-10-23.html')

describe('Tirol — the list, as served on 23.10.2026', () => {
  it('reads every entry with its Landtag number, Fassung and Frist', () => {
    const drafts = parseTirolList(LIST)
    expect(drafts).toHaveLength(10)
    expect(drafts[0]).toMatchObject({
      id: 't-2026-734',
      title: 'Gesetz, mit dem das Tiroler Pflanzenschutzmittelgesetz 2012 geändert wird',
      startedAt: '2026-10-08',
      deadline: '2026-11-05',
      url: 'https://lte.tirol.gv.at/public/ggs/risLink.xhtml?gn=734&gj=2026',
    })
    expect(tirolFilingEmail(LIST)).toBe('verfassungsdienst@tirol.gv.at')
  })

  it('refuses a page that is not the list', () => {
    expect(() => parseTirolList('<html><h1>Wartung</h1></html>')).toThrow(LandSourceError)
  })
})

describe('Tirol — the Landtag\'s record of one Gegenstand', () => {
  const url = (n: string) => tirolRecordUrl('2026', n)

  it('in Begutachtung: the draft\'s documents, no station yet', () => {
    const r = parseTirolRecord(BEGUTACHTUNG, url('722'))
    expect(r.gz).toBe('722/2026')
    expect(r.stage).toBeNull()
    expect(r.documents.map((d) => d.title)).toEqual(['Entwurf', 'Erläuterungen', 'Textgegenüberstellung', 'Leicht Lesen'])
    expect(r.documents[2]!.url).toBe(tirolDocumentUrl(url('722'), 'Begutachtungsentwurf/Textgegenüberstellung'))
    expect(isTirolDocumentUrl(r.documents[2]!.url)).toBe(true)
  })

  it('as a Vorlage: its committees, and the Stellungnahmen by their submitters', () => {
    const r = parseTirolRecord(VORLAGE, url('573'))
    expect(r.stage).toMatchObject({ station: 'rv', date: '2026-09-29' })
    expect(r.statements.map((s) => s.name)).toEqual(['AK Tirol', 'Bundesministerium für Bildung', 'Tiroler Gemeindeverband'])
    expect(r.landtag?.committee).toBe('Ausschuss für Wohnen, Raumordnung, Rechts- und Gemeindeangelegenheiten')
  })

  it('kundgemacht: every station from the Land\'s own record, the plenary sitting once', () => {
    const r = parseTirolRecord(KUNDGEMACHT, url('135'))
    expect(r.stage).toEqual({ station: 'bgbl', label: 'Kundgemacht', detail: 'LGBl. Nr. 39/2026', date: '2026-05-22', url: 'https://www.ris.bka.gv.at/eli/lgbl/TI/2026/39' })
    expect(r.procedure.filter((s) => s.station).map((s) => [s.station, s.date])).toEqual([
      ['rv', '2026-04-22'],
      ['parlament', '2026-05-20'],
      ['bgbl', '2026-05-22'],
    ])
    expect(r.procedure.filter((s) => /29\. Sitzung der 18\. Periode/.test(s.label))).toHaveLength(1)
    expect(r.landtag?.decision).toEqual({ date: '2026-05-20', vote: null })
    expect(r.statements).toHaveLength(16)
  })

  it('refuses a page without its Geschäftszahl', () => {
    expect(() => parseTirolRecord('<div id="contentwrapper"></div>', url('1'))).toThrow(LandSourceError)
  })
})

describe('Tirol — Verordnungen from the IFG-Informationsregister (24.10.2026)', () => {
  const dataset = (over: Record<string, unknown> = {}) => ({
    id: 'cecc1dab0a0a805aec901b31be976527',
    title: { de: 'GSDG-Durchführungsverordnung, Begutachtungsverfahren' },
    keywords: [{ id: 'ifg' }, { id: 'verordnungsbegutachtungen-tirol' }],
    contact_point: [{ name: 'Amt der Tiroler Landesregierung - Abteilung Gesundheitsrecht und Krankenanstalten', email: 'mailto:gesundheitsrecht.krankenanstalten@tirol.gv.at' }],
    catalog_record: { issued: '2026-10-21T08:57:06Z' },
    distributions: [
      { title: { de: 'Begutachtungsschreiben extern' }, access_url: ['https://dokumente.tirol.gv.at/get/aaa'] },
      { title: { de: 'Stellungnahme AK Tirol' }, access_url: ['https://dokumente.tirol.gv.at/get/bbb'] },
      { title: { de: 'Stellungnahme Bundeskanzleramt zur Änderung der Verordnung' }, access_url: ['https://dokumente.tirol.gv.at/get/ccc'] },
    ],
    ...over,
  })

  it('reads a draft of the Landesregierung: no Frist, the day it entered the register, its office', () => {
    const vo = tirolVoOf(dataset())!
    expect(vo.draft).toMatchObject({
      id: 't-vcecc1dab0a0a805aec901b31be976527',
      kind: 'verordnung',
      title: 'GSDG-Durchführungsverordnung',
      startedAt: '2026-10-21',
      deadline: null,
      fristUnknown: true,
      url: 'https://www.data.gv.at/katalog/datasets/cecc1dab0a0a805aec901b31be976527',
    })
    expect(vo.draft.documents.map((d) => d.title)).toEqual(['Begutachtungsschreiben extern'])
    expect(vo.statements.map((s) => s.name)).toEqual(['AK Tirol', 'Bundeskanzleramt'])
    expect(vo.email).toBe('gesundheitsrecht.krankenanstalten@tirol.gv.at')
  })

  it('leaves out a Bezirkshauptmannschaft\'s traffic ordinance and an untagged dataset', () => {
    expect(tirolVoOf(dataset({ contact_point: [{ name: 'Bezirkshauptmannschaft Landeck' }] }))).toBeNull()
    expect(tirolVoOf(dataset({ keywords: [{ id: 'ifg' }] }))).toBeNull()
  })

  it('refuses an answer that is no result list', () => {
    expect(() => parseTirolVoSearch({ error: 'down' })).toThrow(LandSourceError)
  })
})
