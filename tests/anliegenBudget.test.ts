import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearNitroCache, nitroCachedFunction } from './helpers/nitroCache'

/**
 * The Anliegen endpoints answer within a stated bound (15.11.2026,
 * `server/utils/parliament/anliegenService.ts`). Measured before: 40–88 s for
 * the running period's list with Parliament slow, no answer within 120 s for
 * one Petition an den Bundesrat — the list reads and the single item had no
 * budget of their own beyond the client's 8 s × 3 attempts.
 *
 * Asserted with upstreams that never answer or answer late: a list that
 * never answers is an unread kind at the deadline, records slower than the
 * budget leave `state: null`, a record of the page not in time is a 504 and
 * its counts not in time are null — never a guess, never 0. And what did not
 * arrive runs on into its cache, so the next request finds it.
 *
 * Parliament's client is mocked as a module (`itemsForGp.test.ts`), the cache
 * is the one that keeps (`helpers/nitroCache.ts`), the clock is faked.
 */

vi.stubGlobal('defineCachedFunction', nitroCachedFunction)
vi.stubGlobal('DERIVED_CACHE', '/derived')

vi.mock('../server/utils/upstream/parliament', () => ({
  fetchFilterList: vi.fn(),
  fetchGegenstand: vi.fn(),
  assertRowsMatchGp: vi.fn(),
  assertListHeader: vi.fn(),
}))

const { fetchFilterList, fetchGegenstand } = vi.mocked(await import('../server/utils/upstream/parliament'))
const { getAnliegenDetail, getAnliegenRows } = await import('../server/utils/parliament/anliegenService')

const LIST_BUDGET_MS = 20_000
const DETAIL_BUDGET_MS = 10_000

function fixture(name: string): unknown {
  return (JSON.parse(readFileSync(new URL(`./fixtures/anliegen/${name}.json`, import.meta.url), 'utf8')) as { content: unknown }).content
}
const PETITION = fixture('XXVIII-PET-13')
const BUNDESRAT = fixture('BR-PET-BR-28')

/** A list-101 row of a Petition of GP XXVIII (0 gp, 1 ityp, 2 inr, 6 title, 8 date). */
function petitionRow(inr: number): unknown[] {
  const r: unknown[] = new Array(36).fill(null)
  Object.assign(r, { 0: 'XXVIII', 1: 'PET', 2: inr, 6: `Petition ${inr}`, 7: `${inr}/PET`, 8: 20250101, 14: `/gegenstand/XXVIII/PET/${inr}` })
  return r
}

/** A list-101 row of a Petition an den Bundesrat, arrived on `date` (yyyymmdd). */
function bundesratRow(inr: number, date: number): unknown[] {
  const r: unknown[] = new Array(36).fill(null)
  Object.assign(r, { 0: 'XXVII', 1: 'PET-BR', 2: inr, 6: `Petition BR ${inr}`, 7: `${inr}/PET-BR/2020`, 8: date, 11: 'PET-BR', 14: `/gegenstand/BR/PET-BR/${inr}` })
  return r
}

/** A list-143 row: 0 gp, 1 ityp, 2 inr, 19 statements, 20 support, 23 AKTIV. */
function participationRow(gp: string, ityp: string, inr: number): unknown[] {
  const r: unknown[] = new Array(24).fill(null)
  Object.assign(r, { 0: gp, 1: ityp, 2: inr, 11: ityp, 19: 4, 20: 997, 23: 'J' })
  return r
}

const never = () => new Promise<never>(() => {})
const after = <T>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms))

interface Upstream {
  /** List 101 of a kind or of the Bundesrat (`PET`, `BI`, `I`, `PET-BR`): its rows, or `never`. */
  list101?: Partial<Record<string, unknown[][] | 'never'>>
  list143?: 'never'
  /** The record read: how long it takes, or never. */
  record?: (gp: string, ityp: string, inr: number) => number | 'never'
}

