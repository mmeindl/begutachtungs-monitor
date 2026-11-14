import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The period's item list from list 101 (`getItemsForGp`,
 * `server/utils/parliament/drafts.ts`, 14.11.2026): one call narrowed by
 * `ITYP` and `DOKTYP`, never `{ GP_CODE }` alone — and the narrowing held
 * against every row, because the API ignores a filter key it does not know.
 *
 * `defineCachedFunction` calls straight through and `createError` builds a
 * plain error, as in `statementsFetch.test.ts`; the upstream client is
 * mocked, so the filter body it is called with is what is checked.
 */
vi.stubGlobal(
  'defineCachedFunction',
  <A extends unknown[], R>(fn: (...args: A) => R) =>
    (...args: A): R => fn(...args),
)
vi.stubGlobal('DERIVED_CACHE', '/derived')
vi.stubGlobal('createError', (o: { statusCode: number; statusMessage: string }) => Object.assign(new Error(o.statusMessage), o))

vi.mock('../server/utils/upstream/parliament', () => ({
  fetchFilterList: vi.fn(),
  fetchGegenstand: vi.fn(),
  fetchMeListConfig: vi.fn(),
  assertRowsMatchGp: vi.fn(),
  assertListHeader: vi.fn(),
}))

const { fetchFilterList } = vi.mocked(await import('../server/utils/upstream/parliament'))
const { getItemsForGp, getVorlagenForGp } = await import('../server/utils/parliament/drafts')
const { foreignDoktype } = await import('../server/utils/parliament/list101')

/** A list-101 row with the columns the mapper reads: 0 gp, 2 inr, 6 title,
 *  7 citation, 8 date, 10 status, 11 DOKTYP, 14 path. */
function row(inr: number, doktyp: string, status = '5'): unknown[] {
  const r: unknown[] = new Array(36).fill(null)
  r[0] = 'XXVIII'
  r[2] = inr
  r[6] = `Gesetz ${inr}, Änderung`
  r[7] = `${inr} d.B.`
  r[8] = 20241209
  r[10] = status
  r[11] = doktyp
  r[14] = `/gegenstand/XXVIII/I/${inr}`
  return r
}

beforeEach(() => fetchFilterList.mockReset())

describe('getItemsForGp', () => {
  it('asks for type I and the six document types, never the period alone', async () => {
    fetchFilterList.mockResolvedValue({ rows: [row(14, 'BUA'), row(589, 'RV'), row(119, 'RVS')] } as never)
    const items = await getItemsForGp('XXVIII')
    expect(fetchFilterList).toHaveBeenCalledWith(101, { GP_CODE: ['XXVIII'], ITYP: ['I'], DOKTYP: ['RV', 'BUA', 'GABR', 'GABR13', 'RVS', 'EBR'] })
    expect(items.map((i) => `${i.inr} ${i.doktyp}`)).toEqual(['14 BUA', '589 RV', '119 RVS'])
  })
  it('refuses an answer in which the filter did not grip', async () => {
    // An Ausschussbericht among the rows: the API ignored DOKTYP.
    fetchFilterList.mockResolvedValue({ rows: [row(14, 'BUA'), row(15, 'AUB')] } as never)
    await expect(getItemsForGp('XXVIII')).rejects.toMatchObject({ statusCode: 502, statusMessage: expect.stringContaining('DOKTYP AUB') })
  })
  it('gives the Regierungsvorlagen only to their readers', async () => {
    fetchFilterList.mockResolvedValue({ rows: [row(14, 'BUA'), row(589, 'RV', '2'), row(119, 'RVS')] } as never)
    expect((await getVorlagenForGp('XXVIII')).map((v) => [v.inr, v.citation, v.status])).toEqual([[589, '589 d.B.', '2']])
  })
})

describe('foreignDoktype', () => {
  it('names the first row outside the list, or null', () => {
    expect(foreignDoktype([row(1, 'RV'), row(2, 'EBR')], ['RV', 'EBR'])).toBeNull()
    expect(foreignDoktype([row(1, 'RV'), row(2, 'AUB')], ['RV'])).toBe('AUB')
    expect(foreignDoktype([row(1, 'RV'), 'not a row'], ['RV'])).toBe('?')
    expect(foreignDoktype([], ['RV'])).toBeNull()
  })
})
