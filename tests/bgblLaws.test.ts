import { describe, expect, it } from 'vitest'
import { bgblParts, lawsOfRefs, repealedOfRefs } from '../server/utils/ris/bgblLaws'

/** A RIS `OgdDocumentReference`, reduced to the fields `lawsOfRefs` reads. */
const ref = (gesetzesnummer: string, kurztitel: string, organ: string, ausserkraft?: string) => ({
  Data: { Metadaten: { Bundesrecht: { Kurztitel: kurztitel, BrKons: { Gesetzesnummer: gesetzesnummer, Kundmachungsorgan: organ, StammnormPublikationsorgan: organ.split(/(?<=Nr\.)/)[0], StammnormBgblnummer: organ.match(/Nr\.\s*(\d+\/\d{4})/)?.[1], Ausserkrafttretensdatum: ausserkraft } } } },
})

describe('bgblParts', () => {
  it('reads Teil and number from either upstream form', () => {
    expect(bgblParts('Bundesgesetzblatt I Nr. 69/2026')).toEqual({ teil: 'I', nummer: '69/2026' })
    expect(bgblParts('BGBl. II Nr. 410/2024')).toEqual({ teil: 'II', nummer: '410/2024' })
    expect(bgblParts('dRGBl. S. 219/1897')).toBeNull()
  })
})

describe('lawsOfRefs — the laws a BGBl changed', () => {
  // As RIS answered for Kundmachungsorgannummer=69/2026 on 21.10.2026.
  const refs = [
    ref('20011782', 'Sterbeverfügungsgesetz', 'BGBl. I Nr. 242/2021 zuletzt geändert durch BGBl. I Nr. 69/2026 '),
    ref('20011782', 'Sterbeverfügungsgesetz', 'BGBl. I Nr. 242/2021 zuletzt geändert durch BGBl. I Nr. 69/2026 '),
    ref('20013129', 'Verwendung der Mittel der Gesundheitsreformfonds', 'BGBl. II Nr. 69/2026'),
  ]

  it('keeps the Teil it was asked for and drops the namesake in another Teil', () => {
    expect(lawsOfRefs(refs, 'I', '69/2026')).toEqual([{
      title: 'Sterbeverfügungsgesetz',
      gesetzesnummer: '20011782',
      url: 'https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=20011782',
      stammnorm: 'BGBl. I Nr. 242/2021',
    }])
  })

  it('does not take a longer number for this one', () => {
    expect(lawsOfRefs([ref('1', 'A', 'BGBl. I Nr. 169/2026')], 'I', '69/2026')).toEqual([])
    expect(lawsOfRefs([ref('1', 'A', 'BGBl. I Nr. 69/20261')], 'I', '69/2026')).toEqual([])
  })

  it('links a law of which the BGBl repealed parts, not one it repealed whole', () => {
    const partly = [
      ref('10008253', 'Behinderteneinstellungsgesetz', 'BGBl. Nr. 22/1970 zuletzt geändert durch BGBl. I Nr. 50/2025 '),
      ref('10008253', 'Behinderteneinstellungsgesetz', 'BGBl. Nr. 22/1970 aufgehoben durch BGBl. I Nr. 50/2025 '),
      ref('9', 'Weggefallenes Gesetz', 'BGBl. Nr. 1/1990 aufgehoben durch BGBl. I Nr. 50/2025 '),
    ]
    expect(lawsOfRefs(partly, 'I', '50/2025').map((l) => l.title)).toEqual(['Behinderteneinstellungsgesetz'])
  })

  it('sorts by title as a German reader expects', () => {
    const many = [
      ref('3', 'Ärztegesetz 1998', 'BGBl. I Nr. 50/2025'),
      ref('2', 'Arbeitsmarktservicegesetz', 'BGBl. I Nr. 50/2025'),
      ref('1', 'Bundesabgabenordnung', 'BGBl. I Nr. 50/2025'),
    ]
    expect(lawsOfRefs(many, 'I', '50/2025').map((l) => l.title)).toEqual(['Arbeitsmarktservicegesetz', 'Ärztegesetz 1998', 'Bundesabgabenordnung'])
  })
})

/**
 * Two things an empty list used to hide (22.10.2026), both read from RIS's
 * own answers of that day: the search for BGBl. I Nr. 131/2022, which
 * repealed the COVID-19-Impfpflichtgesetz and amended the Epidemiegesetz,
 * and the one for BGBl. I Nr. 4/2022, which created the
 * Impfpflichtgesetz.
 */
