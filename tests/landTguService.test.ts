import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LandDraftDetail } from '../shared/types'
import type { TguParagraph } from '../server/utils/laender/landTgu'

/**
 * The comparison of a Land's Textgegenüberstellung with RIS
 * (`server/utils/laender/landTguService.ts`), with the reader and RIS
 * replaced: what the page is told about every § it does not show.
 *
 * Kärnten's reader stands in for all of them — the service treats every
 * Land's §§ alike once they are read.
 */

vi.mock('../server/utils/laender/landKons', () => ({ lawInForce: vi.fn(), paragraphText: vi.fn(), paragraphByPhrase: vi.fn() }))
vi.mock('../server/utils/laender/texts/read', () => ({ landPdfBytes: vi.fn(async () => new Uint8Array()), draftSource: vi.fn() }))
vi.mock('../server/utils/annex/annexPdfPages', () => ({ pagesOf: vi.fn(async () => [{ width: 842, items: [] }]) }))
vi.mock('../server/utils/laender/landTguKaernten', () => {
  const ktnTguParagraphs = vi.fn()
  return { ktnTguParagraphs, ktnTguReading: vi.fn((pages: unknown, laws: unknown) => ({ paragraphs: ktnTguParagraphs(pages, laws) })) }
})

const { lawInForce, paragraphText, paragraphByPhrase } = vi.mocked(await import('../server/utils/laender/landKons'))
const { draftSource, landPdfBytes } = vi.mocked(await import('../server/utils/laender/texts/read'))
const { ktnTguParagraphs, ktnTguReading } = vi.mocked(await import('../server/utils/laender/landTguKaernten'))
const { compareTgu, ooeColumnPages, sideBySide, withFullStops } = await import('../server/utils/laender/landTguService')

const LAW = 'Kärntner Beispielgesetz'
const detail = (title = `Gesetz, mit dem das ${LAW} geändert wird`): LandDraftDetail => ({
  draft: {
    id: 'ktn-1-2025-1', land: 'ktn', kind: 'gesetz', title, startedAt: '2025-03-01', deadline: '2025-04-01', active: false,
    url: 'https://www.ktn.gv.at/e.pdf',
    documents: [{ title: 'Entwurf', url: 'https://www.ktn.gv.at/e.pdf' }, { title: 'Textgegenüberstellung', url: 'https://www.ktn.gv.at/t.pdf' }],
  },
  statements: null, statementsUrl: null, filing: { kind: 'document' }, summary: null, procedure: null, landtag: null,
  retentionNote: null, listUrl: 'https://www.ktn.gv.at/', comparisons: [['geltend', 'entwurf']],
} as unknown as LandDraftDetail)

/** RIS's § text, as `standsInRis` reads it: the § heading's words, then its body. */
const ris = (text: string) => `<nutzdaten>${text}</nutzdaten>`
const TEXT_5 = 'Begriffe (1) Begriffe sind in diesem Gesetz so zu verstehen, wie sie hier stehen.'
const para = (number: string, over: Partial<TguParagraph> = {}): TguParagraph => ({ law: LAW, number, old: [], neu: [], changed: true, ...over })

/** RIS knows §§ 5 and 6 of the law, in the words above. */
function risKnows(paras: Record<string, string> = { 5: TEXT_5, 6: 'Pflichten (1) Jede Person hat die Pflichten nach diesem Gesetz zu erfüllen.' }) {
  lawInForce.mockImplementation(async (_land, law) => (law === LAW ? new Map(Object.keys(paras).map((n) => [n, `ris:${n}`])) : new Map()))
  paragraphText.mockImplementation(async (url: string) => ris(paras[url.slice('ris:'.length)] ?? ''))
}

beforeEach(() => {
  vi.clearAllMocks()
  paragraphByPhrase.mockResolvedValue(null)
  draftSource.mockReturnValue({ document: { label: 'Entwurf', url: 'https://www.ktn.gv.at/e.pdf', publisher: 'Land Kärnten' }, read: async () => ({ units: null, text: '' }) })
  risKnows()
})

const reasonsOf = (r: { withheld: { id: string; reason?: string }[] }) => Object.fromEntries(r.withheld.map((w) => [w.id, w.reason ?? 'standing']))

