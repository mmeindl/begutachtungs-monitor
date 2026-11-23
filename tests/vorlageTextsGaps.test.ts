/**
 * The sentences of „Der Entwurf" on the page of a Regierungsvorlage without a
 * Begutachtung where nothing can be shown (`vorlageTexts.ts`, 21.11.2026):
 * each opens with a lead word, and none claims from Parliament's document
 * list that a document was not published — a list proves no absence.
 * Parliament is mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { splitGap } from '../shared/utils/gaps'
import { nitroCachedFunction } from './helpers/nitroCache'

vi.stubGlobal('defineCachedFunction', nitroCachedFunction)
vi.stubGlobal('DERIVED_CACHE', '/derived')
vi.mock('../server/utils/annex/annexSource', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../server/utils/annex/annexSource')>()),
  parliamentAnnex: vi.fn(),
}))
vi.mock('../server/utils/parliament/drafts', () => ({ getGegenstand: vi.fn() }))
vi.mock('../server/utils/upstream/fetchDocument', () => ({ fetchDocument: vi.fn() }))
vi.mock('../server/utils/annex/annexPdfService', () => ({ annexFromPdf: vi.fn(), annexFromParliamentPdf: vi.fn() }))

const { annexFromParliamentPdf } = vi.mocked(await import('../server/utils/annex/annexPdfService'))
const { parliamentAnnex } = vi.mocked(await import('../server/utils/annex/annexSource'))
const { getGegenstand } = vi.mocked(await import('../server/utils/parliament/drafts'))
const { fetchDocument } = vi.mocked(await import('../server/utils/upstream/fetchDocument'))
const { getVorlageExplanations, getVorlageTextComparison } = await import('../server/utils/parliament/vorlageTexts')

const root = (ityp: 'I' | 'A', inr: number) => ({ gp: 'XXVIII', ityp, inr })
const PDF = { label: 'Textgegenüberstellung des Ministeriums beim Parlament (PDF)', url: 'https://www.parlament.gv.at/dokument/x.pdf' }
/** Parliament's record of the item with these document groups. */
const record = (...groups: [string, ...('PDF' | 'HTML')[]][]) =>
  ({ content: { documents: groups.map(([title, ...types]) => ({ title, documents: types.map((type) => ({ link: `/dokument/XXVIII/I/1/${title}.${type.toLowerCase()}`, type })) })) } }) as never

/** The lead word of a reason, or null where it opens with none. */
const lead = (reason: string | null) => splitGap(reason)?.kind ?? null

beforeEach(() => {
  vi.clearAllMocks()
})

describe('the Vorlage’s Textgegenüberstellung where none can be read', () => {
  it('keeps an Antrag’s PDF-only annex unread, and says so', async () => {
    parliamentAnnex.mockResolvedValue({ pdf: PDF, html: null })
    const out = await getVorlageTextComparison(root('A', 101))
    expect(out.available).toBe(false)
    expect(lead(out.unavailableReason)).toBe('outOfScope')
    expect(out.unavailableReason).toContain('nur als PDF')
    expect(out.pdf).toEqual(PDF)
    expect(annexFromParliamentPdf).not.toHaveBeenCalled()
  })

  it('says „Nicht lesbar" for a Vorlage’s PDF that does not open or yields no row, and links it', async () => {
    getGegenstand.mockResolvedValue(record())
    parliamentAnnex.mockResolvedValue({ pdf: PDF, html: null })
    annexFromParliamentPdf.mockResolvedValueOnce(null)
    const closed = await getVorlageTextComparison(root('I', 107))
    annexFromParliamentPdf.mockResolvedValueOnce({ rows: [], refusal: null, droppedPages: 0 } as never)
    const empty = await getVorlageTextComparison(root('I', 108))
    for (const out of [closed, empty]) {
      expect(out.available).toBe(false)
      expect(lead(out.unavailableReason)).toBe('unreadable')
      expect(out.pdf).toEqual(PDF)
    }
  })

  it('lets a failed fetch of the PDF through instead of answering with a gap', async () => {
    getGegenstand.mockResolvedValue(record())
    parliamentAnnex.mockResolvedValue({ pdf: PDF, html: null })
    annexFromParliamentPdf.mockRejectedValueOnce(new Error('502'))
    await expect(getVorlageTextComparison(root('I', 109))).rejects.toThrow('502')
  })

  it('claims no absence where Parliament’s list holds none', async () => {
    parliamentAnnex.mockResolvedValue({ pdf: null, html: null })
    for (const ityp of ['I', 'A'] as const) {
      const out = await getVorlageTextComparison(root(ityp, ityp === 'I' ? 102 : 103))
      expect(lead(out.unavailableReason)).toBe('unreadable')
      expect(out.unavailableReason).not.toMatch(/veröffentlicht/)
    }
  })
})

describe('the Vorlage’s Erläuterungen where none can be shown', () => {
  it('claims no absence where Parliament’s list holds none', async () => {
    getGegenstand.mockResolvedValue(record(['Gesetzestext', 'PDF', 'HTML'], ['Vorblatt und WFA', 'PDF']))
    const out = await getVorlageExplanations(root('I', 104))
    expect(lead(out.unavailableReason)).toBe('unreadable')
    expect(out.unavailableReason).not.toMatch(/veröffentlicht/)
    expect(out.document).toBeNull()
  })

  it('names a PDF-only one as not read by the monitor, and links it', async () => {
    getGegenstand.mockResolvedValue(record(['Erläuterungen', 'PDF']))
    const out = await getVorlageExplanations(root('I', 105))
    expect(lead(out.unavailableReason)).toBe('outOfScope')
    expect(out.unavailableReason).toContain('nur als PDF')
    expect(out.document?.url).toMatch(/\.pdf$/)
  })

  it('names Erläuterungen without an Allgemeiner Teil as the draft’s section does', async () => {
    getGegenstand.mockResolvedValue(record(['Erläuterungen', 'PDF', 'HTML']))
    fetchDocument.mockResolvedValue('<html><body><p>Zu § 1:</p><p>Text.</p></body></html>')
    const out = await getVorlageExplanations(root('I', 106))
    expect(out.available).toBe(false)
    expect(lead(out.unavailableReason)).toBe('unreadable')
  })
})
