import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { bundesrechtHits } from '../server/utils/eu/bundesrecht'
import { headDocumentTransposes, landesrechtHits, landesrechtSearchParams, lgblKey, type LrKonsSearchAnswer } from '../server/utils/eu/landesrecht'

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
        { nor: 'LWI40003714', kurztitel: 'Unterweisung in Wintersportarten', xmlUrl: 'https://ogd.ris.bka.gv.at/Dokumente/Landesnormen/LWI40003714/LWI40003714.xml', head: false },
        { nor: 'LWI40014561', kurztitel: 'Wiener Dienstleistungsgesetz', xmlUrl: 'https://ogd.ris.bka.gv.at/Dokumente/Landesnormen/LWI40014561/LWI40014561.xml', head: false },
      ],
    })
    expect(bundesrechtHits(answer as never).hits).toEqual([])
  })

  it('marks a law\'s head document („§ 0")', () => {
    const answer = fixture('lrkons-wien-2006-123.json')
    const refs = answer.OgdSearchResult!.OgdDocumentResults!.OgdDocumentReference as { Data: { Metadaten: { Landesrecht: { LrKons: { ArtikelParagraphAnlage: string } } } } }[]
    refs[1]!.Data.Metadaten.Landesrecht.LrKons.ArtikelParagraphAnlage = '§ 0'
    expect(landesrechtHits(answer).hits.map((h) => h.head)).toEqual([false, true])
  })

  it('reads a head document by its Novellen: never the draft\'s own, never a later year', () => {
    // The Oö. Gleichbehandlungsgesetz 2021's § 0 as RIS serves it (LOO40022802, 04.11.2026), shortened.
    const head = 'Kurztitel Oö. Gleichbehandlungsgesetz 2021 Typ LG §/Artikel/Anlage § 0 Umsetzungshinweis Über die bei den jeweiligen Landesgesetzblättern angeführten Richtlinien hinaus setzt dieser Landesrechtsakt in der geltenden Fassung weiters folgende Richtlinie(n) um: CELEX-Nr. 32021L1883 Langtitel Landesgesetz über die Gleichbehandlung StF: LGBl.Nr. 76/2021 (GP XXVIII RV 1606/2021) Änderung LGBl.Nr. 47/2023 (GP XXIX RV 523/2023; RL (EU) 2019/1158 [CELEX-Nr. 32019L1158]) LGBl.Nr. 57/2026 (GP XXIX RV 1390/2026; RL 2000/43/EG [CELEX-Nr. 32000L0043]; RL (EU) 2023/970 [CELEX-Nr. 32023L0970]) Präambel/Promulgationsklausel'
    expect(headDocumentTransposes(head, '32019L1158', '2026-05-20', '57/2026')).toBe(true)
    expect(headDocumentTransposes(head, '32021L1883', '2026-05-20', '57/2026')).toBe(true)
    expect(headDocumentTransposes(head, '32023L0970', '2026-05-20', '57/2026')).toBe(false)
    expect(headDocumentTransposes(head, '32023L0970', '2025-05-20', null)).toBe(false)
    expect(lgblKey('LGBl. Nr. 57/2026')).toBe('57/2026')
    // The Oö. Antidiskriminierungsgesetz's StF names its directives without a CELEX.
    const adg = 'Umsetzungshinweis … CELEX-Nr. 32021L1883 Langtitel StF: LGBl.Nr. 50/2005 (GP XXVI RV 225/2004; RL 2000/43/EG vom 29. Juni 2000, ABl.Nr. L 180) Änderung LGBl.Nr. 136/2006'
    expect(headDocumentTransposes(adg, '32000L0043', '2026-05-20', '57/2026', '2000/43/EG')).toBe(true)
    expect(headDocumentTransposes(adg, '32000L0043', '2026-05-20', '57/2026')).toBe(false)
    expect(headDocumentTransposes(adg, '32000L0078', '2026-05-20', '57/2026', '2000/78/EG')).toBe(false)
  })

  it('leaves out an Art.-15a-Vereinbarung', () => {
    const answer = fixture('lrkons-wien-2006-123.json')
    const refs = answer.OgdSearchResult!.OgdDocumentResults!.OgdDocumentReference as { Data: { Metadaten: { Landesrecht: { LrKons: { Typ: string } } } } }[]
    refs[0]!.Data.Metadaten.Landesrecht.LrKons.Typ = 'Vereinbarung'
    expect(landesrechtHits(answer).hits.map((h) => h.nor)).toEqual(['LWI40014561'])
  })
})
