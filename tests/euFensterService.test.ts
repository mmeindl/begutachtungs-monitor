import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearNitroCache, nitroCacheKeys, nitroCachedFunction } from './helpers/nitroCache'

/**
 * The windows open on the Commission's portal, through the service
 * (`openWindows`, `server/utils/eu/portalService.ts`): null on failure —
 * never an empty list —, nothing failed cached, and a log line that says
 * why without a word of the answer. This is the read the uptime check's EU
 * canary watches. The reader itself: `tests/euFenster.test.ts`.
 *
 * The portal is a fake: the list of 15.11.2026 (`tests/fixtures/eu-portal`).
 */

vi.stubGlobal('defineCachedFunction', nitroCachedFunction)

// No 2.5 s between the fake's answers.
vi.mock('../server/utils/laender/session', () => ({ SitePacer: class { async turn() {} } }))
// Only the request is a fake. The error classes are the client's own: the
// service's log line reads them (`failureReason`).
vi.mock('../server/utils/upstream/fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../server/utils/upstream/fetch')>()),
  upstreamJson: vi.fn(),
}))

const { upstreamJson, UpstreamHttpError, UpstreamUnreachableError } = vi.mocked(await import('../server/utils/upstream/fetch'))
const { openWindows } = await import('../server/utils/eu/portalService')

const LIST = 'https://ec.europa.eu/info/law/better-regulation/brpapi/searchInitiatives?feedbackStatus=OPEN&size=100&language=DE'
const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/eu-portal/${name}.json`, import.meta.url), 'utf8'))

let asked: string[] = []
function portal(list: () => unknown = () => fixture('open-windows')) {
  upstreamJson.mockImplementation(async (url: string) => {
    asked.push(url)
    if (url === LIST) return list()
    throw new Error(`unexpected ${url}`)
  })
}

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  asked = []
  clearNitroCache()
  upstreamJson.mockReset()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.clearAllMocks()
  warn.mockRestore()
})

describe('the open windows, through the service', () => {
  it('is the list where the portal answers, asked once and silent in the log', async () => {
    portal()
    expect((await openWindows())?.initiatives.length).toBeGreaterThan(0)
    await openWindows()
    expect(asked).toEqual([LIST])
    expect(warn).not.toHaveBeenCalled()
  })

  it('is null where the portal fails — never an empty list — and the failure is not cached', async () => {
    portal(() => { throw new UpstreamHttpError(406, LIST) })
    expect(await openWindows()).toBeNull()
    expect(nitroCacheKeys().filter((k) => k.startsWith('eu-portal-offen'))).toEqual([])
    expect(warn.mock.calls).toEqual([['[eu] Ihre Meinung zählt nicht abrufbar:', 'HTTP 406']])
    portal()
    expect(await openWindows()).not.toBeNull()
  })

  it('says why in the log: the kind of the failure, and nothing of the answer', async () => {
    // What the client throws for a body that is no JSON. The runtime's message quotes the body; the name is invented.
    const quoting = new SyntaxError(`Unexpected token 'E', "Erika Must"... is not valid JSON`)
    portal(() => { throw new UpstreamUnreachableError(LIST, quoting) })
    expect(await openWindows()).toBeNull()
    expect(warn.mock.calls).toEqual([['[eu] Ihre Meinung zählt nicht abrufbar:', 'nicht erreichbar (Antwort ist kein JSON)']])
  })

  it('names the shape the reader did not know, in the reader’s own sentence', async () => {
    portal(() => ({ initiativeResultDtoPage: { content: 'Erika Musterfrau' } }))
    expect(await openWindows()).toBeNull()
    expect(warn.mock.calls).toEqual([['[eu] Ihre Meinung zählt nicht abrufbar:', 'Portal: Liste ohne Seite']])
  })
})
