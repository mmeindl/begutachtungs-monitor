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

import { safeExternalUrl } from '../../../shared/utils/safeExternalUrl'
import { createSlots, type Slots } from './slots'

/** One identity for every request this server makes (decided 22.09.2026). */
export const USER_AGENT = 'begutachtungs-monitor/0.1 (+https://begutachtungs-monitor.at)'

/**
 * How many requests this process keeps in flight to one upstream host —
 * the outbound half of the door policy (`server/middleware/guard.ts` is
 * the inbound one), and the only half that holds however a fan-out is
 * started (22.10.2026).
 *
 * The guard hides `/api/stations/:gp`, whose cold build fans out to 300–650
 * Parliament requests, twelve at a time (`parliament/stationMap.ts`). But
 * `/api/drafts?gp=…` starts that same build for any plausible period, and
 * fifteen such requests — XIV to XXVIII — put 180 requests in flight at
 * once against a service that documents no rate limit; the guard's own
 * header names what follows when Parliament limits this server's address.
 * No route can be closed against that without closing a page, so the cap
 * sits where every request passes: here.
 *
 * The numbers are the widest legitimate fan-outs, so that no single normal
 * build waits:
 *
 * - Parliament, 16: a cold station map holds 12, and a page view beside it
 *   takes three or four (list 81, the Gegenstand, list 142, the Vorlage).
 *   Two cold builds at once now queue instead of doubling the load.
 * - Every other host — the RIS ones — 24: a cold draft page fetches §
 *   documents in three sections side by side, the Lesefassung 16 of them
 *   (four Artikel × four §§, `kons/konsService.ts`), the annex check and the
 *   § names four each.
 *
 * A slot is taken per ATTEMPT and given back when the attempt is over — the
 * body read included, nothing else: never across a backoff, never across a
 * cached function the caller awaits. No request can therefore wait for a
 * slot while holding one, which is what keeps nested fan-outs (the
 * Lesefassung's four-in-four) free of deadlock. The per-attempt timeout
 * starts once the slot is taken: time spent queued is this server's, not the
 * upstream's, and must not count as the upstream being slow.
 */
export const HOST_CONCURRENCY: Readonly<Record<string, number>> = { 'www.parlament.gv.at': 16 }
export const DEFAULT_HOST_CONCURRENCY = 24

const slotsByHost = new Map<string, Slots>()

/** The slots of the host `url` names; one table for the whole process. */
function slotsFor(url: string): Slots {
  let host = ''
  try {
    host = new URL(url).host
  } catch {
    // An unparseable URL fails in `fetch` itself; it queues with the rest.
  }
  let slots = slotsByHost.get(host)
  if (!slots) {
    slots = createSlots(HOST_CONCURRENCY[host] ?? DEFAULT_HOST_CONCURRENCY)
    slotsByHost.set(host, slots)
  }
  return slots
}

/** The RIS OGD endpoint every Applikation (Begut, BrKons, BgblAuth) is queried through. */
export const RIS_API_BASE = 'https://data.bka.gv.at/ris/api/v2.6/Bundesrecht'

/**
 * The largest body a read takes when its policy names no cap of its own.
 *
 * A ceiling, set above every legitimate body measured on 22.10.2026: list
 * 142 of one Ministerialentwurf reaches ~42 MB (XXVII 164/ME, 106.183
 * Stellungnahmen), a RIS Begut page of 100 records is 1,9 MB, and nothing
 * else either upstream sends passes 300 KB. Until then JSON and text had no
 * ceiling at all, and the byte cap was compared only once the whole body sat
 * in memory — against a local server sending without a length, a 1 MB cap
 * refused after 64 MB had arrived. The server runs with a 384 MB heap.
 *
 * Callers with a measured number of their own pass it (`fetchDocument`, the
 * PDFs, Parliament's lists in `parliament.ts`). The scripts pass `Infinity`:
 * a measurement over a whole period reads list 142 in one piece — ~95 MB for
 * GP XXVII — and runs on a machine that is not the server.
 */
