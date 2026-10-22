import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RisConsultationDetail, RisMapRow } from '../shared/types'
import { draftArticle, risConsultation } from './helpers/builders'
import { clearNitroCache, nitroCacheKeys, nitroCachedFunction } from './helpers/nitroCache'

/**
 * The Erläuterungen when the draft's own text does not arrive
 * (`server/utils/explanations/explanationsService.ts`, `articlesOf`; the
 * §12.13 rule).
 *
 * The draft's Artikel are only the key that places the Besonderer Teil's
 * passages at their Paragraph — the section must not fall for them, so their
 * failure is caught. Until 22.10.2026 it was caught into an EMPTY list, which
 * the join reads as „a draft without Artikel": every passage went out under
 * `law: null`, while the Beilage keys its rows by the Artikel wherever the
 * draft names one. On a draft amending one law that lost every passage at
 * its §§ — and kept `paragraphsAtAnnex` true, so the general part pointed
 * down to passages that were not there. And the answer was cached for a day.
 *
 * Now unknown Artikel give no passages and an answer that is served once and
 * not stored: the general part stands, the page says the rest is in the
 * document, and the next request reads the draft again.
 */

vi.stubGlobal('defineCachedFunction', nitroCachedFunction)

vi.mock('../server/utils/ris/begutCorpus', () => ({ getRisMapForGp: vi.fn() }))
vi.mock('../server/utils/ris/konsLaw', () => ({ getText: vi.fn() }))
vi.mock('../server/utils/ris/risOnly', () => ({ getRisConsultation: vi.fn() }))
vi.mock('../server/utils/annex/annexSource', () => ({ hasAnnexDocument: vi.fn(async () => true) }))
vi.mock('../server/utils/lawtext/draftArticlesService', () => ({
  getDraftArticles: vi.fn(),
  draftArticlesOfXml: vi.fn(),
}))

const { getRisMapForGp } = vi.mocked(await import('../server/utils/ris/begutCorpus'))
const { getText } = vi.mocked(await import('../server/utils/ris/konsLaw'))
const { getRisConsultation } = vi.mocked(await import('../server/utils/ris/risOnly'))
const { draftArticlesOfXml, getDraftArticles } = vi.mocked(await import('../server/utils/lawtext/draftArticlesService'))
const { getExplanations, getRisExplanations } = await import('../server/utils/explanations/explanationsService')

// ---------------------------------------------------------------------------
// One draft amending one law, with a general and a special part
// ---------------------------------------------------------------------------

const doc = (body: string): string =>
  `<?xml version="1.0" encoding="utf-8"?><risdok xmlns="http://www.bka.gv.at"><metadaten /><nutzdaten><abschnitt nr="1" typ="ns">${body}</abschnitt></nutzdaten></risdok>`
const head = (text: string): string => `<ueberschrift typ="erll" halign="c">${text}</ueberschrift>`
const part = (text: string): string => `<ueberschrift typ="erlz" halign="c">${text}</ueberschrift>`
const para = (text: string): string => `<absatz typ="erltext" halign="j">${text}</absatz>`

const ERLAEUTERUNGEN = doc(
  part('Erläuterungen') +
  part('Allgemeiner Teil') +
  head('Hauptgesichtspunkte des Entwurfs:') +
  para('Die Richtlinie soll umgesetzt werden.') +
  part('Besonderer Teil') +
  head('Zu Z 1 (§ 12 Abs. 3):') +
  para('Die Bestimmung entfällt.') +
  head('Zu Z 2 (§ 12b):') +
  para('Neu eingefügt.'),
)

const XML_URL = 'https://www.ris.bka.gv.at/Dokumente/Begut/BEGUT_X/ERL.xml'