describe('compareTgu — every § not shown, with why (25.10.2026)', () => {
  it('shows a new § RIS does not have yet, and says of one RIS cannot rule out that it is new — not that its text differs', async () => {
    ktnTguParagraphs.mockReturnValue([
      para('5', { old: [TEXT_5], neu: ['Begriffe (1) Begriffe sind neu zu verstehen.'] }),
      para('5a', { neu: ['Ausnahmen (1) Ausnahmen gibt es keine.'] }),
      para('6', { neu: ['Pflichten (1) Neu gefasst.'] }),
    ])
    const r = (await compareTgu('ktn', detail())).value
    expect(r.units.map((u) => [u.id, u.change])).toEqual([['§5', 'changed'], ['§5a', 'inserted']])
    // § 6 is printed as new, but RIS has a § 6: inserted, not „nicht wortgleich".
    expect(reasonsOf(r)).toEqual({ '§6': 'inserted' })
  })

  it('says of every new § why, where RIS knows the law under no name the draft uses', async () => {
    lawInForce.mockResolvedValue(new Map())
    ktnTguParagraphs.mockReturnValue([para('55b', { neu: ['Neu (1) Ganz neu.'] }), para('95a', { neu: ['Neu (1) Auch neu.'] })])
    const r = (await compareTgu('ktn', detail())).value
    expect(reasonsOf(r)).toEqual({ '§55b': 'inserted', '§95a': 'inserted' })
  })

  it('names a § whose text in force RIS refuses as such, and an elided one RIS lacks as elided', async () => {
    ktnTguParagraphs.mockReturnValue([
      para('5', { old: ['Begriffe (1) Begriffe sind ganz anders zu verstehen, als sie hier stehen.'], neu: ['Begriffe (1) Neu.'] }),
      para('6', { old: [TEXT_5], neu: ['x'] }),
      para('9', { old: ['(1) bis (4) …'], neu: ['(1) bis (4) …', '(5) Neu.'] }),
    ])
    const r = (await compareTgu('ktn', detail())).value
    expect(reasonsOf(r)).toEqual({ '§5': 'standing', '§6': 'standing', '§9': 'elided' })
  })

  it('names a § without new text whose repeal the draft does not state as such, not as refused by RIS', async () => {
    ktnTguParagraphs.mockReturnValue([para('5', { old: [TEXT_5] }), para('6', { old: ['Pflichten (1) Jede Person hat die Pflichten nach diesem Gesetz zu erfüllen.'], neu: ['Pflichten (1) Neu.'] })])
    const r = (await compareTgu('ktn', detail())).value
    expect(reasonsOf(r)).toEqual({ '§5': 'deletion' })
    draftSource.mockReturnValue({ document: { label: 'Entwurf', url: 'https://www.ktn.gv.at/e.pdf', publisher: 'Land Kärnten' }, read: async () => ({ units: null, text: '1. § 5 entfällt.' }) })
    expect(((await compareTgu('ktn', detail())).value).units.map((u) => [u.id, u.change])).toEqual([['§5', 'removed'], ['§6', 'changed']])
  })

  it('names a § printed without any text as unsure — it was shown empty, which is gone, where RIS lacked its number', async () => {
    ktnTguParagraphs.mockReturnValue([para('6', { old: ['Pflichten (1) Jede Person hat die Pflichten nach diesem Gesetz zu erfüllen.'], neu: ['Pflichten (1) Neu.'] }), para('25')])
    const r = (await compareTgu('ktn', detail())).value
    expect(r.units.map((u) => u.id)).toEqual(['§6'])
    expect(reasonsOf(r)).toEqual({ '§25': 'unsure' })
  })

  it('names a § printed twice as such', async () => {
    ktnTguParagraphs.mockReturnValue([
      para('6', { old: ['Pflichten (1) Jede Person hat die Pflichten nach diesem Gesetz zu erfüllen.'], neu: ['Pflichten (1) Neu.'] }),
      para('6', { old: ['Pflichten (1) Jede Person hat die Pflichten nach diesem Gesetz zu erfüllen.'], neu: ['Pflichten (1) Anders neu.'] }),
      para('5', { old: [TEXT_5], neu: ['Begriffe (1) Neu.'] }),
    ])
    expect(reasonsOf((await compareTgu('ktn', detail())).value)).toEqual({ '§6': 'twice' })
  })

  it('hands on the reader\'s own reasons', async () => {
    ktnTguParagraphs.mockReturnValue([
      para('5', { old: [TEXT_5], neu: ['Begriffe (1) Neu.'] }),
      para('6', { unread: true, because: 'wording' }),
      para('7', { unread: true }),
      para('8', { unread: true, because: 'unsure' }),
    ])
    expect(reasonsOf((await compareTgu('ktn', detail())).value)).toEqual({ '§6': 'wording', '§7': 'unread', '§8': 'unsure' })
  })
})

