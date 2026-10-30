/**
 * Who may call what, how often — the rules behind `server/middleware/guard.ts`,
 * kept pure so vitest can execute them.
 *
 * WHO IS EXTERNAL. Caddy is the only way in from outside and it sets
 * X-Forwarded-For on every request it proxies. Node listens on 127.0.0.1, so
 * a request WITHOUT the header came from the box itself: the prewarm and
 * watchdog units (`deploy/systemd/`), which curl 127.0.0.1:3000 directly.
 *
 * WHAT IS NOT A REQUEST OF ITS OWN (since 22.10.2026). A server-side render
 * calls the API in-process, and where it forwards the visitor's headers —
 * X-Forwarded-For included — that call drew a token of its own: a draft
 * page's SSR cost two (the page and `/api/drafts/:gp/:inr`; its
 * `/erlaeuterungen` call carries no X-Forwarded-For and never counted —
 * measured on a production build, 22.10.2026). An in-process call is no new
 * arrival: its page was admitted at the door, and it is told apart by its
 * socket (`isInProcessRequest`). What the page costs upstream is bounded
 * where it is spent — the per-host slots in `upstream/fetch.ts` — not by
 * counting its parts here. The sections a browser loads after the page are
 * requests of their own and count as before.
 *
 * WHICH ADDRESS. The LAST entry of the header, the one Caddy itself
 * appended: everything left of it was sent by the client and can say
 * anything. Caddy without `trusted_proxies` writes exactly one entry, so
 * last and first agree today; if a CDN is ever put in front, this is the
 * line to revisit, because then the last entry is the CDN.
 *
 * IPv6 is keyed by its /64: one connection typically holds a whole /64, and
 * a per-address limit there is a limit nobody has to respect.
 */

/**
 * Whether a request is an in-process sub-request of a page being rendered —
 * Nitro's `localFetch`, whose mock socket (node-mock-http) carries an empty
 * `remoteAddress`. A real connection always has one: Caddy's 127.0.0.1, or
 * the box's own curl. Undefined is NOT in-process — a socket whose address
 * is gone (a client that hung up) still counts — so a Nitro that changed its
 * mock would count these calls again, the old and safe behaviour.
 */
export function isInProcessRequest(remoteAddress: string | null | undefined): boolean {
  return remoteAddress === ''
}

/**
 * The path the router will see, normalised so an encoding or a doubled slash
 * is no way past the checks — the door's checks (`middleware/guard.ts`) and
 * the page-view count (`zaehlung/klassen.ts`) read the same path.
 */
export function normalisedPath(raw: string): string {
  const path = raw.split('?')[0] ?? ''
  let decoded = path
  try {
    decoded = decodeURIComponent(path)
  } catch {
    // Malformed escapes: judge the raw path; the router will 404 it anyway.
  }
  return decoded.replace(/\/{2,}/g, '/').toLowerCase()
}

/** Routes that exist for the prewarm unit alone and fan out hundreds of upstream requests cold. */
const PREWARM_ONLY = [/^\/api\/stations(?:\/|$)/, /^\/api\/ris-map(?:\/|$)/, /^\/api\/bgbl\/teil2\/?$/]

export function isPrewarmOnlyPath(path: string): boolean {
  return PREWARM_ONLY.some((re) => re.test(path))
}

/**
 * Assets cost nothing and a first page load pulls a few dozen of them; they
 * are not counted, so the global budget below means "pages and API calls".
 */
export function isUncountedPath(path: string): boolean {
  return (
    path.startsWith('/_nuxt/') ||
    path.startsWith('/fonts/') ||
    path.startsWith('/favicon') ||
    path === '/apple-touch-icon.png' ||
    path === '/robots.txt'
  )
}

export interface BucketRule {
  /** Requests that may arrive at once. */
  burst: number
  /** Requests regained per minute, continuously. */
  perMinute: number
}

