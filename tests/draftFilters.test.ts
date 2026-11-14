import { describe, expect, it } from 'vitest'
import { GP_STARTS, intToRoman, romanToInt } from '../shared/utils/gp'
import { LAND_CODES } from '../shared/utils/laender'
import { type LandPeriodCalendars, periodViewFor } from '../shared/utils/periodCalendar'
import {
  type DraftFilterValues,
  SEVERAL_STATIONS,
  ART_CHOICES,
  activeFilterChips,
  artChoiceLabel,
  artChoiceOf,
  artChoiceParams,
  artSelectFor,
  artUnavailableBySources,
  artUnavailableFor,
  artUnavailableNote,
  begutachtungGapReason,
  choiceAdmitsBundLaw,
  choiceAdmitsDraft,
  choiceAdmitsLandLaw,
  choiceAdmitsOpenVorlage,
  coherentArt,
  coherentBegutachtung,
  coherentFilters,
  draftKindArt,
  draftApiQuery,
  draftCountLabel,
  draftFiltersFromQuery,
  draftUrlQuery,
  halfState,
  landCoverageNote,
  landsIncompleteFor,
  lateHalves,
  ohneSilentNoteDe,
  registerReachNote,
  sameDraftFilters,
  spanOptionsFor,
  stationTabsFor,
  unionGps,
  unionMinistries,
  withoutDraftRequests,
  withoutDraftRowsOf,
  ANTRAG_ROUTE_UNAVAILABLE,
  choiceAdmitsMinisterialentwurf,
  draftRowsOf,
} from '../app/utils/draftFilters'
import { ANTRAG_PATHS } from '../shared/utils/antragPathTable'
import { antragPathFor, carriesDraft } from '../shared/utils/antragPath'

const empty: DraftFilterValues = {
  status: 'all',
  stations: [],
  art: '',
  gp: '',
  landtag: '',
  ministry: '',
  q: '',
  sort: 'frist',
  reversed: false,
  eu: '',
  begutachtung: '',
}

