import { describe, expect, it } from 'vitest'
import {
  gpEndedBodyDe,
  gpEndedHeadlineDe,
  RV_BASE_RATES,
  rvBaseRateFor,
  rvBaseRateSentenceDe,
} from '../shared/utils/outcomes'
import { RV_LATENCY_CONTEXT_DAYS } from '../shared/utils/deadlines'

describe('RV base rates (scripts/rv-latency.mjs, 2026-09-08)', () => {
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
