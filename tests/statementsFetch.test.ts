import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * How list 142 is READ — sized, capped and held against its own count
 * (`server/utils/parliament/statements.ts`, docs/api-exploration.md list 142).
 *
 * WHY THIS FILE EXISTS. Until 22.10.2026 the Ministerialentwurf's list had
 * no cap and no count check: 164/ME of GP XXVII, 106,183 Stellungnahmen,
 * came back from `showAll` as 100,000 rows — silently, which is how
 * `showAll` stops — and the page aggregated, cached, stored and shipped
 * them as the whole list. Everything that decides that lives in a Nitro
 * file, so this suite runs it with Nitro's two names faked:
 *
 * `defineCachedFunction` calls straight through (as in
 * `bgblService.test.ts`), so every call is a real read and the request log
 * below means something. `globalThis.fetch` is the one seam every upstream
 * request goes through (`upstream/fetch.ts`), so the real client runs —
 * its URL, its body, its status mapping — against a fake list 142 that
 * answers the way the filter API does: one page of 20 plus `count` without
 * `showAll`, everything with it, `TYP` as a filter.
 *
 * `drafts.ts` is mocked as a module: it is list 81, the existence check and
 * the counter the empty-answer guard reads, not a boundary of this module.
 * The last-good store runs for real, in a temporary directory.
 *
 * Synthetic rows throughout: „Muster, Max" for every private person,
 * „Musterverband n" for every institution. No submitter is real.
 */

vi.stubGlobal(
  'defineCachedFunction',
  <A extends unknown[], R>(fn: (...args: A) => R) =>
    (...args: A): R => fn(...args),
)
vi.stubGlobal('DERIVED_CACHE', '/derived')

vi.mock('../server/utils/parliament/drafts', () => ({
  getDraftsForGp: vi.fn(),
  getGegenstand: vi.fn(),
}))

const { getDraftsForGp } = vi.mocked(await import('../server/utils/parliament/drafts'))
const { getStatementsForRv, getStatementsWithFallback } = await import('../server/utils/parliament/statements')
const { STATEMENTS_CAP } = await import('../server/utils/parliament/list142')
const { loadLastGoodStatements } = await import('../server/utils/parliament/lastgood')

// ---------------------------------------------------------------------------
// A fake list 142
// ---------------------------------------------------------------------------

/** The header as the API returns it (`tests/listHeaders.test.ts`), the read columns only. */
const HEADER_142 = [
  { feld_name: 'GP_CODE' }, { feld_name: 'ITYP' }, { feld_name: 'INR' }, {},
  { feld_name: 'DATUM' }, { feld_name: 'DATUM_SORT' }, { label: 'Von' },
  { feld_name: 'BEZUG_GP_CODE' }, { feld_name: 'BEZUG_INR' }, { feld_name: 'BEZUG_ITYP' },
  {}, {}, { label: 'Unterstützungen' }, {}, {}, { label: 'Nr' }, {}, {},
  { label: 'Bezug_Link' }, { feld_name: 'TYP' }, {}, {}, {},
]

type Typ = 'I' | 'P'

/** One list-142 row of a parent, in the 23 columns `mapStatementRow` reads. */
function row(gp: string, ityp: 'ME' | 'I', inr: number, n: number, typ: Typ): unknown[] {
  const snItyp = ityp === 'ME' ? 'SNME' : 'SN'
  const citation = ityp === 'ME' ? `${n}/SN-${inr}/ME` : `${n}/SN`
  const submitter = typ === 'I' ? `Musterverband ${n}` : 'Muster, Max'
  const day = String(1 + (n % 28)).padStart(2, '0')
  return [
    gp, snItyp, 50_000 + n, null, `${day}.07.2026`, `2026-07-${day}T12:00:00`,
    `<a href="/gegenstand/${gp}/${snItyp}/${50_000 + n}/">${submitter} (${citation})</a>`,
    gp, String(inr), ityp, null, null, 0, null, null, citation, `${inr}/${ityp}`, null,
    `/gegenstand/${gp}/${ityp}/${inr}`, typ, 1, n, '1',
  ]
}

interface Parent {
  rows: unknown[][]
  /** `showAll` stops here, the way it stops at 100,000 upstream — `count` stays true. */
  showAllStopsAt?: number
  /** Answer without `count`. */
  noCount?: boolean
  /** Ignore a `TYP` key, the way the API ignores keys it does not know. */
  ignoresTyp?: boolean
  /** Answer with an HTTP status instead. */
  status?: number
}

const parents = new Map<string, Parent>()

