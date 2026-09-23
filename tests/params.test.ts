import type { H3Event } from 'h3'
import { describe, expect, it } from 'vitest'
import {
  ministryFilterOptions,
  readGpParam,
  readLawStationPair,
  readListQuery,
  readRisId,
  validateGpInrParams,
} from '../server/utils/http/params'
import type { FakeError, FakeEvent } from './helpers/nitroGlobals'

/**
 * What a handler reads out of a request (`server/utils/http/params.ts`).
 *
 * The one module in `server/utils` that is deliberately NOT pure — reading a
 * request is the Nitro boundary — and therefore the one this suite had no
 * way to execute. `tests/helpers/nitroGlobals.ts` supplies the three names
 * it is made of, and the event below is a literal: these functions read a
 * query bag and two route params, nothing else about h3.
 *
 * The rule under test that costs the most if it breaks is
 * `readLawStationPair`: the word diff calls one side removed and the other
 * inserted, so a pair accepted the wrong way round would report every
 * amendment backwards instead of failing.
 */

const event = (over: FakeEvent = {}) => over as H3Event

const query = (q: Record<string, string | string[] | undefined>) => event({ __query: q })
const params = (p: Record<string, string | undefined>) => event({ __params: p })

/** The status code a call refuses with — or `null` when it does not refuse. */
function refusal(run: () => unknown): FakeError | null {
  try {
    run()
    return null
  } catch (err) {
    return err as FakeError
  }
}

describe('validateGpInrParams', () => {
  it('reads a well-formed pair', () => {
    expect(validateGpInrParams(params({ gp: 'XXVIII', inr: '88' }))).toEqual({ gp: 'XXVIII', inr: 88 })
  })

  /* Not a 400: the route params are uppercased BEFORE the pattern is applied,
   * so `/entwuerfe/xxviii/88` is the same page as `/entwuerfe/XXVIII/88`.
   * Links travel in mails and chats, where a client lowercases a URL without
   * asking, and a Roman numeral has no lower case to mean anything else. */
  it('accepts a lowercase period and normalises it', () => {
    expect(validateGpInrParams(params({ gp: 'xxviii', inr: '88' })).gp).toBe('XXVIII')
  })

  it('refuses a period that is not a Roman numeral', () => {
    expect(refusal(() => validateGpInrParams(params({ gp: '28', inr: '1' })))?.statusCode).toBe(400)
    expect(refusal(() => validateGpInrParams(params({ gp: 'XXVIIIA', inr: '1' })))?.statusCode).toBe(400)
    // An absent param is the same answer as a malformed one.
    expect(refusal(() => validateGpInrParams(params({ inr: '1' })))?.statusCode).toBe(400)
  })

  it('refuses an item number that is not a positive integer', () => {
    for (const inr of ['abc', '1a', '-1', '1.5', '']) {
      expect(refusal(() => validateGpInrParams(params({ gp: 'XXVIII', inr }))), inr).not.toBeNull()
    }
  })

  /* Upstream counts from 1. `0` passes the digit pattern and is caught by the
   * second half of the guard — the half a regex-only check would miss. */
  it('refuses item number 0', () => {
    const err = refusal(() => validateGpInrParams(params({ gp: 'XXVIII', inr: '0' })))
    expect(err?.statusCode).toBe(400)
    expect(err?.statusMessage).toContain('Gegenstandsnummer')
  })

  it('names the wrong half in its message', () => {
    expect(refusal(() => validateGpInrParams(params({ gp: '28', inr: '1' })))?.statusMessage)
      .toContain('Gesetzgebungsperiode')
  })
})

