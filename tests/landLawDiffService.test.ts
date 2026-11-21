import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LandDraftDetail, LandLawDiffResponse } from '../shared/types'
import { clearNitroCache, nitroCacheKeys, nitroCachedFunction } from './helpers/nitroCache'
import { MUTATION_KINDS, isMiss, mutationOutcome, mutations, type MutationKind } from '../scripts/lib/stationMutations'

/**
 * The cache in front of a Land's comparisons (`server/utils/laender/
 * landLawDiffService.ts`, 25.10.2026): an answer resting on a failed read is
 * served, and not kept. Until then a RIS timeout during the check of the
 * Textgegenüberstellung was held for a day as „im RIS nicht wortgleich".
 */

vi.stubGlobal('defineCachedFunction', nitroCachedFunction)
vi.stubGlobal('DERIVED_CACHE', 'derived')

vi.mock('../server/utils/laender/landTguService', () => ({ compareTgu: vi.fn() }))
vi.mock('../server/utils/laender/sources', () => ({ draftsSharingKundmachung: vi.fn() }))
vi.mock('../server/utils/laender/texts/stations', () => ({ textSources: vi.fn() }))

const { compareTgu } = vi.mocked(await import('../server/utils/laender/landTguService'))
const { textSources } = vi.mocked(await import('../server/utils/laender/texts/stations'))
const { draftsSharingKundmachung } = vi.mocked(await import('../server/utils/laender/sources'))
const { cachedLandComparison, compareLandTexts, compareReadTexts } = await import('../server/utils/laender/landLawDiffService')

const detail = { draft: { id: 'ktn-1-2025-1' }, comparisons: [['geltend', 'entwurf']] } as unknown as LandDraftDetail
const answer = (withheld: LandLawDiffResponse['withheld']): LandLawDiffResponse => ({
  from: 'geltend', to: 'entwurf', available: true, unavailableReason: null, units: [], stats: { total: 0, unchanged: 0, changed: 0, editorial: 0, inserted: 0, removed: 0 },
  fromDocument: null, toDocument: null, addedLaws: [], droppedLaws: [], sharedWith: [], withheld,
})

beforeEach(() => {
  clearNitroCache()
  compareTgu.mockReset()
  textSources.mockReset()
  textSources.mockReturnValue({})
})

describe('cachedLandComparison', () => {
  it('serves an answer with a § unchecked for want of RIS, keeps none, and answers anew once RIS is back', async () => {
    compareTgu.mockResolvedValueOnce({ value: answer([{ law: 'K', id: '§5', reason: 'unchecked' }]), complete: false })
    expect((await cachedLandComparison('ktn', '1-2025-1', 'geltend', 'entwurf', detail)).withheld).toEqual([{ law: 'K', id: '§5', reason: 'unchecked' }])
    expect(nitroCacheKeys()).toEqual([])

    compareTgu.mockResolvedValueOnce({ value: answer([]), complete: true })
    expect((await cachedLandComparison('ktn', '1-2025-1', 'geltend', 'entwurf', detail)).withheld).toEqual([])
    expect(nitroCacheKeys()).toEqual(['land-law-diff:ktn-1-2025-1-geltend-entwurf%7C%7C%7C'])
    // Kept: the next request does not compare again.
    expect((await cachedLandComparison('ktn', '1-2025-1', 'geltend', 'entwurf', detail)).withheld).toEqual([])
    expect(compareTgu).toHaveBeenCalledTimes(2)
  })

  // G081 of the audit of 20.11.2026: keyed by land, number and pair alone,
  // a replaced document or a newly decided Kundmachung was answered for a
  // day from the comparison of the old one.
  it('compares anew where a document or the Kundmachung changed, and serves the kept answer where nothing did', async () => {
    textSources.mockImplementation((_land, d) => ({ entwurf: { document: { label: 'Entwurf', url: d.draft.documents[0]!.url, publisher: 'Land Kärnten' }, read: vi.fn() } }))
    compareTgu.mockResolvedValue({ value: answer([]), complete: true })
    const at = (url: string, lgbl: string | null) =>
      ({ draft: { id: 'ktn-1-2025-1', documents: [{ title: 'Entwurf', url }], stage: lgbl ? { station: 'bgbl', detail: lgbl } : null }, comparisons: [['geltend', 'entwurf']] }) as unknown as LandDraftDetail
    await cachedLandComparison('ktn', '1-2025-1', 'geltend', 'entwurf', at('https://example.org/e1.pdf', null))
    await cachedLandComparison('ktn', '1-2025-1', 'geltend', 'entwurf', at('https://example.org/e1.pdf', null))
    expect(compareTgu).toHaveBeenCalledTimes(1)
    await cachedLandComparison('ktn', '1-2025-1', 'geltend', 'entwurf', at('https://example.org/e2.pdf', null))
    expect(compareTgu).toHaveBeenCalledTimes(2)
    await cachedLandComparison('ktn', '1-2025-1', 'geltend', 'entwurf', at('https://example.org/e2.pdf', 'LGBl. Nr. 3/2026'))
    expect(compareTgu).toHaveBeenCalledTimes(3)
    expect(nitroCacheKeys()).toHaveLength(3)
  })

  it('keeps nothing where the comparison throws', async () => {
    compareTgu.mockRejectedValueOnce(new Error('PDF timed out'))
    await expect(cachedLandComparison('ktn', '1-2025-1', 'geltend', 'entwurf', detail)).rejects.toMatchObject({ message: 'PDF timed out' })
    expect(nitroCacheKeys()).toEqual([])
  })
})

