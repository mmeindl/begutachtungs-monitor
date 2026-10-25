import { describe, expect, it } from 'vitest'
import { GP_STARTS, intToRoman, romanToInt } from '../shared/utils/gp'
import {
  type DraftFilterValues,
  SEVERAL_STATIONS,
  activeFilterChips,
  draftApiQuery,
  draftCountLabel,
  draftFiltersFromQuery,
  draftUrlQuery,
  sameDraftFilters,
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
      draftFiltersFromQuery({ status: 'halb', art: 'unbestimmt', sort: 'neu', station: 'mond' }),
    ).toEqual(empty)
  })

  it('reads an old „Ministerialentwürfe" link as the law drafts', () => {
    // The Art names kinds since 23.10.2026; a superset of what the link showed.
    expect(draftFiltersFromQuery({ art: 'ministerialentwurf' }).art).toBe('gesetz')
    expect(draftFiltersFromQuery({ art: 'gesetz' }).art).toBe('gesetz')
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

  describe('the period', () => {
    // Relative to the calendar, so the day a row is added changes nothing here.
    const newest = Math.max(...Object.keys(GP_STARTS).map((g) => romanToInt(g) ?? 0))

    it('reads a lowercased code the way the server does', () => {
      expect(draftFiltersFromQuery({ gp: 'xxvii' }).gp).toBe('XXVII')
      expect(draftFiltersFromQuery({ gp: ' XIV ' }).gp).toBe('XIV')
    })

    it('drops a code the endpoints would refuse, so the list opens instead of an error', () => {
      // 400 there: no Roman numeral, or not a canonical one.
      expect(draftFiltersFromQuery({ gp: 'XYZ' }).gp).toBe('')
      expect(draftFiltersFromQuery({ gp: 'IIII' }).gp).toBe('')
      expect(draftFiltersFromQuery({ gp: '28' }).gp).toBe('')
      // 404 there: further out than the running period's successor.
      expect(draftFiltersFromQuery({ gp: intToRoman(newest + 2) }).gp).toBe('')
      expect(draftFiltersFromQuery({ gp: 'LXX' }).gp).toBe('')
    })

    it('keeps the successor of the newest period, which the server answers too', () => {
      // `isPlausibleGp`'s one period of headroom, on the day a period convenes.
      expect(draftFiltersFromQuery({ gp: intToRoman(newest + 1) }).gp).toBe(intToRoman(newest + 1))
    })
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
    { ...empty, art: 'gesetz', gp: 'XXVIII', ministry: 'BMJ' },
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

describe('sameDraftFilters', () => {
  const open: DraftFilterValues = { ...empty, status: 'open', stations: ['begutachtung'] }

  it('recognises the state the page itself wrote into the URL', () => {
    // `useDraftFilters` reads its own `router.replace` back through the route.
    for (const values of [empty, open, { ...open, gp: 'XXVII', q: 'klima', sort: 'stellungnahmen' as const }]) {
      expect(sameDraftFilters(draftFiltersFromQuery(draftUrlQuery(values)), values)).toBe(true)
    }
  })

  it('tells a navigation to another list apart, one filter is enough', () => {
    // The header's „Entwürfe" from a list the homepage opened filtered.
    expect(sameDraftFilters(empty, open)).toBe(false)
    expect(sameDraftFilters(open, { ...open, ministry: 'BMF' })).toBe(false)
    expect(sameDraftFilters(open, { ...open, sort: 'stellungnahmen' })).toBe(false)
    expect(sameDraftFilters({ ...open, q: 'klima' }, open)).toBe(false)
  })

  it('compares what a URL carries, not how a link spelled it', () => {
    expect(sameDraftFilters(draftFiltersFromQuery({ gp: 'xxvii', status: 'halb' }), { ...empty, gp: 'XXVII' })).toBe(true)
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
      { key: 'art', label: 'Verordnungsentwürfe' },
      { key: 'gp', label: 'GP XXVII' },
      { key: 'ministry', label: 'BMF' },
    ])
  })
})

/**
 * The count line — by kind, summed over the sources, never one pooled total
 * (docs/architecture.md §12.19). A headline „336 Entwürfe" would put the
 * Stellungnahmen figures of a third of the rows over all of them.
 */
describe('draftCountLabel', () => {
  // GP XXVIII on 23.10.2026: 148 Ministerialentwürfe, the RIS half 4 + 206.
  const ris = { gesetz: 4, verordnung: 206 }
  const both = { me: 148, vorlagen: [], ris, laterStationsOnly: false }

  it('counts by kind, the Ministerialentwürfe among the law drafts', () => {
    const label = draftCountLabel(both)
    expect(label).toBe('152 Gesetzesentwürfe · 206 Verordnungsentwürfe')
    expect(label).not.toContain('358')
    expect(label).not.toContain('weitere')
  })

  it('sums the Länder into the same kinds', () => {
    expect(draftCountLabel({ ...both, laender: { gesetz: 100, verordnung: 182 } })).toBe(
      '252 Gesetzesentwürfe · 388 Verordnungsentwürfe',
    )
    expect(draftCountLabel({ me: null, vorlagen: [], ris: null, laterStationsOnly: false, laender: { gesetz: 36 } })).toBe(
      '36 Gesetzesentwürfe',
    )
  })

  it('names only the kinds that are in the list', () => {
    expect(draftCountLabel({ ...both, ris: null })).toBe('148 Gesetzesentwürfe')
    expect(draftCountLabel({ ...both, me: null, ris: { verordnung: 206 }, art: 'verordnung' })).toBe('206 Verordnungsentwürfe')
  })

  it('names a record of kind „unbestimmt" only where there is one', () => {
    expect(draftCountLabel({ ...both, ris: { ...ris, unbestimmt: 1 } })).toBe(
      '152 Gesetzesentwürfe · 206 Verordnungsentwürfe · 1 anderer Entwurf',
    )
  })

  it('uses the singular per kind', () => {
    expect(draftCountLabel({ me: 0, vorlagen: [], ris: { gesetz: 1, verordnung: 1 }, laterStationsOnly: false })).toBe(
      '1 Gesetzesentwurf · 1 Verordnungsentwurf',
    )
  })

  it('says an empty list once, by the Art it stands under', () => {
    expect(draftCountLabel({ ...both, me: 0, ris: {} })).toBe('0 Entwürfe')
    expect(draftCountLabel({ ...both, me: 0, ris: {}, art: 'gesetz' })).toBe('0 Gesetzesentwürfe')
    expect(draftCountLabel({ ...both, me: null, ris: {}, art: 'verordnung' })).toBe('0 Verordnungsentwürfe')
    expect(draftCountLabel({ ...both, me: null, ris: null, laender: {} })).toBe('0 Entwürfe')
  })

  it('says nothing where nothing is asked for', () => {
    expect(draftCountLabel({ ...both, me: null, ris: null })).toBe('')
  })

  it('says the RIS half failed rather than counting it as zero, by what it would have brought', () => {
    expect(draftCountLabel({ ...both, ris: 'failed' })).toBe(
      '148 Gesetzesentwürfe · die Verordnungs- und einzelne Gesetzesentwürfe des Bundes sind gerade nicht abrufbar',
    )
    expect(draftCountLabel({ ...both, ris: 'failed', art: 'gesetz' })).toBe(
      '148 Gesetzesentwürfe · einzelne Gesetzesentwürfe des Bundes sind gerade nicht abrufbar',
    )
    expect(draftCountLabel({ ...both, me: null, ris: 'failed', art: 'verordnung', laender: { verordnung: 12 } })).toBe(
      '12 Verordnungsentwürfe · die Verordnungsentwürfe des Bundes sind gerade nicht abrufbar',
    )
  })

  it('counts the Regierungsvorlagen as a term of their own', () => {
    const none = { consultation: { kind: 'none' as const } }
    expect(draftCountLabel({ ...both, vorlagen: [none, none] })).toBe(
      '152 Gesetzesentwürfe · 206 Verordnungsentwürfe · 2 Regierungsvorlagen ohne Begutachtung',
    )
  })

  it('claims „ohne Begutachtung" only where every Vorlage is checked', () => {
    const vorlagen = [{ consultation: { kind: 'none' as const } }, { consultation: { kind: 'unknown' as const } }]
    expect(draftCountLabel({ ...both, ris: null, vorlagen })).toBe('148 Gesetzesentwürfe · 2 Regierungsvorlagen')
  })

  it('leaves the RIS half out under a station it cannot reach — not as rows, not as failed', () => {
    expect(draftCountLabel({ ...both, laterStationsOnly: true })).toBe('148 Gesetzesentwürfe')
    expect(draftCountLabel({ ...both, ris: 'failed', laterStationsOnly: true })).toBe('148 Gesetzesentwürfe')
    expect(draftCountLabel({ ...both, laterStationsOnly: true, laender: { gesetz: 3 } })).toBe('151 Gesetzesentwürfe')
  })

  it('uses the singular at one', () => {
    expect(draftCountLabel({ me: 1, vorlagen: [{ consultation: { kind: 'none' } }], ris: null, laterStationsOnly: false })).toBe(
      '1 Gesetzesentwurf · 1 Regierungsvorlage ohne Begutachtung',
    )
  })
})
