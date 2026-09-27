import { describe, expect, it } from 'vitest'
import {
  gpEndedBodyDe,
  gpEndedHeadlineDe,
  RV_BASE_RATES,
  rvBaseRateFor,
  rvBaseRateSentenceDe,
  changeShareRateFor,
  changeShareSentenceDe,
} from '../app/utils/outcomes'
import { RV_LATENCY_CONTEXT_DAYS } from '../app/utils/deadlines'
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

  it('states the rate as numbers, without a verdict word', () => {
    expect(rvBaseRateSentenceDe('XXVIII')).toBe(
      'In der XXVII. Gesetzgebungsperiode wurden 296 von 353 Entwürfen zur Regierungsvorlage, 9 von 10 davon binnen 6 Monaten nach Fristende.',
    )
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
    expect(gpEndedBodyDe('XXVII')).toContain('4 von 61 Entwürfen')
    // XXVI: 49 + 14 = 63.
    expect(gpEndedBodyDe('XXVI')).toContain('14 von 63 Entwürfen')
    expect(gpEndedBodyDe('XXV')).toContain('XXVII. Gesetzgebungsperiode')
  })

  it('never uses the vocabulary the framing rule forbids', () => {
    for (const s of [gpEndedHeadlineDe('XXVII', '2024-10-23'), gpEndedBodyDe('XXVII'), rvBaseRateSentenceDe('XXVII')]) {
      expect(s).not.toMatch(/gescheitert|versenkt|ignoriert|verschleppt|Schublade/i)
    }
  })
})

describe('changeShareSentenceDe (§12.38)', () => {
  it('states the count of the draft and the middle half of the period, not a verdict', () => {
    const s = changeShareSentenceDe('XXVII', 12, 21, 'Änderungsanordnungen')
    expect(s).toContain('Von den 21 Änderungsanordnungen des Entwurfs hat die Regierungsvorlage 12 (57 %) geändert oder gestrichen')
    expect(s).toContain('bei der Hälfte der Entwürfe zwischen')
    expect(s).not.toMatch(/nur|kaum|erfolgreich|ignoriert|Wirkung/)
  })

  it('says none and all in words', () => {
    expect(changeShareSentenceDe('XXVII', 0, 5, 'Paragraphen')).toContain('übernimmt die 5 Paragraphen des Entwurfs im Wortlaut')
    expect(changeShareSentenceDe('XXVII', 5, 5, 'Paragraphen')).toContain('alle 5 geändert')
  })

  it('holds a running period against the newest closed one', () => {
    expect(changeShareRateFor('XXVIII').gp).toBe('XXVII')
  })
})
