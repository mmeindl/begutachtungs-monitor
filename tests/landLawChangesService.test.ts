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

const { konsRefsOfLgbl, konsParagraphHistory } = vi.mocked(await import('../server/utils/laender/landKonsLaws'))
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

describe('compareLandLawChanges — RIS’s two versions of one § are one unit (20.11.2026)', () => {
  beforeEach(() => {
    XML['novelle2.xml'] = '<risdok><nutzdaten><absatz typ="novao1">1. § 66a lautet: „§ 66a …“</absatz><absatz typ="novao1">2. § 29 entfällt.</absatz></nutzdaten></risdok>'
    XML['66a-old.xml'] = '<risdok><nutzdaten><ueberschrift typ="para" ct="text">Schriftverkehr</ueberschrift><absatz typ="abs" ct="text">Der im Zusammenhang mit der Funktionsausübung stehende Schriftverkehr hat nach Maßgabe der technischen Möglichkeiten elektronisch zu erfolgen.</absatz></nutzdaten></risdok>'
    XML['66a-new.xml'] = '<risdok><nutzdaten><ueberschrift typ="para" ct="text">Elektronische Kommunikation</ueberschrift><absatz typ="abs" ct="text">(1) Die Ausübung der zustehenden Rechte und die Übermittlung von Einladungen erfolgen elektronisch.</absatz><absatz typ="abs" ct="text">(2) Auf Verlangen ist schriftlich zuzustellen.</absatz></nutzdaten></risdok>'
    XML['29-old.xml'] = '<risdok><nutzdaten><absatz typ="abs" ct="text">(1) Die Vorsitzenden erhalten eine angemessene Entschädigung.</absatz></nutzdaten></risdok>'
    XML['29-new.xml'] = '<risdok><nutzdaten><absatz typ="abs" ct="text">Entfallen</absatz></nutzdaten></risdok>'
  })

  it('compares a § reworded beyond likeness, or recorded as „Entfallen“, with its own earlier wording — never „neu“ beside „entfallen“', async () => {
    const version = (para: string, xml: string, from: string, to: string | null, organ: string) => {
      const r = ref(para, xml, from)
      Object.assign(r.Data.Metadaten.Landesrecht.LrKons, { Kundmachungsorgan: organ, StammnormBgblnummer: '91/1990', Ausserkrafttretensdatum: to })
      return r
    }
    const new66a = version('§ 66a', '66a-new.xml', '2026-09-01', null, 'LGBl. Nr. 91/1990 zuletzt geändert durch LGBl. Nr. 56/2026')
    const old66a = version('§ 66a', '66a-old.xml', '2020-01-01', '2026-08-31', 'LGBl. Nr. 91/1990 zuletzt geändert durch LGBl. Nr. 3/2020')
    const new29 = version('§ 29', '29-new.xml', '2026-09-01', null, 'LGBl. Nr. 91/1990 zuletzt geändert durch LGBl. Nr. 56/2026')
    const old29 = version('§ 29', '29-old.xml', '2020-01-01', '2026-08-31', 'LGBl. Nr. 91/1990 zuletzt geändert durch LGBl. Nr. 3/2020')
    konsRefsOfLgbl.mockResolvedValue({ refs: [new66a, new29], complete: true })
    konsParagraphHistory.mockImplementation(async (_land, _nr, key) => (key === '§66a' ? [old66a, new66a] : [old29, new29]))
    const { value } = await compareLandLawChanges('ooe', 'LGBl. Nr. 56/2026', 'novelle2.xml', null, '2026-08-20')
    expect(value.units.map((u) => [u.id, u.fromId, u.change])).toEqual([['§29', '§29', 'changed'], ['§66a', '§66a', 'changed']])
    expect(value.withheld).toEqual([])
  })

  it('reads a change made only in the heading as a change, never „unverändert“ (Oö. LGBl. Nr. 53/2017 § 8, 21.11.2026)', async () => {
    XML['8-old.xml'] = '<risdok><nutzdaten><ueberschrift typ="para" ct="text">§ 8</ueberschrift><absatz typ="abs" ct="text">Von der Anwendung ist ausgenommen.</absatz></nutzdaten></risdok>'
    XML['8-new.xml'] = '<risdok><nutzdaten><ueberschrift typ="para" ct="text">§ 8<br />Ausnahmen</ueberschrift><absatz typ="abs" ct="text">Von der Anwendung ist ausgenommen.</absatz></nutzdaten></risdok>'
    XML['novelle3.xml'] = '<risdok><nutzdaten><absatz typ="novao1">1. Die Überschrift zu § 8 lautet: „Ausnahmen“</absatz></nutzdaten></risdok>'
    const version = (xml: string, from: string, to: string | null, organ: string) => {
      const r = ref('§ 8', xml, from)
      Object.assign(r.Data.Metadaten.Landesrecht.LrKons, { Kundmachungsorgan: organ, StammnormBgblnummer: '36/1979', Ausserkrafttretensdatum: to })
      return r
    }
    const neu = version('8-new.xml', '2017-07-01', null, 'LGBl. Nr. 36/1979 zuletzt geändert durch LGBl. Nr. 53/2017')
    const old = version('8-old.xml', '2010-01-01', '2017-06-30', 'LGBl. Nr. 36/1979 zuletzt geändert durch LGBl. Nr. 1/2010')
    konsRefsOfLgbl.mockResolvedValue({ refs: [neu], complete: true })
    konsParagraphHistory.mockResolvedValue([old, neu])
    const { value } = await compareLandLawChanges('ooe', 'LGBl. Nr. 53/2017', 'novelle3.xml', null, '2017-06-20')
    expect(value.units.map((u) => [u.id, u.heading, u.change])).toEqual([['§8', 'Ausnahmen', 'changed']])
    expect(value.units[0]!.segments?.filter((s) => s.type === 'inserted').map((s) => s.text.trim())).toEqual(['Ausnahmen'])
  })
})

