/**
 * What a Landesgesetz changed, assembled from RIS (`landLawChangesService.ts`):
 * every § RIS ties to the Landesgesetzblatt is shown or named, never dropped.
 * RIS is mocked; the rules (`landLawChanges.ts`) and the comparison run as
 * they are.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nitroCachedFunction } from './helpers/nitroCache'

vi.stubGlobal('defineCachedFunction', nitroCachedFunction)
vi.mock('../server/utils/laender/landKonsLaws', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../server/utils/laender/landKonsLaws')>()),
  konsRefsOfLgbl: vi.fn(),
  konsParagraphHistory: vi.fn(),
}))
vi.mock('../server/utils/upstream/fetch', () => ({ upstreamText: vi.fn() }))

const { konsRefsOfLgbl } = vi.mocked(await import('../server/utils/laender/landKonsLaws'))
const { upstreamText } = vi.mocked(await import('../server/utils/upstream/fetch'))
const { compareLandLawChanges } = await import('../server/utils/laender/landLawChangesService')

const LAW = 'Oö. Beispielgesetz 2026'
/** One record of RIS's consolidated Landesrecht, as its search answers: a § of the law LGBl. Nr. 56/2026 enacts. */
const ref = (para: string, xml: string, from = '2026-07-01') => ({
  Data: {
    Metadaten: { Landesrecht: { Kurztitel: LAW, LrKons: { ArtikelParagraphAnlage: para, Gesetzesnummer: '20001234', Inkrafttretensdatum: from, Kundmachungsorgan: 'LGBl. Nr. 56/2026', StammnormBgblnummer: '56/2026' } } },
    Dokumentliste: { ContentReference: { Urls: { ContentUrl: [{ Url: xml }] } } },
  },
})
const XML: Record<string, string> = {
  'lgbl.xml': '<risdok><nutzdaten><abschnitt><ueberschrift typ="para">§ 1<br />Ziel</ueberschrift><absatz typ="abs">(1) Text.</absatz></abschnitt></nutzdaten></risdok>',
  'p1.xml': '<risdok><nutzdaten><ueberschrift typ="para" ct="text">Ziel</ueberschrift><absatz typ="abs" ct="text">(1) Dieses Gesetz regelt das Beispiel.</absatz></nutzdaten></risdok>',
  // A § whose XML holds no text block the reader takes.
  'p2.xml': '<risdok><nutzdaten><ueberschrift typ="para" ct="text">Tarif</ueberschrift></nutzdaten></risdok>',
}

beforeEach(() => {
  vi.clearAllMocks()
  upstreamText.mockImplementation(async (url: string) => XML[url] ?? '')
})

describe('compareLandLawChanges — a law the Landesgesetzblatt enacts anew (19.11.2026)', () => {
  it('names a § whose RIS text it cannot read, never drops it uncounted', async () => {
    konsRefsOfLgbl.mockResolvedValue({ refs: [ref('§ 1', 'p1.xml'), ref('§ 2', 'p2.xml')], complete: true })
    const { value } = await compareLandLawChanges('ooe', 'LGBl. Nr. 56/2026', 'lgbl.xml', null, '2026-06-30')
    expect(value.units.map((u) => [u.id, u.change])).toEqual([['§1', 'inserted']])
    expect(value.withheld).toEqual([{ law: LAW, id: '§2', reason: 'enactedUnread' }])
  })

  it('names a § RIS holds in two versions as one of a new law, not as one an instruction names', async () => {
    konsRefsOfLgbl.mockResolvedValue({ refs: [ref('§ 1', 'p1.xml'), ref('§ 1', 'p1.xml', '2027-01-01')], complete: true })
    const { value } = await compareLandLawChanges('ooe', 'LGBl. Nr. 56/2026', 'lgbl.xml', null, '2026-06-30')
    expect(value.withheld).toEqual([{ law: LAW, id: '§1', reason: 'enactedUnread' }])
  })
})
