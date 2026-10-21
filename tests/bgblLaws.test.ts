import { describe, expect, it } from 'vitest'
import { bgblParts, lawsOfRefs } from '../server/utils/ris/bgblLaws'

/** A RIS `OgdDocumentReference`, reduced to the fields `lawsOfRefs` reads. */
const ref = (gesetzesnummer: string, kurztitel: string, organ: string) => ({
  Data: { Metadaten: { Bundesrecht: { Kurztitel: kurztitel, BrKons: { Gesetzesnummer: gesetzesnummer, Kundmachungsorgan: organ, StammnormPublikationsorgan: organ.split(/(?<=Nr\.)/)[0], StammnormBgblnummer: organ.match(/Nr\.\s*(\d+\/\d{4})/)?.[1] } } } },
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
