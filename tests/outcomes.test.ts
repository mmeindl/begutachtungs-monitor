import { describe, expect, it } from 'vitest'
import {
  gpEndedBodyDe,
  gpEndedHeadlineDe,
  RV_BASE_RATES,
  rvBaseRateFor,
  rvBaseRateSentenceDe,
  changeShareRateFor,
  changeShareSentenceDe,
  begutachtungAftermathDe,
  earlyVorlageSentenceDe,
  tabledBeforeFristEnd,
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
    expect(gpEndedBodyDe('XXVII')).toContain('4 von 61 solcher Entwürfe')
    // XXVI: 49 + 14 = 63.
    expect(gpEndedBodyDe('XXVI')).toContain('14 von 63 solcher Entwürfe')
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
    const s = changeShareSentenceDe('XXVII', 12, 21, 'Änderungen')
    expect(s).toContain('Die Regierungsvorlage hat 12 von 21 Änderungen des Entwurfs umgeschrieben oder gestrichen (57\u00a0%).')
    expect(s).toContain('Üblich waren in der XXVII. Gesetzgebungsperiode')
    expect(s).not.toMatch(/nur|kaum|erfolgreich|ignoriert|Wirkung/)
  })

  it('says none and all in words', () => {
    expect(changeShareSentenceDe('XXVII', 0, 5, 'Paragraphen')).toContain('übernimmt alle 5 Paragraphen des Entwurfs im Wortlaut')
    expect(changeShareSentenceDe('XXVII', 5, 5, 'Paragraphen')).toContain('alle 5 Paragraphen des Entwurfs umgeschrieben')
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

  it('115/ME: the count kept, the range replaced by when the Vorlage came, in the bar\'s words', () => {
    expect(earlyVorlageSentenceDe(0, 8, 'Änderungen', { arrivedAt: '2026-06-10', deadline: '2026-06-24', rvDate: '2026-06-10' }))
      .toBe('Die Regierungsvorlage übernimmt alle 8 Änderungen des Entwurfs im Wortlaut, abgesehen von redaktionellen Korrekturen – eingebracht noch vor Beginn der Begutachtung.')
  })

  it('names the other timings', () => {
    const at = (arrivedAt: string, rvDate: string, deadline: string) =>
      earlyVorlageSentenceDe(1, 20, 'Paragraphen', { arrivedAt, deadline, rvDate })
    expect(at('2026-03-25', '2026-03-24', '2026-04-09')).toContain('– eingebracht noch vor Beginn der Begutachtung.') // 92/ME
    expect(at('2025-09-15', '2025-09-24', '2025-09-29')).toContain('(5\u00a0%) – eingebracht noch während der Begutachtung.') // 45/ME
    expect(at('2025-09-15', '2025-09-29', '2025-09-29')).toContain('– eingebracht am letzten Tag der Begutachtungsfrist.')
  })

  it('never says why', () => {
    const s = earlyVorlageSentenceDe(0, 8, 'Paragraphen', { arrivedAt: '2026-06-11', deadline: '2026-06-21', rvDate: '2026-06-10' })
    expect(s).not.toMatch(/Zum Vergleich|ignoriert|konnte|nicht aufgenommen|Wirkung|erfolgreich/)
  })
})

describe('begutachtungAftermathDe — the line that closes „Die Begutachtung"', () => {
  const after = { arrivedAt: '2026-05-01', deadline: '2026-06-12', rvDate: '2026-09-02' }

  it('states the count once the Vorlage came after the Fristende, without the range', () => {
    expect(begutachtungAftermathDe({ changed: 12, own: 21 }, 'Änderungen', after))
      .toBe('Die Regierungsvorlage hat 12 von 21 Änderungen des Entwurfs umgeschrieben oder gestrichen (57\u00a0%).')
    expect(begutachtungAftermathDe({ changed: 0, own: 8 }, 'Paragraphen', after))
      .toBe('Die Regierungsvorlage übernimmt alle 8 Paragraphen des Entwurfs im Wortlaut, abgesehen von redaktionellen Korrekturen.')
  })

  /* Under the Stellungnahmen, „im Wortlaut übernommen" for a Vorlage they
     could not have shaped reads as input ignored — so no count at all. */
  it('says only when an early Vorlage came, count or not (115/ME)', () => {
    const early = { arrivedAt: '2026-06-10', deadline: '2026-06-24', rvDate: '2026-06-10' }
    const line = 'Eingebracht wurde die Regierungsvorlage am 10.06.2026, am selben Tag, an dem der Entwurf in Begutachtung ging.'
    expect(begutachtungAftermathDe({ changed: 0, own: 8 }, 'Paragraphen', early)).toBe(line)
    expect(begutachtungAftermathDe(null, 'Paragraphen', early)).toBe(line)
  })

  it('says nothing while the count is unknown', () => {
    expect(begutachtungAftermathDe(null, 'Paragraphen', after)).toBeNull()
  })
})
