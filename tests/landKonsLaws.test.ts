/**
 * The geltende Fassung of a Landesgesetz's laws (`landKonsLaws.ts`):
 * only records that name THIS Landesgesetzblatt, in either spelling RIS uses.
 */
import { describe, expect, it } from 'vitest'
import { landLawsOfRefs, landRepealedOfRefs, lgblNummer } from '../server/utils/laender/landKonsLaws'

const ref = (title: string, organ: string, nr: string, extra: Record<string, string> = {}) => ({
  Data: { Metadaten: { Landesrecht: { Kurztitel: title, LrKons: { Kundmachungsorgan: organ, Gesetzesnummer: nr, StammnormPublikationsorgan: 'LGBl Nr', StammnormBgblnummer: extra.stamm ?? '32/2015', GesamteRechtsvorschriftUrl: `https://ogd.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=LrSbg&Gesetzesnummer=${nr}`, ...extra } } } },
})

describe('landLawsOfRefs', () => {
  it('links the laws whose records name this Landesgesetzblatt, and only those', () => {
    const refs = [
      ref('Salzburger Kinder- und Jugendhilfegesetz', 'LGBl Nr 32/2015 zuletzt geändert durch LGBl Nr 94/2026 ', '20000949'),
      ref('Anderes Gesetz', 'LGBl Nr 1/2000 zuletzt geändert durch LGBl Nr 194/2026', '1'),
      ref('Parteienförderung', 'LGBl.Nr. 79/1981 zuletzt geändert durch LGBl.Nr. 94/2026', '2'),
    ]
    expect(landLawsOfRefs('sbg', refs, '94/2026').map((l) => [l.title, l.url])).toEqual([
      ['Parteienförderung', 'https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=LrSbg&Gesetzesnummer=2'],
      ['Salzburger Kinder- und Jugendhilfegesetz', 'https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=LrSbg&Gesetzesnummer=20000949'],
    ])
    expect(landLawsOfRefs('sbg', refs, '94/2026')[1]!.stammnorm).toBe('LGBl. Nr. 32/2015')
  })

  it('names a law repealed whole under „Aufgehoben", not as a geltende Fassung', () => {
    const refs = [ref('Altes Gesetz', 'LGBl Nr 5/1990 aufgehoben durch LGBl Nr 20/2024', '9')]
    expect(landLawsOfRefs('sbg', refs, '20/2024')).toEqual([])
    expect(landRepealedOfRefs(refs, '20/2024').map((l) => l.title)).toEqual(['Altes Gesetz'])
  })

  it('reads the number off the citation', () => {
    expect(lgblNummer('LGBl. Nr. 94/2026')).toBe('94/2026')
  })
})