describe('compareTgu — nothing shown, everything named (25.10.2026)', () => {
  it('names every § where the reader composes none of them (Kärnten 15193/2025: 21 §§, none named)', async () => {
    ktnTguParagraphs.mockReturnValue([para('3', { unread: true, because: 'wording' }), para('14b', { unread: true }), para('3', { unread: true, because: 'wording' })])
    const r = (await compareTgu('ktn', detail())).value
    expect(r.available).toBe(false)
    expect(r.unavailableReason).toMatch(/^Aus dieser Textgegenüberstellung zeigt der Monitor keinen Paragraphen/)
    expect(r.withheld).toEqual([{ law: LAW, id: '§3', reason: 'wording' }, { law: LAW, id: '§14b', reason: 'unread' }])
    expect(lawInForce).not.toHaveBeenCalled()
  })

  it('names them where RIS confirms none, each with why', async () => {
    ktnTguParagraphs.mockReturnValue([para('5', { old: ['Begriffe (1) Ganz anders, als RIS es druckt, und das in vielen Worten.'], neu: ['x'] }), para('9', { unread: true })])
    const r = (await compareTgu('ktn', detail())).value
    expect(r.available).toBe(false)
    expect(reasonsOf(r)).toEqual({ '§5': 'standing', '§9': 'unread' })
  })

  it('says only that it found nothing, where it read no § at all', async () => {
    ktnTguParagraphs.mockReturnValue([])
    const r = (await compareTgu('ktn', detail())).value
    expect(r).toMatchObject({ available: false, unavailableReason: 'In der Textgegenüberstellung fand der Monitor keine Paragraphen, die er lesen kann.', withheld: [] })
  })
})

describe('compareTgu — a failed read is no verdict (25.10.2026)', () => {
  const two = () => [
    para('5', { old: [TEXT_5], neu: ['Begriffe (1) Neu.'] }),
    para('6', { old: ['Pflichten (1) Jede Person hat die Pflichten nach diesem Gesetz zu erfüllen.'], neu: ['Pflichten (1) Neu.'] }),
  ]

  it('is complete where every read answered', async () => {
    ktnTguParagraphs.mockReturnValue(two())
    expect(await compareTgu('ktn', detail())).toMatchObject({ complete: true, value: { available: true, withheld: [] } })
  })

  it('names the §§ of a law RIS did not answer for as unchecked, not as refused, and is incomplete', async () => {
    ktnTguParagraphs.mockReturnValue([...two(), para('5a', { neu: ['Neu (1) Ganz neu.'] })])
    lawInForce.mockRejectedValue(new Error('RIS timed out'))
    const r = await compareTgu('ktn', detail())
    expect(r.complete).toBe(false)
    expect(reasonsOf(r.value)).toEqual({ '§5': 'unchecked', '§6': 'unchecked', '§5a': 'unchecked' })
  })

  it('names only the § whose own text RIS did not deliver', async () => {
    ktnTguParagraphs.mockReturnValue(two())
    const ok = paragraphText.getMockImplementation()!
    paragraphText.mockImplementation(async (url: string) => (url === 'ris:6' ? Promise.reject(new Error('502')) : ok(url)))
    const r = await compareTgu('ktn', detail())
    expect(r.complete).toBe(false)
    expect(r.value.units.map((u) => u.id)).toEqual(['§5'])
    expect(reasonsOf(r.value)).toEqual({ '§6': 'unchecked' })
  })

  it('takes a draft it could not read for no repeal, but for unchecked', async () => {
    ktnTguParagraphs.mockReturnValue([para('5', { old: [TEXT_5] }), two()[1]!])
    draftSource.mockReturnValue({ document: { label: 'Entwurf', url: 'https://www.ktn.gv.at/e.pdf', publisher: 'Land Kärnten' }, read: () => Promise.reject(new Error('timeout')) })
    const r = await compareTgu('ktn', detail())
    expect(r.complete).toBe(false)
    expect(reasonsOf(r.value)).toEqual({ '§5': 'unchecked' })
  })
})

