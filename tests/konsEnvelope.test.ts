import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RisEnvelopeError } from '../server/utils/upstream/fetch'
import { clearNitroCache, nitroCacheKeys, nitroCachedFunction } from './helpers/nitroCache'

/**
 * RIS's HTTP-200 error envelope on the BrKons path — read as a failure, not
 * as „no such law" (`ris/konsLaw.ts`, `konsJson`; the §12.13 rule).
 *
 * RIS answers a failure on its side with HTTP 200 and
 * `{"OgdSearchResult":{"Error":…}}`. Until 22.10.2026 `konsJson` read BrKons
 * through the plain JSON client, which took that for a result without hits:
 * `resolveLawByBgbl` said there was no such law, `paragraphHistory` that the
 * law had no history, `lawsOfBgbl` that the Kundmachung changed nothing —
 * and `kons/konsCache.ts` kept each of those for a day, so every § name, the
 * Lesefassung's check and the „Geltende Fassung" links built on them said
 * the same for a day.
 *
 * The fakes are the module's two boundaries: `fetch`, the one seam every
 * upstream request goes through (so the real client runs — its retry loop
 * and its envelope check), and Nitro's cache, as one that KEEPS
 * (`helpers/nitroCache.ts`), so a test can ask whether a failure was stored.
 * The clock is fake only for the policy's backoff (600 and 1200 ms).
 */

vi.stubGlobal('defineCachedFunction', nitroCachedFunction)
// `kons/konsCache.ts` reads the layer name as a Nitro auto-import.
vi.stubGlobal('DERIVED_CACHE', '/derived')

const { konsJson, konsQuery, paragraphHistory, resolveLawByBgbl } = await import('../server/utils/ris/konsLaw')
const { lawsOfBgbl } = await import('../server/utils/ris/bgblLaws')
const { readBgblLaws, readParagraphHistory, resolveKonsLaw } = await import('../server/utils/kons/konsCache')

/** What RIS sends when the query failed on its side — status 200. */
const ENVELOPE = {
  OgdSearchResult: { Error: { Applikation: 'BrKons', Message: 'Die Abfrage konnte nicht durchgeführt werden.' } },
}

/** One § of the Universitätsgesetz 2002 as a BrKons record, last changed by BGBl. I Nr. 62/2026. */
function paragraph(nor: string, label: string) {
  return {
    Data: {
      Metadaten: {
        Technisch: { ID: nor },
        Bundesrecht: {
          Kurztitel: 'Universitätsgesetz 2002',
          BrKons: {
            ArtikelParagraphAnlage: label,
            Paragraphnummer: label.replace('§ ', ''),
            Gesetzesnummer: '20002128',
            StammnormPublikationsorgan: 'BGBl. I Nr.',
            StammnormBgblnummer: '120/2002',
            Kundmachungsorgan: 'BGBl. I Nr. 120/2002 zuletzt geändert durch BGBl. I Nr. 62/2026',
            NovellenBgblnummer: '62/2026',
          },
        },
      },
      Dokumentliste: {
        ContentReference: {
          ContentType: 'MainDocument',
          Urls: { ContentUrl: [{ DataType: 'Xml', Url: `https://www.ris.bka.gv.at/Dokumente/Bundesnormen/${nor}/${nor}.xml` }] },
        },
      },
    },
  }
}

/** A real answer: two §§ of one law. */
const ANSWER = {
  OgdSearchResult: {
    OgdDocumentResults: {
      Hits: { '#text': '2' },
      OgdDocumentReference: [paragraph('NOR40000001', '§ 1'), paragraph('NOR40000002', '§ 2')],
    },
  },
}

/** A real answer with nothing in it — RIS knows no such law. */
const NO_HITS = { OgdSearchResult: { OgdDocumentResults: { Hits: { '#text': '0' } } } }

/** What RIS answers right now, and how often it was asked. */
let ris: unknown = ENVELOPE
let requests = 0

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

/** The promise, with the fake clock run until it settles — the retries wait 600 and 1200 ms. */
async function settled<T>(promise: Promise<T>): Promise<T> {
  const outcome = promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  )
  await vi.runAllTimersAsync()
  const result = await outcome
  if (!result.ok) throw result.error
  return result.value
}