describe('compareLandLawChanges — a Landesgesetzblatt RIS has not consolidated (20.11.2026)', () => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

  it('says „noch nicht eingearbeitet“ within the window the list says it for, and keeps nothing', async () => {
    konsRefsOfLgbl.mockResolvedValue({ refs: [], complete: true })
    const { value, complete } = await compareLandLawChanges('ktn', 'LGBl. Nr. 67/2026', 'lgbl.xml', null, daysAgo(31))
    expect(value.available).toBe(false)
    expect(value.unavailableReason).toMatch(/^Im RIS noch nicht eingearbeitet: /)
    expect(complete).toBe(false)
  })

  it('says „Nicht veröffentlicht“ only after it, and holds that', async () => {
    konsRefsOfLgbl.mockResolvedValue({ refs: [], complete: true })
    const { value, complete } = await compareLandLawChanges('ktn', 'LGBl. Nr. 67/2026', 'lgbl.xml', null, daysAgo(61))
    expect(value.unavailableReason).toMatch(/^Nicht veröffentlicht: /)
    expect(complete).toBe(true)
  })
})

describe('compareLandLawChanges — a Landesgesetzblatt RIS has not consolidated (20.11.2026)', () => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

  it('says „noch nicht eingearbeitet“ within the window the list says it for, and keeps nothing', async () => {
    konsRefsOfLgbl.mockResolvedValue({ refs: [], complete: true })
    const { value, complete } = await compareLandLawChanges('ktn', 'LGBl. Nr. 67/2026', 'lgbl.xml', null, daysAgo(31))
    expect(value.available).toBe(false)
    expect(value.unavailableReason).toMatch(/^Im RIS noch nicht eingearbeitet: /)
    expect(complete).toBe(false)
  })

  it('says „Nicht veröffentlicht“ only after it, and holds that', async () => {
    konsRefsOfLgbl.mockResolvedValue({ refs: [], complete: true })
    const { value, complete } = await compareLandLawChanges('ktn', 'LGBl. Nr. 67/2026', 'lgbl.xml', null, daysAgo(61))
    expect(value.unavailableReason).toMatch(/^Nicht veröffentlicht: /)
    expect(complete).toBe(true)
  })
})

describe('compareLandLawChanges — a law no instruction could be matched to (20.11.2026)', () => {
  it('names its §§ as such, never as §§ an instruction names', async () => {
    // A Novelle of a law LGBl. Nr. 12/2001 enacted, whose Landesgesetzblatt yields no instruction the monitor reads.
    const amended = ref('§ 3', 'p1.xml', '2026-07-01')
    Object.assign(amended.Data.Metadaten.Landesrecht.LrKons, { Kundmachungsorgan: 'LGBl. Nr. 12/2001 zuletzt geändert durch LGBl. Nr. 56/2026', StammnormBgblnummer: '12/2001' })
    konsRefsOfLgbl.mockResolvedValue({ refs: [amended], complete: true })
    const { value } = await compareLandLawChanges('ooe', 'LGBl. Nr. 56/2026', 'lgbl.xml', null, '2026-06-30')
    expect(value.withheld).toEqual([{ law: LAW, id: '§3', reason: 'lawUnmatched' }])
    expect(konsParagraphHistory).not.toHaveBeenCalled()
  })
})