describe('compareTgu — one law, one group (25.10.2026)', () => {
  it('files the withheld §§ of a law RIS knows by another name where it confirmed the others', async () => {
    // The draft names the law as it was called; RIS confirms § 5 under its present name.
    lawInForce.mockResolvedValue(new Map())
    paragraphByPhrase.mockResolvedValue({ url: 'ris:5', law: 'Kärntner Bildungsbaufondsgesetz – K-BBFG' })
    ktnTguParagraphs.mockReturnValue([
      para('5', { law: 'Kärntner Schulbaufondsgesetz', old: [TEXT_5], neu: ['Begriffe (1) Neu.'] }),
      para('6', { law: 'Kärntner Schulbaufondsgesetz', unread: true, because: 'wording' }),
    ])
    const r = (await compareTgu('ktn', detail('Gesetz, mit dem das Kärntner Schulbaufondsgesetz geändert wird'))).value
    expect(r.units.map((u) => u.article)).toEqual(['Kärntner Bildungsbaufondsgesetz – K-BBFG'])
    expect(r.withheld).toEqual([{ law: 'Kärntner Bildungsbaufondsgesetz – K-BBFG', id: '§6', reason: 'wording' }])
  })

  it('keeps RIS\'s name where the draft declines the adjective after its article, and files the withheld §§ there', async () => {
    lawInForce.mockResolvedValue(new Map())
    paragraphByPhrase.mockResolvedValue({ url: 'ris:5', law: 'Kärntner landwirtschaftliches Schulgesetz 1993 - K-LSchG' })
    ktnTguParagraphs.mockReturnValue([
      para('5', { law: 'Kärntner landwirtschaftliche Schulgesetz 1993', old: [TEXT_5], neu: ['Begriffe (1) Neu.'] }),
      para('6', { law: 'Kärntner landwirtschaftliche Schulgesetz 1993', unread: true }),
    ])
    const r = (await compareTgu('ktn', detail('Gesetz, mit dem das Kärntner landwirtschaftliche Schulgesetz 1993 geändert wird'))).value
    expect(r.units.map((u) => u.article)).toEqual(['Kärntner landwirtschaftliches Schulgesetz 1993 - K-LSchG'])
    expect(r.withheld.map((w) => w.law)).toEqual(['Kärntner landwirtschaftliches Schulgesetz 1993 - K-LSchG'])
  })

  it('leaves a law alone whose confirmed §§ stand under more than one law', async () => {
    lawInForce.mockResolvedValue(new Map())
    paragraphByPhrase.mockImplementation(async (_l: string, _ph: string, n: string) => ({ url: `ris:${n}`, law: n === '5' ? 'Gesetz A' : 'Gesetz B' }))
    ktnTguParagraphs.mockReturnValue([
      para('5', { law: 'Kärntner Sammelgesetz', old: [TEXT_5], neu: ['Begriffe (1) Neu.'] }),
      para('6', { law: 'Kärntner Sammelgesetz', old: ['Pflichten (1) Jede Person hat die Pflichten nach diesem Gesetz zu erfüllen.'], neu: ['Pflichten (1) Neu.'] }),
      para('7', { law: 'Kärntner Sammelgesetz', unread: true }),
    ])
    const r = (await compareTgu('ktn', detail('Gesetz, mit dem das Kärntner Sammelgesetz geändert wird'))).value
    expect(r.withheld).toEqual([{ law: 'Kärntner Sammelgesetz', id: '§7', reason: 'unread' }])
  })
})

describe('compareTgu — what the reader says beside the §§ (26.10.2026)', () => {
  it('hands on the instructions that reach §§ they do not name, and the pages it did not read', async () => {
    ktnTguReading.mockReturnValueOnce({
      paragraphs: [para('5', { old: [TEXT_5], neu: ['Begriffe (1) Neu.'] })],
      reaches: [{ law: LAW, instruction: 'Im V. Abschnitt wird jeweils das Wort „Kindergärtnerin" ersetzt.' }],
      droppedPages: 2,
    })
    const r = (await compareTgu('ktn', detail())).value
    expect(r).toMatchObject({ available: true, reaches: [{ law: LAW, instruction: 'Im V. Abschnitt wird jeweils das Wort „Kindergärtnerin" ersetzt.' }], droppedPages: 2 })
  })

  it('names a § once per cause — two causes, two lines; the same cause twice, one', async () => {
    ktnTguParagraphs.mockReturnValue([
      para('6', { unread: true, because: 'division' }),
      para('6', { unread: true, because: 'wording' }),
      para('6', { unread: true, because: 'wording' }),
    ])
    expect((await compareTgu('ktn', detail())).value.withheld).toEqual([
      { law: LAW, id: '§6', reason: 'division' },
      { law: LAW, id: '§6', reason: 'wording' },
    ])
  })

  it('names an Artikel and an Anlage by their own designation', async () => {
    ktnTguParagraphs.mockReturnValue([para('Art. 19', { unread: true, because: 'wording' }), para('Anlage 2', { unread: true, because: 'annex' })])
    expect((await compareTgu('ktn', detail())).value.withheld.map((w) => w.id)).toEqual(['Art. 19', 'Anlage 2'])
  })
})