describe('draftFiltersFromQuery', () => {
  it('reads every filter a link can carry', () => {
    expect(
      draftFiltersFromQuery({
        status: 'open',
        station: 'rv,bgbl',
        art: 'antrag',
        gp: 'XXVIII',
        ministry: 'BMF',
        q: 'klima',
        sort: 'stellungnahmen',
        reverse: '1',
        eu: 'umsetzung',
        begutachtung: 'ohne',
      }),
    ).toEqual({
      status: 'open',
      stations: ['rv', 'bgbl'],
      art: 'antrag',
      gp: 'XXVIII',
      landtag: '',
      ministry: 'BMF',
      q: 'klima',
      sort: 'stellungnahmen',
      reversed: true,
      eu: 'umsetzung',
      begutachtung: 'ohne',
    })
  })

  it('falls back rather than erroring on a hand-typed link', () => {
    expect(
      draftFiltersFromQuery({ status: 'halb', art: 'unbestimmt', sort: 'neu', station: 'mond', eu: 'flankierend-vo', begutachtung: 'vielleicht' }),
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
    { status: 'closed', stations: ['bgbl'], art: 'verordnung', gp: 'XXVII', landtag: '', ministry: 'BMF', q: 'x', sort: 'stellungnahmen', reversed: true, eu: '', begutachtung: '' },
    { ...empty, reversed: true },
    { ...empty, eu: 'umsetzung' },
    { ...empty, status: 'open', art: 'verordnung', eu: 'umsetzung' },
    { ...empty, begutachtung: 'ohne' },
    { ...empty, begutachtung: 'ohne', stations: ['bgbl'], gp: 'XXVII', q: 'orf' },
  ]

  it('reopens the list the link was written from', () => {
    for (const values of cases) {
      expect(draftFiltersFromQuery(draftUrlQuery(values))).toEqual(values)
    }
  })

  it('leaves every default out of the URL', () => {
    expect(draftUrlQuery(empty)).toEqual({})
    // „Setzt EU-Recht um" off is the default: no `eu` in the link.
    expect(draftUrlQuery({ ...empty, eu: 'umsetzung' })).toEqual({ eu: 'umsetzung' })
    // „Ohne Begutachtung" likewise: off is absent, on is `begutachtung=ohne`.
    expect(draftUrlQuery({ ...empty, begutachtung: 'ohne' })).toEqual({ begutachtung: 'ohne' })
    expect(draftUrlQuery({ ...empty, sort: 'frist', status: 'all' })).toEqual({})
    // Turned round is the one direction that is not the default.
    expect(draftUrlQuery({ ...empty, reversed: true })).toEqual({ reverse: '1' })
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
    expect(sameDraftFilters({ ...open, eu: 'umsetzung' }, open)).toBe(false)
    expect(sameDraftFilters({ ...open, begutachtung: 'ohne' }, open)).toBe(false)
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
      eu: undefined,
    })
  })

  it('joins the stations and passes the rest through', () => {
    expect(
      draftApiQuery({ status: 'open', stations: ['rv', 'bgbl'], gp: 'XXVIII', ministry: 'BMF', eu: 'umsetzung' }),
    ).toEqual({ status: 'open', station: 'rv,bgbl', gp: 'XXVIII', ministry: 'BMF', eu: 'umsetzung' })
  })

  /* The page searches the halves itself since 12.11.2026 (`searchBundHalves`):
   * a term is no request, so the halves are not re-fetched per term. */
  it('never carries the search term', () => {
    const searching: DraftFilterValues = { ...empty, q: 'klima' }
    expect(draftApiQuery(searching)).not.toHaveProperty('q')
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
 * The count line — by kind, summed over the sources, never one pooled total.
 * A headline „336 Entwürfe" would put the
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

  /* 12.11.2026: the list shows the rows that came while a half is on its
   * way. The count must say so rather than count the missing half as 0 —
   * and it must read differently from a failure. */
  it('says a half on its way in the failure register, never as a count', () => {
    expect(draftCountLabel({ ...both, ris: 'pending' })).toBe(
      '148 Gesetzesentwürfe · die Verordnungs- und einzelne Gesetzesentwürfe des Bundes werden noch geladen',
    )
    expect(draftCountLabel({ ...both, ris: 'pending', art: 'verordnung', me: null })).toBe(
      'Die Verordnungsentwürfe des Bundes werden noch geladen',
    )
    expect(draftCountLabel({ ...both, laender: { pending: ['sbg'] } })).toBe(
      '152 Gesetzesentwürfe · 206 Verordnungsentwürfe · die Entwürfe des Landes Salzburg werden noch geladen',
    )
    expect(draftCountLabel({ ...both, laender: { pending: ['w'] } })).toContain('die Entwürfe Wiens werden noch geladen')
    expect(draftCountLabel({ ...both, laender: { pending: ['sbg', 'w'] } })).toContain('die Entwürfe der Länder werden noch geladen')
  })

  it('tells „noch geladen" from „nicht abrufbar"', () => {
    const pending = draftCountLabel({ ...both, ris: 'pending' })
    const failed = draftCountLabel({ ...both, ris: 'failed' })
    expect(pending).not.toBe(failed)
    expect(pending).not.toContain('nicht abrufbar')
    expect(failed).not.toContain('geladen')
  })

  it('states no zero while a half is on its way', () => {
    /* The Bund's rows filtered to none, the Länder still loading: „0
     * Entwürfe" would be falsified a moment later. */
    expect(draftCountLabel({ ...both, me: 0, ris: {}, laender: { pending: ['sbg'] } })).toBe(
      'Die Entwürfe des Landes Salzburg werden noch geladen',
    )
    expect(draftCountLabel({ ...both, me: 0, ris: 'pending' })).not.toMatch(/^0 /)
    // Without anything pending, the zero stands as before.
    expect(draftCountLabel({ ...both, me: 0, ris: {}, laender: {} })).toBe('0 Entwürfe')
  })

  /* 14.11.2026: under „Ohne Entwurf" the line said „0 Entwürfe" while the
   * Bund's laws were still on their way — an empty list counted as „asked,
   * none found". */
  it('says the laws on their way as such, never as a zero or a partial total', () => {
    const ohne = { me: null, vorlagen: [], ris: null, laterStationsOnly: false } as const
    expect(draftCountLabel({ ...ohne, laws: 'pending' })).toBe('Die Gesetze des Bundes ohne Entwurf werden noch geladen')
    // The Vorlagen already there are counted, the laws named as coming.
    expect(draftCountLabel({ ...ohne, vorlagen: [{ consultation: { kind: 'none' } }], laws: 'pending' })).toBe(
      '1 Regierungsvorlage ohne Begutachtung · die Gesetze des Bundes ohne Entwurf werden noch geladen',
    )
    expect(draftCountLabel({ ...ohne, laws: 'pending', art: 'antrag' })).not.toMatch(/^0 /)
    expect(draftCountLabel({ ...ohne, laws: [], landLaws: { pending: ['sbg'] } })).toBe(
      'Die Gesetze des Landes Salzburg werden noch geladen',
    )
    expect(draftCountLabel({ ...ohne, laws: 'pending', landLaws: { pending: ['sbg'] } })).toBe(
      'Die Gesetze des Bundes ohne Entwurf werden noch geladen · die Gesetze des Landes Salzburg werden noch geladen',
    )
    // Once they came and are none, the zero stands.
    expect(draftCountLabel({ ...ohne, laws: [] })).toBe('0 Entwürfe')
  })

  /* 14.11.2026: the open Vorlagen come lazily too, and the line stood
   * without them for a moment — under „Ohne Entwurf" as a total. */
  it('says the open Vorlagen on their way or failed, never as a zero or a partial total', () => {
    const ohne = { me: null, ris: null, laterStationsOnly: false } as const
    expect(draftCountLabel({ ...ohne, vorlagen: 'pending', laws: [] })).toBe('Die Regierungsvorlagen ohne Entwurf werden noch geladen')
    expect(draftCountLabel({ ...ohne, vorlagen: 'pending', laws: [{ consultation: 'none' }] })).toBe(
      '1 Gesetz ohne Begutachtung · die Regierungsvorlagen ohne Entwurf werden noch geladen',
    )
    expect(draftCountLabel({ ...ohne, vorlagen: 'pending', laws: 'pending' })).toBe(
      'Die Regierungsvorlagen ohne Entwurf werden noch geladen · die Gesetze des Bundes ohne Entwurf werden noch geladen',
    )
    // Failed: said in the count line's place for a source that could not be read.
    expect(draftCountLabel({ ...ohne, vorlagen: 'failed', laws: [{ consultation: 'none' }] })).toBe(
      '1 Gesetz ohne Begutachtung · die Regierungsvorlagen ohne Entwurf sind gerade nicht abrufbar',
    )
    expect(draftCountLabel({ ...both, vorlagen: 'pending' })).toBe(
      '152 Gesetzesentwürfe · 206 Verordnungsentwürfe · die Regierungsvorlagen ohne Entwurf werden noch geladen',
    )
    expect(draftCountLabel({ ...both, me: 0, ris: {}, vorlagen: 'pending' })).not.toMatch(/^0 /)
    expect(draftCountLabel({ ...both, vorlagen: 'failed' })).toBe(
      '152 Gesetzesentwürfe · 206 Verordnungsentwürfe · die Regierungsvorlagen ohne Entwurf sind gerade nicht abrufbar',
    )
  })

  it('names the laws on their way in the default list beside the drafts already counted', () => {
    expect(draftCountLabel({ ...both, laws: 'pending' })).toBe(
      '152 Gesetzesentwürfe · 206 Verordnungsentwürfe · die Gesetze des Bundes ohne Entwurf werden noch geladen',
    )
    expect(draftCountLabel({ ...both, laender: { gesetz: 3 }, landLaws: { pending: ['w'] } })).toBe(
      '155 Gesetzesentwürfe · 206 Verordnungsentwürfe · die Gesetze Wiens werden noch geladen',
    )
    // A Land whose drafts and laws are both coming is named once.
    expect(draftCountLabel({ ...both, laender: { pending: ['sbg'] }, landLaws: { pending: ['sbg'] } })).toBe(
      '152 Gesetzesentwürfe · 206 Verordnungsentwürfe · die Entwürfe und Gesetze des Landes Salzburg werden noch geladen',
    )
    expect(draftCountLabel({ ...both, laender: { pending: ['sbg', 'w'] }, landLaws: { pending: ['sbg'] } })).toBe(
      '152 Gesetzesentwürfe · 206 Verordnungsentwürfe · die Entwürfe der Länder werden noch geladen · die Gesetze des Landes Salzburg werden noch geladen',
    )
  })

  it('counts the Regierungsvorlagen as a term of their own', () => {
    const none = { consultation: { kind: 'none' as const } }
    expect(draftCountLabel({ ...both, vorlagen: [none, none] })).toBe(
      '152 Gesetzesentwürfe · 206 Verordnungsentwürfe · 2 Regierungsvorlagen ohne Begutachtung',
    )
  })

  it('counts the laws without a Begutachtung as a term of their own, never added up', () => {
    const none = { consultation: { kind: 'none' as const } }
    const laws = (n: number, consultation: 'none' | 'committee' = 'none') => Array.from({ length: n }, () => ({ consultation }))
    expect(draftCountLabel({ me: null, vorlagen: [none], ris: null, laterStationsOnly: false, laws: laws(80) })).toBe(
      '1 Regierungsvorlage ohne Begutachtung · 80 Gesetze ohne Begutachtung',
    )
    expect(draftCountLabel({ me: null, vorlagen: [], ris: null, laterStationsOnly: false, laws: laws(1) })).toBe('1 Gesetz ohne Begutachtung')
    // None in view: one zero, not a missing line.
    expect(draftCountLabel({ me: null, vorlagen: [], ris: null, laterStationsOnly: false, laws: [] })).toBe('0 Entwürfe')
    // Absent while the chip is off: the line is what it was.
    expect(draftCountLabel(both)).toBe('152 Gesetzesentwürfe · 206 Verordnungsentwürfe')
  })

  it('counts an Ausschussbegutachtung in a term of its own, never added to „ohne Begutachtung" (10.11.2026)', () => {
    const laws = [...Array.from({ length: 59 }, () => ({ consultation: 'none' as const })), ...Array.from({ length: 8 }, () => ({ consultation: 'committee' as const }))]
    expect(draftCountLabel({ me: null, vorlagen: [], ris: null, laterStationsOnly: false, laws })).toBe(
      '59 Gesetze ohne Begutachtung · 8 Gesetze mit Ausschussbegutachtung',
    )
    expect(draftCountLabel({ me: null, vorlagen: [], ris: null, laterStationsOnly: false, laws: [{ consultation: 'committee' }] })).toBe(
      '1 Gesetz mit Ausschussbegutachtung',
    )
    expect(
      draftCountLabel({ me: null, vorlagen: [{ consultation: { kind: 'none' } }, { consultation: { kind: 'committee' } }], ris: null, laterStationsOnly: false, laws: [] }),
    ).toBe('1 Regierungsvorlage ohne Begutachtung · 1 Regierungsvorlage mit Ausschussbegutachtung')
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

describe('begutachtungGapReason', () => {
  it('names why a period carries no rows, and nothing where it does', () => {
    expect(begutachtungGapReason('unlinked')).toMatch(/nicht erfasst/)
    expect(begutachtungGapReason('unread')).toBe('Gerade nicht abrufbar')
    // Still being read after a start: its own, calm reason — the page asks again.
    expect(begutachtungGapReason('pending')).toMatch(/gerade eingelesen/)
    expect(begutachtungGapReason(null)).toBeNull()
    expect(begutachtungGapReason(undefined)).toBeNull()
  })
})

describe('the select „Art" (14.11.2026)', () => {
  const choiceOf = (query: Record<string, string>) => {
    const f = draftFiltersFromQuery(query)
    return artChoiceOf(f.art, f.begutachtung)
  }
  it('groups its options in the path graphic\'s words', () => {
    const groups = artSelectFor({ chosen: '', others: true, landSelected: true, unavailable: {} })
    expect(groups.map((g) => [g.label, g.options.map((o) => o.label)])).toEqual([
      [null, ['Alle Arten']],
      ['Mit Entwurf', ['Alle mit Entwurf', 'Gesetzesentwürfe', 'Gesetzesentwürfe, als Initiativantrag eingebracht', 'Verordnungsentwürfe', 'Andere Entwürfe']],
      ['Ohne Entwurf', ['Alle ohne Entwurf', 'Regierungsvorlagen ohne Entwurf', 'Initiativanträge ohne Entwurf', 'Ausschussanträge ohne Entwurf', 'Landesgesetze ohne zugeordneten Entwurf']],
      ['Im Nationalrat', ['Alle Initiativanträge', 'Staatsverträge']],
    ])
  })
  it('offers „Andere Entwürfe" only where the view holds one and the Landesgesetze only with a Land — unless chosen', () => {
    const labels = (o: Parameters<typeof artSelectFor>[0]) => artSelectFor(o).flatMap((g) => g.options.map((x) => x.value))
    const none = labels({ chosen: '', others: false, landSelected: false, unavailable: {} })
    expect(none).not.toContain('andere')
    expect(none).not.toContain('ohne-landesgesetz')
    expect(labels({ chosen: 'andere', others: false, landSelected: false, unavailable: {} })).toContain('andere')
    expect(labels({ chosen: 'ohne-landesgesetz', others: false, landSelected: false, unavailable: {} })).toContain('ohne-landesgesetz')
  })
  it('disables an option with a reason, and says the reason as one note', () => {
    const groups = artSelectFor({ chosen: 'ohne', others: false, landSelected: false, unavailable: { ohne: 'Nur für Gesetze des Bundes und Salzburgs feststellbar', 'ohne-vorlage': 'x' } })
    const all = groups.flatMap((g) => g.options)
    expect(all.find((o) => o.value === 'ohne')!.disabled).toBe(true)
    expect(all.find((o) => o.value === 'gesetz')!.disabled).toBe(false)
    expect(artUnavailableNote('ohne', 'Nur für Gesetze des Bundes und Salzburgs feststellbar'))
      .toBe('„Alle ohne Entwurf“: nur für Gesetze des Bundes und Salzburgs feststellbar; die Liste zeigt deshalb alle Arten.')
  })
  it('lands every old link on the option that means what it meant', () => {
    expect(choiceOf({})).toBe('')
    expect(choiceOf({ begutachtung: 'ohne' })).toBe('ohne')
    expect(choiceOf({ begutachtung: 'ohne', art: 'vorlage' })).toBe('ohne-vorlage')
    expect(choiceOf({ begutachtung: 'ohne', art: 'antrag' })).toBe('ohne-antrag')
    expect(choiceOf({ art: 'gesetz' })).toBe('gesetz')
    expect(choiceOf({ art: 'ministerialentwurf' })).toBe('gesetz')
    expect(choiceOf({ art: 'verordnung' })).toBe('verordnung')
  })
  it('encodes the two new options in the same parameters, and drops a mismatched pair', () => {
    expect(choiceOf({ art: 'andere' })).toBe('andere')
    expect(choiceOf({ begutachtung: 'ohne', art: 'landesgesetz' })).toBe('ohne-landesgesetz')
    expect(choiceOf({ art: 'landesgesetz' })).toBe('')
    expect(choiceOf({ begutachtung: 'ohne', art: 'andere' })).toBe('ohne')
    expect(choiceOf({ art: 'quatsch' })).toBe('')
    expect(choiceOf({ begutachtung: 'ohne', art: 'gesetz' })).toBe('ohne')
    expect(choiceOf({ art: 'vorlage' })).toBe('')
    expect(coherentArt('vorlage', 'ohne')).toBe('vorlage')
    expect(coherentArt('verordnung', '')).toBe('verordnung')
  })
  it('round-trips every option through the URL', () => {
    for (const { value } of ART_CHOICES) {
      const f = { ...draftFiltersFromQuery({}), ...artChoiceParams(value) }
      const back = draftFiltersFromQuery(draftUrlQuery(f))
      expect(artChoiceOf(back.art, back.begutachtung), value).toBe(value)
    }
    expect(draftUrlQuery({ ...draftFiltersFromQuery({}), ...artChoiceParams('ohne-landesgesetz') })).toEqual({ art: 'landesgesetz', begutachtung: 'ohne' })
    expect(draftUrlQuery({ ...draftFiltersFromQuery({}), ...artChoiceParams('andere') })).toEqual({ art: 'andere' })
  })
  it('asks the draft halves for the instrument kind', () => {
    expect(draftKindArt('vorlage')).toBe('')
    expect(draftKindArt('landesgesetz')).toBe('')
    expect(draftKindArt('gesetz')).toBe('gesetz')
    expect(draftKindArt('andere')).toBe('unbestimmt')
  })
  it('admits drafts only under „Alle Arten" and their own kind — „Gesetzesentwürfe" holds no law and no Vorlage', () => {
    expect(choiceAdmitsDraft('', 'unbestimmt')).toBe(true)
    expect(choiceAdmitsDraft('gesetz', 'gesetz')).toBe(true)
    expect(choiceAdmitsDraft('gesetz', 'verordnung')).toBe(false)
    expect(choiceAdmitsDraft('andere', 'unbestimmt')).toBe(true)
    expect(choiceAdmitsDraft('andere', 'gesetz')).toBe(false)
    expect(choiceAdmitsDraft('ohne', 'gesetz')).toBe(false)
    expect(choiceAdmitsBundLaw('gesetz', 'rv')).toBe(false)
    expect(choiceAdmitsOpenVorlage('gesetz', 'none')).toBe(false)
    expect(choiceAdmitsLandLaw('gesetz', { begutachtung: { kind: 'none' }, registerCovers: true, route: null })).toBe(false)
  })
  it('admits the open Vorlagen and the Bund\'s laws by the item they came as', () => {
    expect(choiceAdmitsOpenVorlage('', 'unknown')).toBe(true)
    expect(choiceAdmitsOpenVorlage('', 'draft')).toBe(false)
    expect(choiceAdmitsOpenVorlage('ohne', 'unknown')).toBe(false)
    expect(choiceAdmitsOpenVorlage('ohne', 'committee')).toBe(true)
    expect(choiceAdmitsOpenVorlage('ohne-vorlage', 'none')).toBe(true)
    expect(choiceAdmitsOpenVorlage('ohne-antrag', 'none')).toBe(false)
    expect(choiceAdmitsOpenVorlage('ohne-landesgesetz', 'none')).toBe(false)
    expect(choiceAdmitsBundLaw('', 'antrag')).toBe(true)
    expect(choiceAdmitsBundLaw('ohne', 'antrag')).toBe(true)
    expect(choiceAdmitsBundLaw('ohne-vorlage', 'rv')).toBe(true)
    expect(choiceAdmitsBundLaw('ohne-vorlage', 'antrag')).toBe(false)
    expect(choiceAdmitsBundLaw('ohne-antrag', 'antrag')).toBe(true)
    expect(choiceAdmitsBundLaw('ohne-landesgesetz', 'rv')).toBe(false)
  })
  it('holds the laws from a committee\'s motion under „Ausschussanträge ohne Entwurf" and „Alle ohne Entwurf" (14.11.2026)', () => {
    // The address: `?begutachtung=ohne&art=ausschussantrag`, the /wege row's link.
    expect(choiceOf({ begutachtung: 'ohne', art: 'ausschussantrag' })).toBe('ohne-ausschussantrag')
    expect(artChoiceParams('ohne-ausschussantrag')).toEqual({ art: 'ausschussantrag', begutachtung: 'ohne' })
    // A draft option's leftover value never reads as it.
    expect(choiceOf({ art: 'ausschussantrag' })).toBe('')
    expect(artChoiceLabel('ohne-ausschussantrag')).toBe('Ausschussanträge ohne Entwurf')
    expect(choiceAdmitsBundLaw('ohne-ausschussantrag', 'ausschussantrag')).toBe(true)
    expect(choiceAdmitsBundLaw('ohne-ausschussantrag', 'rv')).toBe(false)
    expect(choiceAdmitsBundLaw('ohne-ausschussantrag', 'antrag')).toBe(false)
    expect(choiceAdmitsBundLaw('ohne', 'ausschussantrag')).toBe(true)
    expect(choiceAdmitsBundLaw('', 'ausschussantrag')).toBe(true)
    expect(choiceAdmitsBundLaw('ohne-vorlage', 'ausschussantrag')).toBe(false)
    expect(choiceAdmitsBundLaw('ohne-antrag', 'ausschussantrag')).toBe(false)
    // An open committee's motion: under its own option only with a note; never as a Regierungsvorlage.
    expect(choiceAdmitsOpenVorlage('ohne-ausschussantrag', 'committee', 'ausschussantrag')).toBe(true)
    expect(choiceAdmitsOpenVorlage('ohne-ausschussantrag', 'unknown', 'ausschussantrag')).toBe(false)
    expect(choiceAdmitsOpenVorlage('ohne-ausschussantrag', 'none', 'regierungsvorlage')).toBe(false)
    expect(choiceAdmitsOpenVorlage('ohne-vorlage', 'committee', 'ausschussantrag')).toBe(false)
    expect(choiceAdmitsOpenVorlage('', 'unknown', 'ausschussantrag')).toBe(true)
    // No Land's law, and the option shows the Bund's laws.
    expect(choiceAdmitsLandLaw('ohne-ausschussantrag', { begutachtung: { kind: 'none' }, registerCovers: true, route: null })).toBe(false)
    expect(withoutDraftRowsOf('ohne-ausschussantrag')).toMatchObject({ bundLaws: true })
  })
  it('counts an open committee\'s motion as what it is, never as a Regierungsvorlage', () => {
    const line = draftCountLabel({
      me: null,
      vorlagen: [{ kind: 'ausschussantrag', consultation: { kind: 'unknown' } }, { kind: 'regierungsvorlage', consultation: { kind: 'none' } }],
      ris: null,
      laterStationsOnly: false,
    })
    expect(line).toBe('1 Regierungsvorlage ohne Begutachtung · 1 Ausschussantrag')
  })
  it('admits the Länder\'s laws exactly as each label says', () => {
    const none = { begutachtung: { kind: 'none' as const }, registerCovers: true, route: { kind: 'vorlage' as const } }
    const noneNoRoute = { ...none, route: null }
    const covered = { begutachtung: { kind: 'silent' as const, reason: 'unsupported' as const }, registerCovers: true, route: { kind: 'antrag' as const } }
    const consulted = { begutachtung: { kind: 'consulted' as const, by: 'heading' as const }, registerCovers: true, route: { kind: 'vorlage' as const } }
    const beyondReach = { begutachtung: { kind: 'silent' as const, reason: 'register-reach' as const }, registerCovers: false, route: null }
    // „Alle ohne Entwurf": Salzburg's evidenced „ohne Begutachtung" only.
    expect([none, noneNoRoute, covered, consulted, beyondReach].map((l) => choiceAdmitsLandLaw('ohne', l))).toEqual([true, true, false, false, false])
    expect(choiceAdmitsLandLaw('ohne-vorlage', none)).toBe(true)
    expect(choiceAdmitsLandLaw('ohne-vorlage', noneNoRoute)).toBe(false)
    expect(choiceAdmitsLandLaw('ohne-antrag', covered)).toBe(false)
    // „Landesgesetze ohne zugeordneten Entwurf": what the count line calls so — never the plain „Landesgesetz".
    expect([none, noneNoRoute, covered, consulted, beyondReach].map((l) => choiceAdmitsLandLaw('ohne-landesgesetz', l))).toEqual([true, true, true, true, false])
    expect(choiceAdmitsLandLaw('', beyondReach)).toBe(true)
  })
  describe('„Alle mit Entwurf"', () => {
    it('reads `begutachtung=mit` as the option, leniently', () => {
      expect(choiceOf({ begutachtung: 'mit' })).toBe('mit')
      expect(draftFiltersFromQuery({ begutachtung: ['mit', 'ohne'] }).begutachtung).toBe('mit')
      expect(draftFiltersFromQuery({ begutachtung: 'MIT' }).begutachtung).toBe('')
      expect(artChoiceParams('mit')).toEqual({ art: '', begutachtung: 'mit' })
      expect(draftUrlQuery({ ...draftFiltersFromQuery({}), ...artChoiceParams('mit') })).toEqual({ begutachtung: 'mit' })
    })
    it('drops the redundant parameter beside a draft kind: the kind is canonical', () => {
      for (const art of ['gesetz', 'verordnung', 'andere'] as const) {
        const f = draftFiltersFromQuery({ begutachtung: 'mit', art })
        expect(f).toMatchObject({ art, begutachtung: '' })
        expect(artChoiceOf(f.art, f.begutachtung)).toBe(art)
        expect(draftUrlQuery(f)).toEqual({ art })
        // A state written apart is written canonically too.
        expect(draftUrlQuery({ ...draftFiltersFromQuery({}), art, begutachtung: 'mit' })).toEqual({ art })
      }
      expect(choiceOf({ begutachtung: 'mit', art: 'ministerialentwurf' })).toBe('gesetz')
      expect(coherentBegutachtung('gesetz', 'mit')).toBe('')
      expect(coherentBegutachtung('', 'mit')).toBe('mit')
      expect(coherentBegutachtung('vorlage', 'ohne')).toBe('ohne')
    })
    it('drops an Art of „Ohne Entwurf" beside it, as every mismatched pair', () => {
      for (const art of ['vorlage', 'antrag', 'landesgesetz'] as const) {
        const f = draftFiltersFromQuery({ begutachtung: 'mit', art })
        expect(f).toMatchObject({ art: '', begutachtung: 'mit' })
        expect(draftUrlQuery(f)).toEqual({ begutachtung: 'mit' })
      }
    })
    it('admits every draft and no row without one — exactly its group', () => {
      for (const kind of ['gesetz', 'verordnung', 'unbestimmt'] as const) {
        expect(choiceAdmitsDraft('mit', kind)).toBe(true)
        // …and exactly one of the group's three holds it too: the sum, nothing more, nothing less.
        expect((['gesetz', 'verordnung', 'andere'] as const).filter((c) => choiceAdmitsDraft(c, kind))).toHaveLength(1)
      }
      for (const v of ['none', 'committee', 'unknown', 'draft'] as const) expect(choiceAdmitsOpenVorlage('mit', v)).toBe(false)
      expect(choiceAdmitsBundLaw('mit', 'rv')).toBe(false)
      expect(choiceAdmitsBundLaw('mit', 'antrag')).toBe(false)
      for (const law of [
        { begutachtung: { kind: 'none' as const }, registerCovers: true, route: { kind: 'vorlage' as const } },
        { begutachtung: { kind: 'silent' as const, reason: 'unsupported' as const }, registerCovers: true, route: null },
        { begutachtung: { kind: 'silent' as const, reason: 'register-reach' as const }, registerCovers: false, route: null },
      ]) expect(choiceAdmitsLandLaw('mit', law)).toBe(false)
    })
    it('shows no row without a draft, and is never unavailable or a Ressort-dropper', () => {
      expect(withoutDraftRowsOf('mit')).toEqual({ vorlagen: false, bundLaws: false, landLaws: false })
      expect(artUnavailableFor({ bund: false, landsApply: false, ohneLandsApply: false }, {}).mit).toBeUndefined()
      expect(coherentFilters({ art: '' as const, ministry: 'BMF' }, 'mit').ministry).toBe('BMF')
      const options = artSelectFor({ chosen: '', others: false, landSelected: false, unavailable: {} }).flatMap((g) => g.options)
      expect(options.find((o) => o.value === 'mit')).toEqual({ value: 'mit', label: 'Alle mit Entwurf', disabled: false })
    })
    it('names itself in the chip, and its count line names no law', () => {
      expect(activeFilterChips({ status: 'all', art: '', begutachtung: 'mit', gp: '', ministry: '' })).toEqual([{ key: 'art', label: 'Alle mit Entwurf' }])
      // Removing the chip writes „Alle Arten": no parameter left.
      expect(draftUrlQuery({ ...draftFiltersFromQuery({ begutachtung: 'mit' }), ...artChoiceParams('') })).toEqual({})
      // What the page passes under it: the laws and Vorlagen not in view (undefined / []), never `pending`.
      expect(draftCountLabel({ me: 3, vorlagen: [], ris: { verordnung: 2, unbestimmt: 1 }, laterStationsOnly: false, art: '', laender: { gesetz: 1 } }))
        .toBe('4 Gesetzesentwürfe · 2 Verordnungsentwürfe · 1 anderer Entwurf')
      expect(draftCountLabel({ me: 0, vorlagen: [], ris: {}, laterStationsOnly: false, art: artChoiceParams('mit').art })).toBe('0 Entwürfe')
    })
  })
  describe('availability, known before an option is chosen', () => {
    const DRAFT_OPTIONS = ['mit', 'gesetz', 'verordnung', 'andere'] as const
    const OHNE_BUND_SBG = ['ohne', 'ohne-vorlage', 'ohne-antrag'] as const
    const bundOnly = { bund: true, landsApply: false, ohneLandsApply: false }
    const sbgOnly = { bund: false, landsApply: true, ohneLandsApply: true }
    const bgldOnly = { bund: false, landsApply: true, ohneLandsApply: false }
    const bundBgld = { bund: true, landsApply: true, ohneLandsApply: false }
    const disabled = (u: ReturnType<typeof artUnavailableFor>) =>
      (Object.keys(u) as (keyof typeof u)[]).filter((k) => u[k]).sort()

    it('disables from the sources alone, without any answer', () => {
      // Neither the Bund nor Salzburg: the three Bund-and-Salzburg options, „Andere" and „als Initiativantrag".
      expect(disabled(artUnavailableBySources(bgldOnly))).toEqual(['als-antrag', 'andere', 'initiativantraege', 'ohne-ausschussantrag', 'staatsvertraege', ...OHNE_BUND_SBG].sort())
      expect(disabled(artUnavailableFor(bgldOnly, {}))).toEqual(['als-antrag', 'andere', 'initiativantraege', 'ohne-ausschussantrag', 'staatsvertraege', ...OHNE_BUND_SBG].sort())
      // No Land: „Landesgesetze ohne zugeordneten Entwurf".
      expect(disabled(artUnavailableFor(bundOnly, {}))).toEqual(['ohne-landesgesetz'])
      // No Bund: „Andere Entwürfe", „als Initiativantrag" and the Bund's
      // committee motions; Salzburg keeps „Ohne Entwurf" open.
      expect(disabled(artUnavailableFor(sbgOnly, {}))).toEqual(['als-antrag', 'andere', 'initiativantraege', 'ohne-ausschussantrag', 'staatsvertraege'])
      expect(artUnavailableFor(sbgOnly, {})['ohne-ausschussantrag']).toBe('nur für Gesetze des Bundes')
      // With the Bund, it follows the Bund's laws like the other options of the group.
      expect(artUnavailableFor(bundOnly, { bundLawsFailed: true })['ohne-ausschussantrag']).toBe(begutachtungGapReason('unread'))
      expect(disabled(artUnavailableFor(bundBgld, {}))).toEqual([])
      // Whatever an answer says, a source-only reason stays the reason.
      expect(artUnavailableFor(bgldOnly, { landLawsFailed: true }).ohne).toBe('Nur für Gesetze des Bundes und Salzburgs feststellbar')
      expect(artUnavailableFor(bundOnly, {})['ohne-landesgesetz']).toBe('nur für Gesetze der Länder')
    })
    it('keeps an option enabled while its answer is pending, and disables it once the answer says so', () => {
      // Pending: no answer yet — unknown is not unavailable.
      for (const s of [bundOnly, sbgOnly, bundBgld]) for (const c of OHNE_BUND_SBG) expect(artUnavailableFor(s, {})[c]).toBeNull()
      expect(artUnavailableFor(bundOnly, { bundLaws: null }).ohne).toBeNull()
      // An answer that can carry the claim: enabled.
      expect(artUnavailableFor(bundOnly, { bundLaws: { available: true, gap: null } }).ohne).toBeNull()
      // One that cannot, or a failed fetch: disabled, with the gap's reason.
      expect(artUnavailableFor(bundOnly, { bundLaws: { available: false, gap: 'unlinked' } }).ohne).toBe(begutachtungGapReason('unlinked'))
      for (const c of OHNE_BUND_SBG) expect(artUnavailableFor(bundOnly, { bundLawsFailed: true })[c]).toBe(begutachtungGapReason('unread'))
      // Where the Bund is a source, Salzburg's answer decides nothing.
      expect(artUnavailableFor({ bund: true, landsApply: true, ohneLandsApply: true }, { sbgLaws: { state: 'unavailable' } }).ohne).toBeNull()
      // Salzburg alone: its laws decide — unread, failed, or still being read.
      expect(artUnavailableFor(sbgOnly, { sbgLaws: { state: 'ok', statements: 'complete' } }).ohne).toBeNull()
      expect(artUnavailableFor(sbgOnly, { sbgLaws: { state: 'unavailable' } }).ohne).toBe(begutachtungGapReason('unread'))
      expect(artUnavailableFor(sbgOnly, { landLawsFailed: true }).ohne).toBe(begutachtungGapReason('unread'))
      expect(artUnavailableFor(sbgOnly, { sbgLaws: { state: 'ok', statements: 'pending' } }).ohne).toBe(begutachtungGapReason('pending'))
    })
    it('asks under every option for the answers availability needs — and the open Vorlagen only where they are rows', () => {
      for (const c of DRAFT_OPTIONS) {
        expect(withoutDraftRequests(c, bundBgld), c).toEqual({ vorlagen: false, bundLaws: true, landLaws: false })
        expect(withoutDraftRequests(c, sbgOnly), c).toEqual({ vorlagen: false, bundLaws: false, landLaws: true })
        expect(withoutDraftRequests(c, bgldOnly), c).toEqual({ vorlagen: false, bundLaws: false, landLaws: false })
      }
      expect(withoutDraftRequests('', bundBgld)).toEqual({ vorlagen: true, bundLaws: true, landLaws: true })
      // An option of „Ohne Entwurf" may step back to „Alle Arten": it asks what that shows.
      for (const c of [...OHNE_BUND_SBG, 'ohne-landesgesetz'] as const) {
        expect(withoutDraftRequests(c, bundBgld), c).toEqual({ vorlagen: true, bundLaws: true, landLaws: true })
      }
    })
    it('announces nothing under the four draft options, whatever the answers do', () => {
      // Every „werden noch geladen"/„nicht abrufbar" announcement is gated on these.
      for (const c of DRAFT_OPTIONS) expect(withoutDraftRowsOf(c), c).toEqual({ vorlagen: false, bundLaws: false, landLaws: false })
      // …and a pending or failed answer leaves the draft options available.
      for (const answers of [{}, { bundLawsFailed: true }, { bundLaws: { available: false, gap: 'pending' as const } }]) {
        for (const c of DRAFT_OPTIONS) expect(artUnavailableFor(bundBgld, answers)[c] ?? null, c).toBeNull()
      }
      for (const c of DRAFT_OPTIONS) expect(artUnavailableFor(sbgOnly, { landLawsFailed: true })[c] ?? null, c).toBe(c === 'andere' ? 'nur für Entwürfe des Bundes' : null)
    })
  })
  describe('„Gesetzesentwürfe, als Initiativantrag eingebracht"', () => {
    const viaAntrag = { active: false, chain: { antragCitation: '1065/A' } }
    const plain = { active: false, chain: {} }
    const noChain = { active: false }
    const running = { active: true, chain: { antragCitation: '1065/A' } }
    const bundOnly = { bund: true, landsApply: false, ohneLandsApply: false }

    it('reads and writes `art=als-antrag`, apart from `antrag` (Initiativanträge ohne Entwurf)', () => {
      expect(choiceOf({ art: 'als-antrag' })).toBe('als-antrag')
      expect(draftUrlQuery({ ...draftFiltersFromQuery({}), ...artChoiceParams('als-antrag') })).toEqual({ art: 'als-antrag' })
      // A draft option: `mit` beside it drops, `ohne` beside it reads as „Alle ohne Entwurf".
      expect(draftUrlQuery(draftFiltersFromQuery({ begutachtung: 'mit', art: 'als-antrag' }))).toEqual({ art: 'als-antrag' })
      expect(choiceOf({ begutachtung: 'ohne', art: 'als-antrag' })).toBe('ohne')
      // `antrag` stays „Initiativanträge ohne Entwurf", and alone it is no option.
      expect(choiceOf({ begutachtung: 'ohne', art: 'antrag' })).toBe('ohne-antrag')
      expect(choiceOf({ art: 'antrag' })).toBe('')
      // No instrument kind: the halves are asked as under „Alle Arten".
      expect(draftKindArt('als-antrag')).toBe('')
    })
    it('admits only a Ministerialentwurf whose row names the Antrag', () => {
      expect(choiceAdmitsMinisterialentwurf('als-antrag', viaAntrag)).toBe(true)
      expect(choiceAdmitsMinisterialentwurf('als-antrag', plain)).toBe(false)
      expect(choiceAdmitsMinisterialentwurf('als-antrag', noChain)).toBe(false)
      expect(choiceAdmitsMinisterialentwurf('als-antrag', running)).toBe(false)
      // A subset of „Gesetzesentwürfe" and „Alle mit Entwurf": each of its rows stands there too.
      for (const c of ['', 'mit', 'gesetz'] as const) expect(choiceAdmitsMinisterialentwurf(c, viaAntrag), c).toBe(true)
      for (const c of ['verordnung', 'andere', 'ohne', 'ohne-antrag'] as const) expect(choiceAdmitsMinisterialentwurf(c, viaAntrag), c).toBe(false)
      // Never a RIS record or a Land's draft, of any kind…
      for (const kind of ['gesetz', 'verordnung', 'unbestimmt'] as const) expect(choiceAdmitsDraft('als-antrag', kind), kind).toBe(false)
      // …never a row without a draft.
      for (const v of ['none', 'committee', 'unknown', 'draft'] as const) expect(choiceAdmitsOpenVorlage('als-antrag', v)).toBe(false)
      expect(choiceAdmitsBundLaw('als-antrag', 'rv')).toBe(false)
      expect(choiceAdmitsBundLaw('als-antrag', 'antrag')).toBe(false)
      expect(choiceAdmitsLandLaw('als-antrag', { begutachtung: { kind: 'none' }, registerCovers: true, route: { kind: 'antrag' } })).toBe(false)
      expect(withoutDraftRowsOf('als-antrag')).toEqual({ vorlagen: false, bundLaws: false, landLaws: false })
      expect(draftRowsOf('als-antrag')).toEqual({ me: true, ris: false, laender: false })
      expect(draftRowsOf('gesetz')).toEqual({ me: true, ris: true, laender: true })
      expect(draftRowsOf('verordnung')).toEqual({ me: false, ris: true, laender: true })
    })
    it('the table\'s carrying paths are rows of it — the inference the row states', () => {
      for (const [gp, byInr] of Object.entries(ANTRAG_PATHS)) {
        for (const inr of Object.keys(byInr).map(Number)) {
          const path = antragPathFor(gp, inr)
          const row = { active: false, chain: carriesDraft(path) ? { antragCitation: path.antrag.citation } : {} }
          expect(choiceAdmitsMinisterialentwurf('als-antrag', row), `${gp}/${inr}`).toBe(carriesDraft(path))
        }
      }
    })
    it('is unavailable without the Bund, outside the table\'s periods and without chains — with its reason', () => {
      expect(ANTRAG_ROUTE_UNAVAILABLE).toBe('nur für die XXVI. bis XXVIII. GP erfasst')
      expect(artUnavailableBySources({ bund: false, landsApply: true, ohneLandsApply: true })['als-antrag']).toBe('nur für Entwürfe des Bundes')
      for (const gp of ['XXVI', 'XXVII', 'XXVIII']) expect(artUnavailableFor(bundOnly, { gp })['als-antrag'], gp).toBeNull()
      for (const gp of ['XXV', 'XX', 'XXIX']) expect(artUnavailableFor(bundOnly, { gp })['als-antrag'], gp).toBe(ANTRAG_ROUTE_UNAVAILABLE)
      // The period not known yet: unknown is not unavailable.
      expect(artUnavailableFor(bundOnly, { gp: '' })['als-antrag']).toBeNull()
      expect(artUnavailableFor(bundOnly, {})['als-antrag']).toBeNull()
      // Rows without the chain that names the route cannot be cut by it.
      expect(artUnavailableFor(bundOnly, { gp: 'XXVII', chainsMissing: true })['als-antrag']).toBe(begutachtungGapReason('unread'))
      // The answers of „Ohne Entwurf" decide nothing about it.
      expect(artUnavailableFor(bundOnly, { gp: 'XXVIII', bundLawsFailed: true })['als-antrag']).toBeNull()
      expect(artUnavailableNote('als-antrag', ANTRAG_ROUTE_UNAVAILABLE))
        .toBe('„Gesetzesentwürfe, als Initiativantrag eingebracht“: nur für die XXVI. bis XXVIII. GP erfasst; die Liste zeigt deshalb alle Arten.')
    })
    it('asks no answer of its own: the draft options\' requests', () => {
      const bundBgld = { bund: true, landsApply: true, ohneLandsApply: false }
      expect(withoutDraftRequests('als-antrag', bundBgld)).toEqual(withoutDraftRequests('gesetz', bundBgld))
      expect(withoutDraftRequests('als-antrag', bundBgld)).toEqual({ vorlagen: false, bundLaws: true, landLaws: false })
    })
    it('names itself in the chip, which removes it', () => {
      expect(activeFilterChips({ status: 'all', art: 'als-antrag', gp: '', ministry: '' }))
        .toEqual([{ key: 'art', label: 'Gesetzesentwürfe, als Initiativantrag eingebracht' }])
      expect(draftUrlQuery({ ...draftFiltersFromQuery({ art: 'als-antrag' }), ...artChoiceParams('') })).toEqual({})
      // Its count line is the law drafts', the RIS half and the Länder not asked for.
      expect(draftCountLabel({ me: 24, vorlagen: [], ris: null, laterStationsOnly: false, art: 'als-antrag', laender: null })).toBe('24 Gesetzesentwürfe')
      expect(draftCountLabel({ me: 0, vorlagen: [], ris: null, laterStationsOnly: false, art: 'als-antrag', laender: null })).toBe('0 Gesetzesentwürfe')
    })
  })
  it('names the chosen option in the active-filter chips and in an empty count line', () => {
    expect(activeFilterChips({ status: 'all', art: 'vorlage', begutachtung: 'ohne', gp: '', ministry: '' })).toEqual([{ key: 'art', label: 'Regierungsvorlagen ohne Entwurf' }])
    expect(activeFilterChips({ status: 'all', art: '', begutachtung: 'ohne', gp: '', ministry: '' })).toEqual([{ key: 'art', label: 'Alle ohne Entwurf' }])
    expect(activeFilterChips({ status: 'all', art: 'andere', gp: '', ministry: '' })).toEqual([{ key: 'art', label: 'Andere Entwürfe' }])
    expect(draftCountLabel({ me: null, vorlagen: [], ris: null, laterStationsOnly: false, art: 'antrag', laws: [] })).toBe('0 Initiativanträge')
    expect(draftCountLabel({ me: null, vorlagen: [], ris: { unbestimmt: 0 }, laterStationsOnly: false, art: 'andere' })).toBe('0 andere Entwürfe')
  })
})

describe('the list\'s Land notes (14.11.2026)', () => {
  it('names the Länder that cannot answer „Alle ohne Entwurf"', () => {
    expect(ohneSilentNoteDe([])).toBeNull()
    expect(ohneSilentNoteDe(['noe'])).toBe('Ob ein Landesgesetz ohne Entwurf entstand, lässt sich für Niederösterreich nicht feststellen; seine Landesgesetze stehen hier nicht.')
    expect(ohneSilentNoteDe(['noe', 'w'])).toMatch(/für die Länder Niederösterreich und Wien nicht feststellen; ihre/)
  })
  it('counts the laws beyond the register\'s reach', () => {
    expect(registerReachNote({})).toBeNull()
    expect(registerReachNote({ w: 3 })).toBe('3 Landesgesetze Wiens stehen hier nicht: Das Register reicht nicht weit genug zurück, um einen Entwurf auszuschließen.')
    expect(registerReachNote({ noe: 1, ktn: 2 })).toMatch(/^3 Landesgesetze der Länder /)
  })
  it('says the incomplete Länder in one line, linked to their blocks — and nothing with only complete ones', () => {
    expect(landCoverageNote(['bgld', 'sbg', 'ooe'])).toBeNull()
    expect(landCoverageNote([])).toBeNull()
    const parts = landCoverageNote(['sbg', 't', 'ktn', 'noe'], 27)!
    expect(parts.map((p) => p.text).join('')).toBe('Nicht vollständig in der Liste: Tirol, Kärnten (27 Entwürfe ohne Datum stehen in keinem Zeitraum) und Niederösterreich.')
    expect(parts.filter((p) => p.href).map((p) => p.href)).toEqual(['/datenlage#tirol', '/datenlage#kaernten', '/datenlage#niederoesterreich'])
    expect(landCoverageNote(['ktn'])!.map((p) => p.text).join('')).toBe('Nicht vollständig in der Liste: Kärnten.')
  })
  it('judges each homepage list by what it shows (14.11.2026)', () => {
    // Running Begutachtungen: only the Verordnungsentwürfe can be missing —
    // the Steiermark's are not read, Vorarlberg does not list any. A Land
    // that drops a draft at its Frist (Niederösterreich, Wien) is whole here.
    expect(landsIncompleteFor([...LAND_CODES], 'laufend')).toEqual(['stmk', 'vbg'])
    // Decided in the Landtag: the draft held after its Frist and the way read.
    expect(landsIncompleteFor(['ooe', 't'], 'beschlossen')).toEqual(['t'])
    // Kundgemacht: Verordnungen read, the draft held, the Kundmachung found.
    expect(landsIncompleteFor(['bgld', 'ktn', 'ooe', 'sbg', 'stmk', 't', 'w'], 'kundgemacht')).toEqual(['ktn', 'ooe', 'stmk', 't', 'w'])
    const text = (parts: ReturnType<typeof landCoverageNote>) => parts!.map((p) => p.text).join('')
    expect(text(landCoverageNote(['t', 'noe', 'stmk'], undefined, 'laufend'))).toBe('Nicht vollständig in dieser Liste: Steiermark.')
    expect(landCoverageNote(['noe', 'w'], undefined, 'laufend')).toBeNull()
    // The undated count belongs to the period-cut list of /entwuerfe only.
    expect(text(landCoverageNote(['ktn'], 27, 'kundgemacht'))).toBe('Nicht vollständig in dieser Liste: Kärnten.')
  })
})

describe('the Ressort under „Ohne Ministerialentwurf" (10.11.2026)', () => {
  const f = { art: '' as const, ministry: 'BMF' }
  it('is dropped while the chip applies — its rows carry no Ressort', () => {
    expect(coherentFilters(f, 'ohne', true).ministry).toBe('')
    // A link carrying both reads the same way once the chip applies.
    expect(coherentFilters({ ...draftFiltersFromQuery({ begutachtung: 'ohne', ministry: 'BMF' }) }, 'ohne', true).ministry).toBe('')
  })
  it('stays where the chip does not apply: off, or unavailable for the period or the sources', () => {
    expect(coherentFilters(f, '', false).ministry).toBe('BMF')
    expect(coherentFilters(f, 'ohne', false).ministry).toBe('BMF')
  })
  it('is one rule with the Art: both in one pass, nothing restored when the chip goes off', () => {
    expect(coherentFilters({ art: 'gesetz' as const, ministry: 'BMF' }, 'ohne', true)).toEqual({ art: '', ministry: '' })
    expect(coherentFilters({ art: 'vorlage' as const, ministry: '' }, '', false)).toEqual({ art: '', ministry: '' })
  })
  it('leaves no Ressort among the active-filter chips once dropped', () => {
    const dropped = coherentFilters({ status: 'all' as const, art: '' as const, gp: '', ministry: 'BMF' }, 'ohne', true)
    expect(activeFilterChips(dropped)).toEqual([])
  })
})

/**
 * Where a half of `/entwuerfe` stands (12.11.2026). The case that matters:
 * the server's render passed its deadline, the payload carries `null`, and
 * the browser must start in „loading" — not in „failed", not in „ready with
 * nothing".
 */
describe('halfState', () => {
  it('is off where the half is not asked for, whatever it holds', () => {
    expect(halfState(false, { items: [] }, null)).toBe('off')
    expect(halfState(false, null, new Error('x'))).toBe('off')
  })

  it('reads a missed server deadline (null) and a first answer still out (undefined) as loading', () => {
    expect(halfState(true, null, undefined)).toBe('loading')
    expect(halfState(true, undefined, undefined)).toBe('loading')
  })

  it('says failed over any answer it may still hold', () => {
    expect(halfState(true, { items: [] }, new Error('timeout'))).toBe('failed')
  })

  it('is ready with an answer, an empty one included', () => {
    expect(halfState(true, { items: [] }, null)).toBe('ready')
  })
})

describe('lateHalves', () => {
  it('lists the halves on their way beside the lead, never the lead', () => {
    expect(lateHalves('me', { me: 'ready', ris: 'loading', laender: 'loading' })).toEqual(['ris', 'laender'])
    expect(lateHalves('me', { me: 'loading', ris: 'ready', laender: 'off' })).toEqual([])
    expect(lateHalves('ris', { me: 'off', ris: 'ready', laender: 'loading' })).toEqual(['laender'])
  })

  it('does not count a failed half as late', () => {
    expect(lateHalves('me', { me: 'ready', ris: 'failed', laender: 'loading' })).toEqual(['laender'])
  })
})

/* ------------------------------------------------------------------ *
 * The time span by the sources (14.11.2026) — on a fixture calendar, never
 * on dates entered in `LAND_PERIODS`.
 * ------------------------------------------------------------------ */
const FIXTURE: LandPeriodCalendars = {
  sbg: [
    { id: 16, label: '16. Gesetzgebungsperiode', start: '2018-06-13' },
    { id: 17, label: '17. Gesetzgebungsperiode', start: '2023-06-14' },
  ],
  w: [{ id: 21, label: '21. Wahlperiode', start: '2020-11-24' }],
}

describe('?landtag= (14.11.2026)', () => {
  it('reads a period the calendar holds, in either case, as its canonical value', () => {
    expect(draftFiltersFromQuery({ landtag: 'sbg-17' }, FIXTURE).landtag).toBe('sbg-17')
    expect(draftFiltersFromQuery({ landtag: 'SBG-16' }, FIXTURE).landtag).toBe('sbg-16')
    expect(draftFiltersFromQuery({ landtag: ' Sbg-17 ' }, FIXTURE).landtag).toBe('sbg-17')
  })

  it('drops anything else, never an error', () => {
    for (const v of ['sbg-18', 'sbg-0', 'sbg-017', 'xyz-17', 'sbg', '17', 'sbg_17', 'w-17']) {
      expect(draftFiltersFromQuery({ landtag: v }, FIXTURE).landtag).toBe('')
    }
    // Against the shipped calendar too: a period it does not hold drops.
    expect(draftFiltersFromQuery({ landtag: 'sbg-99' }).landtag).toBe('')
  })

  it('round-trips through the URL beside the other filters', () => {
    const f = { ...empty, landtag: 'sbg-17', art: 'gesetz' as const }
    expect(draftUrlQuery(f)).toEqual({ landtag: 'sbg-17', art: 'gesetz' })
    expect(draftFiltersFromQuery(draftUrlQuery(f), FIXTURE)).toEqual(f)
  })

  it('never goes to the Bund endpoints', () => {
    expect(draftApiQuery({ ...empty })).not.toHaveProperty('landtag')
  })
})

describe('spanOptionsFor', () => {
  const gps = ['XXVIII', 'XXVII', 'XXVI', 'XIV']

  it('names the Bund\'s periods by dates and GP while the Bund is a source', () => {
    const opts = spanOptionsFor(periodViewFor(true, ['sbg'], FIXTURE), gps, 'XXVIII', FIXTURE)
    expect(opts.map((o) => o.value)).toEqual(gps)
    expect(opts[0]!.label).toBe('seit 24.10.2024 (GP XXVIII)')
    expect(opts[3]!.label).toBe('GP XIV')
  })

  it('names the Bund\'s spans by their dates alone for several Länder — and only those with a window', () => {
    const opts = spanOptionsFor(periodViewFor(false, ['sbg', 'w'], FIXTURE), gps, 'XXVIII', FIXTURE)
    expect(opts).toEqual([
      { value: 'XXVIII', label: 'seit 24.10.2024' },
      { value: 'XXVII', label: '23.10.2019 – 23.10.2024' },
      { value: 'XXVI', label: '09.11.2017 – 22.10.2019' },
    ])
  })

  it('falls back to the dates for one Land whose calendar is empty', () => {
    const view = periodViewFor(false, ['ktn'], FIXTURE)
    expect(view.mode).toBe('dates')
    expect(spanOptionsFor(view, gps, 'XXVIII', FIXTURE)[0]).toEqual({ value: 'XXVIII', label: 'seit 24.10.2024' })
  })

  it('offers one Land\'s own periods, then the Bund\'s spans its calendar does not reach back to', () => {
    const opts = spanOptionsFor(periodViewFor(false, ['sbg'], FIXTURE), gps, '', FIXTURE)
    expect(opts).toEqual([
      { value: 'sbg-17', label: 'seit 14.06.2023 (17. Gesetzgebungsperiode)' },
      { value: 'sbg-16', label: '13.06.2018 – 13.06.2023 (16. Gesetzgebungsperiode)' },
      // XXVI began 09.11.2017, before Salzburg's calendar starts; XXVII and XXVIII do not.
      { value: 'XXVI', label: '09.11.2017 – 22.10.2019' },
    ])
  })

  it('stands as „Zeitraum …" before any menu came', () => {
    expect(spanOptionsFor({ mode: 'bund' }, [], '', FIXTURE)).toEqual([{ value: '', label: 'Zeitraum …' }])
    expect(spanOptionsFor({ mode: 'dates' }, [], '', FIXTURE)).toEqual([{ value: '', label: 'Zeitraum …' }])
  })
})

describe('the span chip (14.11.2026)', () => {
  const base = { status: 'all' as const, art: '' as const, ministry: '' }

  it('keeps „GP XXVIII" for a Bund period', () => {
    expect(activeFilterChips({ ...base, gp: 'XXVIII' }, { mode: 'bund' }, FIXTURE)).toEqual([{ key: 'gp', label: 'GP XXVIII' }])
  })

  it('shows the compact dates where no period name applies', () => {
    expect(activeFilterChips({ ...base, gp: 'XXVII' }, { mode: 'dates' }, FIXTURE)).toEqual([{ key: 'gp', label: '23.10.2019–23.10.2024' }])
    expect(activeFilterChips({ ...base, gp: 'XXVIII' }, { mode: 'dates' }, FIXTURE)).toEqual([{ key: 'gp', label: 'seit 24.10.2024' }])
  })

  it('shows a Land period by its short designation and the Land', () => {
    expect(activeFilterChips({ ...base, gp: '', landtag: 'sbg-17' }, periodViewFor(false, ['sbg'], FIXTURE), FIXTURE)).toEqual([
      { key: 'landtag', label: '17. GP Salzburg' },
    ])
    expect(activeFilterChips({ ...base, gp: '', landtag: 'w-21' }, periodViewFor(false, ['w'], FIXTURE), FIXTURE)).toEqual([
      { key: 'landtag', label: '21. Wahlperiode Wien' },
    ])
  })
})
