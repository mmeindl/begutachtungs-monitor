/**
 * Stale-while-revalidate with a limit (`server/utils/cache/stale.ts`): an
 * entry is fresh for `maxAge`, served stale while it refreshes until the
 * limit, and refused past it — and whatever the function's own `validate`
 * refuses stays refused at any age.
 *
 * A request that reaches the server directly waits for fresh values: inside
 * that context the limit is `maxAge` itself. The block on h3 runs the real
 * `middleware/guard.ts` in the chain Nitro builds, to show the context
 * reaches the route handler, the page's in-process calls, and nobody else.
 *
 * The last block holds the helper to what it rests on: that nitropack serves
 * a stale entry only while `validate` accepts it, and otherwise makes the
 * request wait.
 */
import { Agent, createServer, request, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { keepIncompleteFor, onlyComplete } from '../server/utils/cache/gathered'
import { isWaitingForFresh, rebuildMark, staleWithin, waitingForFresh } from '../server/utils/cache/stale'
import { nitroCacheSource, nitroRequestModules } from './helpers/nitropack'

const HALF_HOUR_S = 30 * 60
const THREE_HOURS_S = 3 * 60 * 60
const NOW = 1_000_000_000_000

/** An entry `ageS` seconds old, at a frozen `NOW`. */
function aged<T = string>(ageS: number, value: T = 'list' as T) {
  return { value, mtime: NOW - ageS * 1000 }
}

describe('staleWithin', () => {
  afterEach(() => vi.useRealTimers())
  const freeze = () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  }

  it('sets the options Nitro reads: the maxAge, swr on, and its own validate', () => {
    const opts = staleWithin(HALF_HOUR_S, THREE_HOURS_S)
    expect(opts.maxAge).toBe(HALF_HOUR_S)
    expect(opts.swr).toBe(true)
    expect(typeof opts.validate).toBe('function')
  })

  it('accepts a fresh entry', () => {
    freeze()
    expect(staleWithin(HALF_HOUR_S, THREE_HOURS_S).validate(aged(60))).toBe(true)
  })

  it('accepts an expired entry within the limit — Nitro serves it and refreshes behind the request', () => {
    freeze()
    const { validate } = staleWithin(HALF_HOUR_S, THREE_HOURS_S)
    expect(validate(aged(HALF_HOUR_S + 1))).toBe(true)
    expect(validate(aged(THREE_HOURS_S))).toBe(true)
  })

  it('refuses an entry past the limit — the request waits, as without SWR', () => {
    freeze()
    const { validate } = staleWithin(HALF_HOUR_S, THREE_HOURS_S)
    expect(validate(aged(THREE_HOURS_S + 1))).toBe(false)
    expect(validate(aged(60 * 60 * 24 * 7))).toBe(false)
  })

  it('accepts what was just computed — Nitro asks on the write, with mtime now', () => {
    freeze()
    expect(staleWithin(HALF_HOUR_S, THREE_HOURS_S).validate(aged(0))).toBe(true)
  })

  it('refuses no value, and an entry without a time', () => {
    freeze()
    const { validate } = staleWithin(HALF_HOUR_S, THREE_HOURS_S)
    expect(validate({ mtime: NOW })).toBe(false)
    expect(validate({ value: undefined, mtime: NOW })).toBe(false)
    expect(validate({ value: 'list' })).toBe(false)
  })

  it('keeps a falsy value that is a real answer', () => {
    freeze()
    const { validate } = staleWithin(HALF_HOUR_S, THREE_HOURS_S)
    expect(validate(aged(60, null))).toBe(true)
    expect(validate(aged(60, 0))).toBe(true)
    expect(validate(aged(60, ''))).toBe(true)
  })

  it('refuses a limit that would be no stale window at all', () => {
    expect(() => staleWithin(HALF_HOUR_S, HALF_HOUR_S)).toThrow(/must exceed/)
    expect(() => staleWithin(THREE_HOURS_S, HALF_HOUR_S)).toThrow(/must exceed/)
  })

  describe('with onlyComplete', () => {
    const { validate } = staleWithin(HALF_HOUR_S, THREE_HOURS_S, onlyComplete)

    it('serves a complete value stale within the limit, and not past it', () => {
      freeze()
      expect(validate(aged(HALF_HOUR_S + 1, { complete: true }))).toBe(true)
      expect(validate(aged(THREE_HOURS_S + 1, { complete: true }))).toBe(false)
    })

    it('never keeps an incomplete one, however young', () => {
      freeze()
      expect(validate(aged(0, { complete: false }))).toBe(false)
    })
  })

  describe('with keepIncompleteFor', () => {
    const TEN_MIN_MS = 10 * 60 * 1000
    const FIVE_S_MS = 5_000
    const SIX_HOURS_S = 6 * 60 * 60
    const DAY_S = 24 * 60 * 60
    const { validate } = staleWithin(SIX_HOURS_S, DAY_S, keepIncompleteFor(TEN_MIN_MS, FIVE_S_MS))

    it('serves a complete map stale up to the limit', () => {
      freeze()
      expect(validate(aged(SIX_HOURS_S + 60, { complete: true }))).toBe(true)
      expect(validate(aged(DAY_S + 1, { complete: true }))).toBe(false)
    })

    it('keeps a failed map for its ten minutes and never serves it stale past them', () => {
      freeze()
      expect(validate(aged(60, { complete: false }))).toBe(true)
      expect(validate(aged(TEN_MIN_MS / 1000 + 1, { complete: false }))).toBe(false)
    })

    it('keeps a pending map for seconds only', () => {
      freeze()
      expect(validate(aged(1, { complete: false, pending: true }))).toBe(true)
      expect(validate(aged(6, { complete: false, pending: true }))).toBe(false)
    })
  })
})

