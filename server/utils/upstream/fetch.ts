/**
 * The one HTTP client for both upstreams (docs/architecture.md §2).
 *
 * Seven hand-written clients used to carry their own timeout, their own
 * retry loop, their own `sleep` and their own User-Agent — eleven `fetch(`
 * sites in all. What differed between them was never the mechanics, only
 * the numbers, and those are measured decisions that stay where they were
 * measured: every caller passes its own `UpstreamPolicy` and keeps the
 * comment that justifies it.
 *
 * Deliberately free of Nitro globals (no `createError`, no
 * `defineCachedFunction`), so it runs under plain vitest and under
 * vite-node in `scripts/`. That is also why it never maps a status onto an
 * HTTP answer: a 404 from the Parliament API is a 404 for the user, a 404
 * from RIS is a missing document. The caller that knows translates.
 */

/** One identity for every request this server makes (decided 22.09.2026). */
export const USER_AGENT = 'begutachtungs-monitor/0.1 (+https://begutachtungs-monitor.at)'

/** The RIS OGD endpoint every Applikation (Begut, BrKons, BgblAuth) is queried through. */
export const RIS_API_BASE = 'https://data.bka.gv.at/ris/api/v2.6/Bundesrecht'

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface UpstreamPolicy {
  /** Per attempt, not per call: `timeoutMs × (1 + retries)` is the worst case. */
  timeoutMs: number
  /** Extra attempts after the first. `0` means one attempt and no retry. */
  retries: number
  /** Wait before retry `n` (1-based). Omitted: retry at once. */
  backoffMs?: (attempt: number) => number
  method?: 'GET' | 'POST'
  /** JSON-encoded, and it sets the Content-Type. */
  body?: unknown
  accept?: string
  /**
   * Retry EVERY non-OK status, not just 5xx. Two RIS clients do this and
   * did so before the move; nothing else should start.
   */
  retryOnHttpError?: boolean
  /** Refuse a body larger than this, by the declared and by the real length. */
  maxBytes?: number
  /**
   * Who is calling, for the upstream's log. Defaults to `USER_AGENT`, which
   * is what every request path sends.
   *
   * The one caller that sets it is `scripts/lib/http.ts`: a measurement
   * appends its own name (`; scripts/corpus/stationen`) so an operator
   * looking at the traffic can tell which script made it and what to ask
   * about. Without the option the scripts needed a second retry loop of
   * their own, which is what this replaces (23.09.2026).
   */
  userAgent?: string
}

/** Base of the errors this module throws, so a caller can match on one class. */
export abstract class UpstreamError extends Error {
  /** Whether the retry loop may try again after this one. */
  abstract readonly retryable: boolean
}

/** A non-OK answer that was not retried — the caller decides what the status means. */
export class UpstreamHttpError extends UpstreamError {
  readonly retryable = false
  constructor(readonly status: number, readonly url: string) {
    super(`HTTP ${status} für ${url}`)
    this.name = 'UpstreamHttpError'
  }
}

/** The body exceeded `policy.maxBytes`. Never retried: a second read is the same document. */
export class UpstreamTooLargeError extends UpstreamError {
  readonly retryable = false
  constructor(readonly url: string, readonly bytes: number) {
    super(`Dokument zu groß (${bytes} Bytes): ${url}`)
    this.name = 'UpstreamTooLargeError'
  }
}

/**
 * RIS reports its errors inside an HTTP-200 envelope (`OgdSearchResult.Error`),
 * so success is checked on the body. Retryable: a bad minute of the RIS is
 * not an empty result set.
 */
export class RisEnvelopeError extends UpstreamError {
  readonly retryable = true
  constructor(readonly url: string, detail: unknown) {
    super(`RIS-Fehler für ${url}: ${JSON.stringify(detail ?? null).slice(0, 200)}`)
    this.name = 'RisEnvelopeError'
  }
}

/** Every attempt failed. `cause` is the last failure, whatever kind it was. */
export class UpstreamUnreachableError extends UpstreamError {
  readonly retryable = false
  constructor(readonly url: string, override readonly cause: unknown) {
    super(`Upstream nicht erreichbar: ${url}`)
    this.name = 'UpstreamUnreachableError'
  }
}

