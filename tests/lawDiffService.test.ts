import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearNitroCache, nitroCacheKeys, nitroCachedFunction } from './helpers/nitroCache'

/**
 * The § comparison when an upstream read fails
 * (`server/utils/diff/lawDiffService.ts`; the §12.13 rule).
 *
 * Every case below was, until 22.10.2026, a catch whose leftover was cached
 * for a day as a statement about the draft:
 *
 *  - the Kundmachung's lookup timing out → „Dieser Entwurf ist bisher nicht
 *    als Gesetz kundgemacht worden." on the comparison against it;
 *  - the RIS map not loading for a draft Parliament has only as a PDF →
 *    „… und ist im RIS nicht veröffentlicht.";
 *  - the Vorlage's record not arriving → `bundled` unknown, so a Sammelgesetz
 *    was counted whole under no note;
 *  - the draft's own text not arriving where a later pair is cut to it →
 *    „lässt sich im Text nicht trennen".
 *
 * Each now either throws — nothing stored, the next call answers — or, where
 * the failed read was only garnish for the pair asked (the Kundmachung beside
 * draft and Vorlage), goes out without it and is not stored.
 *
 * The parsers, the station resolution and the diff run for real; the fakes
 * are the upstream reads (Parliament's detail JSON, the RIS map, the
 * Kundmachung's record, the documents) and Nitro's cache, as one that keeps
 * (`helpers/nitroCache.ts`). The documents are empty pages: what a failure
 * test reads is which answer comes back and whether it was stored, not what
 * the diff found.
 */

vi.stubGlobal('defineCachedFunction', nitroCachedFunction)

vi.mock('../server/utils/parliament/drafts', () => ({ getGegenstand: vi.fn() }))
vi.mock('../server/utils/ris/begutCorpus', () => ({ getRisMapForGp: vi.fn() }))
vi.mock('../server/utils/ris/bgblService', () => ({ getBgblDocument: vi.fn() }))
vi.mock('../server/utils/upstream/fetchDocument', () => ({ fetchDocument: vi.fn() }))

const { getGegenstand } = vi.mocked(await import('../server/utils/parliament/drafts'))
const { getRisMapForGp } = vi.mocked(await import('../server/utils/ris/begutCorpus'))
const { getBgblDocument } = vi.mocked(await import('../server/utils/ris/bgblService'))
const { fetchDocument } = vi.mocked(await import('../server/utils/upstream/fetchDocument'))
const { getLawDiff } = await import('../server/utils/diff/lawDiffService')

// ---------------------------------------------------------------------------
// 1/ME XXVIII → 10 d.B. → BGBl. I Nr. 5/2026
// ---------------------------------------------------------------------------

const ME_HTML = 'https://www.parlament.gv.at/dokument/XXVIII/ME/1/me.html'
const ME_PDF = 'https://www.parlament.gv.at/dokument/XXVIII/ME/1/me.pdf'
const ME_RIS_XML = 'https://www.ris.bka.gv.at/Dokumente/Begut/BEGUT_X/ENTW.xml'
const RV_HTML = 'https://www.parlament.gv.at/dokument/XXVIII/I/10/rv.html'
const AUSSCHUSS_HTML = 'https://www.parlament.gv.at/dokument/XXVIII/I/10/ausschuss.html'
const BGBL_PAGE = 'https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=BgblAuth&Dokumentnummer=BGBLA_2026_I_5'

const NOT_PROMULGATED = 'Dieser Entwurf ist bisher nicht als Gesetz kundgemacht worden.'
const NOT_IN_RIS = 'Der Gesetzestext des Entwurfs liegt beim Parlament nur als PDF vor und ist im RIS nicht veröffentlicht.'

/** The draft's detail JSON: its own text, the later stations, the link to its Vorlage. */
function meDetail({ pdfOnly = false } = {}) {
  return {
    content: {
      documents: [
        { title: 'Gesetzestext', documents: pdfOnly ? [{ link: ME_PDF, type: 'PDF' }] : [{ link: ME_HTML, type: 'HTML' }, { link: ME_PDF, type: 'PDF' }] },
      ],
      statements: {
        documents: [
          { title: 'Gesetzestext', documents: [{ link: RV_HTML, type: 'HTML' }] },
          { title: 'Geändert im Ausschuss', documents: [{ link: AUSSCHUSS_HTML, type: 'HTML' }] },
        ],
      },
      stages: [{ date: '01.02.2026', text: '<a href="https://www.parlament.gv.at/gegenstand/XXVIII/I/10">10 d.B.</a>' }],
    },
  }
}

/** The Vorlage's detail JSON: its Kundmachung, and the drafts it was built from. */
function rvDetail({ bundled = false } = {}) {
  return {
    content: {
      status: { bgbllinks: [{ title: 'BGBl. I Nr. 5/2026', link: BGBL_PAGE }] },
      preconst: [{ gp_code: 'XXVIII', ityp: 'ME', inr: 1 }, ...(bundled ? [{ gp_code: 'XXVIII', ityp: 'ME', inr: 2 }] : [])],
    },
  }
}

const BGBL_DOCUMENT = {
  id: 'BGBLA_2026_I_5',
  xml: 'https://www.ris.bka.gv.at/Dokumente/BgblAuth/BGBLA_2026_I_5/BGBLA_2026_I_5.xml',
  html: null,
  page: BGBL_PAGE,
  kurztitel: 'Testgesetz',
  datum: '2026-03-01',
}

/** The draft's row in the RIS join: RIS carries its text as XML. */
const RIS_MAP = { rows: [{ inr: 1, risId: 'BEGUT_X', risUrl: 'https://www.ris.bka.gv.at/r', risDocument: { html: null, xml: ME_RIS_XML, pdf: null } }] }