function upstream(u: Upstream): void {
  fetchFilterList.mockImplementation(async (listId: number, body: Record<string, unknown>) => {
    const ityp = (body.ITYP as string[])[0]!
    const gp = (body.GP_CODE as string[] | undefined)?.[0] ?? 'BR'
    if (listId === 101) {
      const rows = u.list101?.[ityp] ?? []
      if (rows === 'never') return never()
      return { count: rows.length, rows } as never
    }
    if (u.list143 === 'never') return never()
    const rows = ityp === 'PET' ? [participationRow(gp, ityp, 1)] : ityp === 'PET-BR' ? [participationRow('BR', 'PET-BR', 28)] : []
    return { count: rows.length, rows } as never
  })
  fetchGegenstand.mockImplementation(async (gp: string, ityp: string, inr: number) => {
    const ms = u.record?.(gp, ityp, inr) ?? 0
    if (ms === 'never') return never()
    return after(ms, { content: ityp === 'PET-BR' ? BUNDESRAT : PETITION } as never)
  })
}

/** Settles `promise` under the fake clock and says when, in fake milliseconds. */
async function timed<T>(promise: Promise<T>): Promise<{ ms: number; value?: T; error?: unknown }> {
  const start = Date.now()
  let done = false
  let out: { value?: T; error?: unknown } = {}
  promise.then((value) => { out = { value } }, (error: unknown) => { out = { error } }).finally(() => { done = true })
  // Timer to timer, so the time read is exact; a cap instead of a hang if nothing settles it.
  await vi.advanceTimersByTimeAsync(0)
  for (let i = 0; !done && i < 1_000; i++) await vi.advanceTimersToNextTimerAsync()
  if (!done) throw new Error('never settled')
  return { ms: Date.now() - start, ...out }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  clearNitroCache()
  fetchFilterList.mockReset()
  fetchGegenstand.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the list answers within one budget for lists and records together', () => {
  it('names a kind whose list never answers as unread, at the deadline, and serves the others', async () => {
    upstream({ list101: { PET: [petitionRow(1)], BI: 'never' } })
    const { ms, value } = await timed(getAnliegenRows('XXVIII', 'XXVIII'))
    expect(ms).toBeLessThanOrEqual(LIST_BUDGET_MS)
    expect(value!.unread.kinds).toEqual(['buergerinitiative'])
    expect(value!.rows.map((r) => r.root.inr)).toEqual([1])
    expect(value!.rows[0]!.state).not.toBeNull()
  })

  it('answers 502 at the deadline where no kind\'s list answered', async () => {
    upstream({ list101: { PET: 'never', BI: 'never', I: 'never' } })
    const { ms, error } = await timed(getAnliegenRows('XXVIII', 'XXVIII'))
    expect(ms).toBeLessThanOrEqual(LIST_BUDGET_MS)
    expect(error).toMatchObject({ statusCode: 502 })
  })

  it('leaves state null where the records are slower than the budget, and they run on into the cache', async () => {
    upstream({ list101: { PET: [petitionRow(1), petitionRow(2)] }, record: () => LIST_BUDGET_MS + 5_000 })
    const { ms, value } = await timed(getAnliegenRows('XXVIII', 'XXVIII'))
    expect(ms).toBeLessThanOrEqual(LIST_BUDGET_MS)
    expect(value!.rows.map((r) => [r.state, r.lastStepAt])).toEqual([[null, null], [null, null]])
    // The counts came from list 143 meanwhile; a late record takes nothing else with it.
    expect(value!.rows[0]!.counts).toEqual({ statements: 4, support: 997 })
    await vi.advanceTimersByTimeAsync(10_000)
    const next = await timed(getAnliegenRows('XXVIII', 'XXVIII'))
    expect(next.ms).toBe(0)
    expect(next.value!.rows.every((r) => r.state !== null)).toBe(true)
  })

  it('counts the list reads into the budget: lists late, records get only what is left', async () => {
    let calls = 0
    fetchFilterList.mockImplementation(async (listId: number, body: Record<string, unknown>) => {
      calls++
      const ityp = (body.ITYP as string[])[0]!
      const rows = listId === 101 && ityp === 'PET' ? [petitionRow(1)] : []
      return after(15_000, { count: rows.length, rows } as never)
    })
    fetchGegenstand.mockImplementation(() => after(8_000, { content: PETITION } as never))
    const { ms, value } = await timed(getAnliegenRows('XXVIII', 'XXVIII'))
    // All list reads at once: 3 + 1 of list 101 and 3 + 1 of list 143.
    expect(calls).toBe(8)
    expect(ms).toBeLessThanOrEqual(LIST_BUDGET_MS)
    expect(value!.rows[0]!.state).toBeNull()
  })

  it('states open and counts as unread where list 143 never answers', async () => {
    upstream({ list101: { PET: [petitionRow(1)] }, list143: 'never' })
    const { ms, value } = await timed(getAnliegenRows('XXVIII', 'XXVIII'))
    expect(ms).toBeLessThanOrEqual(LIST_BUDGET_MS)
    expect(value!.rows[0]).toMatchObject({ open: null, counts: { statements: null, support: null } })
    expect(value!.rows[0]!.state).not.toBeNull()
  })

  it('reads the Bundesrat\'s records behind the period\'s, those of the period\'s days first', async () => {
    const order: string[] = []
    upstream({
      list101: {
        PET: [petitionRow(1), petitionRow(2)],
        // 28 arrived before GP XXVIII began, 30 within it.
        'PET-BR': [bundesratRow(28, 20110103), bundesratRow(30, 20250301)],
      },
      record: (_gp, ityp, inr) => {
        order.push(`${ityp} ${inr}`)
        return 100
      },
    })
    const { value } = await timed(getAnliegenRows('XXVIII', 'XXVIII'))
    expect(order).toEqual(['PET 1', 'PET 2', 'PET-BR 30', 'PET-BR 28'])
    expect(value!.bundesrat.rows.map((r) => r.root.inr)).toEqual([28, 30])
    expect(value!.bundesrat.unread).toBe(false)
  })

  it('marks the Bundesrat\'s list unread at the deadline where it never answers, the period\'s rows served', async () => {
    upstream({ list101: { PET: [petitionRow(1)], 'PET-BR': 'never' } })
    const { ms, value } = await timed(getAnliegenRows('XXVIII', 'XXVIII'))
    expect(ms).toBeLessThanOrEqual(LIST_BUDGET_MS)
    expect(value!.bundesrat).toEqual({ rows: [], unread: true })
    expect(value!.rows).toHaveLength(1)
  })
})

