import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseEciList } from '../server/utils/eu/eciRegister'
import { parseOpenWindows } from '../server/utils/eu/haveYourSay'
import { LandSiteBusyError } from '../server/utils/laender/session'
import { failureReason } from '../server/utils/upstream/failureReason'
import { UpstreamHttpError, UpstreamRefusedError, UpstreamUnreachableError, upstreamJson, type UpstreamPolicy } from '../server/utils/upstream/fetch'

/**
 * The reason a failed read writes into the server's log
 * (`server/utils/upstream/failureReason.ts`). Two things are held here: the
 * line says what failed, which the HTTP client's own message hides, and it
 * never carries a word of the answer. The name below is invented; the
 * sources' real answers name officials and organisers.
 */

const NAME = 'Erika Musterfrau'
const URL_ = 'https://example.test/liste'
const ONCE: UpstreamPolicy = { timeoutMs: 1_000, retries: 0 }

/** Every read answers this, or throws it. */
function stubFetch(answer: Response | Error): void {
  vi.stubGlobal('fetch', () => (answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer.clone())))
}

/** The error a read through the real client ends in. */
async function failureOf(answer: Response | Error): Promise<unknown> {
  stubFetch(answer)
  return upstreamJson(URL_, ONCE).then(
    () => {
      throw new Error('the read was expected to fail')
    },
    (error: unknown) => error,
  )
}

const thrownBy = (run: () => unknown): unknown => {
  try {
    run()
  } catch (error) {
    return error
  }
  throw new Error('the parser was expected to throw')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('failureReason: what the HTTP client reports', () => {
  it('names the status of an answer that was not retried', async () => {
    expect(failureReason(await failureOf(new Response('', { status: 406 })))).toBe('HTTP 406')
    expect(failureReason(new UpstreamHttpError(403, URL_))).toBe('HTTP 403')
  })

  it('says what the last attempt died of, without the address', async () => {
    const error = await failureOf(new Response('', { status: 503 }))
    expect((error as Error).message).toBe(`Upstream nicht erreichbar (HTTP 503): ${URL_}`)
    expect(failureReason(error)).toBe('nicht erreichbar (HTTP 503)')
  })

  it('tells a timeout from a connection that never came about', async () => {
    const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    expect(failureReason(await failureOf(timeout))).toBe('nicht erreichbar (Zeitüberschreitung)')

    const socket = Object.assign(new Error(`getaddrinfo ENOTFOUND ${NAME}`), { code: 'ENOTFOUND' })
    const reason = failureReason(await failureOf(new TypeError('fetch failed', { cause: socket })))
    expect(reason).toBe('nicht erreichbar (TypeError ENOTFOUND)')
  })

  it('takes a code only where it looks like the system’s', () => {
    const odd = Object.assign(new TypeError('fetch failed'), { code: NAME })
    expect(failureReason(new UpstreamUnreachableError(URL_, odd))).toBe('nicht erreichbar (TypeError)')
    expect(failureReason(new UpstreamUnreachableError(URL_, undefined))).toBe('nicht erreichbar (Ursache unbekannt)')
  })

  it('gives the class of the client’s other refusals, not their message', () => {
    expect(failureReason(new UpstreamRefusedError(`https://example.test/${NAME}`))).toBe('UpstreamRefusedError')
  })
})

describe('failureReason: never a word of the answer', () => {
  it('says that a body is no JSON without quoting it', async () => {
    // HTTP 200 with a page instead of the list: an error page, a bot check.
    const reason = failureReason(await failureOf(new Response(`${NAME} ist nicht im Dienst`, { status: 200 })))
    expect(reason).toBe('nicht erreichbar (Antwort ist kein JSON)')
  })

  it('does so for the message a runtime writes about such a body', () => {
    // What Node 22 and later say; an older runtime's shorter message would prove nothing here.
    const quoting = new SyntaxError(`Unexpected token 'E', "${NAME.slice(0, 10)}"... is not valid JSON`)
    expect(quoting.message).toContain('Erika')
    expect(failureReason(new UpstreamUnreachableError(URL_, quoting))).not.toContain('Erika')
    expect(failureReason(quoting)).toBe('SyntaxError')
  })

  it('gives the name alone of an error the runtime or another module made', () => {
    expect(failureReason(new TypeError(`Invalid URL: ${NAME}`))).toBe('TypeError')
    expect(failureReason(new RangeError(`Invalid time value: ${NAME}`))).toBe('RangeError')
    expect(failureReason(new LandSiteBusyError())).toBe('LandSiteBusyError')
  })

  it('says nothing about what is no error at all', () => {
    expect(failureReason(NAME)).toBe('Fehler ohne Angabe')
    expect(failureReason({ message: NAME })).toBe('Fehler ohne Angabe')
    expect(failureReason(undefined)).toBe('Fehler ohne Angabe')
  })
})

/**
 * A plain `Error` passes with its message, because that is how the readers
 * say which shape they did not know. This holds the two lists the uptime
 * check's EU canary watches to what the rule assumes: each of their
 * sentences is fixed, whatever stands where the reader expected something
 * else.
 */
describe('the sentences of the two list readers', () => {
  const page = (content: unknown) => ({ initiativeResultDtoPage: { content } })
  const row = (fields: Record<string, unknown>) => page([{ id: 18953, shortTitle: NAME, ...fields }])

  const portal: [string, unknown][] = [
    ['Portal: Liste ohne Seite', { initiativeResultDtoPage: NAME }],
    ['Portal: Liste ohne Seite', page(NAME)],
    ['Portal: Zeile ist kein Objekt', page([NAME])],
    ['Portal: Zeile ohne Nummer', page([{ id: NAME, currentStatuses: [] }])],
    ['Portal: Zeile ohne Status', row({ currentStatuses: NAME })],
    ['Portal: Status ist kein Objekt', row({ currentStatuses: [NAME] })],
    ['Portal: Status ohne Stadium', row({ currentStatuses: [{ authorName: NAME, receivingFeedbackStatus: 'OPEN' }] })],
  ]

  const entry = (fields: Record<string, unknown>) => ({ entries: [{ year: '2022', number: '2', title: NAME, ...fields }] })

  const register: [string, unknown][] = [
    ['Register: Liste ohne Einträge', NAME],
    ['Register: Liste ohne Einträge', { entries: NAME }],
    ['Register: Eintrag ist kein Objekt', { entries: [NAME] }],
    ['Register: Eintrag ohne Nummer', entry({ year: NAME, status: 'ONGOING' })],
    ['Register: Eintrag ohne Status', entry({})],
  ]

  it.each(portal)('the portal’s list: „%s“', (sentence, answer) => {
    const reason = failureReason(thrownBy(() => parseOpenWindows(answer)))
    expect(reason).toBe(sentence)
    expect(reason).not.toMatch(/Erika|Musterfrau/)
  })

  it.each(register)('the register’s list: „%s“', (sentence, answer) => {
    const reason = failureReason(thrownBy(() => parseEciList(answer)))
    expect(reason).toBe(sentence)
    expect(reason).not.toMatch(/Erika|Musterfrau/)
  })

  it('a cut list names two counts and nothing else of the answer', () => {
    const cut = { entries: [{ year: '2022', number: '2', status: 'ONGOING', title: NAME }], recordsFound: 136 }
    expect(failureReason(thrownBy(() => parseEciList(cut)))).toBe('Register: Liste gekürzt (1 von 136)')
  })
})
