/**
 * The HTTP a measurement script does: one identity, and the server's client.
 *
 * `server/utils/upstream/fetch.ts` is the one retry loop in this repo and is
 * Nitro-free on purpose, so a script can use it. What kept the scripts on a
 * second copy of it until 23.09.2026 was the identity: that module hard-coded
 * the server's User-Agent, and a script has to name ITSELF in the header so
 * an upstream operator reading the log can tell which measurement made the
 * traffic. `UpstreamPolicy` now carries a `userAgent`, and what is left here
 * is the translation: the script's name, the two hosts, and the three call
 * shapes the scripts ask for.
 *
 * The numbers stay where they were measured. Every caller passes its own
 * attempts, backoff and timeout, and each keeps the comment that justifies
 * them — the same rule the shared client already states for the request path.
 */
import {
  RIS_API_BASE,
  USER_AGENT,
  UpstreamUnreachableError,
  upstreamJson,
  upstreamText,
  type UpstreamPolicy,
} from '../../server/utils/upstream/fetch'

/** The RIS OGD endpoint every Applikation (Begut, BrKons, BgblAuth) is queried through. */
export const RIS_API = RIS_API_BASE

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
  /** Names the caller in the User-Agent; `harness/me`, not `scripts/harness/me.ts`. */
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
  /**
   * The error thrown once every attempt failed, for a caller that says what
   * it was doing („RIS nicht erreichbar bei Begut-Seite 12"). It is handed
   * the last failure, which is what a hand-written loop used to see. Without
   * it the caller gets `UpstreamUnreachableError`, which names the URL.
   */
  onExhausted?: (url: string, lastError: unknown) => Error
}

const DEFAULT_TIMEOUT_MS = 30_000

function policyOf(opts: HttpOptions, accept?: string): UpstreamPolicy {
  return {
    timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    retries: (opts.attempts ?? 1) - 1,
    backoffMs: opts.backoffMs,
    retryOnHttpError: opts.retryOnHttpError,
    method: opts.method,
    body: opts.body,
    accept: opts.accept ?? accept,
    userAgent: scriptUserAgent(opts.script),
  }
}

/** Runs the call and lets a caller that named an exhaustion message have it. */
async function withMessage<T>(url: string, opts: HttpOptions, run: () => Promise<T>): Promise<T> {
  if (!opts.onExhausted) return await run()
  try {
    return await run()
  } catch (err) {
    if (err instanceof UpstreamUnreachableError) throw opts.onExhausted(url, err.cause)
    throw err
  }
}

/** The body as text, decoded the way `fetch` decodes it. */
export function getText(url: string, opts: HttpOptions): Promise<string> {
  return withMessage(url, opts, () => upstreamText(url, policyOf(opts)))
}

/** Parsed JSON. A body that does not parse counts as a failed attempt. */
export function getJson<T = unknown>(url: string, opts: HttpOptions): Promise<T> {
  return withMessage(url, opts, () => upstreamJson<T>(url, policyOf(opts, 'application/json')))
}

/**
 * One RIS OGD answer, whole — the envelope stays on, because every caller
 * reaches into a different corner of it.
 *
 * Deliberately NOT the shared client's own `risJson`, which unwraps to
 * `OgdSearchResult` and raises `RisEnvelopeError` on `.Error`. Two reasons,
 * both in the callers: they read the envelope themselves and decide what an
 * error in it means for their run, and `__url` makes this the path a
 * PARLIAMENT detail page is read through as well (`harness/kons.ts`), where
 * there is no `OgdSearchResult` to unwrap at all.
 *
 * `__url` in the parameters replaces the RIS endpoint with that URL, which is
 * how that page goes through the same helper — and therefore through the same
 * offline cache.
 */
export function risJson<T = unknown>(params: Record<string, string>, opts: HttpOptions): Promise<T> {
  const { __url: url, ...query } = params
  return getJson<T>(url ?? `${RIS_API}?${new URLSearchParams(query)}`, opts)
}
