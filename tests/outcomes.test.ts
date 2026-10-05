import { describe, expect, it } from 'vitest'
import {
  gpEndedBodyDe,
  gpEndedHeadlineDe,
  RV_BASE_RATES,
  rvBaseRateFor,
  rvWaitScale,
  daysSinceFristDe,
  changeShareRateFor,
  changeShareValueDe,
  reasoningShareValueDe,
  earlyVorlageWhenDe,
  tabledBeforeFristEnd,
  chainUnlinkedBodyDe,
  chainUnlinkedHeadlineDe,
  rvStationView,
  relatedGpSuffixDe,
  type VorlageOutcomeState,
} from '../app/utils/outcomes'
import { RV_LATENCY_CONTEXT_DAYS } from '../app/utils/deadlines'
import type { DraftDetail } from '../shared/types'
import { todayIso } from '../shared/utils/format'
import { GP_STARTS, gpEndedOn, romanToInt } from '../shared/utils/gp'

describe('RV base rates (scripts/corpus/rvLatency.ts, 2026-09-08)', () => {
  it('rows are internally consistent', () => {
    for (const r of RV_BASE_RATES) {
      expect(r.withRv).toBeLessThanOrEqual(r.drafts)
      expect(r.rvInLaterGp).toBeLessThanOrEqual(r.withRv)
      expect(r.withinLatencyWindow).toBeGreaterThan(0)
      expect(r.withinLatencyWindow).toBeLessThanOrEqual(1)
      expect(r.medianDays).toBeLessThanOrEqual(r.p90Days)
    }
  })

  it('the hand-written 180-day window sits at the measured p90 of both closed GPs', () => {
    // 189 d (XXVII) and 148 d (XXVI): the constant predates the measurement
    // and survived it — nine in ten first RVs arrive inside it.
    for (const r of RV_BASE_RATES) {
      expect(Math.abs(r.p90Days - RV_LATENCY_CONTEXT_DAYS)).toBeLessThan(45)
      expect(Math.round(r.withinLatencyWindow * 10)).toBe(9)
    }
  })

  it('falls back to the newest closed GP for a running or unmeasured one', () => {
    expect(rvBaseRateFor('XXVIII').gp).toBe('XXVII')
    expect(rvBaseRateFor('XXV').gp).toBe('XXVII')
    expect(rvBaseRateFor('XXVI').gp).toBe('XXVI')
  })

  /**
   * The row that the running period borrows has to BE the newest ended one.
   *
   * `rvBaseRateFor` falls back to `RV_BASE_RATES[0]` for every unmeasured GP,
   * and the running one is always unmeasured — so the day GP XXIX convenes
   * and `GP_STARTS` gains its row, this pairing breaks silently: the outcome
   * card would head „In der XXVII. Gesetzgebungsperiode …" on a XXVIII page
   * whose own period has long closed, and nothing on the page would look
   * wrong.
   *
   * WHEN THIS TEST GOES RED: run `pnpm corpus:rv-latenz` for the period that
   * just ended and put its row at the head of `RV_BASE_RATES`. The test is
   * the reminder, not the fix.
   */
  it('measures the newest period that has actually ended', () => {
    const ended = Object.keys(GP_STARTS)
      .filter((gp) => gpEndedOn(gp) !== null)
      .sort((a, b) => (romanToInt(b) ?? 0) - (romanToInt(a) ?? 0))
    expect(RV_BASE_RATES[0]!.gp).toBe(ended[0])
  })

  it('draws the wait on the latency window, with the median and the window as ticks', () => {
    const r = rvBaseRateFor('XXVIII')
    const { value, marks } = rvWaitScale(18, r)
    expect(value).toBeCloseTo(10)
    expect(marks.map((m) => [m.key, Math.round(m.at), m.align, m.lines.join(' ')])).toEqual([
      ['median', 22, 'center', 'Hälfte der Vorlagen nach 40 Tagen'],
      ['window', 100, 'end', '9 von 10 Vorlagen binnen 6 Monaten'],
    ])
  })

  it('stretches the track past the window, and drops the median where its label would collide', () => {
    const r = rvBaseRateFor('XXVIII')
    const past = rvWaitScale(240, r)
    expect(past.value).toBe(100)
    expect(past.marks.map((m) => [m.key, m.at, m.align])).toEqual([
      ['median', (40 / 240) * 100, 'center'],
      ['window', 75, 'center'],
    ])
    const long = rvWaitScale(1000, r)
    expect(long.marks.map((m) => [m.key, m.align])).toEqual([['window', 'start']])
  })

  it('names the wait in days', () => {
    expect(daysSinceFristDe(0)).toBe('Frist endete heute')
    expect(daysSinceFristDe(1)).toBe('1 Tag seit Fristende')
    expect(daysSinceFristDe(13)).toBe('13 Tage seit Fristende')
  })
})