describe('readLawStationPair', () => {
  it('defaults to the comparison the product is about', () => {
    expect(readLawStationPair(query({}))).toEqual({ from: 'me', to: 'rv' })
  })

  it('takes an explicit pair', () => {
    expect(readLawStationPair(query({ von: 'me', bis: 'plenum' }))).toEqual({ from: 'me', to: 'plenum' })
  })

  /* `bis` alone means „the station right before it", so each difference
   * belongs to one actor — never a fixed left side of ME. */
  it('fills a missing left side with the station before the right one', () => {
    expect(readLawStationPair(query({ bis: 'ausschuss' })).from).toBe('rv')
    expect(readLawStationPair(query({ bis: 'plenum' })).from).toBe('rv')
    expect(readLawStationPair(query({ bis: 'rv' })).from).toBe('me')
  })

  /* THE ONE THAT MATTERS. Accepted, this pair would not fail — it would
   * render every amendment with insertions and deletions swapped. */
  it('refuses a flipped pair', () => {
    const err = refusal(() => readLawStationPair(query({ von: 'rv', bis: 'me' })))
    expect(err?.statusCode).toBe(400)
    expect(err?.statusMessage).toContain('vor der für „bis“ liegen')
    expect(refusal(() => readLawStationPair(query({ von: 'bgbl', bis: 'ausschuss' })))?.statusCode).toBe(400)
  })

  it('refuses a station compared with itself', () => {
    expect(refusal(() => readLawStationPair(query({ von: 'rv', bis: 'rv' })))?.statusCode).toBe(400)
  })

  it('refuses `bis=me`, which has no station before it', () => {
    expect(refusal(() => readLawStationPair(query({ bis: 'me' })))?.statusCode).toBe(400)
  })

  /* Right way round and still not a question: between the Beschluss and the
   * Kundmachung no actor changes the text, and the message has to say THAT
   * rather than the order rule, or the reader looks in the wrong direction. */
  it('refuses plenum→bgbl with its own reason', () => {
    const err = refusal(() => readLawStationPair(query({ von: 'plenum', bis: 'bgbl' })))
    expect(err?.statusCode).toBe(400)
    expect(err?.statusMessage).toContain('ändert sich der Text nicht mehr')
    // The neighbouring pair carries the same statement and stays allowed.
    expect(readLawStationPair(query({ von: 'ausschuss', bis: 'bgbl' }))).toEqual({ from: 'ausschuss', to: 'bgbl' })
  })

  it('refuses an unknown station on either side, and lists the vocabulary', () => {
    const bis = refusal(() => readLawStationPair(query({ bis: 'senat' })))
    expect(bis?.statusCode).toBe(400)
    expect(bis?.statusMessage).toContain('me, rv, ausschuss, plenum, bgbl')
    expect(refusal(() => readLawStationPair(query({ von: 'senat', bis: 'rv' })))?.statusCode).toBe(400)
  })

  it('reads the first value of a repeated param and ignores an empty one', () => {
    expect(readLawStationPair(query({ bis: ['plenum', 'bgbl'] }))).toEqual({ from: 'rv', to: 'plenum' })
    expect(readLawStationPair(query({ von: '', bis: '' }))).toEqual({ from: 'me', to: 'rv' })
  })
})

describe('readListQuery', () => {
  it('reads the whole vocabulary', () => {
    expect(readListQuery(query({ gp: 'xxviii', status: 'open', station: 'rv,bgbl', ministry: 'bmj', q: 'ÖKOStrom' })))
      .toEqual({ gp: 'XXVIII', status: 'open', stations: ['rv', 'bgbl'], ministry: 'BMJ', q: 'ökostrom' })
  })

  it('defaults to every draft of the running period', () => {
    expect(readListQuery(query({}))).toEqual({
      gp: undefined, status: 'all', stations: [], ministry: undefined, q: undefined,
    })
  })

  it('refuses a malformed period and an unknown status', () => {
    expect(refusal(() => readListQuery(query({ gp: '28' })))?.statusCode).toBe(400)
    expect(refusal(() => readListQuery(query({ status: 'offen' })))?.statusCode).toBe(400)
  })

  /* Station names travel in shared links. A typo in one shows the list, it
   * does not 400 — the opposite rule from the pair above, and deliberately:
   * a dropped filter shows MORE, a flipped pair shows something false. */
  it('drops an unknown station instead of refusing the request', () => {
    expect(readListQuery(query({ station: 'senat' })).stations).toEqual([])
    expect(readListQuery(query({ station: 'rv,senat,bgbl' })).stations).toEqual(['rv', 'bgbl'])
  })

  it('never silently drops a valid station', () => {
    // Every name in the vocabulary survives the round trip, one by one and
    // all at once — the half of the rule above that must NOT be lenient.
    for (const s of ['begutachtung', 'rv', 'parlament', 'bgbl']) {
      expect(readListQuery(query({ station: s })).stations, s).toEqual([s])
    }
    expect(readListQuery(query({ station: ' BGBl , Parlament ' })).stations).toEqual(['bgbl', 'parlament'])
  })
})