/** The join row of 5/ME: matched, with Erläuterungen and a Gegenüberstellung in RIS. */
function joinRow(): RisMapRow {
  const formats = { html: null, xml: XML_URL, pdf: null }
  return {
    citation: '5/ME',
    inr: 5,
    status: 'matched',
    tier: 'A',
    risId: 'BEGUT_X',
    risKurztitel: 'Aktiengesetz, Änderung',
    risUrl: 'https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Begut&Dokumentnummer=BEGUT_X',
    risDocument: { html: null, xml: 'https://www.ris.bka.gv.at/Dokumente/Begut/BEGUT_X/ENTW.xml', pdf: null },
    textComparison: { html: null, xml: 'https://www.ris.bka.gv.at/Dokumente/Begut/BEGUT_X/TGUE.xml', pdf: null },
    textComparisonParts: [],
    explanations: formats,
    score: 1,
    risBeginn: '2026-03-01',
    endeOffsetDays: 0,
    risEnde: '2026-04-12',
    reason: null,
  }
}

/** One named Artikel — the Beilage keys its rows by it, so the passages must carry it too. */
const DRAFT = { blocks: [], articles: [draftArticle({ key: 'Aktiengesetz', title: 'Aktiengesetz' })] }

const unreachable = () => Promise.reject(new Error('RIS: The operation was aborted due to timeout'))

beforeEach(() => {
  clearNitroCache()
  getRisMapForGp.mockResolvedValue({ rows: [joinRow()] } as Awaited<ReturnType<typeof getRisMapForGp>>)
  getText.mockResolvedValue(ERLAEUTERUNGEN)
  getDraftArticles.mockReset()
  draftArticlesOfXml.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('a Ministerialentwurf whose own text does not arrive', () => {
  it('keeps the general part and files no passage under an unknown law', async () => {
    getDraftArticles.mockImplementation(unreachable)
    const out = await getExplanations('XXVIII', 5)
    expect(out.available).toBe(true)
    expect(out.passages.map((p) => p.heading)).toEqual(['Hauptgesichtspunkte des Entwurfs:'])
    // Not two passages under `law: null` that no row of the Beilage carries —
    // and no pointer down to them either.
    expect(out.paragraphs).toEqual([])
    expect(out.paragraphsAtAnnex).toBe(false)
  })

  it('does not store that answer, so the next request places the passages', async () => {
    getDraftArticles.mockImplementationOnce(unreachable)
    await getExplanations('XXVIII', 5)
    expect(nitroCacheKeys().filter((k) => k.startsWith('erlaeuterungen-me:'))).toEqual([])

    getDraftArticles.mockResolvedValue(DRAFT)
    const out = await getExplanations('XXVIII', 5)
    expect(out.paragraphs.map((p) => [p.law, p.para])).toEqual([['Aktiengesetz', '12'], ['Aktiengesetz', '12b']])
    expect(out.paragraphsAtAnnex).toBe(true)
    // And THAT answer is kept: the draft is not read a third time.
    expect(nitroCacheKeys()).toContain('erlaeuterungen-me:XXVIII-5')
    await getExplanations('XXVIII', 5)
    expect(getDraftArticles).toHaveBeenCalledTimes(2)
  })
})

describe('a Begutachtung without a Gegenstand, the same way', () => {
  function record(): RisConsultationDetail {
    const formats = { html: null, xml: XML_URL, pdf: null }
    return {
      ...risConsultation({ id: 'BEGUT_V' }),
      mainDocument: { html: null, xml: 'https://www.ris.bka.gv.at/Dokumente/Begut/BEGUT_V/ENTW.xml', pdf: null },
      explanations: formats,
      textComparison: formats,
      textComparisonParts: [formats],
      coverLetter: null,
      otherDocuments: [],
    }
  }

  it('serves the general part without passages, stores nothing, and places them once the text arrives', async () => {
    getRisConsultation.mockResolvedValue(record())
    draftArticlesOfXml.mockImplementationOnce(unreachable)
    const first = await getRisExplanations('BEGUT_V')
    expect(first.available).toBe(true)
    expect(first.paragraphs).toEqual([])
    expect(nitroCacheKeys().filter((k) => k.startsWith('erlaeuterungen-ris:'))).toEqual([])

    draftArticlesOfXml.mockResolvedValue(DRAFT)
    const second = await getRisExplanations('BEGUT_V')
    expect(second.paragraphs.map((p) => p.law)).toEqual(['Aktiengesetz', 'Aktiengesetz'])
  })
})