describe('repealedOfRefs — what a BGBl repealed whole', () => {
  const nr131 = [
    ref('20011811', 'COVID-19-Impfpflichtgesetz', 'BGBl. I Nr. 4/2022 aufgehoben durch BGBl. I Nr. 131/2022 ', '2022-07-28'),
    ref('20011814', 'COVID-19-Impfpflichtverordnung', 'BGBl. II Nr. 52/2022 aufgehoben durch BGBl. I Nr. 131/2022 ', '2022-07-28'),
    ref('10010265', 'Epidemiegesetz 1950', 'BGBl. Nr. 186/1950 zuletzt geändert durch BGBl. I Nr. 131/2022 ', '2022-12-06'),
    ref('20011865', 'Anpassungen der in Bundesgesetzen festgesetzten Beträge', 'BGBl. II Nr. 131/2022', '2023-03-31'),
  ]

  it('names the laws it repealed, of either Teil, and links the one it amended', () => {
    expect(repealedOfRefs(nr131, 'I', '131/2022')).toEqual([
      { title: 'COVID-19-Impfpflichtgesetz', gesetzesnummer: '20011811', stammnorm: 'BGBl. I Nr. 4/2022' },
      { title: 'COVID-19-Impfpflichtverordnung', gesetzesnummer: '20011814', stammnorm: 'BGBl. II Nr. 52/2022' },
    ])
    expect(lawsOfRefs(nr131, 'I', '131/2022').map((l) => l.title)).toEqual(['Epidemiegesetz 1950'])
  })

  it('tells a BGBl that only repealed from one RIS has not consolidated yet', () => {
    // Both used to be the same empty list — and the station said
    // „noch nicht eingearbeitet" about a law that is gone, every day anew.
    const only = nr131.slice(0, 2)
    expect(lawsOfRefs(only, 'I', '131/2022')).toEqual([])
    expect(repealedOfRefs(only, 'I', '131/2022')).toHaveLength(2)
    expect(repealedOfRefs([], 'I', '131/2022')).toEqual([])
  })

  it('does not credit a BGBl with the repeal of the law it created', () => {
    const nr4 = [ref('20011811', 'COVID-19-Impfpflichtgesetz', 'BGBl. I Nr. 4/2022 aufgehoben durch BGBl. I Nr. 131/2022 ', '2022-07-28')]
    expect(repealedOfRefs(nr4, 'I', '4/2022')).toEqual([])
  })
})

describe('lawsOfRefs — a law no longer in force', () => {
  const today = { today: '2026-10-22', complete: true }
  const nr4 = [
    ref('20011811', 'COVID-19-Impfpflichtgesetz', 'BGBl. I Nr. 4/2022', '2022-03-17'),
    ref('20011811', 'COVID-19-Impfpflichtgesetz', 'BGBl. I Nr. 4/2022 zuletzt geändert durch BGBl. I Nr. 22/2022 ', '2022-04-10'),
    ref('20011811', 'COVID-19-Impfpflichtgesetz', 'BGBl. I Nr. 4/2022 aufgehoben durch BGBl. I Nr. 131/2022 ', '2022-07-28'),
    ref('20011805', 'Rentenanpassung', 'BGBl. II Nr. 4/2022', '2022-12-31'),
  ]

  it('says when a law this BGBl created stopped being in force', () => {
    // Listed as „Geltende Fassung" until then, though BGBl. I Nr. 131/2022
    // repealed it — every version named this BGBl, none of them was a repeal
    // BY it, and none had been in force since 28.07.2022.
    const [law] = lawsOfRefs(nr4, 'I', '4/2022', today)
    expect(law).toMatchObject({ title: 'COVID-19-Impfpflichtgesetz', inKraftBis: '2022-07-28' })
  })

  it('claims nothing where the search could not see every version', () => {
    expect(lawsOfRefs(nr4, 'I', '4/2022', { ...today, complete: false })[0]?.inKraftBis).toBeUndefined()
    expect(lawsOfRefs(nr4, 'I', '4/2022')[0]?.inKraftBis).toBeUndefined()
  })

  it('claims nothing for a law it only amended, or one still in force', () => {
    // The later Fassungen of an amended law do not name this BGBl: that all
    // versions naming it ended says nothing about the law.
    const amended = [ref('10010265', 'Epidemiegesetz 1950', 'BGBl. Nr. 186/1950 zuletzt geändert durch BGBl. I Nr. 131/2022 ', '2022-12-06')]
    expect(lawsOfRefs(amended, 'I', '131/2022', today)[0]?.inKraftBis).toBeUndefined()
    const standing = [...nr4.slice(0, 2), ref('20011811', 'COVID-19-Impfpflichtgesetz', 'BGBl. I Nr. 4/2022 zuletzt geändert durch BGBl. I Nr. 22/2022 ')]
    expect(lawsOfRefs(standing, 'I', '4/2022', today)[0]?.inKraftBis).toBeUndefined()
  })
})