describe('one Anliegen\'s page answers within its budget', () => {
  const root = { gp: 'XXVIII', kind: 'petition' as const, inr: 1 }
  const bundesrat = { gp: 'BR', kind: 'petition-bundesrat' as const, inr: 28 }

  it('renders the course with counts null where list 143 never answers', async () => {
    upstream({ list143: 'never' })
    const { ms, value } = await timed(getAnliegenDetail(root, 'XXVIII'))
    expect(ms).toBeLessThanOrEqual(DETAIL_BUDGET_MS)
    expect(value!.counts).toEqual({ statements: null, support: null })
    expect(value!.title).toBe('Koralmbahn-Ticket (Klimaticket Süd)')
  })

  it('reads record and counts side by side: both slow, one wait', async () => {
    upstream({ record: () => 6_000 })
    fetchFilterList.mockImplementation(() => after(6_000, { count: 1, rows: [participationRow('BR', 'PET-BR', 28)] } as never))
    const { ms, value } = await timed(getAnliegenDetail(bundesrat, 'XXVIII'))
    expect(ms).toBeLessThan(7_000)
    expect(value!.counts).toEqual({ statements: 4, support: 997 })
  })

  it('answers 504 at the deadline where the record never answers', async () => {
    upstream({ record: () => 'never' })
    const { ms, error } = await timed(getAnliegenDetail(bundesrat, 'XXVIII'))
    expect(ms).toBeLessThanOrEqual(DETAIL_BUDGET_MS)
    expect(error).toMatchObject({ statusCode: 504, statusMessage: 'Parlament-API nicht erreichbar' })
  })

  it('keeps a failed record\'s own status — a 404 stays a 404, at once', async () => {
    upstream({})
    fetchGegenstand.mockRejectedValue({ statusCode: 404, statusMessage: 'Gegenstand nicht gefunden' })
    const { ms, error } = await timed(getAnliegenDetail(root, 'XXVIII'))
    expect(ms).toBe(0)
    expect(error).toEqual({ statusCode: 404, statusMessage: 'Gegenstand nicht gefunden' })
  })
})
