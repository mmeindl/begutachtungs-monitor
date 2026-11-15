import { describe, expect, it } from 'vitest'
import { intToRoman } from '../shared/utils/gp'
import {
  LAND_PERIODS,
  type LandPeriodCalendars,
  coherentSpan,
  gpOfferedIn,
  gpsOverlapping,
  laenderSpanQuery,
  landPeriodChipDe,
  landPeriodSpanLabelDe,
  landPeriodWindow,
  landPeriodsOf,
  landtagOfferedIn,
  landtagParts,
  parseLandtag,
  periodViewFor,
  runningLandPeriod,
  windowDatesDe,
} from '../shared/utils/periodCalendar'

/**
 * The one calendar for the list's time span (`shared/utils/periodCalendar.ts`,
 * 14.11.2026). Every rule runs on a FIXTURE calendar: the dates below are
 * invented for the test and say nothing about any Landtag. The shipped
 * calendar (verified dates, entered by hand) is held to its invariants only.
 */
const FIXTURE: LandPeriodCalendars = {
  // Out of order on purpose: the functions sort by start.
  sbg: [
    { id: 17, label: '17. Gesetzgebungsperiode', start: '2023-06-14' },
    { id: 15, label: '15. Gesetzgebungsperiode', start: '2013-06-19' },
    { id: 16, label: '16. Gesetzgebungsperiode', start: '2018-06-13' },
  ],
  t: [{ id: 18, label: 'XVIII. Gesetzgebungsperiode', start: '2022-10-25' }],
}