describe('GP-ended copy', () => {
  it('names the boundary date when known, the fact alone otherwise', () => {
    expect(gpEndedHeadlineDe('XXVII', '2024-10-23')).toBe(
      'Die XXVII. Gesetzgebungsperiode endete am 23.10.2024 – ohne Regierungsvorlage zu diesem Entwurf.',
    )
    expect(gpEndedHeadlineDe('XIX', null)).toBe(
      'Die XIX. Gesetzgebungsperiode ist beendet – ohne Regierungsvorlage zu diesem Entwurf.',
    )
  })

  it('gives the carry-over rarity of THAT GP where measured', () => {
    // XXVII: 57 without RV + 4 late RVs = 61 open at the GP's end.
    expect(gpEndedBodyDe('XXVII')).toContain('4 von 61 solcher Entwürfe')
    // XXVI: 49 + 14 = 63.
    expect(gpEndedBodyDe('XXVI')).toContain('14 von 63 solcher Entwürfe')
    expect(gpEndedBodyDe('XXV')).toContain('XXVII. Gesetzgebungsperiode')
  })

  it('never uses the vocabulary the framing rule forbids', () => {
    for (const s of [gpEndedHeadlineDe('XXVII', '2024-10-23'), gpEndedBodyDe('XXVII'), ...rvWaitScale(20, rvBaseRateFor('XXVII')).marks.flatMap((m) => m.lines)]) {
      expect(s).not.toMatch(/gescheitert|versenkt|ignoriert|verschleppt|Schublade/i)
    }
  })
})

describe("the Regierungsvorlage card's counts (§12.38, 02.10.2026)", () => {
  it('one form for every count, zero and all included', () => {
    expect(changeShareValueDe(12, 21, 'Änderungen')).toBe('12 von 21 Änderungen des Entwurfs (57 %)')
    expect(changeShareValueDe(0, 5, 'Paragraphen')).toBe('0 von 5 Paragraphen des Entwurfs (0 %)')
    expect(changeShareValueDe(5, 5, 'Paragraphen')).toBe('5 von 5 Paragraphen des Entwurfs (100 %)')
    expect(changeShareValueDe(1, 1, 'Paragraphen')).toBe('1 von 1 Paragraph des Entwurfs (100 %)')
  })

  it('counts the Begründungen in the singular too', () => {
    expect(reasoningShareValueDe(66, 153)).toBe('66 von 153 Begründungen geändert')
    expect(reasoningShareValueDe(1, 1)).toBe('1 von 1 Begründung geändert')
  })

  it('states counts, not a verdict', () => {
    for (const s of [changeShareValueDe(12, 21, 'Änderungen'), reasoningShareValueDe(0, 4)]) {
      expect(s).not.toMatch(/nur|kaum|erfolgreich|ignoriert|Wirkung/)
    }
  })

  it('holds a running period against the newest closed one', () => {
    expect(changeShareRateFor('XXVIII').gp).toBe('XXVII')
  })
})

describe('a Vorlage tabled while the Begutachtung ran (29.09.2026)', () => {
  it('counts the Fristende itself, not the day after, and nothing without both dates', () => {
    expect(tabledBeforeFristEnd('2026-06-24', '2026-06-10')).toBe(true) // 115/ME
    expect(tabledBeforeFristEnd('2026-06-24', '2026-06-24')).toBe(true)
    expect(tabledBeforeFristEnd('2026-06-24', '2026-06-25')).toBe(false)
    expect(tabledBeforeFristEnd(null, '2026-06-10')).toBe(false)
    expect(tabledBeforeFristEnd('2026-06-24', null)).toBe(false)
  })

  it('says when an early Vorlage came, in the bar\'s words', () => {
    const at = (arrivedAt: string, rvDate: string, deadline: string) => earlyVorlageWhenDe({ arrivedAt, deadline, rvDate })
    expect(at('2026-06-10', '2026-06-10', '2026-06-24')).toBe('Eingebracht noch vor Beginn der Begutachtung') // 115/ME
    expect(at('2026-03-25', '2026-03-24', '2026-04-09')).toBe('Eingebracht noch vor Beginn der Begutachtung') // 92/ME
    expect(at('2025-09-15', '2025-09-24', '2025-09-29')).toBe('Eingebracht noch während der Begutachtung') // 45/ME
    expect(at('2025-09-15', '2025-09-29', '2025-09-29')).toBe('Eingebracht am letzten Tag der Begutachtungsfrist')
  })

  it('never says why', () => {
    expect(earlyVorlageWhenDe({ arrivedAt: '2026-06-11', deadline: '2026-06-21', rvDate: '2026-06-10' }))
      .not.toMatch(/Zum Vergleich|ignoriert|konnte|nicht aufgenommen|Wirkung|erfolgreich/)
  })
})

