import { describe, expect, it } from 'vitest'
import { deadlineTone, noRvVerdictDe, RV_LATENCY_CONTEXT_DAYS } from '../shared/utils/deadlines'

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