/**
 * The numbers, as constraints:
 *
 * - `global` must never be felt by a reader. An SSR page is one request
 *   (its in-process API calls are free, `isInProcessRequest`), and client
 *   navigation adds a few calls per click — 240 at once and 240 a minute
 *   covers someone clicking through drafts as fast as they can. A crawler
 *   that ignores robots.txt is slowed to four requests a second — four
 *   pages since an SSR page costs one token, where it was two (22.10.2026).
 *   Warm, a draft page renders in about 90 ms; cold, its upstream calls
 *   queue in the per-host slots (`upstream/fetch.ts`, 16 at once to
 *   Parliament).
 * - `search` costs one uncached RIS request plus an XML re-parse every
 *   time. The field debounces 700 ms, so a reader typing produces a handful;
 *   20 at once and 12 a minute leave room for that and none for a loop.
 * - `statementDocs` is up to 32 uncached upstream GETs per call. A reader
 *   scrolling a 700-row list fast sends ~22 batches, which the burst of 30
 *   absorbs; 20 a minute after that caps a loop at ~640 upstream requests a
 *   minute in the worst case of all-cold refs.
 */
export const RATE_RULES = {
  global: { burst: 240, perMinute: 240 },
  search: { burst: 20, perMinute: 12 },
  statementDocs: { burst: 30, perMinute: 20 },
} as const satisfies Record<string, BucketRule>

export type RateClass = keyof typeof RATE_RULES

/** The strict bucket a path draws from in ADDITION to `global`, if any. */
export function strictClassFor(path: string): RateClass | null {
  if (path === '/api/suche' || path === '/api/suche/') return 'search'
  if (path === '/api/stellungnahmen/dokumente' || path === '/api/stellungnahmen/dokumente/') return 'statementDocs'
  return null
}

/** The rate-limit key for a request, or null when it did not come through the proxy. */
export function clientKeyFromForwardedFor(xff: string | null | undefined): string | null {
  if (xff === null || xff === undefined) return null
  const last = xff.split(',').at(-1)?.trim() ?? ''
  if (!last) return 'unknown'
  return last.includes(':') ? ipv6Prefix64(last) : last
}

/** "2001:db8:1:2:3::4" → "2001:db8:1:2::/64"; falls back to the input when it is not parseable. */
export function ipv6Prefix64(addr: string): string {
  const bare = addr.replace(/^\[|\]$/g, '').split('%')[0]!.toLowerCase()
  // An IPv4-mapped address is an IPv4 address.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(bare)
  if (mapped) return mapped[1]!
  const halves = bare.split('::')
  if (halves.length > 2) return bare
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - head.length - tail.length
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return bare
  const groups = [...head, ...Array<string>(missing).fill('0'), ...tail]
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`
}

interface Bucket {
  tokens: number
  at: number
}

export interface RateLimiter {
  /** Takes one token; returns 0 when allowed, else the seconds until one is free. */
  take(key: string, now?: number): number
  readonly size: number
}

/**
 * A token bucket per key, in a Map that cannot grow without bound.
 *
 * Idle keys are swept once a minute (lazily, on a request — no timer to
 * leak): a bucket that has refilled completely carries no information. If
 * the map still exceeds `maxKeys` — many distinct addresses at once — the
 * oldest entries go first; losing one forgets a client's debt, which errs
 * towards letting a request through.
 */
export function createRateLimiter(rule: BucketRule, maxKeys = 10_000): RateLimiter {
  const buckets = new Map<string, Bucket>()
  const perMs = rule.perMinute / 60_000
  const fullAfterMs = rule.burst / perMs
  let lastSweep = 0

  function sweep(now: number) {
    lastSweep = now
    for (const [key, b] of buckets) if (now - b.at >= fullAfterMs) buckets.delete(key)
    for (const key of buckets.keys()) {
      if (buckets.size <= maxKeys) break
      buckets.delete(key)
    }
  }

  return {
    take(key, now = Date.now()) {
      if (now - lastSweep >= 60_000 || buckets.size > maxKeys) sweep(now)
      const b = buckets.get(key)
      const tokens = b ? Math.min(rule.burst, b.tokens + (now - b.at) * perMs) : rule.burst
      if (tokens < 1) {
        buckets.set(key, { tokens, at: now })
        return Math.ceil((1 - tokens) / perMs / 1000)
      }
      // Re-inserted so the Map's order stays least-recently-used first.
      buckets.delete(key)
      buckets.set(key, { tokens: tokens - 1, at: now })
      return 0
    },
    get size() {
      return buckets.size
    },
  }
}