describe('compareLandLawChanges — Artikel titled with their number alone (22.11.2026)', () => {
  it('finds each Artikel’s law in its promulgation clause, never withholds its §§ as unmatched (Wien LGBl. Nr. 42/2019)', async () => {
    XML['wien42.xml'] = '<risdok><nutzdaten>' +
      '<ueberschrift typ="art" halign="c">Artikel I</ueberschrift><absatz typ="promkleinlsatz" halign="j">Die Dienstordnung 1994, LGBl. Nr. 56, zuletzt geändert durch das Gesetz LGBl. Nr. 10/2019, wird wie folgt geändert:</absatz>' +
      '<absatz typ="novao2" halign="j">1. In § 15 Abs. 5 wird nach dem Ausdruck <n>„IV K,“</n> der Ausdruck <n>„IV P,“</n> eingefügt.</absatz>' +
      '<ueberschrift typ="art" halign="c">Artikel II</ueberschrift><absatz typ="promkleinlsatz" halign="j">Die Besoldungsordnung 1994, LGBl. Nr. 55, zuletzt geändert durch das Gesetz LGBl. Nr. 20/2019, wird wie folgt geändert:</absatz>' +
      '<absatz typ="novao2" halign="j">1. In § 2 wird nach dem Ausdruck <n>„Schema II K,“</n> der Ausdruck <n>„das Schema II P,“</n> eingefügt.</absatz>' +
      '</nutzdaten></risdok>'
    const amended = (law: string, para: string, stammnorm: string) => {
      const r = ref(para, 'p1.xml', '2019-08-01')
      r.Data.Metadaten.Landesrecht.Kurztitel = law
      Object.assign(r.Data.Metadaten.Landesrecht.LrKons, { Kundmachungsorgan: `LGBl. Nr. ${stammnorm} zuletzt geändert durch LGBl. Nr. 42/2019`, StammnormBgblnummer: stammnorm, Gesetzesnummer: stammnorm })
      return r
    }
    konsRefsOfLgbl.mockResolvedValue({ refs: [amended('Dienstordnung 1994', '§ 15', '56/1994'), amended('Besoldungsordnung 1994', '§ 2', '55/1994')], complete: true })
    konsParagraphHistory.mockResolvedValue([])
    const { value } = await compareLandLawChanges('w', 'LGBl. Nr. 42/2019', 'wien42.xml', null, '2019-07-24')
    expect(value.withheld.filter((w) => w.reason === 'lawUnmatched')).toEqual([])
    expect(konsParagraphHistory.mock.calls.map((c) => c.slice(1)).sort()).toEqual([['55/1994', '§2'], ['56/1994', '§15']])
  })
})

describe('compareLandLawChanges — a § the Landesgesetzblatt repeals (20.11.2026)', () => {
  beforeEach(() => {
    XML['novelle.xml'] = '<risdok><nutzdaten><absatz typ="novao1">1. § 2 entfällt.</absatz></nutzdaten></risdok>'
  })

  it('names a repealed § whose history holds no earlier version, never drops it uncounted', async () => {
    // RIS's record of the repeal, from the day it takes effect, of a law LGBl. Nr. 12/2001 enacted.
    const repeal = ref('§ 2', 'p2.xml', '2026-07-01')
    Object.assign(repeal.Data.Metadaten.Landesrecht.LrKons, { Kundmachungsorgan: 'LGBl. Nr. 12/2001 aufgehoben durch LGBl. Nr. 56/2026', StammnormBgblnummer: '12/2001' })
    konsRefsOfLgbl.mockResolvedValue({ refs: [repeal], complete: true })
    // The §'s history holds that record alone: no earlier version to pair it with (`pairOf` → „new").
    konsParagraphHistory.mockResolvedValue([repeal])
    const { value } = await compareLandLawChanges('ooe', 'LGBl. Nr. 56/2026', 'novelle.xml', null, '2026-06-30')
    expect(value.withheld).toEqual([{ law: LAW, id: '§2', reason: 'unpaired' }])
  })
})
