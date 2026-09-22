import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchUpstream,
  RisEnvelopeError,
  risJson,
  upstreamBytes,
  upstreamJson,
  UpstreamHttpError,
  UpstreamTooLargeError,
  UpstreamUnreachableError,
  USER_AGENT,
  type UpstreamPolicy,
} from '../server/utils/upstream/fetch'

/**
 * The shared client replaced seven hand-written retry loops
 * (`server/utils/upstream/fetch.ts`). What the callers rely on is the
 * policy being honoured exactly: retry a 5xx, never retry a 4xx, wait the
 * backoff the caller named, and treat a RIS error envelope as a failure
 * rather than as an empty result.
 */

const NOW: UpstreamPolicy = { timeoutMs: 1_000, retries: 0 }

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

/** Answers the queued responses in order; a queued `Error` is thrown instead. */
function stubFetch(...answers: (Response | Error)[]): { calls: RequestInit[] } {
  const calls: RequestInit[] = []
  let i = 0
  vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
    calls.push(init)
    const answer = answers[Math.min(i++, answers.length - 1)]!
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer.clone())
  })
  return { calls }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchUpstream', () => {
  it('sends the one User-Agent and the Accept the policy asks for', async () => {
    const { calls } = stubFetch(jsonResponse({ ok: true }))
    await upstreamJson('https://example.test/x', { ...NOW, accept: 'application/json' })
    const headers = calls[0]!.headers as Record<string, string>
    expect(headers['User-Agent']).toBe('begutachtungs-monitor/0.1 (+https://begutachtungs-monitor.at)')
    expect(headers['User-Agent']).toBe(USER_AGENT)
    expect(headers.Accept).toBe('application/json')
    expect(headers['Content-Type']).toBeUndefined()
  })

  /**
   * The one option a script sets. `scripts/lib/http.ts` appends the script's
   * name (`…; scripts/corpus/stationen)`) so an upstream operator can tell
   * which measurement made the traffic — and the scripts needed a second
   * retry loop of their own until the policy could carry it (23.09.2026).
   * Omitting it has to keep sending the server's own identity, or every
   * request path would start lying about who it is.
   */
  it('lets a caller name itself, and sends the one identity when none does', async () => {
    const mine = 'begutachtungs-monitor/0.1 (+https://begutachtungs-monitor.at; scripts/corpus/stationen)'
    const { calls } = stubFetch(jsonResponse({ ok: true }), jsonResponse({ ok: true }))
    await upstreamJson('https://example.test/x', { ...NOW, userAgent: mine })
    await upstreamJson('https://example.test/x', NOW)
    expect((calls[0]!.headers as Record<string, string>)['User-Agent']).toBe(mine)
    expect((calls[1]!.headers as Record<string, string>)['User-Agent']).toBe(USER_AGENT)
  })

  it('encodes a body as JSON and says so', async () => {
    const { calls } = stubFetch(jsonResponse({ ok: true }))
    await upstreamJson('https://example.test/x', { ...NOW, method: 'POST', body: { GP_CODE: ['XXVIII'] } })
    expect(calls[0]!.method).toBe('POST')
    expect(calls[0]!.body).toBe('{"GP_CODE":["XXVIII"]}')
    expect((calls[0]!.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('retries a 5xx up to the policy and then throws', async () => {
    const { calls } = stubFetch(new Response('', { status: 503 }))
    await expect(upstreamJson('https://example.test/x', { timeoutMs: 100, retries: 2 })).rejects.toThrow(
      UpstreamUnreachableError,
    )
    expect(calls).toHaveLength(3)
  })

  it('retries a network error and succeeds on a later attempt', async () => {
    const { calls } = stubFetch(new Error('ECONNRESET'), jsonResponse({ hit: 1 }))
    await expect(upstreamJson('https://example.test/x', { timeoutMs: 100, retries: 2 })).resolves.toEqual({ hit: 1 })
    expect(calls).toHaveLength(2)
  })

  it('does not retry a 4xx and reports its status', async () => {
    const { calls } = stubFetch(new Response('', { status: 404 }))
    const err = await upstreamJson('https://example.test/x', { timeoutMs: 100, retries: 2 }).catch((e) => e)
    expect(err).toBeInstanceOf(UpstreamHttpError)
    expect((err as UpstreamHttpError).status).toBe(404)
    expect(calls).toHaveLength(1)
  })

  it('retries a 4xx only where the policy asks for it', async () => {
    const { calls } = stubFetch(new Response('', { status: 404 }))
    await expect(
      upstreamJson('https://example.test/x', { timeoutMs: 100, retries: 1, retryOnHttpError: true }),
    ).rejects.toThrow(UpstreamUnreachableError)
    expect(calls).toHaveLength(2)
  })

  it('returns a non-OK answer instead of throwing, so the caller can map it', async () => {
    stubFetch(new Response('', { status: 404 }))
    const res = await fetchUpstream('https://example.test/x', { timeoutMs: 100, retries: 2 })
    expect(res.status).toBe(404)
  })

  it('waits the backoff the policy names, once per retry', async () => {
    vi.useFakeTimers()
    try {
      const { calls } = stubFetch(new Response('', { status: 500 }))
      const waits: number[] = []
      const pending = upstreamJson('https://example.test/x', {
        timeoutMs: 100,
        retries: 2,
        backoffMs: (attempt) => {
          waits.push(attempt)
          return 300 * attempt
        },
      }).catch(() => null)
      await vi.runAllTimersAsync()
      await pending
      expect(waits).toEqual([1, 2])
      expect(calls).toHaveLength(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('gives up when the attempt times out', async () => {
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'TimeoutError')))
      }),
    )
    await expect(upstreamJson('https://example.test/x', { timeoutMs: 5, retries: 0 })).rejects.toThrow(
      UpstreamUnreachableError,
    )
  })

  it('retries a body that will not parse', async () => {
    const { calls } = stubFetch(new Response('<html>nope</html>', { status: 200 }))
    await expect(upstreamJson('https://example.test/x', { timeoutMs: 100, retries: 1 })).rejects.toThrow(
      UpstreamUnreachableError,
    )
    expect(calls).toHaveLength(2)
  })
})