describe('readGpParam', () => {
  it('reads „aktuell" in any case as the running period', () => {
    expect(readGpParam(params({ gp: 'aktuell' }))).toBeNull()
    expect(readGpParam(params({ gp: 'AKTUELL' }))).toBeNull()
  })

  it('normalises a period and refuses a malformed one', () => {
    expect(readGpParam(params({ gp: 'xxvii' }))).toBe('XXVII')
    expect(refusal(() => readGpParam(params({ gp: '27' })))?.statusCode).toBe(400)
  })

  it('needs the param unless the caller says it defaults to the running period', () => {
    expect(refusal(() => readGpParam(params({})))?.statusCode).toBe(400)
    expect(readGpParam(params({}), { defaultsToCurrent: true })).toBeNull()
  })
})

describe('readRisId', () => {
  it('takes a RIS document number and refuses anything else', () => {
    expect(readRisId(params({ id: 'BEGUT_COO_2026_123' }))).toBe('BEGUT_COO_2026_123')
    expect(refusal(() => readRisId(params({ id: 'XXVIII' })))?.statusCode).toBe(400)
  })

  /* Same regex, two answers (the file header): an API caller built the
   * request, a reader followed a link that names nothing. */
  it('answers 404 where a page route asks', () => {
    expect(refusal(() => readRisId(params({ id: 'XXVIII' }), { notFoundOnInvalid: true }))?.statusCode).toBe(404)
  })
})

describe('ministryFilterOptions', () => {
  const item = (code: string, name: string, coMinistries?: { code: string; name: string }[]) =>
    ({ ministryCode: code, ministryName: name, coMinistries })

  it('lists every code once, in code order', () => {
    expect(ministryFilterOptions([
      item('BMJ', 'Justiz'),
      item('BMF', 'Finanzen'),
      item('BMJ', 'Justiz'),
    ])).toEqual([{ code: 'BMF', name: 'Finanzen' }, { code: 'BMJ', name: 'Justiz' }])
  })

  it('keeps the first name per code, so a renamed ministry is one entry', () => {
    expect(ministryFilterOptions([item('BMF', 'Finanzen'), item('BMF', 'Finanzen und Wirtschaft')]))
      .toEqual([{ code: 'BMF', name: 'Finanzen' }])
  })

  /* A jointly issued Entwurf belongs to BOTH ressorts. Without the
   * co-ministry the menu would offer BMJ and the filter would then drop the
   * draft the BMJ did send — menu and filter have to agree on what a Ressort
   * owns. */
  it('lists a co-issuing ministry too', () => {
    expect(ministryFilterOptions([item('BMFFIM', 'Frauen', [{ code: 'BMJ', name: 'Justiz' }])]))
      .toEqual([{ code: 'BMFFIM', name: 'Frauen' }, { code: 'BMJ', name: 'Justiz' }])
  })

  it('merges a co-ministry with its own drafts instead of repeating it', () => {
    expect(ministryFilterOptions([
      item('BMJ', 'Justiz'),
      item('BMFFIM', 'Frauen', [{ code: 'BMJ', name: 'Justiz (Ressort)' }]),
    ])).toEqual([{ code: 'BMFFIM', name: 'Frauen' }, { code: 'BMJ', name: 'Justiz' }])
  })

  it('survives the RIS half, which has no co-ministries at all', () => {
    expect(ministryFilterOptions([{ ministryCode: 'BMF', ministryName: 'Finanzen' }]))
      .toEqual([{ code: 'BMF', name: 'Finanzen' }])
    expect(ministryFilterOptions([])).toEqual([])
    // A row without a code contributes nothing rather than an empty chip.
    expect(ministryFilterOptions([{ ministryCode: '', ministryName: 'Unbekannt' }])).toEqual([])
  })
})
