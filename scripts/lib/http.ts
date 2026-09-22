/**
 * The HTTP a measurement script does: one identity, one retry loop.
 *
 * Five retry loops lived in five scripts, and what differed between them was
 * never the mechanics — only the numbers, and those are measured decisions
 * that stay at the call site as a policy the caller passes and comments.
 * Same rule as `server/utils/upstream/fetch.ts`, which is the same idea for
 * the request path and is deliberately NOT used here: it carries its own
 * `UpstreamError` classes and hard-codes the server's User-Agent, while a
 * script has to name itself in the User-Agent so an upstream operator
 * reading the log can tell which measurement made the traffic. What the two
 * do share is the identity, which is imported rather than written twice.
 */
import { USER_AGENT, sleep } from '../../server/utils/upstream/fetch'

/** The RIS OGD endpoint every Applikation (Begut, BrKons, BgblAuth) is queried through. */
export const RIS_API = 'https://data.bka.gv.at/ris/api/v2.6/Bundesrecht'

/** Parliament's site, which is also its API host. */
export const PARLIAMENT = 'https://www.parlament.gv.at'

/**
 * `begutachtungs-monitor/0.1 (+https://begutachtungs-monitor.at; scripts/<name>)`
 * — the server's identity with the script's own name appended (decided
 * 22.09.2026). The URL form is the useful one for an upstream operator: it
 * says whom to contact, and the script name says what to ask about.
 */
export function scriptUserAgent(script: string): string {
  return USER_AGENT.replace(/\)$/, `; scripts/${script})`)
}

export interface HttpOptions {
  /** Names the caller in the User-Agent; `me-harness`, not `scripts/me-harness`. */
  script: string
  /** Attempts in total, the first included. `1` means no retry. */
  attempts?: number
  /** Wait before retry `n` (1-based, so the first retry is `n = 1`). */
  backoffMs?: (retry: number) => number
  /** Per attempt, not per call. */
  timeoutMs?: number
  /**
   * Retry EVERY non-OK status, not just 5xx. Off, a 404 throws at once —
   * a second request for a document that is not there is the same answer.
   */
  retryOnHttpError?: boolean
  method?: 'GET' | 'POST'
  /** JSON-encoded, and it sets the Content-Type. */
  body?: unknown
  accept?: string
  /** Merged over the ones built here, so a caller can override Accept. */
  headers?: Record<string, string>
  /** Told about every failed attempt — the scripts that report progress say so on stderr. */
  onFailure?: (err: unknown, attempt: number) => void
  /** The error thrown once every attempt failed. Default: the last failure itself. */
  onExhausted?: (url: string, lastError: unknown) => Error
}

const DEFAULT_TIMEOUT_MS = 30_000

/** A non-OK answer the policy says not to retry. */
class HttpStatusError extends Error {
  constructor(readonly status: number, url: string) {
    super(`HTTP ${status} für ${url}`)
    this.name = 'HttpStatusError'
  }
}

/**
 * One request, retried per policy, with the body read inside the loop.
 *
 * Reading the body is part of the transport: a truncated answer and a dropped
 * connection are the same failure, and every loop this replaces retried both.
 */
async function withRetry<T>(url: string, opts: HttpOptions, consume: (res: Response) => Promise<T>): Promise<T> {
  const attempts = opts.attempts ?? 1
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (attempt > 1 && opts.backoffMs) await sleep(opts.backoffMs(attempt - 1))
    try {
      const res = await fetch(url, {
        method: opts.method ?? 'GET',
        headers: {
          'User-Agent': scriptUserAgent(opts.script),
          ...(opts.accept ? { Accept: opts.accept } : {}),
          ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...opts.headers,
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      })
      if (!res.ok) {
        const err = new HttpStatusError(res.status, url)
        if (res.status < 500 && !opts.retryOnHttpError) throw err
        lastError = err
        opts.onFailure?.(err, attempt)
        continue
      }
      return await consume(res)
    } catch (err) {
      if (err instanceof HttpStatusError) throw err
      lastError = err
      opts.onFailure?.(err, attempt)
    }
  }
  throw opts.onExhausted ? opts.onExhausted(url, lastError) : lastError
}

/** The body as text, decoded the way `fetch` decodes it. */
export function getText(url: string, opts: HttpOptions): Promise<string> {
  return withRetry(url, opts, (res) => res.text())
}

/** Parsed JSON. A body that does not parse counts as a failed attempt. */
export function getJson<T = unknown>(url: string, opts: HttpOptions): Promise<T> {
  return withRetry(url, { accept: 'application/json', ...opts }, async (res) => (await res.json()) as T)
}

/**
 * One RIS OGD answer, whole — the envelope stays on, because every caller
 * reaches into a different corner of it.
 *
 * `__url` in the parameters replaces the RIS endpoint with that URL, which is
 * how `kons-harness.ts` reads a Parliament detail page through the same
 * helper (and therefore through the same offline cache).
 */
export function risJson<T = unknown>(params: Record<string, string>, opts: HttpOptions): Promise<T> {
  const { __url: url, ...query } = params
  return getJson<T>(url ?? `${RIS_API}?${new URLSearchParams(query)}`, opts)
}
