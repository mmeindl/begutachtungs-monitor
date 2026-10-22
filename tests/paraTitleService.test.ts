import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LawDiffUnit } from '../shared/types'
import type { KonsParagraphRef } from '../server/utils/ris/konsLaw'
import { draftSummary } from './helpers/builders'
import { clearNitroCache, nitroCacheKeys, nitroCachedFunction } from './helpers/nitroCache'

/**
 * The § names when an upstream read fails (`server/utils/diff/paraTitleService.ts`;
 * the §12.13 rule).
 *
 * „Anything unresolved is simply absent from the map" — and until
 * 22.10.2026 anything UNREACHABLE was too, for a day: the list row, the
 * comparison and the RIS map each ended in `.catch(() => null)`, so a blip
 * cost the whole draft its names until the cache expired, and a § document
 * that did not arrive left that § nameless for as long. Now the three throw,
 * and a single § that fails leaves the others standing in an answer that is
 * not stored.
 *
 * The clause parser, the instruction grammar and the § parser run for real
 * on small documents in RIS's vocabulary; the upstream reads and the
 * comparison under the names are faked, and Nitro's cache keeps
 * (`helpers/nitroCache.ts`).
 */

vi.stubGlobal('defineCachedFunction', nitroCachedFunction)

vi.mock('../server/utils/parliament/drafts', () => ({ getGegenstand: vi.fn(), getDraftsForGp: vi.fn() }))
vi.mock('../server/utils/diff/lawDiffService', () => ({ getLawDiff: vi.fn() }))
vi.mock('../server/utils/ris/begutCorpus', () => ({ getRisMapForGp: vi.fn() }))
vi.mock('../server/utils/upstream/fetchDocument', () => ({ fetchDocument: vi.fn() }))
vi.mock('../server/utils/kons/konsCache', () => ({ resolveKonsLaw: vi.fn(), fetchParagraphXml: vi.fn() }))

const { getDraftsForGp, getGegenstand } = vi.mocked(await import('../server/utils/parliament/drafts'))
const { getLawDiff } = vi.mocked(await import('../server/utils/diff/lawDiffService'))
const { getRisMapForGp } = vi.mocked(await import('../server/utils/ris/begutCorpus'))
const { fetchDocument } = vi.mocked(await import('../server/utils/upstream/fetchDocument'))
const { fetchParagraphXml, resolveKonsLaw } = vi.mocked(await import('../server/utils/kons/konsCache'))
const { getParagraphTitles } = await import('../server/utils/diff/paraTitleService')

// ---------------------------------------------------------------------------
// 1/ME XXVIII amends the Glücksspielgesetz in § 5 and § 7
// ---------------------------------------------------------------------------

const ARTICLE = 'Änderung des Glücksspielgesetzes'
const RIS_XML = 'https://www.ris.bka.gv.at/Dokumente/Begut/BEGUT_X/ENTW.xml'
const RV_HTML = 'https://www.parlament.gv.at/dokument/XXVIII/I/10/rv.html'

/** The draft as RIS publishes it — Parliament has it only as a PDF. */
const DRAFT_XML =
  '<risdok><nutzdaten><abschnitt>' +
  `<ueberschrift typ="g1">Artikel 1</ueberschrift><ueberschrift typ="g2">${ARTICLE}</ueberschrift>` +
  '<absatz typ="promkleinlsatz">Das Glücksspielgesetz, BGBl. Nr. 620/1989, zuletzt geändert durch BGBl. I Nr. 20/2026, wird wie folgt geändert:</absatz>' +
  '<absatz typ="novao1">1. In § 5 Abs. 1 wird das Wort "A" durch das Wort "B" ersetzt.</absatz>' +
  '</abschnitt></nutzdaten></risdok>'

const ME_DETAIL = {
  content: {
    documents: [{ title: 'Gesetzestext', documents: [{ link: 'https://www.parlament.gv.at/dokument/XXVIII/ME/1/me.pdf', type: 'PDF' }] }],
    statements: { documents: [{ title: 'Gesetzestext', documents: [{ link: RV_HTML, type: 'HTML' }] }] },
  },
}

/** Two instructions of the comparison, addressing § 5 and § 7. */
function unit(id: string, text: string): LawDiffUnit {
  return { article: ARTICLE, articleKey: '1', fromArticleKey: '1', id, fromId: id, heading: null, quotedHeading: null, change: 'changed', editorial: false, fromText: text, toText: text } as LawDiffUnit
}
const UNITS = [unit('Z 1', '1. In § 5 Abs. 1 wird das Wort "A" durch das Wort "B" ersetzt.'), unit('Z 2', '2. § 7 lautet:')]
const KEY_5 = `${ARTICLE}|Z 1|changed`
const KEY_7 = `${ARTICLE}|Z 2|changed`