describe('staleWithin for a request that waits for fresh values', () => {
  afterEach(() => vi.useRealTimers())
  const freeze = () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  }
  const { validate } = staleWithin(HALF_HOUR_S, THREE_HOURS_S)

  it('refuses an expired entry the limit would still serve — Nitro then makes the request await the refresh', () => {
    freeze()
    expect(validate(aged(HALF_HOUR_S + 1))).toBe(true)
    expect(waitingForFresh(() => validate(aged(HALF_HOUR_S + 1)))).toBe(false)
    expect(waitingForFresh(() => validate(aged(THREE_HOURS_S)))).toBe(false)
  })

  it('accepts a fresh entry, and the value just computed — the write passes', () => {
    freeze()
    expect(waitingForFresh(() => validate(aged(HALF_HOUR_S)))).toBe(true)
    expect(waitingForFresh(() => validate(aged(0)))).toBe(true)
  })

  it('keeps what the inner validate refuses refused', () => {
    freeze()
    const inner = staleWithin(HALF_HOUR_S, THREE_HOURS_S, onlyComplete)
    expect(waitingForFresh(() => inner.validate(aged(60, { complete: false })))).toBe(false)
    expect(waitingForFresh(() => inner.validate(aged(60, { complete: true })))).toBe(true)
  })

  it('holds across awaits, and a visitor meanwhile still gets the stale entry', async () => {
    freeze()
    const stale = aged(HALF_HOUR_S + 1)
    let release!: () => void
    const refresh = new Promise<void>((resolve) => (release = resolve))
    const waiter = waitingForFresh(async () => {
      await refresh
      return [isWaitingForFresh(), validate(stale)]
    })
    // The visitor asks while the waiting request's refresh is in flight.
    expect(isWaitingForFresh()).toBe(false)
    expect(validate(stale)).toBe(true)
    release()
    expect(await waiter).toEqual([true, false])
  })
})

/**
 * The real guard in the chain Nitro builds (nitropack runtime/internal/app.mjs):
 * h3's `onRequest`, which Nitro makes async to await its `request` hook, then
 * the route-rules layer, the middleware, the router — served over a real
 * socket, and `localFetch` as Nitro does it, through node-mock-http into the
 * same node handler. Each handler awaits a timer first, so the context has to
 * survive a macrotask, as it does in front of an upstream call.
 */