export const DEFAULT_MAX_BYTES = 64 * 1024 * 1024

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
  /**
   * Refuse a body larger than this, by the declared length before the
   * download and by the bytes counted during it. Omitted:
   * `DEFAULT_MAX_BYTES`. `Infinity` reads whatever comes.
   */
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
  /**
   * Fetch only URLs on the upstream allowlist (`safeExternalUrl`), and follow
   * redirects by hand so every hop is held to it too. Set by every client
   * whose URL comes out of upstream DATA rather than from a constant here —
   * a document link, a RIS `ContentUrl` — so a compromised upstream cannot
   * point this server at an internal address. A refused URL throws
   * `UpstreamRefusedError` and is never requested.
   */
  upstreamHostsOnly?: boolean
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

/** A URL, or a redirect target, off the upstream allowlist. Never requested, never retried. */
export class UpstreamRefusedError extends UpstreamError {
  readonly retryable = false
  constructor(readonly url: string) {
    super(`Adresse außerhalb der Quellen abgelehnt: ${url}`)
    this.name = 'UpstreamRefusedError'
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
    // Manual where the hosts are held to the allowlist: `fetch` would
    // otherwise follow a redirect to any host before anything could look.
    ...(policy.upstreamHostsOnly ? { redirect: 'manual' as const } : {}),
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
 *
 * Each attempt holds one of its host's slots (`HOST_CONCURRENCY`) from
 * before the request to after the body, and gives it back on every way out
 * — answer, error, timeout. `consume` must therefore only read: an upstream
 * call inside it would wait for a slot while holding one.
 */
async function withRetries<T>(
  url: string,
  policy: UpstreamPolicy,
  consume: (res: Response) => Promise<T> | T,
): Promise<T> {
  if (policy.upstreamHostsOnly) {
    const safe = safeExternalUrl(url)
    if (!safe) throw new UpstreamRefusedError(url)
    url = safe
  }
  const slots = slotsFor(url)
  let lastError: unknown
  for (let attempt = 0; attempt <= policy.retries; attempt++) {
    if (attempt > 0 && policy.backoffMs) await sleep(policy.backoffMs(attempt))

    const release = await slots.acquire()
    try {
      let res: Response
      try {
        // `requestInit` after the slot, not before: it starts the timeout.
        res = policy.upstreamHostsOnly
          ? await fetchWithinUpstreams(url, requestInit(policy))
          : await fetch(url, requestInit(policy))
      } catch (err) {
        // A refused hop or a broken redirect chain is an answer, not a bad minute.
        if (err instanceof UpstreamError && !err.retryable) throw err
        // Network error or timeout.
        lastError = err
        continue
      }

      if (res.status >= 500 || (!res.ok && policy.retryOnHttpError)) {
        // Unread, the body would keep the connection busy past the slot.
        abandon(res.body)
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
    } finally {
      release()
    }
  }
  throw new UpstreamUnreachableError(url, lastError)
}

/** Redirect hops followed by hand before the chain counts as a failure. */
const MAX_REDIRECTS = 5

/**
 * `fetch` with redirects followed by hand, each target held to the upstream
 * allowlist before it is requested. A 303, and a 301/302 after a POST, turn
 * into a GET without a body, as `fetch` itself would do.
 */
async function fetchWithinUpstreams(url: string, init: RequestInit): Promise<Response> {
  let current = url
  let currentInit = init
  for (let hop = 0; ; hop++) {
    const res = await fetch(current, currentInit)
    if (res.status < 300 || res.status >= 400 || res.status === 304) return res
    const location = res.headers.get('location')
    await res.body?.cancel()
    if (!location) throw new UpstreamHttpError(res.status, current)
    if (hop >= MAX_REDIRECTS) throw new UpstreamHttpError(res.status, current)
    let target: string | null
    try {
      target = safeExternalUrl(new URL(location, current).href)
    } catch {
      target = null
    }
    if (!target) throw new UpstreamRefusedError(location)
    const method = (currentInit.method ?? 'GET').toUpperCase()
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === 'POST')) {
      currentInit = { ...currentInit, method: 'GET', body: undefined }
    }
    current = target
  }
}

/**
 * The raw answer, retried per policy. A non-OK status below 500 is
 * RETURNED, not thrown — the callers that map 404 onto their own answer
 * need to see it. The body is left unread, and with it `maxBytes` and the
 * host slot: the slot comes back once the headers are in, so a caller
 * reading a large body here reads it outside `HOST_CONCURRENCY`. No request
 * path calls this; the reads below are what they use.
 */
export function fetchUpstream(url: string, policy: UpstreamPolicy): Promise<Response> {
  return withRetries(url, policy, (res) => res)
}

function assertOk(res: Response, url: string): void {
  if (res.ok) return
  abandon(res.body)
  throw new UpstreamHttpError(res.status, url)
}

/**
 * The body, counted while it arrives and dropped the moment it passes the
 * cap — every read below goes through here, whatever it decodes to.
 *
 * Read by hand rather than with `arrayBuffer()`, `json()` or `text()`:
 * those buffer the whole body before anything can compare, so a cap
 * checked after them limits what is kept, not what is downloaded. The
 * declared `content-length` is still checked first — refusing before the
 * download is cheaper still — but it is a claim, not a fact, and a chunked
 * answer makes none.
 */
async function readCapped(res: Response, url: string, policy: UpstreamPolicy): Promise<Uint8Array<ArrayBuffer>> {
  const max = policy.maxBytes ?? DEFAULT_MAX_BYTES
  const declared = Number(res.headers.get('content-length') ?? 0)
  if (declared > max) {
    abandon(res.body)
    throw new UpstreamTooLargeError(url, declared)
  }
  const chunks: Uint8Array[] = []
  let total = 0
  const reader = res.body?.getReader()
  while (reader) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      abandon(reader)
      throw new UpstreamTooLargeError(url, total)
    }
    chunks.push(value)
  }
  // One fresh buffer even for a single chunk: a chunk may be a view into a
  // larger pooled buffer, and `upstreamBytes` hands out the buffer itself.
  const body = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    body.set(chunk, at)
    at += chunk.byteLength
  }
  return body
}

