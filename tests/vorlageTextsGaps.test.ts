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
vi.mock('../server/utils/upstream/fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../server/utils/upstream/fetch')>()),
  upstreamBytes: vi.fn(),
}))
vi.mock('../server/utils/explanations/explanationsPdf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../server/utils/explanations/explanationsPdf')>()),
  explanationPagesOf: vi.fn(),
}))

const { annexFromParliamentPdf } = vi.mocked(await import('../server/utils/annex/annexPdfService'))
const { parliamentAnnex } = vi.mocked(await import('../server/utils/annex/annexSource'))
const { getGegenstand } = vi.mocked(await import('../server/utils/parliament/drafts'))
const { fetchDocument } = vi.mocked(await import('../server/utils/upstream/fetchDocument'))
const { upstreamBytes, UpstreamTooLargeError } = vi.mocked(await import('../server/utils/upstream/fetch'))
const { explanationPagesOf } = vi.mocked(await import('../server/utils/explanations/explanationsPdf'))
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

  describe('held as a PDF only', () => {
    const line = (text: string, y: number, bold = false) => ({ x: 85, y, width: 300, text, size: 10, bold })
    const sound = [{ width: 595, height: 842, offTurn: 0, runs: [line('Allgemeiner Teil', 720, true), line('Das Gesetz regelt die Sache.', 700), line('Besonderer Teil', 670, true), line('Zu § 1:', 650, true), line('Die Begründung.', 639)] }]
    const asked = () => getGegenstand.mockResolvedValue(record(['Erläuterungen', 'PDF']))

    it('reads it, credits Parliament and links the PDF', async () => {
      asked()
      upstreamBytes.mockResolvedValue({ bytes: new Uint8Array(4) } as never)
      explanationPagesOf.mockResolvedValue(sound)
      parliamentAnnex.mockResolvedValue({ pdf: null, html: null })
      const out = await getVorlageExplanations(root('I', 105))
      expect(out.available).toBe(true)
      expect(out.publisher).toBe('parlament')
      expect(out.source?.url).toMatch(/\.pdf$/)
      expect(out.passages[0]!.text).toEqual(['Das Gesetz regelt die Sache.'])
      expect(out.hasSpecial).toBe(true)
    })

    it('says „Nicht lesbar" and links it where the PDF does not open, is too large or holds no text', async () => {
      upstreamBytes.mockResolvedValue({ bytes: new Uint8Array(4) } as never)
      asked()
      explanationPagesOf.mockRejectedValueOnce(new Error('bad'))
      const closed = await getVorlageExplanations(root('I', 110))
      explanationPagesOf.mockResolvedValueOnce([{ width: 595, height: 842, offTurn: 0, runs: [] }])
      const empty = await getVorlageExplanations(root('I', 111))
      upstreamBytes.mockRejectedValueOnce(new UpstreamTooLargeError('x', 1))
      const large = await getVorlageExplanations(root('I', 112))
      for (const out of [closed, empty, large]) {
        expect(out.available).toBe(false)
        expect(lead(out.unavailableReason)).toBe('unreadable')
        expect(out.document?.url).toMatch(/\.pdf$/)
      }
    })

    it('lets a failed fetch through instead of answering with a gap', async () => {
      asked()
      upstreamBytes.mockRejectedValueOnce(new Error('502'))
      await expect(getVorlageExplanations(root('I', 113))).rejects.toThrow('502')
    })
  })

  it('names Erläuterungen without an Allgemeiner Teil as the draft’s section does', async () => {
    getGegenstand.mockResolvedValue(record(['Erläuterungen', 'PDF', 'HTML']))
    fetchDocument.mockResolvedValue('<html><body><p>Zu § 1:</p><p>Text.</p></body></html>')
    const out = await getVorlageExplanations(root('I', 106))
    expect(out.available).toBe(false)
    expect(lead(out.unavailableReason)).toBe('unreadable')
  })
})
