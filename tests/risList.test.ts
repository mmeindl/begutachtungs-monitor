import { describe, expect, it } from 'vitest'
import { filterRisConsultations, risStationWants } from '../server/utils/ris/risList'
import { ministryTokens } from '../server/utils/searchHaystack'
import type { BgblOutcome, RisConsultation } from '../shared/types'

/**
 * Der Filter der zweiten Listenhälfte (`server/utils/ris/risList.ts`).
 * Zwei Regeln tragen hier eine Aussage über das Verfahren: wo ein Satz ohne
 * Gegenstand auf der Stationsachse steht, und dass der Ressortname nicht
 * durchsucht wird.
 */

function rec(overrides: Partial<RisConsultation> = {}): RisConsultation {
  return {
    id: 'BEGUT_1',
    kind: 'verordnung',
    title: 'Krankentransportverordnung',
    longTitle: 'Verordnung der Bundesministerin für Landesverteidigung über den Krankentransport',
    ministryCode: 'BMLV',
    ministryName: 'BMLV (Bundesministerium für Landesverteidigung)',
    startedAt: '2026-09-01',
    deadline: '2026-10-01',
    active: true,
    risUrl: 'https://www.ris.bka.gv.at/Begut/1',
    outcome: null,
    ...overrides,
  }
}

const TOKENS = ministryTokens(['BMLV (Bundesministerium für Landesverteidigung)'])
const ALL = {
  wants: { begutachtung: true, bgbl: false },
  status: 'all',
  art: undefined,
  ministry: undefined,
  q: undefined,
  ministryTokens: TOKENS,
  outcomes: {} as Record<string, BgblOutcome>,
} as const

const ids = (rows: RisConsultation[]) => rows.map((r) => r.id)

describe('risStationWants', () => {
  it('reads an empty station list as "no station filter at all"', () => {
    // `bgbl` stays false and costs nothing: with `begutachtung` true the
    // filter lets every row through anyway.
    expect(risStationWants([])).toEqual({ begutachtung: true, bgbl: false })
  })

  it('answers both halves of the axis these records can reach', () => {
    expect(risStationWants(['begutachtung'])).toEqual({ begutachtung: true, bgbl: false })
    expect(risStationWants(['bgbl'])).toEqual({ begutachtung: false, bgbl: true })
    // Neither is reachable without a Gegenstand at Parliament (§12.16).
    expect(risStationWants(['rv'])).toEqual({ begutachtung: false, bgbl: false })
  })
})

describe('filterRisConsultations', () => {
  const rows = [
    rec({ id: 'BEGUT_1', active: true }),
    rec({ id: 'BEGUT_2', active: false, kind: 'gesetz' }),
  ]
  const kundgemacht = { BEGUT_2: { state: 'kundgemacht' } as BgblOutcome }

  it('keeps nothing on a station these records cannot reach', () => {
    expect(ids(filterRisConsultations(rows, { ...ALL, wants: { begutachtung: false, bgbl: false } }))).toEqual([])
  })

  it('lets the promulgated ones through under the BGBl station', () => {
    const wants = { begutachtung: false, bgbl: true }
    expect(ids(filterRisConsultations(rows, { ...ALL, wants, outcomes: kundgemacht }))).toEqual(['BEGUT_2'])
    // No outcome resolved is not a promulgation: the empty budget must not
    // answer "keine kundgemachten Verordnungen" (§12.13).
    expect(ids(filterRisConsultations(rows, { ...ALL, wants }))).toEqual([])
  })

  it('filters by status and by kind', () => {
    expect(ids(filterRisConsultations(rows, { ...ALL, status: 'open' }))).toEqual(['BEGUT_1'])
    expect(ids(filterRisConsultations(rows, { ...ALL, art: 'gesetz' }))).toEqual(['BEGUT_2'])
  })

  it('does not search the ministry clause of the long title', () => {
    // "Landesverteidigung" appears only inside "Verordnung der
    // Bundesministerin für …", so the word must not pull the whole output
    // of that house (§12.31).
    expect(ids(filterRisConsultations(rows, { ...ALL, q: 'landesverteidigung' }))).toEqual([])
    expect(ids(filterRisConsultations(rows, { ...ALL, q: 'krankentransport' }))).toHaveLength(2)
    expect(ids(filterRisConsultations(rows, { ...ALL, q: 'bmlv' }))).toHaveLength(2)
  })

  it('keeps a word of the long title that stands outside the clause', () => {
    const row = rec({
      id: 'BEGUT_3',
      title: 'Kurztitel ohne das Wort',
      longTitle: 'Verordnung der Bundesministerin für Landesverteidigung über die Truppenübung',
    })
    expect(ids(filterRisConsultations([row], { ...ALL, q: 'truppenübung' }))).toEqual(['BEGUT_3'])
  })
})
