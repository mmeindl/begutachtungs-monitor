import { describe, expect, it } from 'vitest'
import {
  RATE_RULES,
  clientKeyFromForwardedFor,
  createRateLimiter,
  ipv6Prefix64,
  isPrewarmOnlyPath,
  isUncountedPath,
  strictClassFor,
} from '../server/utils/http/rateLimit'

/**
 * The door policy (`server/middleware/guard.ts`). What costs the most if it
 * breaks: a prewarm route reachable from outside (hundreds of upstream
 * requests per call), or a budget a reader can feel.
 */
describe('who is outside', () => {
  it('treats a request without X-Forwarded-For as local', () => {
    expect(clientKeyFromForwardedFor(undefined)).toBeNull()
    expect(clientKeyFromForwardedFor(null)).toBeNull()
  })

  /* The entry Caddy appended is the last one; anything before it is what
   * the client claimed. */
  it('keys by the entry the proxy appended, not the one the client sent', () => {
    expect(clientKeyFromForwardedFor('203.0.113.7')).toBe('203.0.113.7')
    expect(clientKeyFromForwardedFor('1.2.3.4, 203.0.113.7')).toBe('203.0.113.7')
    expect(clientKeyFromForwardedFor('')).toBe('unknown')
  })

  it('keys IPv6 by its /64', () => {
    expect(clientKeyFromForwardedFor('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64')
    expect(clientKeyFromForwardedFor('2001:db8:1:2:bbbb::9')).toBe('2001:db8:1:2::/64')
    expect(ipv6Prefix64('2001:db8::1')).toBe('2001:db8:0:0::/64')
    expect(ipv6Prefix64('::1')).toBe('0:0:0:0::/64')
    expect(ipv6Prefix64('[2001:0db8:0001:0002:0:0:0:1]')).toBe('2001:db8:1:2::/64')
    expect(ipv6Prefix64('::ffff:203.0.113.7')).toBe('203.0.113.7')
  })
})

describe('which routes', () => {
  it('knows the prewarm-only routes, and only those', () => {
    for (const p of ['/api/stations/aktuell', '/api/stations/XXVII', '/api/ris-map/aktuell', '/api/bgbl/teil2', '/api/stations']) {
      expect(isPrewarmOnlyPath(p), p).toBe(true)
    }
    for (const p of ['/api/drafts', '/api/ris-drafts', '/entwuerfe/XXVIII/8', '/api/stationsx', '/api/bgbl/teil2x']) {
      expect(isPrewarmOnlyPath(p), p).toBe(false)
    }
  })

  it('puts the two upstream-per-call routes into their strict buckets', () => {
    expect(strictClassFor('/api/suche')).toBe('search')
    expect(strictClassFor('/api/stellungnahmen/dokumente')).toBe('statementDocs')
    expect(strictClassFor('/api/drafts')).toBeNull()
  })

  it('does not count assets', () => {
    expect(isUncountedPath('/_nuxt/entry.js')).toBe(true)
    expect(isUncountedPath('/fonts/SourceSerif4-Semibold.woff2')).toBe(true)
    expect(isUncountedPath('/api/drafts')).toBe(false)
  })
})

describe('the token bucket', () => {
  it('lets a burst through, then refuses with the seconds to wait', () => {
    const limiter = createRateLimiter({ burst: 3, perMinute: 6 })
    expect([0, 1, 2].map(() => limiter.take('a', 0))).toEqual([0, 0, 0])
    // One token per 10 s.
    expect(limiter.take('a', 0)).toBe(10)
    expect(limiter.take('a', 10_000)).toBe(0)
    // Another client is untouched.
    expect(limiter.take('b', 10_000)).toBe(0)
  })

  it('forgets idle clients and never holds more than its bound', () => {
    const limiter = createRateLimiter({ burst: 2, perMinute: 60 }, 100)
    for (let i = 0; i < 500; i++) limiter.take(`k${i}`, i)
    expect(limiter.size).toBeLessThanOrEqual(101)
    // Long after, a request sweeps every bucket that has refilled.
    limiter.take('late', 10 * 60_000)
    expect(limiter.size).toBe(1)
  })

  /* The reader-facing constraint: a draft page plus its SSR calls and a
   * dozen client navigations in a minute must not come near the limit. */
  it('is generous enough globally for fast reading', () => {
    const limiter = createRateLimiter(RATE_RULES.global)
    for (let i = 0; i < 200; i++) expect(limiter.take('reader', i * 100)).toBe(0)
  })
})
