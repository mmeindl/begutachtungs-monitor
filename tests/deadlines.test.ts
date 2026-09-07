import { describe, expect, it } from 'vitest'
import {
  deadlineTone,
  fristDivergence,
  noRvVerdictDe,
  RV_LATENCY_CONTEXT_DAYS,
} from '../shared/utils/deadlines'

/**
 * ISO date exactly N days before today — anchored on the LOCAL calendar
 * day, the same convention daysUntil uses, so boundary tests are exact
 * at any time of day.
 */
function daysAgo(n: number): string {
  const now = new Date()
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

describe('deadlineTone', () => {
  it('renders expired deadlines muted even when flagged active (stale client data)', () => {
    expect(deadlineTone(daysAgo(2), true)).toBe('inactive')
  })

  it('never colors inactive consultations', () => {
    expect(deadlineTone(daysAgo(-2), false)).toBe('inactive')
  })
})

describe('noRvVerdictDe', () => {
  it('stays silent inside the latency window — context speaks, not a verdict', () => {
    expect(noRvVerdictDe(daysAgo(100))).toBeNull()
    expect(noRvVerdictDe(daysAgo(RV_LATENCY_CONTEXT_DAYS))).toBeNull()
    expect(noRvVerdictDe(null)).toBeNull()
    expect(noRvVerdictDe('kaputt')).toBeNull()
  })

  it('brackets months elapsed into the quotable sentence', () => {
    expect(noRvVerdictDe(daysAgo(245))).toBe(
      'Seit Ende der Begutachtungsfrist vor 8 Monaten liegt keine Regierungsvorlage vor.',
    )
  })

  it('switches to the year vocabulary past twelve months', () => {
    expect(noRvVerdictDe(daysAgo(400))).toContain('vor über einem Jahr')
    expect(noRvVerdictDe(daysAgo(800))).toContain('vor über 2 Jahren')
  })
})

describe('fristDivergence', () => {
  /* The real case: 56/ME (GP XXVIII, MinroG-Novelle IE-R 2025). Both
   * sources start the Frist on 03.10.2025, then Parliament ends it on
   * 10.10.2025 and RIS on 10.11.2025 — a 7-day versus a 38-day
   * Begutachtung, which is exactly the kind of divergence a submitter
   * needs to see before the earlier of the two dates passes. */
  const ris = {
    endeOffsetDays: 31,
    risEnde: '2025-11-10',
    risUrl:
      'https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Begut&Dokumentnummer=BEGUT_EBB0D040_71B0_41A4_8F4D_7CC31664E5F2',
  }

  it('reports a later RIS date while the Frist runs', () => {
    expect(fristDivergence(ris, true)).toEqual({
      date: '2025-11-10',
      url: ris.risUrl,
      days: 31,
      later: true,
    })
  })

  /* The sign is the direction a submitter acts on — a flip would name the
   * wrong date, so both directions are pinned. */
  it('reports an earlier RIS date as earlier', () => {
    expect(fristDivergence({ ...ris, endeOffsetDays: -4 }, true)?.later).toBe(false)
    expect(fristDivergence({ ...ris, endeOffsetDays: -4 }, true)?.days).toBe(4)
  })

  it('stays silent once the Frist is over — then it is trivia, not a decision', () => {
    expect(fristDivergence(ris, false)).toBeNull()
  })

  it('stays silent when the sources agree or RIS has no date', () => {
    expect(fristDivergence({ ...ris, endeOffsetDays: 0 }, true)).toBeNull()
    expect(fristDivergence({ ...ris, endeOffsetDays: null }, true)).toBeNull()
    expect(fristDivergence({ ...ris, risEnde: null }, true)).toBeNull()
    expect(fristDivergence(null, true)).toBeNull()
  })

  it('survives an unmatched RIS row without a link', () => {
    expect(fristDivergence({ ...ris, risUrl: null }, true)?.url).toBeNull()
  })
})
