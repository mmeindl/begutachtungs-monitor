import { describe, expect, it } from 'vitest'
import {
  canParticipate,
  dedupeDraftList,
  filterDraftList,
  sortDraftList,
} from '../server/utils/parliament/draftList'
import type { DraftSummary } from '../shared/types'

/**
 * What a query shows and what leads the page — the two decisions
 * `/api/drafts` makes about a list it did not fetch
 * (`server/utils/parliament/draftList.ts`).
 */

function draft(overrides: Partial<DraftSummary> = {}): DraftSummary {
  return {
    gp: 'XXVIII',
    inr: 1,
    citation: '1/ME',
    title: 'Bundesgesetz, mit dem das Ökostromgesetz geändert wird',
    ministryCode: 'BMF',
    ministryName: 'Bundesministerium für Finanzen',
    coMinistries: [],
    arrivedAt: '2026-09-01',
    deadline: '2026-10-01',
    active: true,
    statementCount: 0,
    parliamentUrl: 'https://www.parlament.gv.at/gegenstand/XXVIII/ME/1',
    ...overrides,
  }
}

const ALL = { status: 'all', stations: [], ministry: undefined, q: undefined, stationsUsable: true } as const

const titles = (rows: DraftSummary[]) => rows.map((r) => r.citation)

describe('canParticipate', () => {
  it('counts a running Frist and an open filing on the Regierungsvorlage alike', () => {
    expect(canParticipate({ active: true })).toBe(true)
    expect(canParticipate({ active: false, chain: { station: 'rv', filingOpen: true } as DraftSummary['chain'] })).toBe(true)
    expect(canParticipate({ active: false })).toBe(false)
  })
})

/* List 81 carries a jointly issued Entwurf once per Ressort: GP XXVII 302/ME
 * (BMFFIM ∥ BMJ), 266/ME (BMF ∥ BMFFIM) and 114/ME (BMJ ∥ BMDW) stood in the
 * archive twice and made `total` say 353 of 350 (found 23.09.2026). */
describe('dedupeDraftList', () => {
  it('keeps one row per Entwurf and names every ressort that sent it', () => {
    const rows = dedupeDraftList([
      draft({ inr: 302, citation: '302/ME', ministryCode: 'BMFFIM', ministryName: 'Frauen, Wissenschaft und Forschung' }),
      draft({ inr: 302, citation: '302/ME', ministryCode: 'BMJ', ministryName: 'Justiz' }),
      draft({ inr: 266, citation: '266/ME', ministryCode: 'BMF' }),
    ])
    expect(titles(rows)).toEqual(['302/ME', '266/ME'])
    expect(rows[0]!.coMinistries).toEqual([{ code: 'BMJ', name: 'Justiz' }])
    // A draft one Ressort sent carries an empty list, never a hole.
    expect(rows[1]!.coMinistries).toEqual([])
  })

  /* The lead must not depend on the order upstream happened to answer in:
   * `requireDraft` picks its own row out of the same list, and a detail page
   * naming a different Ressort than the card that opened it is the defect
   * this sort prevents. Code order, so it reads the same on every machine. */
  it('leads with the same ressort whichever order the rows arrive in', () => {
    const [first] = dedupeDraftList([
      draft({ inr: 114, ministryCode: 'BMJ' }),
      draft({ inr: 114, ministryCode: 'BMDW' }),
    ])
    const [flipped] = dedupeDraftList([
      draft({ inr: 114, ministryCode: 'BMDW' }),
      draft({ inr: 114, ministryCode: 'BMJ' }),
    ])
    expect(first!.ministryCode).toBe('BMDW')
    expect(flipped!.ministryCode).toBe('BMDW')
    expect(flipped!.coMinistries.map((m) => m.code)).toEqual(['BMJ'])
  })

  it('separates the periods — the same number exists in every GP', () => {
    const rows = dedupeDraftList([
      draft({ gp: 'XXVIII', inr: 114 }),
      draft({ gp: 'XXVII', inr: 114 }),
    ])
    expect(rows.map((r) => r.gp)).toEqual(['XXVIII', 'XXVII'])
  })
})