const UG = { organ: 'BGBl. I Nr.', nummer: '120/2002' }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.stubGlobal('fetch', () => {
    requests++
    return Promise.resolve(json(ris))
  })
  ris = ENVELOPE
  requests = 0
  clearNitroCache()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('konsJson — the envelope is a failure', () => {
  it('throws the envelope error after the policy has retried it, instead of answering with no hits', async () => {
    const url = konsQuery({ Kundmachungsorgannummer: '120/2002' })
    await expect(settled(konsJson(url))).rejects.toBeInstanceOf(RisEnvelopeError)
    // One attempt and the two retries of KONS_POLICY: a bad minute of RIS is
    // retried like a 5xx before it counts.
    expect(requests).toBe(3)
  })

  it('keeps the shape its readers walk: the whole `OgdSearchResult`', async () => {
    ris = ANSWER
    const body = await settled(konsJson(konsQuery({ Kundmachungsorgannummer: '120/2002' })))
    expect(body.OgdSearchResult.OgdDocumentResults.Hits['#text']).toBe('2')
  })
})

describe('the readers inherit it — none of them answers „nothing" out of a failure', () => {
  it('resolveLawByBgbl throws rather than returning null („no such law")', async () => {
    await expect(settled(resolveLawByBgbl(UG, '2026-06-01', 'Universitätsgesetz 2002'))).rejects.toBeInstanceOf(RisEnvelopeError)
  })

  it('paragraphHistory throws rather than returning an empty history', async () => {
    await expect(settled(paragraphHistory('20002128'))).rejects.toBeInstanceOf(RisEnvelopeError)
  })

  it('lawsOfBgbl throws rather than returning „changed no law"', async () => {
    await expect(settled(lawsOfBgbl('Bundesgesetzblatt I Nr. 62/2026'))).rejects.toBeInstanceOf(RisEnvelopeError)
  })

  it('a real answer without hits is still an answer — null, as before', async () => {
    ris = NO_HITS
    await expect(settled(resolveLawByBgbl(UG, '2026-06-01', 'Universitätsgesetz 2002'))).resolves.toBeNull()
  })
})

describe('through the day-long caches (`kons/konsCache.ts`): nothing is stored, the next call gets the law', () => {
  it('resolveKonsLaw: the outage is not kept as „unresolvable"', async () => {
    await expect(settled(resolveKonsLaw('BGBl. I Nr.', '120/2002', '2026-06-01', 'Universitätsgesetz 2002'))).rejects.toBeInstanceOf(RisEnvelopeError)
    expect(nitroCacheKeys()).toEqual([])

    ris = ANSWER
    const law = await settled(resolveKonsLaw('BGBl. I Nr.', '120/2002', '2026-06-01', 'Universitätsgesetz 2002'))
    expect(law?.gesetzesnummer).toBe('20002128')
    expect(Object.keys(law?.paragraphs ?? {})).toEqual(['§ 1', '§ 2'])
  })

  it('readParagraphHistory: the outage is not kept as an empty history', async () => {
    await expect(settled(readParagraphHistory('20002128'))).rejects.toBeInstanceOf(RisEnvelopeError)
    expect(nitroCacheKeys()).toEqual([])

    ris = ANSWER
    const history = await settled(readParagraphHistory('20002128'))
    expect(history?.map((v) => v.ref.label)).toEqual(['§ 1', '§ 2'])
  })

  it('readBgblLaws: the outage is not kept as „this Kundmachung changed no law"', async () => {
    await expect(settled(readBgblLaws('Bundesgesetzblatt I Nr. 62/2026'))).rejects.toBeInstanceOf(RisEnvelopeError)
    expect(nitroCacheKeys()).toEqual([])

    ris = ANSWER
    const laws = await settled(readBgblLaws('Bundesgesetzblatt I Nr. 62/2026'))
    expect(laws.map((l) => l.title)).toEqual(['Universitätsgesetz 2002'])
  })

  it('and a real „no such law" IS kept — null is an answer, a failure is not', async () => {
    ris = NO_HITS
    await expect(settled(resolveKonsLaw('BGBl. I Nr.', '120/2002', '2026-06-01', 'Universitätsgesetz 2002'))).resolves.toBeNull()
    expect(nitroCacheKeys()).toHaveLength(1)

    ris = ANSWER
    const before = requests
    await expect(settled(resolveKonsLaw('BGBl. I Nr.', '120/2002', '2026-06-01', 'Universitätsgesetz 2002'))).resolves.toBeNull()
    expect(requests).toBe(before)
  })
})