describe('upstreamBytes', () => {
  it('refuses a body that declares more than the cap, before reading it', async () => {
    stubFetch(new Response('x'.repeat(10), { headers: { 'content-length': '999' } }))
    await expect(upstreamBytes('https://example.test/x', { ...NOW, maxBytes: 100 })).rejects.toThrow(
      UpstreamTooLargeError,
    )
  })

  it('refuses a body that turns out larger than the cap', async () => {
    stubFetch(new Response('x'.repeat(200)))
    await expect(upstreamBytes('https://example.test/x', { ...NOW, maxBytes: 100 })).rejects.toThrow(
      UpstreamTooLargeError,
    )
  })

  it('hands the content-type along for callers that decode themselves', async () => {
    stubFetch(new Response('hi', { headers: { 'content-type': 'text/html; charset=windows-1252' } }))
    const body = await upstreamBytes('https://example.test/x', NOW)
    expect(body.contentType).toBe('text/html; charset=windows-1252')
    expect(body.bytes.byteLength).toBe(2)
  })
})

describe('risJson', () => {
  it('unwraps the OgdSearchResult', async () => {
    stubFetch(jsonResponse({ OgdSearchResult: { OgdDocumentResults: { Hits: { '#text': '3' } } } }))
    const result = await risJson<{ OgdDocumentResults: { Hits: { '#text': string } } }>(
      'https://example.test/ris',
      NOW,
    )
    expect(result.OgdDocumentResults.Hits['#text']).toBe('3')
  })

  it('treats an error in the 200 envelope as a failure, not as an empty result', async () => {
    stubFetch(jsonResponse({ OgdSearchResult: { Error: { Message: 'kaputt' } } }))
    const err = await risJson('https://example.test/ris', NOW).catch((e) => e)
    expect(err).toBeInstanceOf(RisEnvelopeError)
    expect(String(err)).toContain('kaputt')
  })

  it('treats a missing envelope the same way', async () => {
    stubFetch(jsonResponse({ nothing: true }))
    await expect(risJson('https://example.test/ris', NOW)).rejects.toThrow(RisEnvelopeError)
  })

  it('retries an envelope error where the policy allows it', async () => {
    const { calls } = stubFetch(
      jsonResponse({ OgdSearchResult: { Error: 'einmal' } }),
      jsonResponse({ OgdSearchResult: { ok: true } }),
    )
    await expect(risJson('https://example.test/ris', { timeoutMs: 100, retries: 2 })).resolves.toEqual({ ok: true })
    expect(calls).toHaveLength(2)
  })
})
