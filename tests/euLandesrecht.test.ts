import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { bundesrechtHits } from '../server/utils/eu/bundesrecht'
import { landesrechtHits, landesrechtSearchParams, type LrKonsSearchAnswer } from '../server/utils/eu/landesrecht'

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/eu/${name}`, import.meta.url), 'utf8')) as LrKonsSearchAnswer

describe('D4 for the Länder: LrKons', () => {
  it('asks the Land\'s consolidated law with its own flag, as of a day', () => {
    expect(landesrechtSearchParams('2006/123/EG', '2026-11-04', 'ooe')).toEqual({
      Applikation: 'LrKons',
      Bundesland_SucheInOberoesterreich: 'true',
      Suchworte: '"2006/123/EG"',
      'Fassung.FassungVom': '2026-11-04',
      DokumenteProSeite: 'OneHundred',
    })
    expect(Object.keys(landesrechtSearchParams('2006/123/EG', '2026-11-04', 'ktn'))).toContain('Bundesland_SucheInKaernten')
  })

  it('reads the hits of a real answer, where the Bund\'s reader keeps none', () => {
    const answer = fixture('lrkons-wien-2006-123.json')
    expect(landesrechtHits(answer)).toEqual({
      total: 6,
      hits: [
        { nor: 'LWI40003714', kurztitel: 'Unterweisung in Wintersportarten', xmlUrl: 'https://ogd.ris.bka.gv.at/Dokumente/Landesnormen/LWI40003714/LWI40003714.xml' },
        { nor: 'LWI40014561', kurztitel: 'Wiener Dienstleistungsgesetz', xmlUrl: 'https://ogd.ris.bka.gv.at/Dokumente/Landesnormen/LWI40014561/LWI40014561.xml' },
      ],
    })
    expect(bundesrechtHits(answer as never).hits).toEqual([])
  })

  it('leaves out an Art.-15a-Vereinbarung', () => {
    const answer = fixture('lrkons-wien-2006-123.json')
    const refs = answer.OgdSearchResult!.OgdDocumentResults!.OgdDocumentReference as { Data: { Metadaten: { Landesrecht: { LrKons: { Typ: string } } } } }[]
    refs[0]!.Data.Metadaten.Landesrecht.LrKons.Typ = 'Vereinbarung'
    expect(landesrechtHits(answer).hits.map((h) => h.nor)).toEqual(['LWI40014561'])
  })
})
