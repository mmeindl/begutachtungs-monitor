import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeError, FakeEvent } from './helpers/nitroGlobals'

/**
 * A made-up draft number may leave nothing behind in the cache
 * (`server/api/drafts/[gp]/[inr]/erlaeuterungen.get.ts`, 22.10.2026).
 *
 * Nitro keeps every answer a cached function gives, and two of them answer
 * every number: „ließ sich keinem RIS-Dokument zuordnen", an empty reading.
 * Each made-up number therefore stored ~450 B in the derived LRU, and 20.000
 * of them — a loop, not an attack — evicted the station maps and the RIS
 * corpus that every page reads. Those two handlers now ask list 81 first and
 * AWAIT the answer; run side by side, the cached function would have stored
 * its value although the request 404s.
 *
 * The handlers are executed, not read: `requireDraft` and the services are
 * Nitro auto-imports, so they are globals here and the test can see which
 * one ran. Imported by a computed path because the handlers name those
 * auto-imports, and the tools project declares only h3's own
 * (`tests/helpers/nitroGlobals.ts` says why it stays that way).
 */

const ROUTES = join(import.meta.dirname, '..', 'server', 'api', 'drafts', '[gp]', '[inr]')

/** The sub-routes that check the draft before their cached function, and that function. */
const GUARDED: Record<string, string> = {
  'erlaeuterungen.get.ts': 'getExplanations',
  'konsolidiert.get.ts': 'getConsolidatedText',
}

/**
 * Every other sub-route, with the reason a made-up number caches nothing
 * there — found by requesting each one on a production build (22.10.2026:
 * 404 throughout). Deliberately a closed list, like the persistent layer in
 * `cacheLayers.test.ts`: a new sub-route fails the test below until someone
 * has decided which of the two lists it belongs to.
 */
const SAFE_WITHOUT_GUARD: Record<string, string> = {
  'index.get.ts': '`getDraftDetail` runs `requireDraft` itself; what it caches beside it is keyed by the upstream call, whose 404 is never stored',
  'statements.get.ts': '`requireDraft` beside a list-142 read that throws the 404 itself, inside its cached function',
  'geltende-fassung.get.ts': 'reads `getDraftDetail` first, which 404s',
  'begruendung.get.ts': 'the one cached pairing (me→rv) starts with the Gegenstand, whose 404 throws; every other pairing returns before any cache',
  'diff.get.ts': '`getLawDiff` starts with the Gegenstand, whose 404 throws before anything is stored',
  'gegenueberstellung.get.ts': 'an unmatched number falls through to Parliament\'s copy of the annex, which starts with the Gegenstand',
  'geltendesrecht.get.ts': 'the draft\'s own text is read first, through the Gegenstand',
  'paragraphtitel.get.ts': '`getParagraphTitles` starts with the Gegenstand',
  'rv-stellungnahmen.get.ts': 'the Vorlage is found through the Gegenstand; what is cached after it is keyed by the Vorlage, which exists',
}

const notADraft: FakeError = { statusCode: 404, statusMessage: 'Entwurf nicht gefunden' }

type Handler = (event: H3Event) => Promise<unknown>

async function handlerOf(file: string): Promise<Handler> {
  const path: string = join(ROUTES, file)
  const mod = (await import(/* @vite-ignore */ path)) as { default: Handler }
  return mod.default
}

const draftEvent = (inr: string) => ({ __params: { gp: 'XXVIII', inr }, __query: {} }) satisfies FakeEvent as unknown as H3Event

beforeEach(() => {
  // h3's wrapper is the identity for what is tested here: the handler itself.
  vi.stubGlobal('defineEventHandler', (handler: Handler) => handler)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('draft sub-routes', () => {
  it('classifies every sub-route', () => {
    const files = readdirSync(ROUTES).filter((f) => f.endsWith('.ts')).sort()
    expect(files).toEqual([...Object.keys(GUARDED), ...Object.keys(SAFE_WITHOUT_GUARD)].sort())
  })

  for (const [file, service] of Object.entries(GUARDED)) {
    it(`${file}: a made-up number is refused before ${service} runs`, async () => {
      const cached = vi.fn(async () => ({}))
      vi.stubGlobal(service, cached)
      vi.stubGlobal('requireDraft', vi.fn(async () => {
        throw notADraft
      }))

      await expect((await handlerOf(file))(draftEvent('9999999'))).rejects.toEqual(notADraft)
      expect(cached).not.toHaveBeenCalled()
    })

    it(`${file}: a draft that exists is answered by ${service}`, async () => {
      const answer = { from: service }
      const cached = vi.fn(async () => answer)
      const requireDraft = vi.fn(async () => ({}))
      vi.stubGlobal(service, cached)
      vi.stubGlobal('requireDraft', requireDraft)

      await expect((await handlerOf(file))(draftEvent('133'))).resolves.toBe(answer)
      expect(requireDraft).toHaveBeenCalledWith('XXVIII', 133)
      expect(cached).toHaveBeenCalledWith('XXVIII', 133)
    })

    it(`${file}: the check is awaited, not raced against ${service}`, async () => {
      // A check that only runs BESIDE the cached function would let it start
      // — and a started cached function stores its answer whatever the
      // request does afterwards.
      let release!: () => void
      vi.stubGlobal('requireDraft', vi.fn(() => new Promise<void>((resolve) => {
        release = resolve
      })))
      const cached = vi.fn(async () => ({}))
      vi.stubGlobal(service, cached)

      const pending = (await handlerOf(file))(draftEvent('133'))
      await new Promise((r) => setTimeout(r, 0))
      expect(cached).not.toHaveBeenCalled()
      release()
      await pending
      expect(cached).toHaveBeenCalledOnce()
    })
  }
})