/** A § of the standing law as BrKons serves it. */
const konsParagraph = (id: string, heading: string) =>
  '<risdok><nutzdaten><abschnitt>' +
  `<absatz typ="erltext" ct="artikel_anlage">§ ${id}</absatz>` +
  `<ueberschrift typ="para" ct="text">${heading}</ueberschrift>` +
  `<absatz typ="abs" ct="text"><gldsym>§ ${id}.</gldsym> (1) Text.</absatz>` +
  '</abschnitt></nutzdaten></risdok>'

function ref(id: string): KonsParagraphRef {
  return {
    nor: `NOR_${id}`,
    label: `§ ${id}`,
    id,
    inkrafttreten: null,
    ausserkrafttreten: null,
    kundmachungsorgan: null,
    stammnorm: { organ: 'BGBl. Nr.', nummer: '620/1989' },
    gesetzesnummer: '10004846',
    xmlUrl: `https://www.ris.bka.gv.at/Dokumente/Bundesnormen/NOR_${id}/NOR_${id}.xml`,
  }
}

const HEADINGS: Record<string, string> = { NOR_5: konsParagraph('5', 'Sofortlotterien'), NOR_7: konsParagraph('7', 'Ausspielungen') }

const timeout = () => Promise.reject(new Error('The operation was aborted due to timeout'))
/** § documents that do not arrive. */
const unreachable = new Set<string>()

beforeEach(() => {
  clearNitroCache()
  unreachable.clear()
  getGegenstand.mockResolvedValue(ME_DETAIL as never)
  getDraftsForGp.mockResolvedValue({ items: [draftSummary({ inr: 1, arrivedAt: '2026-03-11' })] } as never)
  getLawDiff.mockResolvedValue({ available: true, units: UNITS } as never)
  getRisMapForGp.mockResolvedValue({ rows: [{ inr: 1, risDocument: { html: null, xml: RIS_XML, pdf: null } }] } as never)
  fetchDocument.mockImplementation(async (url: string) => (url === RIS_XML ? DRAFT_XML : '<html><body></body></html>'))
  resolveKonsLaw.mockResolvedValue({ gesetzesnummer: '10004846', kurztitel: 'Glücksspielgesetz', paragraphs: { '§ 5': ref('5'), '§ 7': ref('7') } })
  fetchParagraphXml.mockImplementation(async (nor: string) => {
    if (unreachable.has(nor)) throw new Error(`timeout: ${nor}`)
    return HEADINGS[nor]!
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

const stored = () => nitroCacheKeys().filter((k) => k.startsWith('para-titles:'))

describe('every read answers', () => {
  it('names both §§ and keeps the answer', async () => {
    const out = await getParagraphTitles('XXVIII', 1, 'me', 'rv')
    expect(out.titles).toEqual({ [KEY_5]: 'Sofortlotterien', [KEY_7]: 'Ausspielungen' })
    expect(out.paragraphs).toEqual({ [KEY_5]: '§ 5', [KEY_7]: '§ 7' })
    expect(stored()).toEqual(['para-titles:XXVIII-1-me-rv'])
  })
})

describe('one § document does not arrive', () => {
  it('the other name still goes out, the answer is not stored, and the next request names both', async () => {
    unreachable.add('NOR_7')
    const during = await getParagraphTitles('XXVIII', 1, 'me', 'rv')
    expect(during.titles).toEqual({ [KEY_5]: 'Sofortlotterien' })
    expect(stored()).toEqual([])

    unreachable.clear()
    const after = await getParagraphTitles('XXVIII', 1, 'me', 'rv')
    expect(after.titles[KEY_7]).toBe('Ausspielungen')
    expect(stored()).toEqual(['para-titles:XXVIII-1-me-rv'])
  })
})

describe('a read the whole lookup stands on does not arrive — it throws, nothing nameless is kept', () => {
  it('the list row with the reference date', async () => {
    getDraftsForGp.mockImplementationOnce(timeout)
    await expect(getParagraphTitles('XXVIII', 1, 'me', 'rv')).rejects.toThrow('timeout')
    expect(stored()).toEqual([])
    expect((await getParagraphTitles('XXVIII', 1, 'me', 'rv')).titles[KEY_5]).toBe('Sofortlotterien')
  })

  it('the comparison whose units are named', async () => {
    getLawDiff.mockImplementationOnce(timeout)
    await expect(getParagraphTitles('XXVIII', 1, 'me', 'rv')).rejects.toThrow('timeout')
    expect(stored()).toEqual([])
    expect((await getParagraphTitles('XXVIII', 1, 'me', 'rv')).titles[KEY_5]).toBe('Sofortlotterien')
  })

  it('the RIS map, where the draft\'s clause stands only in RIS', async () => {
    getRisMapForGp.mockImplementationOnce(timeout)
    await expect(getParagraphTitles('XXVIII', 1, 'me', 'rv')).rejects.toThrow('timeout')
    expect(stored()).toEqual([])
    expect((await getParagraphTitles('XXVIII', 1, 'me', 'rv')).titles[KEY_5]).toBe('Sofortlotterien')
  })
})