describe('the waiting context through h3, the way Nitro serves a request', () => {
  type Answer = { waits: boolean; sub?: boolean }
  const NITRO_GLOBALS = ['defineEventHandler', 'getRequestHeader', 'setResponseHeader', 'createError'] as const
  const saved = new Map<string, unknown>()
  let server: Server
  let port = 0
  // One socket for every request: what one request enters must not stay on
  // the connection for the next.
  const agent = new Agent({ keepAlive: true, maxSockets: 1 })

  beforeAll(async () => {
    const { h3, fetchNodeRequestHandler } = await nitroRequestModules()
    for (const name of NITRO_GLOBALS) saved.set(name, (globalThis as Record<string, unknown>)[name])
    Object.assign(globalThis, {
      defineEventHandler: h3.defineEventHandler,
      getRequestHeader: h3.getRequestHeader,
      setResponseHeader: h3.setResponseHeader,
      createError: h3.createError,
    })
    const guard = (await import('../server/middleware/guard')).default

    const later = () => new Promise((resolve) => setTimeout(resolve, 5))
    const app = h3.createApp({
      onRequest: async () => {
        await later()
      },
    })
    const router = h3.createRouter({ preemptive: true })
    router.get('/api/leaf', h3.defineEventHandler(async () => {
      await later()
      return { waits: isWaitingForFresh() }
    }))
    router.get('/page', h3.defineEventHandler(async () => {
      await later()
      // Nuxt forwards the page's request headers into its API calls; the
      // in-process check must win over a forwarded address.
      const sub = (await (await fetchNodeRequestHandler(handler, '/api/leaf', { headers: { 'x-forwarded-for': '203.0.113.9' } })).json()) as Answer
      return { waits: isWaitingForFresh(), sub: sub.waits }
    }))
    app.use(h3.defineEventHandler(() => undefined))
    app.use(guard)
    app.use(router.handler)
    const handler = h3.toNodeListener(app) as (req: IncomingMessage, res: ServerResponse) => void
    server = createServer(handler)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as AddressInfo).port
  })

  afterAll(async () => {
    agent.destroy()
    await new Promise((resolve) => server?.close(resolve))
    for (const [name, value] of saved) (globalThis as Record<string, unknown>)[name] = value
  })

  function get(path: string, proxied: boolean): Promise<Answer> {
    const headers = proxied ? { 'x-forwarded-for': '198.51.100.7' } : {}
    return new Promise((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, path, headers, agent }, (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => (body += chunk))
        res.on('end', () => {
          try {
            resolve(JSON.parse(body) as Answer)
          } catch (error) {
            reject(new Error(`${res.statusCode}: ${body}`, { cause: error }))
          }
        })
      })
      req.on('error', reject)
      req.end()
    })
  }

  it('a direct request waits in its route handler', async () => {
    expect(await get('/api/leaf', false)).toEqual({ waits: true })
  })

  it('a request through the proxy does not — on the same connection, right after a direct one', async () => {
    expect(await get('/api/leaf', false)).toEqual({ waits: true })
    expect(await get('/api/leaf', true)).toEqual({ waits: false })
  })

  it('the in-process calls of a page inherit its context, either way', async () => {
    expect(await get('/page', false)).toEqual({ waits: true, sub: true })
    expect(await get('/page', true)).toEqual({ waits: false, sub: false })
  })

  it('direct and proxied requests in flight together each keep their own', async () => {
    const free = new Agent({ keepAlive: false })
    const at = (path: string, proxied: boolean) =>
      new Promise<Answer>((resolve, reject) => {
        const req = request({ host: '127.0.0.1', port, path, agent: free, headers: proxied ? { 'x-forwarded-for': '198.51.100.8' } : {} }, (res) => {
          let body = ''
          res.on('data', (chunk: Buffer) => (body += chunk.toString()))
          res.on('end', () => resolve(JSON.parse(body) as Answer))
        })
        req.on('error', reject)
        req.end()
      })
    const answers = await Promise.all([at('/page', true), at('/page', false), at('/api/leaf', true), at('/api/leaf', false)])
    expect(answers).toEqual([
      { waits: false, sub: false },
      { waits: true, sub: true },
      { waits: false },
      { waits: true },
    ])
  })
})

describe('rebuildMark', () => {
  afterEach(() => vi.useRealTimers())

  it('accepts everything until a build sets it, then only what was written after', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const mark = rebuildMark()
    expect(mark.accepts({ value: 'map', mtime: NOW - 1000 })).toBe(true)
    mark.set()
    expect(mark.accepts({ value: 'map', mtime: NOW - 1000 })).toBe(false)
    // Written in the mark's own millisecond: it may have read the old store.
    expect(mark.accepts({ value: 'map', mtime: NOW })).toBe(false)
    expect(mark.accepts({ value: 'map', mtime: NOW + 1 })).toBe(true)
  })

  it('refuses through staleWithin even a fresh entry — the build reads its own map back', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const mark = rebuildMark()
    const { validate } = staleWithin(HALF_HOUR_S, THREE_HOURS_S, (e: { value?: { complete: boolean }; mtime?: number }) => mark.accepts(e) && onlyComplete(e))
    const before = aged(60, { complete: true })
    expect(validate(before)).toBe(true)
    mark.set()
    expect(validate(before)).toBe(false)
    vi.setSystemTime(NOW + 1)
    expect(validate({ value: { complete: true }, mtime: Date.now() })).toBe(true)
  })
})

describe('what the limit rests on: nitropack', () => {
  const source = nitroCacheSource()

  it('counts an entry validate refuses as expired', () => {
    expect(source).toMatch(/const expired = shouldInvalidateCache \|\| entry\.integrity !== integrity \|\| ttl && Date\.now\(\) - \(entry\.mtime \|\| 0\) > ttl \|\| validate\(entry\) === false;/)
  })

  it('serves the stale entry only where swr is on AND validate accepts it — else the caller awaits the refresh', () => {
    expect(source).toMatch(/if \(opts\.swr && validate\(entry\) !== false\) \{[\s\S]{0,200}return entry;\s*\}\s*return _resolvePromise\.then\(\(\) => entry\);/)
  })

  it('logs a failed background refresh instead of throwing it, and writes nothing', () => {
    // The `.catch` on the SWR path; the write sits after the awaited resolver,
    // so a throw never reaches it and the stale entry stays as it was.
    expect(source).toMatch(/_resolvePromise\.catch\(\(error\) => \{\s*console\.error\(`\[cache\] SWR handler error\.`, error\)/)
    expect(source).toMatch(/entry\.value = await pending\[key\];\s*\} catch \(error\) \{[\s\S]{0,80}throw error;/)
  })

  it('stamps mtime before it asks validate on a write', () => {
    expect(source).toMatch(/entry\.mtime = Date\.now\(\);[\s\S]{0,120}if \(validate\(entry\) !== false\) \{/)
  })

  it('keeps the stale value while it refreshes — only swr: false clears it first', () => {
    expect(source).toMatch(/if \(entry\.value !== void 0 && \(opts\.staleMaxAge \|\| 0\) >= 0 && opts\.swr === false\) \{\s*entry\.value = void 0;/)
  })
})