describe('compareLandTexts — what the Land filed as the draft and is none (26.10.2026)', () => {
  // Salzburg 23088: the „Entwurf" is the Gemeindeverband's Stellungnahme (`notADraft`).
  it('is not compared as the draft, and the page says why', async () => {
    const lgbl = { units: [{ id: '§1' }], text: '§ 1' } as never
    textSources.mockReturnValueOnce({
      entwurf: { document: { label: 'Entwurf', url: 'https://example.org/e', publisher: 'Land Salzburg' }, read: async () => ({ units: null, text: 'Stellungnahme', notDraft: true }) },
      lgbl: { document: { label: 'LGBl. Nr. 16/2021', url: null, publisher: 'RIS (CC BY 4.0)' }, read: async () => lgbl },
    })
    const ofDraft = { ...detail, comparisons: [['entwurf', 'lgbl']] } as unknown as LandDraftDetail
    const got = await compareLandTexts('sbg', ofDraft, 'entwurf', 'lgbl')
    expect(got.value).toMatchObject({ available: false, unavailableReason: 'Nicht veröffentlicht: Als Entwurf hat das Land ein anderes Dokument veröffentlicht; der Monitor liest es nicht als Entwurf.' })
  })
})

describe('compareLandTexts — the drafts sharing the Kundmachung, unread (21.11.2026)', () => {
  // Until then a failed read of the Land's register answered „none", and the page said nothing.
  it('says the warning could not be checked, and keeps nothing', async () => {
    const text = (id: string) => ({ units: [{ article: 'G', articleNumber: null, id, heading: null, quotedHeadings: [], text: 'Text.', blocks: [{ kind: 'abs', cls: 'pdf', text: 'Text.', gld: null }] }], text: 'Text.' }) as never
    textSources.mockReturnValueOnce({
      entwurf: { document: { label: 'Entwurf', url: 'https://example.org/e', publisher: 'Land Kärnten' }, read: async () => text('§1') },
      lgbl: { document: { label: 'LGBl. Nr. 1/2026', url: null, publisher: 'RIS (CC BY 4.0)' }, read: async () => text('§1') },
    })
    draftsSharingKundmachung.mockRejectedValueOnce(new Error('register timed out'))
    const ofDraft = { draft: { id: 'ktn-1-2025-1', stage: { kind: 'kundgemacht', detail: 'LGBl. Nr. 1/2026' } }, comparisons: [['entwurf', 'lgbl']] } as unknown as LandDraftDetail
    const got = await compareLandTexts('ktn', ofDraft, 'entwurf', 'lgbl')
    expect(got.value.available).toBe(true)
    expect(got.value.sharedWith).toEqual([])
    expect(got.value.sharedUnknown).toMatch(/^Gerade nicht abrufbar: /)
    expect(got.complete).toBe(false)
  })
})