/* The Regierungsvorlage station of the draft page, moved out of its ten
 * computeds on 03.10.2026. Every expectation is what the page's computeds
 * returned for the same record. */
describe('rvStationView', () => {
  /* ISO date N days before today, on the Vienna day `daysUntil` counts by. */
  function daysAgo(n: number): string {
    const d = new Date(`${todayIso()}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - n)
    return d.toISOString().slice(0, 10)
  }

  /* Only what `rvStationView` reads. A closed Begutachtung of a running,
   * linked GP without a Vorlage, a month after its Frist. */
  function draft(overrides: Partial<DraftDetail> = {}): DraftDetail {
    return {
      gp: 'XXVIII',
      deadline: daysAgo(30),
      active: false,
      gpEnded: false,
      gpEndedOn: null,
      chainCoverage: 'linked',
      antragPath: null,
      successor: null,
      enactment: null,
      ...overrides,
    } as unknown as DraftDetail
  }
  const NOTHING: VorlageOutcomeState = { share: null, sharePending: false, reasoningStats: null, rvExplanations: null }
  const enactment = (furtherRv: unknown[] = []) => ({ rvCitation: '518 d.B.', furtherRv }) as unknown as DraftDetail['enactment']
  const antragPath = (draftShare: number) => ({ antrag: { citation: '1065/A' }, draftShare }) as unknown as DraftDetail['antragPath']

  it('is all off without a draft', () => {
    expect(rvStationView(null, NOTHING)).toEqual({
      showOutcome: false,
      lapsed: false,
      chainUnlinked: false,
      viaAntrag: false,
      noRvVerdict: null,
      noRvBaseRate: null,
      facts: [],
      counted: false,
      context: null,
    })
  })

  it('stays away while the Frist runs and no Vorlage exists', () => {
    const v = rvStationView(draft({ active: true, deadline: daysAgo(-10) }), NOTHING)
    expect(v.showOutcome).toBe(false)
    expect(v.facts).toEqual([])
    expect(v.context).toBeNull()
  })

  it('says „Bisher keine" in the row while the silence is fresh, with the base rate under it', () => {
    const v = rvStationView(draft(), NOTHING)
    expect(v.showOutcome).toBe(true)
    expect(v.noRvVerdict).toBeNull()
    expect(v.facts).toEqual([{ key: 'stand', title: 'Stand', text: 'Bisher keine Regierungsvorlage.' }])
    expect(v.context).toBeNull()
    expect(v.noRvBaseRate).toBe(rvBaseRateFor('XXVIII'))
    expect(v.counted).toBe(false)
  })

  it('puts the verdict in the row once the quiet stretch passes the latency window', () => {
    const v = rvStationView(draft({ deadline: daysAgo(400) }), NOTHING)
    expect(v.noRvVerdict).toBe('Seit Ende der Begutachtungsfrist vor über einem Jahr liegt keine Regierungsvorlage vor.')
    expect(v.facts).toEqual([{ key: 'stand', title: 'Stand', text: v.noRvVerdict }])
    expect(v.context).toBe('Ob und wie es weitergeht, ist offen.')
    expect(v.noRvBaseRate).toBe(rvBaseRateFor('XXVIII'))
  })

  it('states the period\'s end once the GP is over, with the carry-over rate instead of the base rate', () => {
    const v = rvStationView(draft({ gp: 'XXVII', gpEnded: true, gpEndedOn: '2024-10-23', deadline: daysAgo(900) }), NOTHING)
    expect(v.lapsed).toBe(true)
    expect(v.noRvVerdict).toBe(gpEndedHeadlineDe('XXVII', '2024-10-23'))
    expect(v.context).toBe(gpEndedBodyDe('XXVII'))
    expect(v.noRvBaseRate).toBeNull()
  })

  it('claims nothing where the period records no links, over the GP\'s end too', () => {
    const v = rvStationView(draft({ gp: 'XVI', gpEnded: true, chainCoverage: 'unknown' }), NOTHING)
    expect(v.chainUnlinked).toBe(true)
    expect(v.lapsed).toBe(true)
    expect(v.noRvVerdict).toBe(chainUnlinkedHeadlineDe('XVI'))
    expect(v.context).toBe(chainUnlinkedBodyDe())
    expect(v.noRvBaseRate).toBeNull()
  })

  it('names the Initiativantrag instead of any waiting sentence, and the successor draft', () => {
    const v = rvStationView(draft({ deadline: daysAgo(400), antragPath: antragPath(0.9), successor: {} as DraftDetail['successor'] }), NOTHING)
    expect(v.viaAntrag).toBe(true)
    expect(v.noRvVerdict).toBeNull()
    expect(v.context).toBeNull()
    expect(v.noRvBaseRate).toBeNull()
    expect(v.facts.map((f) => f.key)).toEqual(['antrag', 'nachfolger'])
  })

  it('dates the handoff in its own row while the GP runs', () => {
    const handoff = { date: '2026-09-22', recipient: 'das Bundesministerium für Justiz' }
    expect(rvStationView(draft({ handoff }), NOTHING).facts).toEqual([
      { key: 'stand', title: 'Stand', text: 'Bisher keine Regierungsvorlage.' },
      { key: 'ressort', title: 'Beim Ressort', text: 'seit 22.09.2026' },
    ])
    // The period's end closes the wait; the Begutachtung's row dates it then.
    const ended = rvStationView(draft({ handoff, gp: 'XXVII', gpEnded: true, gpEndedOn: '2024-10-23' }), NOTHING)
    expect(ended.facts.map((f) => f.key)).toEqual(['stand'])
    expect(rvStationView(draft({ handoff: { date: null, recipient: 'x' } }), NOTHING).facts.map((f) => f.key)).toEqual(['stand'])
  })

  it('keeps the waiting sentence where the Antrag carries too little of the draft', () => {
    const v = rvStationView(draft({ antragPath: antragPath(0.2) }), NOTHING)
    expect(v.viaAntrag).toBe(false)
    expect(v.facts.map((f) => f.key)).toEqual(['stand'])
  })

  it('lists the Vorlage and the comparison\'s rows as they arrive', () => {
    const d = draft({ enactment: enactment() })
    expect(rvStationView(d, NOTHING).facts.map((f) => f.key)).toEqual(['rv'])
    expect(rvStationView(d, { ...NOTHING, sharePending: true }).facts.map((f) => f.key)).toEqual(['rv', 'aenderung'])
    const full = rvStationView(draft({ enactment: enactment([{}]) }), { share: {}, sharePending: false, reasoningStats: null, rvExplanations: {} })
    expect(full.facts).toEqual([
      { key: 'rv', title: 'Eingebracht' },
      { key: 'aenderung', title: 'Umgeschrieben oder gestrichen' },
      { key: 'begruendung', title: 'Begründung' },
      { key: 'weitere', title: 'Außerdem aus dem Entwurf hervorgegangen' },
    ])
    expect(full.counted).toBe(true)
    expect(full.showOutcome).toBe(true)
  })

  it('counts only where a count row stands', () => {
    expect(rvStationView(draft({ enactment: enactment([{}]) }), NOTHING).counted).toBe(false)
  })

  /* As on the page: with a Vorlage the verdict and its context are still
   * computed for an old Frist, and the template's own guard
   * (`!data.enactment`) keeps them off the screen. Pinned, not endorsed. */
  it('computes the verdict even beside a Vorlage, which the page does not render', () => {
    const v = rvStationView(draft({ deadline: daysAgo(400), enactment: enactment() }), NOTHING)
    expect(v.noRvVerdict).not.toBeNull()
    expect(v.context).toBe('Ob und wie es weitergeht, ist offen.')
    expect(v.facts.map((f) => f.key)).toEqual(['rv'])
  })
})

describe('relatedGpSuffixDe', () => {
  it('names the GP only where it differs from the page\'s own', () => {
    expect(relatedGpSuffixDe('XXVIII', 'XXVIII')).toBe('')
    expect(relatedGpSuffixDe('XXVII', 'XXVIII')).toBe(' (XXVII. GP)')
  })
})
