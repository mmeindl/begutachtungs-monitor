import { describe, expect, it } from 'vitest'
import {
  deadlineTone,
  fristClassOf,
  fristContextDe,
  fristContextFor,
  fristDivergence,
  fristFact,
  fristRangeDe,
  fristStateDe,
  isNewArrival,
  isWithinNewWindow,
  NEW_ARRIVAL_DAYS,
  noRvVerdictDe,
  RV_LATENCY_CONTEXT_DAYS,
} from '../app/utils/deadlines'
import { todayIso } from '../shared/utils/format'

/**
 * ISO date exactly N days before today — anchored on the VIENNA calendar
 * day, which is the day `daysUntil` measures against. It used to be the
 * process's local day, and the two part company for two hours every night
 * on a UTC machine: `daysAgo(RV_LATENCY_CONTEXT_DAYS)` would then be 181
 * days old instead of 180 and fall out of the window the test pins.
 */
function daysAgo(n: number): string {
  const d = new Date(`${todayIso()}T00:00:00Z`)
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

describe('isNewArrival', () => {
  it('marks a Begutachtung that began inside the window, including today', () => {
    expect(isNewArrival(daysAgo(0), true)).toBe(true)
    expect(isNewArrival(daysAgo(NEW_ARRIVAL_DAYS), true)).toBe(true)
  })

  it('stops at the boundary', () => {
    expect(isNewArrival(daysAgo(NEW_ARRIVAL_DAYS + 1), true)).toBe(false)
  })

  it('never marks a closed Verfahren — "neu" on what nobody can act on', () => {
    expect(isNewArrival(daysAgo(1), false)).toBe(false)
  })

  it('says no where upstream ships no start date, and for a future one', () => {
    expect(isNewArrival(null, true)).toBe(false)
    expect(isNewArrival(undefined, true)).toBe(false)
    expect(isNewArrival(daysAgo(-3), true)).toBe(false)
  })
})

/* The same window for every later station (03.10.2026) — without the
 * `active` guard, which belongs to the Begutachtung alone. */
describe('isWithinNewWindow', () => {
  it('holds from today back to the boundary, inclusive', () => {
    expect(isWithinNewWindow(daysAgo(0))).toBe(true)
    expect(isWithinNewWindow(daysAgo(NEW_ARRIVAL_DAYS))).toBe(true)
  })

  it('stops a day past the boundary, and for a future date', () => {
    expect(isWithinNewWindow(daysAgo(NEW_ARRIVAL_DAYS + 1))).toBe(false)
    expect(isWithinNewWindow(daysAgo(-1))).toBe(false)
  })

  it('says no without a date', () => {
    expect(isWithinNewWindow(null)).toBe(false)
    expect(isWithinNewWindow(undefined)).toBe(false)
  })
})

describe('fristClassOf — only the edges carry a class', () => {
  it('is short under 21 days, full from 42, silent between', () => {
    expect(fristClassOf('2026-06-01', '2026-06-21')).toBe('short') // 20
    expect(fristClassOf('2026-06-01', '2026-06-22')).toBeNull() // 21
    expect(fristClassOf('2026-06-01', '2026-07-12')).toBeNull() // 41
    expect(fristClassOf('2026-06-01', '2026-07-13')).toBe('full') // 42
  })

  it('says nothing where the span cannot be made', () => {
    expect(fristClassOf(null, '2026-06-21')).toBeNull()
    expect(fristClassOf('2026-06-21', '2026-06-21')).toBeNull()
    expect(fristClassOf('2026-06-21', '2026-06-01')).toBeNull()
  })
})

describe('fristContextDe — the yardstick sentence', () => {
  it('compares a short Frist with the Regelfall and with practice', () => {
    expect(fristContextDe('short')).toBe(
      'Zum Vergleich: Im Regelfall vorgesehen sind sechs Wochen, und die Hälfte der Entwürfe seit 2013 hatte mindestens vier.',
    )
  })

  it('names how rare a full Frist is', () => {
    expect(fristContextDe('full')).toMatch(/^Zum Vergleich: Die im Regelfall vorgesehenen sechs Wochen/)
  })

  it('is silent in the middle', () => {
    expect(fristContextDe(null)).toBeNull()
    expect(fristContextDe(null, 'verordnung')).toBeNull()
  })

  it('compares a Verordnungsentwurf with its own kind', () => {
    expect(fristContextDe('short', 'verordnung')).toBe(
      'Zum Vergleich: Im Regelfall vorgesehen sind sechs Wochen, und die Hälfte der Verordnungsentwürfe seit 2013 hatte mindestens vier.',
    )
    expect(fristContextDe('full', 'verordnung')).toBe(
      'Zum Vergleich: Die im Regelfall vorgesehenen sechs Wochen erreicht nur etwa jeder sechste Verordnungsentwurf.',
    )
  })
})

describe('fristRangeDe — the Frist as dates', () => {
  it('names the year once where both ends share it', () => {
    expect(fristRangeDe('2026-06-03', '2026-06-17')).toBe('03.06.–17.06.2026')
  })

  it('names both years across the turn of a year', () => {
    expect(fristRangeDe('2025-12-15', '2026-01-26')).toBe('15.12.2025 – 26.01.2026')
  })

  it('falls back to the deadline alone without a usable start', () => {
    expect(fristRangeDe(null, '2026-06-17')).toBe('bis 17.06.2026')
  })
})

/* The detail pages' Frist phrases, moved out of both pages on 03.10.2026.
 * The expected strings are what each page built inline before. */
describe('fristStateDe', () => {
  it('words an open Begutachtung as a fact for the og facts', () => {
    expect(fristStateDe(true, '2026-10-16')).toBe('Frist bis 16.10.2026')
    expect(fristStateDe(true, null)).toBe('Begutachtung läuft')
  })

  it('words it as a clause after the type word for the RIS description', () => {
    expect(fristStateDe(true, '2026-10-16', 'clause')).toBe('in Begutachtung bis 16.10.2026')
    expect(fristStateDe(true, undefined, 'clause')).toBe('in Begutachtung')
  })

  it('says the same about a closed one in both shapes, never „in Begutachtung"', () => {
    for (const shape of ['fact', 'clause'] as const) {
      expect(fristStateDe(false, '2026-08-10', shape)).toBe('Begutachtung endete am 10.08.2026')
      expect(fristStateDe(false, null, shape)).toBe('Begutachtung abgeschlossen')
    }
  })
})

describe('fristContextFor', () => {
  it('is fristContextDe on the class of the dates', () => {
    expect(fristContextFor('2026-06-03', '2026-06-17')).toBe(fristContextDe('short'))
    expect(fristContextFor('2026-06-29', '2026-08-10', 'verordnung')).toBe(fristContextDe('full', 'verordnung'))
    expect(fristContextFor('2026-06-03', '2026-07-01')).toBeNull()
    expect(fristContextFor(null, '2026-07-01')).toBeNull()
  })
})

describe('fristFact', () => {
  it('is the „Begutachtungsfrist" row under the key the bar\'s slot is named by', () => {
    expect(fristFact('2026-06-03', '2026-06-17')).toEqual({ key: 'frist', title: 'Begutachtungsfrist', text: '03.06.–17.06.2026' })
    expect(fristFact(null, '2026-06-17')).toEqual({ key: 'frist', title: 'Begutachtungsfrist', text: 'bis 17.06.2026' })
  })
})