const timeout = () => Promise.reject(new Error('The operation was aborted due to timeout'))

/** What Parliament answers per item, swapped per test. */
let me = meDetail()
let rv = rvDetail()
let rvFails = false
/** Documents that do not arrive. */
const unreachable = new Set<string>()

beforeEach(() => {
  clearNitroCache()
  me = meDetail()
  rv = rvDetail()
  rvFails = false
  unreachable.clear()
  getGegenstand.mockImplementation((async (_gp: string, ityp: string) => {
    if (ityp === 'ME') return me
    if (rvFails) throw new Error('Parlament: fetch failed')
    return rv
  }) as never)
  getRisMapForGp.mockResolvedValue(RIS_MAP as never)
  getBgblDocument.mockResolvedValue(BGBL_DOCUMENT)
  fetchDocument.mockImplementation(async (url: string) => {
    if (unreachable.has(url)) throw new Error(`timeout: ${url}`)
    return '<html><body></body></html>'
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

const stored = () => nitroCacheKeys().filter((k) => k.startsWith('law-diff:'))
const stationIds = (diff: Awaited<ReturnType<typeof getLawDiff>>) => diff.stations.map((s) => s.id)

describe('the Kundmachung does not arrive', () => {
  it('rv→bgbl: the comparison against it throws — never „bisher nicht kundgemacht"', async () => {
    getBgblDocument.mockImplementation(timeout)
    await expect(getLawDiff('XXVIII', 1, 'rv', 'bgbl')).rejects.toThrow('timeout')
    expect(stored()).toEqual([])

    getBgblDocument.mockResolvedValue(BGBL_DOCUMENT)
    const after = await getLawDiff('XXVIII', 1, 'rv', 'bgbl')
    expect(after.unavailableReason).not.toBe(NOT_PROMULGATED)
    expect(after.toDocument?.url).toBe(BGBL_PAGE)
    expect(stationIds(after)).toContain('bgbl')
  })

  it('me→rv: the comparison goes out without the station, and is not stored', async () => {
    getBgblDocument.mockImplementation(timeout)
    const during = await getLawDiff('XXVIII', 1, 'me', 'rv')
    expect(during.fromDocument?.url).toBe(ME_HTML)
    expect(during.toDocument?.url).toBe(RV_HTML)
    expect(stationIds(during)).not.toContain('bgbl')
    expect(stored()).toEqual([])

    getBgblDocument.mockResolvedValue(BGBL_DOCUMENT)
    const after = await getLawDiff('XXVIII', 1, 'me', 'rv')
    expect(stationIds(after)).toEqual(['me', 'rv', 'ausschuss', 'bgbl'])
    expect(stored()).toEqual(['law-diff:XXVIII-1-me-rv'])
  })

  it('a Vorlage without a Kundmachung is an answer, and it is kept', async () => {
    rv = { content: { ...rvDetail().content, status: { bgbllinks: [] } } }
    const first = await getLawDiff('XXVIII', 1, 'rv', 'bgbl')
    expect(first.unavailableReason).toBe(NOT_PROMULGATED)
    expect(stored()).toEqual(['law-diff:XXVIII-1-rv-bgbl'])
    await getLawDiff('XXVIII', 1, 'rv', 'bgbl')
    expect(getGegenstand).toHaveBeenCalledTimes(2) // ME and RV once, not twice
  })
})

describe('the RIS map does not load, for a draft Parliament has only as a PDF', () => {
  it('throws — never „im RIS nicht veröffentlicht" — and the next call reads the RIS text', async () => {
    me = meDetail({ pdfOnly: true })
    getRisMapForGp.mockImplementation(timeout)
    await expect(getLawDiff('XXVIII', 1, 'me', 'rv')).rejects.toThrow('timeout')
    expect(stored()).toEqual([])

    getRisMapForGp.mockResolvedValue(RIS_MAP as never)
    const after = await getLawDiff('XXVIII', 1, 'me', 'rv')
    expect(after.unavailableReason).not.toBe(NOT_IN_RIS)
    expect(after.fromDocument).toEqual({ label: 'Ministerialentwurf, Gesetzestext (RIS)', url: 'https://www.ris.bka.gv.at/r' })
    expect(after.fromSource).toBe('ris')
  })
})

describe('the Vorlage\'s record does not arrive', () => {
  it('throws instead of comparing with `bundled` unknown, and the next call reads the bundling', async () => {
    rv = rvDetail({ bundled: true })
    rvFails = true
    await expect(getLawDiff('XXVIII', 1, 'rv', 'ausschuss')).rejects.toThrow('Parlament')
    expect(stored()).toEqual([])

    rvFails = false
    const after = await getLawDiff('XXVIII', 1, 'rv', 'ausschuss')
    expect(after.bundledWithOtherDrafts).toBe(true)
    expect(after.otherDrafts).toEqual([{ gp: 'XXVIII', inr: 2 }])
  })
})

describe('the draft\'s own text does not arrive, where a later pair is cut to it', () => {
  it('throws instead of comparing the whole Sammelgesetz as „nicht trennbar"', async () => {
    rv = rvDetail({ bundled: true })
    unreachable.add(ME_HTML)
    await expect(getLawDiff('XXVIII', 1, 'rv', 'ausschuss')).rejects.toThrow('timeout')
    expect(stored()).toEqual([])

    unreachable.clear()
    await getLawDiff('XXVIII', 1, 'rv', 'ausschuss')
    expect(fetchDocument).toHaveBeenCalledWith(ME_HTML)
    expect(stored()).toEqual(['law-diff:XXVIII-1-rv-ausschuss'])
  })
})