/**
 * Cancels a body that will not be read: that ends the download, not only the
 * reading of it. Not awaited — the refusal does not depend on it, and the
 * cancel of a teed stream settles only once its twin is cancelled too.
 */
function abandon(body: { cancel(): Promise<void> } | null | undefined): void {
  void body?.cancel().catch(() => {})
}

/** UTF-8 with a byte-order mark dropped — what `Response.text()` and `json()` do. */
function utf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

/** Parsed JSON. A non-OK status throws `UpstreamHttpError`, a bad body is retried. */
export function upstreamJson<T>(url: string, policy: UpstreamPolicy): Promise<T> {
  return withRetries(url, policy, async (res) => {
    assertOk(res, url)
    return JSON.parse(utf8(await readCapped(res, url, policy))) as T
  })
}

/** The body as text, decoded the way `fetch` decodes it. */
export function upstreamText(url: string, policy: UpstreamPolicy): Promise<string> {
  return withRetries(url, policy, async (res) => {
    assertOk(res, url)
    return utf8(await readCapped(res, url, policy))
  })
}

export interface UpstreamBody {
  bytes: ArrayBuffer
  /** The header, for callers that have to decode the bytes themselves. */
  contentType: string | null
}

/** The body as bytes, refused above `policy.maxBytes` (`readCapped`). */
export function upstreamBytes(url: string, policy: UpstreamPolicy): Promise<UpstreamBody> {
  return withRetries(url, policy, async (res) => {
    assertOk(res, url)
    const bytes = await readCapped(res, url, policy)
    return { bytes: bytes.buffer, contentType: res.headers.get('content-type') }
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
      const body = JSON.parse(utf8(await readCapped(res, url, policy))) as { OgdSearchResult?: { Error?: unknown } } | null
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