describe('Wien reads the newest version of its draft (26.10.2026)', () => {
  it('opens the last document, not the first', async () => {
    const wien = {
      ...detail(),
      draft: { ...detail().draft, id: 'w-2026003', land: 'w', documents: [{ title: 'Entwurf', url: 'https://www.wien.gv.at/a.pdf', date: '2026-03-18' }, { title: 'Entwurf', url: 'https://www.wien.gv.at/b.pdf', date: '2026-05-05' }] },
    } as unknown as LandDraftDetail
    await compareTgu('w', wien)
    expect(landPdfBytes).toHaveBeenCalledWith('https://www.wien.gv.at/b.pdf')
  })
})

describe('two-column documents for the federal reader (26.10.2026)', () => {
  const run = (text: string, x: number, y: number, width = text.length * 5) => ({ text, x, y, width })
  const page = (...items: ReturnType<typeof run>[]) => ({ width: 842, items, geometry: { runs: items.length, offTurn: 0, skewed: 0 } })

  it('gives a § designation its full stop, in one run or in several, where its line holds nothing else', () => {
    const out = withFullStops(page(run('§ 64', 60, 500), run('§', 220, 480, 6), run(' ', 226, 480, 3), run('8c', 229, 480, 10), run('§', 60, 460, 6), run(' ', 66, 460, 3), run('5', 69, 460, 5), run(' Abs. 2 gilt.', 74, 460)))
    expect(out.items.map((i) => i.text)).toEqual(['§ 64.', '§ 8c.', '§', ' ', '5', ' Abs. 2 gilt.'])
    expect(out.items[1]).toMatchObject({ x: 220, width: 19 })
  })

  it('takes Oberösterreich\'s side-by-side document for two columns, and names its draft header as the template does (2021-16029)', () => {
    const tgu = [{ items: [{ s: 'Geltende Fassung - Oö. ADIG', x: 153, y: 438, w: 154 }, { s: 'Begutachtungsentwurf – Oö. ADIG-Novelle 2021', x: 450, y: 438, w: 251 }] }]
    expect(sideBySide(tgu)).toBe(true)
    expect(sideBySide([{ items: [{ s: 'Geltende Fassung', x: 153, y: 438, w: 80 }] }])).toBe(false)
    const [p] = ooeColumnPages([page(run('Geltende Fassung - Oö. ADIG', 153, 438), run('Begutachtungsentwurf – Oö. ADIG-Novelle', 450, 438), run('2021', 660, 438), run('§', 220, 400, 6), run('12', 229, 400, 10))])
    expect(p!.items.map((i) => i.text)).toEqual(['Geltende Fassung - Oö. ADIG', 'Vorgeschlagene Fassung', '§ 12.'])
  })
})

describe('compareTgu — a renumbered § is compared with its origin (26.10.2026)', () => {
  it('checks it where it stands in force, pairs it old → new, and takes a new § under the number it frees for new', async () => {
    ktnTguParagraphs.mockReturnValue([
      para('9', { from: '5', old: [TEXT_5], neu: [TEXT_5] }),
      para('5', { neu: ['Neu (1) Ganz neu.'] }),
      para('6', { old: ['Pflichten (1) Jede Person hat die Pflichten nach diesem Gesetz zu erfüllen.'], neu: ['Pflichten (1) Neu.'] }),
    ])
    const r = (await compareTgu('ktn', detail())).value
    // Only what the draft edits is marked: nothing — and the new § 5 is new, although RIS still has the § 5 that moves.
    expect(r.units.map((u) => [u.fromId, u.id, u.change])).toEqual([['§5', '§9', 'unchanged'], [null, '§5', 'inserted'], ['§6', '§6', 'changed']])
    expect(r.withheld).toEqual([])
  })

  it('names one RIS refuses under both its numbers', async () => {
    ktnTguParagraphs.mockReturnValue([
      para('9', { from: '5', old: ['Begriffe (1) Ganz andere Begriffe als die im RIS stehenden Begriffe.'], neu: ['x'] }),
      para('6', { old: ['Pflichten (1) Jede Person hat die Pflichten nach diesem Gesetz zu erfüllen.'], neu: ['Pflichten (1) Neu.'] }),
    ])
    const r = (await compareTgu('ktn', detail())).value
    expect(r.withheld).toEqual([{ law: LAW, id: '§9', fromId: '§5' }])
  })
})