describe('filterDraftList', () => {
  const rows = [
    draft({ inr: 1, citation: '1/ME', active: true }),
    draft({ inr: 2, citation: '2/ME', active: false, ministryCode: 'BMJ' }),
    draft({ inr: 3, citation: '3/ME', active: false, chain: { station: 'bgbl', filingOpen: false } as DraftSummary['chain'] }),
  ]

  it('open means "somebody can still say something", closed is its complement', () => {
    expect(titles(filterDraftList(rows, { ...ALL, status: 'open' }))).toEqual(['1/ME'])
    expect(titles(filterDraftList(rows, { ...ALL, status: 'closed' }))).toEqual(['2/ME', '3/ME'])
  })

  it('treats a row without a station as standing at the Begutachtung', () => {
    expect(titles(filterDraftList(rows, { ...ALL, stations: ['begutachtung'] }))).toEqual(['1/ME', '2/ME'])
    expect(titles(filterDraftList(rows, { ...ALL, stations: ['bgbl'] }))).toEqual(['3/ME'])
  })

  it('drops the station filter where the map could not be read', () => {
    // Otherwise a period whose stations we failed to resolve would answer
    // with an empty list instead of an unfiltered one.
    expect(titles(filterDraftList(rows, { ...ALL, stations: ['bgbl'], stationsUsable: false }))).toHaveLength(3)
  })

  it('matches the ministry by code, never by name', () => {
    expect(titles(filterDraftList(rows, { ...ALL, ministry: 'BMJ' }))).toEqual(['2/ME'])
    expect(titles(filterDraftList(rows, { ...ALL, q: 'finanzen' }))).toEqual([])
    expect(titles(filterDraftList(rows, { ...ALL, q: 'bmj' }))).toEqual(['2/ME'])
  })

  /* „Alle Entwürfe des Ministeriums BMJ" has to hold every draft the BMJ
   * sent, including the one it sent jointly and does not lead. The search
   * follows the same rule, because the row prints both codes. */
  it('finds a jointly issued Entwurf under either of its ressorts', () => {
    const joint = [
      draft({ inr: 302, citation: '302/ME', ministryCode: 'BMFFIM', coMinistries: [{ code: 'BMJ', name: 'Justiz' }] }),
      draft({ inr: 9, citation: '9/ME', ministryCode: 'BMF' }),
    ]
    expect(titles(filterDraftList(joint, { ...ALL, ministry: 'BMFFIM' }))).toEqual(['302/ME'])
    expect(titles(filterDraftList(joint, { ...ALL, ministry: 'BMJ' }))).toEqual(['302/ME'])
    expect(titles(filterDraftList(joint, { ...ALL, q: 'bmj' }))).toEqual(['302/ME'])
  })

  it('reads the query folded and with AND between the words', () => {
    expect(titles(filterDraftList(rows, { ...ALL, q: 'oekostrom' }))).toHaveLength(3)
    expect(titles(filterDraftList(rows, { ...ALL, q: 'ökostrom geändert' }))).toHaveLength(3)
    expect(titles(filterDraftList(rows, { ...ALL, q: 'ökostrom strafrecht' }))).toEqual([])
  })
})

describe('sortDraftList', () => {
  it('leads with the open drafts, nearest Frist first', () => {
    const rows = [
      draft({ inr: 1, citation: 'zu', active: false, deadline: '2026-09-30' }),
      draft({ inr: 2, citation: 'spaet', active: true, deadline: '2026-11-01' }),
      draft({ inr: 3, citation: 'bald', active: true, deadline: '2026-10-01' }),
    ]
    expect(titles(sortDraftList(rows))).toEqual(['bald', 'spaet', 'zu'])
  })

  it('puts an open draft without a Frist behind the dated ones', () => {
    const rows = [
      draft({ inr: 1, citation: 'ohne', active: true, deadline: null }),
      draft({ inr: 2, citation: 'mit', active: true, deadline: '2026-11-01' }),
    ]
    expect(titles(sortDraftList(rows))).toEqual(['mit', 'ohne'])
  })

  it('orders the closed ones by the most recent end', () => {
    const rows = [
      draft({ inr: 1, citation: 'alt', active: false, deadline: '2026-01-01' }),
      draft({ inr: 2, citation: 'neu', active: false, deadline: '2026-08-01' }),
    ]
    expect(titles(sortDraftList(rows))).toEqual(['neu', 'alt'])
  })

  it('does not reorder its input in place', () => {
    const rows = [draft({ inr: 1, citation: 'a', active: false }), draft({ inr: 2, citation: 'b', active: true })]
    sortDraftList(rows)
    expect(titles(rows)).toEqual(['a', 'b'])
  })
})