describe('the shipped calendar', () => {
  /* A fixed day, not the clock: a start after it was entered in the future. */
  const ENTERED_BY = '2026-11-14'
  it('holds, per Land, ISO starts strictly increasing, ids counting up by one, and a label of ordinal and noun', () => {
    for (const [land, periods] of Object.entries(LAND_PERIODS)) {
      expect(periods!.length, land).toBeGreaterThan(0)
      periods!.forEach((p, i) => {
        expect(p.start, `${land}-${p.id}`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(Number.isNaN(Date.parse(p.start)), `${land}-${p.id}`).toBe(false)
        expect(p.start <= ENTERED_BY, `${land}-${p.id}`).toBe(true)
        expect(p.label, `${land}-${p.id}`).toMatch(new RegExp(`^(${p.id}|${intToRoman(p.id)})\\. \\S`))
        if (i > 0) {
          const before = periods![i - 1]!
          expect(p.start > before.start, `${land}-${p.id}`).toBe(true)
          expect(p.id, `${land}-${p.id}`).toBe(before.id + 1)
        }
      })
    }
  })

  /* A period before a gap would run on into it, so each chain must close
   * back to its first row: every window ends the day before the next one
   * begins, and no ordinal is skipped. */
  const contiguousBackTo = (land: 't' | 'vbg', first: { id: number; start: string }) => {
    const periods = landPeriodsOf(land)
    const oldest = periods.at(-1)!
    expect({ id: oldest.id, start: oldest.start }).toEqual(first)
    expect(periods.map((p) => p.id)).toEqual(Array.from({ length: periods.length }, (_, i) => periods[0]!.id - i))
    for (let i = periods.length - 1; i > 0; i--) {
      const w = landPeriodWindow(land, periods[i]!.id)!
      const next = new Date(`${w.to}T12:00:00Z`)
      next.setUTCDate(next.getUTCDate() + 1)
      expect(next.toISOString().slice(0, 10), `${land}-${periods[i]!.id}`).toBe(periods[i - 1]!.start)
    }
  }

  it('holds Tirol without a gap back to XIV (21.10.2003)', () => {
    contiguousBackTo('t', { id: 14, start: '2003-10-21' })
  })

  it('holds Vorarlberg without a gap back to the XXVII. Landtag (05.10.1999)', () => {
    contiguousBackTo('vbg', { id: 27, start: '1999-10-05' })
  })
})

describe('a Land period and its window', () => {
  it('lists the periods newest first', () => {
    expect(landPeriodsOf('sbg', FIXTURE).map((p) => p.id)).toEqual([17, 16, 15])
    expect(landPeriodsOf('w', FIXTURE)).toEqual([])
  })

  it('runs from the constituent sitting to the day before the next one; the newest is open-ended', () => {
    expect(landPeriodWindow('sbg', 15, FIXTURE)).toEqual({ from: '2013-06-19', to: '2018-06-12' })
    expect(landPeriodWindow('sbg', 16, FIXTURE)).toEqual({ from: '2018-06-13', to: '2023-06-13' })
    expect(landPeriodWindow('sbg', 17, FIXTURE)).toEqual({ from: '2023-06-14', to: null })
    expect(landPeriodWindow('sbg', 14, FIXTURE)).toBeNull()
    expect(landPeriodWindow('w', 21, FIXTURE)).toBeNull()
  })

  it('knows the running one, and none for an empty calendar', () => {
    expect(runningLandPeriod('sbg', FIXTURE)?.id).toBe(17)
    expect(runningLandPeriod('w', FIXTURE)).toBeNull()
  })
})

describe('?landtag=', () => {
  it('is read leniently and held against the calendar', () => {
    expect(landtagParts('SBG-17')).toEqual({ land: 'sbg', id: 17 })
    expect(landtagParts('sbg-0')).toBeNull()
    expect(landtagParts('sbg-1000')).toBeNull()
    expect(landtagParts('bayern-1')).toBeNull()
    expect(parseLandtag('Sbg-16', FIXTURE)).toEqual({
      land: 'sbg', id: 16, value: 'sbg-16', window: { from: '2018-06-13', to: '2023-06-13' },
    })
    // Well-formed but not entered: no period.
    expect(parseLandtag('sbg-18', FIXTURE)).toBeNull()
    expect(parseLandtag('sbg-17', {})).toBeNull()
  })
})

describe('periodViewFor', () => {
  it('names the span by the Bund while it is a source', () => {
    expect(periodViewFor(true, [], FIXTURE)).toEqual({ mode: 'bund' })
    expect(periodViewFor(true, ['sbg'], FIXTURE)).toEqual({ mode: 'bund' })
  })

  it('by one Land\'s own periods, alone and with a calendar', () => {
    const view = periodViewFor(false, ['sbg'], FIXTURE)
    expect(view.mode).toBe('land')
    expect(view.mode === 'land' && view.periods.map((p) => p.id)).toEqual([17, 16, 15])
  })

  it('by the dates for several Länder, and for one whose calendar is empty', () => {
    expect(periodViewFor(false, ['sbg', 't'], FIXTURE)).toEqual({ mode: 'dates' })
    expect(periodViewFor(false, ['w'], FIXTURE)).toEqual({ mode: 'dates' })
    // An empty calendar: every single Land falls back to the dates.
    expect(periodViewFor(false, ['sbg'], {})).toEqual({ mode: 'dates' })
  })
})

describe('coherentSpan — a span the sources do not offer falls to the running one', () => {
  const sbg = periodViewFor(false, ['sbg'], FIXTURE)
  const tirol = periodViewFor(false, ['t'], FIXTURE)

  it('keeps a Land period only while its Land is the selection', () => {
    expect(coherentSpan({ gp: '', landtag: 'sbg-16' }, sbg)).toEqual({ gp: '', landtag: 'sbg-16' })
    // The Bund added, several Länder, another Land: dropped.
    expect(coherentSpan({ gp: '', landtag: 'sbg-16' }, { mode: 'bund' })).toEqual({ gp: '', landtag: '' })
    expect(coherentSpan({ gp: '', landtag: 'sbg-16' }, { mode: 'dates' })).toEqual({ gp: '', landtag: '' })
    expect(coherentSpan({ gp: '', landtag: 'sbg-16' }, tirol)).toEqual({ gp: '', landtag: '' })
  })

  it('drops a GP the Land\'s calendar reaches, keeps one it does not reach back to', () => {
    expect(coherentSpan({ gp: 'XXVII', landtag: '' }, sbg)).toEqual({ gp: '', landtag: '' })
    // XXV began 29.10.2013, after the fixture's first Salzburg period: dropped.
    expect(coherentSpan({ gp: 'XXV', landtag: '' }, sbg)).toEqual({ gp: '', landtag: '' })
    // XXIV began 28.10.2008, before it: kept, by its dates.
    expect(coherentSpan({ gp: 'XXIV', landtag: '' }, sbg)).toEqual({ gp: 'XXIV', landtag: '' })
    /* Tirol's one period begins 25.10.2022: XXVIII after it — dropped —,
     * XXVII before it — kept, though the two overlap; each option states its
     * dates. */
    expect(gpOfferedIn('XXVIII', tirol)).toBe(false)
    expect(gpOfferedIn('XXVII', tirol)).toBe(true)
  })

  it('keeps every GP under the Bund, and only those with a window under the dates', () => {
    expect(coherentSpan({ gp: 'XIII', landtag: '' }, { mode: 'bund' })).toEqual({ gp: 'XIII', landtag: '' })
    expect(coherentSpan({ gp: 'XIII', landtag: '' }, { mode: 'dates' })).toEqual({ gp: '', landtag: '' })
    expect(coherentSpan({ gp: 'XIV', landtag: '' }, { mode: 'dates' })).toEqual({ gp: 'XIV', landtag: '' })
    expect(coherentSpan({ gp: 'XXVII', landtag: '' }, { mode: 'dates' })).toEqual({ gp: 'XXVII', landtag: '' })
  })

  it('lets a Land period win over a GP in its view', () => {
    expect(coherentSpan({ gp: 'XXIV', landtag: 'sbg-17' }, sbg)).toEqual({ gp: '', landtag: 'sbg-17' })
    expect(landtagOfferedIn('sbg-14', sbg)).toBe(false)
  })
})

describe('laenderSpanQuery — what the Länder endpoints are asked', () => {
  const sbg = periodViewFor(false, ['sbg'], FIXTURE)

  it('asks a Land\'s view for its running period where none is chosen', () => {
    expect(laenderSpanQuery({ gp: '', landtag: '' }, sbg)).toEqual({ landtag: 'sbg-17' })
    expect(laenderSpanQuery({ gp: '', landtag: 'sbg-16' }, sbg)).toEqual({ landtag: 'sbg-16' })
    expect(laenderSpanQuery({ gp: 'XXIV', landtag: '' }, sbg)).toEqual({ gp: 'XXIV' })
  })

  it('asks every other view for the GP, or nothing — the running one', () => {
    expect(laenderSpanQuery({ gp: '', landtag: '' }, { mode: 'bund' })).toEqual({})
    expect(laenderSpanQuery({ gp: 'XXVII', landtag: '' }, { mode: 'dates' })).toEqual({ gp: 'XXVII' })
  })
})

describe('how a span is named', () => {
  it('states the dates, compact for a chip', () => {
    expect(windowDatesDe({ from: '2024-10-24', to: null })).toBe('seit 24.10.2024')
    expect(windowDatesDe({ from: '2019-10-23', to: '2024-10-23' })).toBe('23.10.2019 – 23.10.2024')
    expect(windowDatesDe({ from: '2019-10-23', to: '2024-10-23' }, true)).toBe('23.10.2019–23.10.2024')
  })

  it('names a Land period as the Land writes it, and shortens it for the chip', () => {
    const [p17, p16] = landPeriodsOf('sbg', FIXTURE)
    expect(landPeriodSpanLabelDe('sbg', p17!, FIXTURE)).toBe('seit 14.06.2023 (17. Gesetzgebungsperiode)')
    expect(landPeriodSpanLabelDe('sbg', p16!, FIXTURE)).toBe('13.06.2018 – 13.06.2023 (16. Gesetzgebungsperiode)')
    expect(landPeriodChipDe('sbg', p17!)).toBe('17. GP Salzburg')
    expect(landPeriodChipDe('t', landPeriodsOf('t', FIXTURE)[0]!)).toBe('XVIII. GP Tirol')
  })
})

describe('gpsOverlapping', () => {
  it('names every Bund period a window touches, newest first', () => {
    expect(gpsOverlapping({ from: '2018-06-13', to: '2023-06-13' })).toEqual(['XXVII', 'XXVI'])
    expect(gpsOverlapping({ from: '2023-06-14', to: null })).toEqual(['XXVIII', 'XXVII'])
    expect(gpsOverlapping({ from: '2024-10-24', to: null })).toEqual(['XXVIII'])
    // Both ends inclusive: the last day of XXVII touches it.
    expect(gpsOverlapping({ from: '2024-10-23', to: '2024-10-23' })).toEqual(['XXVII'])
    expect(gpsOverlapping({ from: '1990-01-01', to: '1995-01-01' })).toEqual(['XIX', 'XVIII', 'XVII'])
    expect(gpsOverlapping({ from: '1970-01-01', to: '1975-11-03' })).toEqual([])
  })
})