describe('compareReadTexts — an instruction whose announced text one side did not read (19.11.2026)', () => {
  const unit = (id: string, text: string) => ({ article: 'Abschussplanverordnung', articleNumber: null, id, heading: null, quotedHeadings: [], text, blocks: [{ kind: 'novao', cls: 'pdf', text, gld: null }] }) as never
  const doc = (label: string) => ({ label, url: null, publisher: 'Land Salzburg' })
  // Salzburg 33884: the draft's PDF sets the rows Z 2 announces after Z 3; the Landesgesetzblatt under Z 2.
  const draft = [
    unit('Z1', 'Im § 2 wird das Wort „Rotwild“ durch das Wort „Rot- und Gamswild“ ersetzt.'),
    unit('Z2', 'Im § 3 werden folgende Änderungen vorgenommen: 2.1. Im Wildraum 2 lautet die die Wildregion 2.3 betreffende Zeile: 2.2. Im Wildraum 8 lautet die die Wildregion 8.2 betreffende Zeile:'),
    unit('Z3', 'Im § 4 wird angefügt: „(2) Die §§ 1 und 3 treten mit dem auf die Kundmachung folgenden Tag in Kraft.“ „ 2.3 45 86 61 “ „ 8.2 35 80 50 “'),
  ]
  const lgbl = [
    unit('Z1', 'Im § 2 wird das Wort „Rotwild“ durch das Wort „Rot- und Gamswild“ ersetzt.'),
    unit('Z2', 'Im § 3 werden folgende Änderungen vorgenommen: 2.1. Im Wildraum 2 lautet die die Wildregion 2.3 betreffende Zeile: „2.3 43 80 59“ 2.2. Im Wildraum 8 lautet die die Wildregion 8.2 betreffende Zeile: „8.2 35 80 50“'),
    unit('Z3', 'Im § 4 wird angefügt: „(2) Die §§ 1 und 3 treten mit 12. März 2026 in Kraft.“'),
  ]

  it('withholds both instructions instead of showing the rows as added under Z 2 and removed under Z 3', () => {
    const got = compareReadTexts('entwurf', 'lgbl', [{ units: draft, text: '' }, { units: lgbl, text: '' }], [doc('Entwurf'), doc('LGBl. Nr. 20/2026')])
    expect(got.units.map((u) => u.id)).toEqual(['Z1'])
    expect(got.withheld).toEqual([
      { law: 'Abschussplanverordnung', id: 'Z2', reason: 'announced' },
      { law: 'Abschussplanverordnung', id: 'Z3', reason: 'announced' },
    ])
    expect(got.stats.total).toBe(1)
    expect(got.unreadAnnounced).toBeUndefined()
  })

  it('shows an instruction whose announced text both sides lack, and names it as unread', () => {
    const toc = unit('Z1', 'Im Inhaltsverzeichnis lautet die den § 27 betreffende Zeile:')
    const word = unit('Z2', 'Im § 2 wird das Wort „Rotwild“ durch das Wort „Rot- und Gamswild“ ersetzt.')
    const got = compareReadTexts('entwurf', 'rv', [{ units: [toc, word], text: '' }, { units: [toc, word], text: '' }], [doc('Entwurf'), doc('Regierungsvorlage')])
    expect(got.units.map((u) => [u.id, u.change])).toEqual([['Z1', 'unchanged'], ['Z2', 'unchanged']])
    expect(got.withheld).toEqual([])
    expect(got.unreadAnnounced).toEqual([{ law: 'Abschussplanverordnung', id: 'Z1' }])
  })
})

