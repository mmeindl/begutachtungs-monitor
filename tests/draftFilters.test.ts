import { describe, expect, it } from 'vitest'
import {
  ART_VERORDNUNG_NOUN,
  type DraftFilterValues,
  SEVERAL_STATIONS,
  activeFilterChips,
  draftApiQuery,
  draftCountLabel,
  draftFiltersFromQuery,
  draftUrlQuery,
  stationTabsFor,
  unionGps,
  unionMinistries,
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
      draftFiltersFromQuery({ status: 'halb', art: 'gesetz', sort: 'neu', station: 'mond' }),
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

  it('reads each of the two orders, and nothing else', () => {
    // The select is the only writer of this value, so what has to hold is
    // the other direction: a link carrying an order we dropped must open the
    // list everybody means, not a page that sorts by a key nothing matches.
    // „Zuletzt dazugekommen" and the title order went on 02.10.2026; their
    // old links open the default.
    expect(draftFiltersFromQuery({ sort: 'neu' }).sort).toBe('frist')
    expect(draftFiltersFromQuery({ sort: 'titel' }).sort).toBe('frist')
    expect(draftFiltersFromQuery({ sort: 'stellungnahmen' }).sort).toBe('stellungnahmen')
    expect(draftFiltersFromQuery({ sort: 'einlangen' }).sort).toBe('frist')
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

describe('stationTabsFor', () => {
  it('offers „Alle" and every station, all available', () => {
    const tabs = stationTabsFor('', [])
    expect(tabs.map((t) => t.value)).toEqual(['', 'begutachtung', 'rv', 'parlament', 'bgbl'])
    expect(tabs.some((t) => t.disabled)).toBe(false)
  })

  it('keeps the two stations a Verordnungsentwurf cannot reach in place, unavailable', () => {
    // The strip does not change shape with the Art filter.
    const tabs = stationTabsFor('verordnung', [])
    expect(tabs.filter((t) => t.disabled).map((t) => t.value)).toEqual(['rv', 'parlament'])
    expect(tabs.find((t) => t.value === 'rv')?.reason).toBe('Verordnungsentwürfe kommen nicht ins Parlament')
    expect(tabs.find((t) => t.value === 'bgbl')?.disabled).toBe(false)
  })

  it('names a shared link\'s several stations as a tab of their own', () => {
    const tabs = stationTabsFor('', ['rv', 'parlament'])
    expect(tabs.at(-1)).toEqual({ value: SEVERAL_STATIONS, label: 'Regierungsvorlage + Parlament' })
    expect(stationTabsFor('', ['rv']).some((t) => t.value === SEVERAL_STATIONS)).toBe(false)
  })
})

describe('unionGps / unionMinistries', () => {
  it('orders periods by their number, not their spelling', () => {
    // As strings XXVIII would sort before XXX.
    expect(unionGps(['XXVIII', 'XXVII'], ['XXX', 'XXVIII'], undefined)).toEqual(['XXX', 'XXVIII', 'XXVII'])
  })

  it('merges Ressorts by code, a name winning over an empty one', () => {
    expect(
      unionMinistries(
        [{ code: 'BMF', name: '' }, { code: 'BMJ', name: 'Justiz' }],
        [{ code: 'BMF', name: 'Finanzen' }, { code: 'BMJ', name: 'anders' }],
      ),
    ).toEqual([
      { code: 'BMF', name: 'Finanzen' },
      { code: 'BMJ', name: 'Justiz' },
    ])
  })
})

describe('activeFilterChips', () => {
  it('has no chip for a filter that excludes nothing', () => {
    expect(activeFilterChips(empty)).toEqual([])
    // „Stellungnahme möglich" is the chip of the tool row, not of this list.
    expect(activeFilterChips({ ...empty, status: 'open' })).toEqual([])
  })

  it('states each value of the closed panel, and an old „Nicht möglich" link', () => {
    expect(
      activeFilterChips({ status: 'closed', art: 'verordnung', gp: 'XXVII', ministry: 'BMF' }),
    ).toEqual([
      { key: 'status', label: 'Nicht möglich' },
      { key: 'art', label: ART_VERORDNUNG_NOUN },
      { key: 'gp', label: 'GP XXVII' },
      { key: 'ministry', label: 'BMF' },
    ])
  })
})

/**
 * The count line — never a pooled total (docs/architecture.md §12.19). A
 * headline „336 Entwürfe" would put the Stellungnahmen figures of a third of
 * the rows over all of them.
 */
describe('draftCountLabel', () => {
  const both = { me: 135, vorlagen: [], ris: 201, laterStationsOnly: false }

  it('counts each half on its own and never adds them up', () => {
    const label = draftCountLabel(both)
    expect(label).toBe(`135 Ministerialentwürfe · 201 ${ART_VERORDNUNG_NOUN}`)
    expect(label).not.toContain('336')
  })

  it('names only the halves that are asked for', () => {
    expect(draftCountLabel({ ...both, ris: null })).toBe('135 Ministerialentwürfe')
    expect(draftCountLabel({ ...both, me: null })).toBe(`201 ${ART_VERORDNUNG_NOUN}`)
  })

  it('says the RIS half failed rather than counting it as zero', () => {
    expect(draftCountLabel({ ...both, ris: 'failed' })).toBe(
      '135 Ministerialentwürfe · die Verordnungsentwürfe sind gerade nicht abrufbar',
    )
  })

  it('counts the Regierungsvorlagen as a third term', () => {
    const none = { consultation: { kind: 'none' as const } }
    expect(draftCountLabel({ ...both, vorlagen: [none, none] })).toBe(
      `135 Ministerialentwürfe · 2 Regierungsvorlagen ohne Begutachtung · 201 ${ART_VERORDNUNG_NOUN}`,
    )
  })

  it('claims „ohne Begutachtung" only where every Vorlage is checked', () => {
    const vorlagen = [{ consultation: { kind: 'none' as const } }, { consultation: { kind: 'unknown' as const } }]
    expect(draftCountLabel({ ...both, ris: null, vorlagen })).toBe('135 Ministerialentwürfe · 2 Regierungsvorlagen')
  })

  it('leaves the Verordnung half out under a station it cannot reach — not as 0, not as failed', () => {
    expect(draftCountLabel({ ...both, laterStationsOnly: true })).toBe('135 Ministerialentwürfe')
    expect(draftCountLabel({ ...both, ris: 'failed', laterStationsOnly: true })).toBe('135 Ministerialentwürfe')
  })

  it('uses the singular at one', () => {
    expect(draftCountLabel({ me: 1, vorlagen: [{ consultation: { kind: 'none' } }], ris: null, laterStationsOnly: false })).toBe(
      '1 Ministerialentwurf · 1 Regierungsvorlage ohne Begutachtung',
    )
  })
})
