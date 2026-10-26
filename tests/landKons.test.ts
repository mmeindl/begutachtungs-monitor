import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A Land's law in force by its name (`server/utils/laender/landKons.ts`).
 *
 * Until 25.10.2026 a law was kept only under its exact short title, and
 * Kärnten's short titles in RIS carry their abbreviation — „Kärntner
 * Jagdgesetz 2000 - K-JG" — so no Kärnten law resolved by the name its draft
 * gives it: every § had to be found by its words, and no new § could be
 * shown at all.
 */

vi.mock('../server/utils/upstream/fetch', () => ({ risJson: vi.fn(), upstreamText: vi.fn() }))

const { risJson } = vi.mocked(await import('../server/utils/upstream/fetch'))
const { lawInForce } = await import('../server/utils/laender/landKons')

/** One RIS hit: a § of a law under its short title. */
const hit = (title: string, para: string) => ({
  Data: {
    Metadaten: { Landesrecht: { Kurztitel: title, LrKons: { ArtikelParagraphAnlage: `§ ${para}` } } },
    Dokumentliste: { ContentReference: { Urls: { ContentUrl: [{ Url: `https://ris/${encodeURIComponent(title)}/${para}.xml` }] } } },
  },
})
const answer = (...hits: ReturnType<typeof hit>[]) => ({ OgdDocumentResults: { Hits: { '#text': String(hits.length) }, OgdDocumentReference: hits } })

beforeEach(() => {
  risJson.mockReset()
})

describe('lawInForce — a law by the name its draft gives it', () => {
  it('takes RIS\'s short title with its abbreviation for the same law, and not a law named after it', async () => {
    risJson.mockResolvedValue(answer(
      hit('Kärntner Jagdgesetz 2000 - K-JG', '55a'),
      hit('Kärntner Jagdgesetz 2000 - K-JG', '95'),
      hit('Kärntner Jagdgesetz 2000 - Durchführungsverordnung', '1'),
      hit('Kärntner Jagd- und Fischerei-Organstrafverfügungsverordnung – K-JFOV', '2'),
    ) as never)
    const law = await lawInForce('ktn', 'Kärntner Jagdgesetz 2000', '2024-11-01')
    expect([...law.keys()]).toEqual(['55a', '95'])
  })

  it('takes the abbreviation after a comma too („…, K-LPG")', async () => {
    risJson.mockResolvedValue(answer(hit('Kärntner Landes-Pflanzenschutzmittelgesetz, K-LPG', '3')) as never)
    expect([...(await lawInForce('ktn', 'Kärntner Landes-Pflanzenschutzmittelgesetz', '2025-06-01')).keys()]).toEqual(['3'])
  })

  it('keeps the exact short title where RIS has it', async () => {
    risJson.mockResolvedValue(answer(hit('Wiener Schulgesetz', '27'), hit('Wiener Schulgesetz - WrSchG', '28')) as never)
    expect([...(await lawInForce('w', 'Wiener Schulgesetz', '2026-05-29')).keys()]).toEqual(['27'])
  })

  it('finds nothing where two laws answer to the name without their abbreviations', async () => {
    risJson.mockResolvedValue(answer(hit('Kärntner Beispielgesetz - K-BG', '1'), hit('Kärntner Beispielgesetz - K-BspG', '2')) as never)
    expect((await lawInForce('ktn', 'Kärntner Beispielgesetz', '2025-01-01')).size).toBe(0)
  })

  it('lets a failed search throw, never answer „no such law"', async () => {
    risJson.mockRejectedValue(new Error('RIS timed out'))
    await expect(lawInForce('ktn', 'Kärntner Jagdgesetz 2000', '2024-11-01')).rejects.toMatchObject({ message: 'RIS timed out' })
  })
})