// A page inside a Land's PDF with no text on it (a scanned page in a
// document set in Word): what stands on it reads as removed or inserted,
// and nothing said so (audit of 20.11.2026, G078). The Textgegenüberstellung
// says its dropped pages; the station pairs now say their textless ones.
describe('compareReadTexts — pages without text inside a document', () => {
  const unit = (id: string, text: string) => ({ article: 'K-BO', articleNumber: null, id, heading: null, quotedHeadings: [], text, blocks: [{ kind: 'novao', cls: 'pdf', text, gld: null }] }) as never
  const doc = (label: string) => ({ label, url: null, publisher: 'Land Kärnten' })
  const units = [unit('Z1', 'Im § 2 wird das Wort „A“ durch das Wort „B“ ersetzt.'), unit('Z2', 'Im § 3 entfällt Abs. 2.')]

  it('counts the empty pages between the first and the last page with text, on both sides', () => {
    const got = compareReadTexts('entwurf', 'rv', [
      { units, text: '', pages: ['Seite 1 von 4 Gesetz', '', ' \n ', 'Seite 4 von 4'] },
      { units, text: '', pages: ['Seite 1', '', 'Seite 3'] },
    ], [doc('Entwurf'), doc('Regierungsvorlage')])
    expect(got.droppedPages).toBe(3)
  })

  it('counts no empty page before the first or after the last text, and none of the Landesgesetzblatt', () => {
    const got = compareReadTexts('entwurf', 'lgbl', [{ units, text: '', pages: ['', 'Seite 1', 'Seite 2', ''] }, { units, text: '' }], [doc('Entwurf'), doc('LGBl. Nr. 1/2026')])
    expect(got.droppedPages).toBeUndefined()
  })
})

// The Bund's fault classes set into a Land's units, compared as the Länder
// station harness compares them (`scripts/harness/landStations.ts`,
// 21.11.2026): through the comparison the route serves, the Land's cleaning
// of quotes, „&" and split compounds, the Artikel pairing and the withholding
// included. Every fault has to come out a change of substance with a marked
// run. The long unit stood unmarked until the comparison passed the word
// diff's ceiling.
describe('compareReadTexts — a fault set into a Land unit is a change of substance', () => {
  const unit = (id: string, text: string) => ({ article: 'Artikel I Änderung des K-JG', articleNumber: 'Artikel I', id, heading: null, quotedHeadings: [], text, blocks: [{ kind: 'novao', cls: 'pdf', text, gld: null }] }) as never as { text: string }
  const doc = { label: 'Einheit', url: null, publisher: '' }
  const texts = [
    'Im § 2 wird das Wort „Rot- und Gamswild“ durch die Wortfolge „Land- & Forstwirtschaft“ ersetzt; dies gilt nicht für Abs. 3 oder 4.',
    '§ 7 Abs. 2 lautet: „(2) Der Zuschlag beträgt 5 % bis 10 %, höchstens 1 500 Euro, für Flächen > 2 ha in den Zonen 3-5.“',
    `§ 4 lautet: „§ 4 (1) Die Behörde hat nicht ${Array.from({ length: 1_700 }, (_, k) => `Wort${k}`).join(' ')} und binnen 14 Tagen oder sofort zu entscheiden.“`,
  ]

  it('in every class, over a unit of each shape', () => {
    const tried = new Set<MutationKind>()
    const misses: string[] = []
    for (const [k, text] of texts.entries()) {
      const before = unit(`Z${k + 1}`, text)
      for (const m of mutations(text)) {
        tried.add(m.kind)
        const got = compareReadTexts('entwurf', 'lgbl', [{ units: [before as never], text }, { units: [{ ...before, text: m.text } as never], text: m.text }], [doc, doc])
        const outcome = mutationOutcome(got.units)
        // Unpaired is no miss (`isMiss`): a digit of the instruction's own
        // address („Im § 2" → „Im § 3") names another place.
        if (isMiss(outcome)) misses.push(`Z${k + 1} ${m.kind} → ${outcome}`)
      }
    }
    expect([...tried].sort()).toEqual([...MUTATION_KINDS].sort())
    expect(misses).toEqual([])
  })
})
