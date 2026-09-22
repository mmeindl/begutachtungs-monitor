import { describe, expect, it } from 'vitest'
import {
  type DraftFilterValues,
  draftApiQuery,
  draftFiltersFromQuery,
  draftUrlQuery,
} from '../app/utils/draftFilters'

const empty: DraftFilterValues = {
  status: 'all',
  stations: [],
  art: '',
  gp: '',
  ministry: '',
  q: '',
  sort: 'frist',
}

describe('draftFiltersFromQuery', () => {
  it('reads every filter a link can carry', () => {
    expect(
      draftFiltersFromQuery({
        status: 'open',
        station: 'rv,bgbl',
        art: 'verordnung',
        gp: 'XXVIII',
        ministry: 'BMF',
        q: 'klima',
        sort: 'stellungnahmen',
      }),
    ).toEqual({
      status: 'open',
      stations: ['rv', 'bgbl'],
      art: 'verordnung',
      gp: 'XXVIII',
      ministry: 'BMF',
      q: 'klima',
      sort: 'stellungnahmen',
    })
  })

  it('falls back rather than erroring on a hand-typed link', () => {
    expect(
      draftFiltersFromQuery({ status: 'halb', art: 'gesetz', sort: 'titel', station: 'mond' }),
    ).toEqual(empty)
  })

  it('reads an empty query as no filter at all', () => {
    expect(draftFiltersFromQuery({})).toEqual(empty)
  })

  it('keeps only the stations the procedure knows, in the order given', () => {
    expect(draftFiltersFromQuery({ station: 'bgbl, MOND ,Begutachtung' }).stations).toEqual([
      'bgbl',
      'begutachtung',
    ])
  })

  it('takes the first value of a repeated parameter', () => {
    expect(draftFiltersFromQuery({ gp: ['XXVII', 'XXVIII'] }).gp).toBe('XXVII')
  })
})

describe('the round trip', () => {
  const cases: DraftFilterValues[] = [
    empty,
    { ...empty, status: 'open' },
    { ...empty, stations: ['begutachtung', 'rv'] },
    { ...empty, art: 'ministerialentwurf', gp: 'XXVIII', ministry: 'BMJ' },
    { ...empty, q: 'klimaschutz', sort: 'stellungnahmen' },
    { status: 'closed', stations: ['bgbl'], art: 'verordnung', gp: 'XXVII', ministry: 'BMF', q: 'x', sort: 'stellungnahmen' },
  ]

  it('reopens the list the link was written from', () => {
    for (const values of cases) {
      expect(draftFiltersFromQuery(draftUrlQuery(values))).toEqual(values)
    }
  })

  it('leaves every default out of the URL', () => {
    expect(draftUrlQuery(empty)).toEqual({})
    expect(draftUrlQuery({ ...empty, sort: 'frist', status: 'all' })).toEqual({})
  })
})

describe('draftApiQuery', () => {
  it('asks for nothing it does not filter by', () => {
    expect(draftApiQuery(empty)).toEqual({
      status: 'all',
      station: undefined,
      gp: undefined,
      ministry: undefined,
      q: undefined,
    })
  })

  it('joins the stations and passes the rest through', () => {
    expect(
      draftApiQuery({ status: 'open', stations: ['rv', 'bgbl'], gp: 'XXVIII', ministry: 'BMF', q: 'klima' }),
    ).toEqual({ status: 'open', station: 'rv,bgbl', gp: 'XXVIII', ministry: 'BMF', q: 'klima' })
  })
})