function requestInit(policy: UpstreamPolicy): RequestInit {
  return {
    method: policy.method ?? 'GET',
    headers: {
      'User-Agent': policy.userAgent ?? USER_AGENT,
      ...(policy.accept ? { Accept: policy.accept } : {}),
      ...(policy.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: policy.body !== undefined ? JSON.stringify(policy.body) : undefined,
    signal: AbortSignal.timeout(policy.timeoutMs),
  }
}

/**
 * The retry loop, with the body read inside it.
 *
 * Reading the body is part of the transport: a truncated response and a
 * dropped connection are the same failure, and the Parliament client has
 * retried a failed `res.json()` since it was written. Anything the consumer
 * decides is NOT transport, so an `UpstreamError` it raises with
 * `retryable === false` leaves the loop at once.
 */
async function withRetries<T>(
  url: string,
  policy: UpstreamPolicy,
  consume: (res: Response) => Promise<T> | T,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= policy.retries; attempt++) {
    if (attempt > 0 && policy.backoffMs) await sleep(policy.backoffMs(attempt))

    let res: Response
    try {
      res = await fetch(url, requestInit(policy))
    } catch (err) {
      // Network error or timeout.
      lastError = err
      continue
    }

    if (res.status >= 500 || (!res.ok && policy.retryOnHttpError)) {
      lastError = new UpstreamHttpError(res.status, url)
      continue
    }

    try {
      return await consume(res)
    } catch (err) {
      if (err instanceof UpstreamError && !err.retryable) throw err
      lastError = err
      continue
    }
  }
  throw new UpstreamUnreachableError(url, lastError)
}

/**
 * The raw answer, retried per policy. A non-OK status below 500 is
 * RETURNED, not thrown — the callers that map 404 onto their own answer
 * need to see it.
 */
export function fetchUpstream(url: string, policy: UpstreamPolicy): Promise<Response> {
  return withRetries(url, policy, (res) => res)
}

function assertOk(res: Response, url: string): void {
  if (!res.ok) throw new UpstreamHttpError(res.status, url)
}

/** Parsed JSON. A non-OK status throws `UpstreamHttpError`, a bad body is retried. */
export function upstreamJson<T>(url: string, policy: UpstreamPolicy): Promise<T> {
  return withRetries(url, policy, async (res) => {
    assertOk(res, url)
    return (await res.json()) as T
  })
}

/** The body as text, decoded the way `fetch` decodes it. */
export function upstreamText(url: string, policy: UpstreamPolicy): Promise<string> {
  return withRetries(url, policy, async (res) => {
    assertOk(res, url)
    return res.text()
  })
}

export interface UpstreamBody {
  bytes: ArrayBuffer
  /** The header, for callers that have to decode the bytes themselves. */
  contentType: string | null
}

/**
 * The body as bytes, refused above `policy.maxBytes`.
 *
 * The declared length is checked before the download and the real one
 * after, because `content-length` is a claim, not a fact.
 */
export function upstreamBytes(url: string, policy: UpstreamPolicy): Promise<UpstreamBody> {
  return withRetries(url, policy, async (res) => {
    assertOk(res, url)
    const max = policy.maxBytes ?? Number.POSITIVE_INFINITY
    const declared = Number(res.headers.get('content-length') ?? 0)
    if (declared > max) throw new UpstreamTooLargeError(url, declared)
    const bytes = await res.arrayBuffer()
    if (bytes.byteLength > max) throw new UpstreamTooLargeError(url, bytes.byteLength)
    return { bytes, contentType: res.headers.get('content-type') }
  })
}

/**
 * One RIS OGD answer, unwrapped to its `OgdSearchResult`.
 *
 * The HTTP-200 error envelope is the reason this exists: RIS answers 200
 * with `OgdSearchResult.Error` where another API would answer 500, and all
 * three clients that read it checked the same shape by hand.
 */
export async function risJson<T>(url: string, policy: UpstreamPolicy): Promise<T> {
  try {
    return await withRetries(url, policy, async (res) => {
      assertOk(res, url)
      const body = (await res.json()) as { OgdSearchResult?: { Error?: unknown } } | null
      const result = body?.OgdSearchResult
      if (!result || result.Error) throw new RisEnvelopeError(url, result?.Error ?? body)
      return result as T
    })
  } catch (err) {
    // An envelope error is RIS answering, not RIS being away. The search
    // endpoint tells the two apart for the user, so it must not arrive
    // wrapped as "unreachable".
    if (err instanceof UpstreamUnreachableError && err.cause instanceof RisEnvelopeError) throw err.cause
    throw err
  }
}