/** `institutions` rows flagged I, then `persons` rows flagged P. */
function parent(gp: string, ityp: 'ME' | 'I', inr: number, institutions: number, persons: number, over: Partial<Parent> = {}): Parent {
  const rows = [
    ...Array.from({ length: institutions }, (_, i) => row(gp, ityp, inr, i + 1, 'I')),
    ...Array.from({ length: persons }, (_, i) => row(gp, ityp, inr, institutions + i + 1, 'P')),
  ]
  const p = { rows, ...over }
  parents.set(`${gp}/${ityp}/${inr}`, p)
  return p
}

interface Request {
  showAll: boolean
  typ: string | null
}

/** Every list-142 request, in order. */
const requests: Request[] = []

function answer(url: string, init: RequestInit): Response {
  const body = JSON.parse(String(init.body)) as Record<string, unknown[]>
  const showAll = new URL(url).searchParams.has('showAll')
  const typ = (body.TYP?.[0] as string | undefined) ?? null
  requests.push({ showAll, typ })
  const p = parents.get(`${body.BEZUG_GP_CODE?.[0]}/${body.BEZUG_ITYP?.[0]}/${body.BEZUG_INR?.[0]}`)
  if (p?.status) return new Response('', { status: p.status })
  const all = (p?.rows ?? []).filter((r) => typ === null || p?.ignoresTyp || r[19] === typ)
  const rows = showAll ? all.slice(0, p?.showAllStopsAt ?? all.length) : all.slice(0, 20)
  return new Response(
    JSON.stringify({
      pages: Math.ceil(all.length / 20),
      ...(p?.noCount ? {} : { count: all.length }),
      header: HEADER_142,
      rows,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

/** List 81's row for the draft — what the existence check and the empty guard read. */
function listed(inr: number, statementCount: number): void {
  getDraftsForGp.mockResolvedValue({ items: [{ inr, statementCount }] } as never)
}

beforeEach(async () => {
  process.env.BM_STATE_DIR = await mkdtemp(join(tmpdir(), 'bm-statements-'))
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => Promise.resolve(answer(url, init))))
  parents.clear()
  requests.length = 0
  getDraftsForGp.mockReset()
})

afterEach(() => {
  delete process.env.BM_STATE_DIR
  vi.unstubAllGlobals()
})

// Each test its own INR: the module keeps an in-memory last-good map for the
// life of the process, which here is the file.

describe('the draft\'s list below the cap', () => {
  it('costs one request where the first page holds it all', async () => {
    parent('XXVIII', 'ME', 101, 3, 4)
    listed(101, 7)

    const result = await getStatementsWithFallback('XXVIII', 101)
    expect(result.items).toHaveLength(7)
    expect(result.unlisted).toBe(0)
    expect(requests).toEqual([{ showAll: false, typ: null }])
  })

  it('is read whole after the sizing call', async () => {
    parent('XXVIII', 'ME', 102, 10, 15)
    listed(102, 25)

    const result = await getStatementsWithFallback('XXVIII', 102)
    expect(result.items).toHaveLength(25)
    expect(result.unlisted).toBe(0)
    expect(requests).toEqual([{ showAll: false, typ: null }, { showAll: true, typ: null }])
  })

  /* THE DEFECT, small: `showAll` hands back fewer rows than its own count
   * says. Aggregating them prints a breakdown of part of the list as the
   * whole one, and stores it. Refused instead — and with no record to fall
   * back on, the error reaches the caller, which degrades to list 81's
   * count rather than to a wrong breakdown. */
  it('is refused when it arrives shorter than its count, and leaves no record', async () => {
    parent('XXVIII', 'ME', 103, 10, 20, { showAllStopsAt: 29 })
    listed(103, 30)

    await expect(getStatementsWithFallback('XXVIII', 103)).rejects.toMatchObject({
      statusCode: 502,
      statusMessage: 'Stellungnahmen-Liste unvollständig geliefert (29 von 30 Zeilen)',
    })
    expect(await loadLastGoodStatements('XXVIII', 103)).toBeNull()
  })

  it('is refused when the answer carries no count to hold it against', async () => {
    parent('XXVIII', 'ME', 104, 2, 3, { noCount: true })
    listed(104, 5)

    await expect(getStatementsWithFallback('XXVIII', 104)).rejects.toMatchObject({ statusCode: 502 })
  })

  /* The index glitch of 27.08.2026: list 142 answers empty while list 81
   * still counts. One retry, then an error — never a cached zero. */
  it('retries an empty answer that list 81 contradicts, then refuses it', async () => {
    listed(105, 707)

    await expect(getStatementsWithFallback('XXVIII', 105)).rejects.toMatchObject({ statusCode: 502 })
    expect(requests).toEqual([{ showAll: false, typ: null }, { showAll: false, typ: null }])
  })

  it('takes an empty answer at its word where list 81 counts none', async () => {
    listed(106, 0)

    expect(await getStatementsWithFallback('XXVIII', 106)).toEqual({ items: [], unlisted: 0, staleAsOf: null })
    expect(requests).toHaveLength(1)
  })
})

describe('the draft\'s list above the cap', () => {
  /* 164/ME's shape: 117 institutions among 106,183. Here 7 among the cap
   * plus 10. The whole list is never requested — not even once to look. */
  it('reads the institutions alone and counts the rest', async () => {
    parent('XXVII', 'ME', 164, 7, STATEMENTS_CAP + 3)
    listed(164, STATEMENTS_CAP + 10)

    const result = await getStatementsWithFallback('XXVII', 164)
    expect(result.items).toHaveLength(7)
    expect(result.items.every((i) => i.submitterKind === 'organisation')).toBe(true)
    expect(result.unlisted).toBe(STATEMENTS_CAP + 3)
    expect(result.staleAsOf).toBeNull()
    expect(requests).toEqual([{ showAll: false, typ: null }, { showAll: false, typ: 'I' }])
    expect(requests.some((r) => r.showAll && r.typ === null)).toBe(false)
  })

  /* The record keeps the count beside the institutions, so the fallback
   * says what the live page said — not „7 Stellungnahmen". */
  it('falls back to the institutions WITH the count when list 142 fails', async () => {
    const p = parent('XXVII', 'ME', 165, 7, STATEMENTS_CAP + 3)
    listed(165, STATEMENTS_CAP + 10)
    await getStatementsWithFallback('XXVII', 165)
    const stored = await loadLastGoodStatements('XXVII', 165)
    expect(stored?.items).toHaveLength(7)
    expect(stored?.unlisted).toBe(STATEMENTS_CAP + 3)

    p.status = 400
    const recalled = await getStatementsWithFallback('XXVII', 165)
    expect(recalled.items).toHaveLength(7)
    expect(recalled.unlisted).toBe(STATEMENTS_CAP + 3)
    expect(recalled.staleAsOf).toBe(stored?.fetchedAt)
  })

  /* An ignored `TYP` answers the whole list — private persons under the
   * heading „Organisationen". The sizing guard refuses it, and on the draft
   * that is a failed read: the page has a fallback for one. */
  it('refuses an institution filter that did not narrow', async () => {
    parent('XXVII', 'ME', 166, 7, STATEMENTS_CAP + 3, { ignoresTyp: true })
    listed(166, STATEMENTS_CAP + 10)

    await expect(getStatementsWithFallback('XXVII', 166)).rejects.toMatchObject({ statusCode: 502 })
    expect(requests.some((r) => r.showAll)).toBe(false)
  })

  it('refuses an institution list that arrives short of its count', async () => {
    parent('XXVII', 'ME', 167, 25, STATEMENTS_CAP, { showAllStopsAt: 24 })
    listed(167, STATEMENTS_CAP + 25)

    await expect(getStatementsWithFallback('XXVII', 167)).rejects.toMatchObject({ statusCode: 502 })
  })
})

describe('the Vorlage\'s list', () => {
  it('is held against its count below the cap too', async () => {
    parent('XXVIII', 'I', 313, 21, 4, { showAllStopsAt: 24 })

    await expect(getStatementsForRv('XXVIII', 313)).rejects.toMatchObject({ statusCode: 502 })
  })

  it('reads a whole list whole', async () => {
    parent('XXVIII', 'I', 314, 21, 4)

    expect(await getStatementsForRv('XXVIII', 314)).toMatchObject({ total: 25, unlisted: 0 })
  })

  it('keeps its institutions-only state above the cap', async () => {
    parent('XXVII', 'I', 1289, 17, STATEMENTS_CAP + 1)

    const result = await getStatementsForRv('XXVII', 1289)
    expect(result.total).toBe(STATEMENTS_CAP + 18)
    expect(result.items).toHaveLength(17)
    expect(result.unlisted).toBe(STATEMENTS_CAP + 1)
  })
})

/* The record on disk, read as the next process would. Not through
 * `loadLastGoodStatements` alone: the shape of the file is what a rollback
 * or a second reader meets. */
describe('the record a capped read leaves', () => {
  it('stores the institutions and the count, nothing of the unread rows', async () => {
    parent('XXVII', 'ME', 168, 3, STATEMENTS_CAP + 2)
    listed(168, STATEMENTS_CAP + 5)
    await getStatementsWithFallback('XXVII', 168)

    const file = JSON.parse(
      await readFile(join(process.env.BM_STATE_DIR!, 'statements', 'XXVII-168.json'), 'utf8'),
    ) as { items: unknown[]; unlisted: number }
    expect(file.items).toHaveLength(3)
    expect(file.unlisted).toBe(STATEMENTS_CAP + 2)
  })
})
