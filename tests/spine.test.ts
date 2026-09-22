import { describe, expect, it } from 'vitest'
import type { DraftDetail } from '../shared/types'
import { formatNumberDe } from '../shared/utils/format'
import { procedureStatusDe, stations } from '../app/utils/spine'

/* Only what `stations()` reads; the rest of DraftDetail is irrelevant here. */
function draft(overrides: Partial<DraftDetail> = {}): DraftDetail {
  return {
    arrivedAt: '2021-02-22',
    deadline: '2021-04-19',
    active: false,
    gpEnded: true,
    handoff: null,
    textEvolution: [],
    statements: { total: 143, organisations: 40, privatePersons: 100, nonPublic: 3, organisationList: [] },
    enactment: {
      rvCitation: '2238 d.B.',
      rvUrl: 'https://www.parlament.gv.at/gegenstand/XXVII/I/2238',
      rvTextUrl: null,
      rvDate: '2023-10-04',
      furtherRv: [],
      bgblNumber: 'Bundesgesetzblatt I Nr. 5/2024',
      bgblRisUrl: null,
      filingOpen: false,
    },
    ...overrides,
  } as unknown as DraftDetail
}

const rvRow = (d: DraftDetail, ctx?: Parameters<typeof stations>[1]) =>
  stations(d, ctx).find((s) => s.id === 'rv')!

describe('stations — the Regierungsvorlage row', () => {
  it('adds the Vorlage\'s own Stellungnahmen after its date, phrased "zur Vorlage"', () => {
    expect(rvRow(draft(), { rvStatementTotal: 10 }).facts).toEqual(['04.10.2023, 30 Monate nach Fristende', '10 Stellungnahmen zur Vorlage'])
    expect(rvRow(draft(), { rvStatementTotal: 1 }).facts).toEqual(['04.10.2023, 30 Monate nach Fristende', '1 Stellungnahme zur Vorlage'])
  })

  it('says nothing about them while unknown or when there are none', () => {
    const date = ['04.10.2023, 30 Monate nach Fristende']
    expect(rvRow(draft()).facts).toEqual(date)
    expect(rvRow(draft(), { rvStatementTotal: 0 }).facts).toEqual(date)
    expect(rvRow(draft(), { rvStatementTotal: null }).facts).toEqual(date)
  })

  it('formats large counts the Austrian way, on both rows', () => {
    const d = draft({ statements: { total: 41376, organisations: 0, privatePersons: 0, nonPublic: 0, organisationList: [] } } as Partial<DraftDetail>)
    const list = stations(d, { rvStatementTotal: 41376 })
    // Whatever de-AT grouping Node's ICU produces (a narrow space here, a
    // dot in browsers) — the point is that both rows use the same one.
    const grouped = formatNumberDe(41376)
    expect(grouped).not.toBe('41376')
    expect(list.find((s) => s.id === 'begutachtung')!.facts[0]).toBe(`${grouped} Stellungnahmen`)
    expect(list.find((s) => s.id === 'rv')!.facts[1]).toBe(`${grouped} Stellungnahmen zur Vorlage`)
  })

  /* The whole point of the line: 115/ME XXVIII was tabled as 525 d.B. on the
     day the draft went out, two weeks before its own Frist ended. The bar
     used to show that as two identical dates in two rows. */
  it('names the distance to the Fristende, including when the Vorlage came first', () => {
    const at = (rvDate: string) => rvRow(draft({
      arrivedAt: '2026-06-10',
      deadline: '2026-06-24',
      enactment: { ...draft().enactment!, rvDate },
    })).facts[0]
    expect(at('2026-06-10')).toBe('10.06.2026, noch vor Fristende')
    expect(at('2026-06-24')).toBe('24.06.2026, am Tag des Fristendes')
    expect(at('2026-06-25')).toBe('25.06.2026, 1 Tag nach Fristende')
    expect(at('2026-07-14')).toBe('14.07.2026, 20 Tage nach Fristende')
    expect(at('2026-12-24')).toBe('24.12.2026, 6 Monate nach Fristende')
  })

  it('falls back to the citation when the stage carries no date', () => {
    const d = draft({ enactment: { ...draft().enactment!, rvDate: null } })
    expect(rvRow(d).facts[0]).toBe('2238 d.B.')
  })
})

describe('stations — how long the Frist ran', () => {
  const beg = (d: DraftDetail) => stations(d).find((s) => s.id === 'begutachtung')!.facts

  it('leads with the duration, in weeks where the span is a clean multiple', () => {
    expect(beg(draft({ arrivedAt: '2026-08-11', deadline: '2026-09-22', active: true })))
      .toEqual(['6 Wochen Frist, bis 22.09.2026', '143 Stellungnahmen'])
    expect(beg(draft({ arrivedAt: '2026-06-10', deadline: '2026-06-24' })))
      .toEqual(['143 Stellungnahmen', '2 Wochen Frist, endete 24.06.2026'])
  })

  it('stays in days for spans that are not whole weeks', () => {
    expect(beg(draft({ arrivedAt: '2026-06-10', deadline: '2026-06-20' })))
      .toEqual(['143 Stellungnahmen', '10 Tage Frist, endete 20.06.2026'])
  })

  /* The duration is derived; the date is upstream's. Where the subtraction
     cannot be made the row keeps exactly what it always said. */
  it('drops the duration rather than guessing it', () => {
    expect(beg(draft({ arrivedAt: null as unknown as string, deadline: '2026-06-24' })))
      .toEqual(['143 Stellungnahmen', 'Frist endete 24.06.2026'])
    expect(beg(draft({ deadline: null })))
      .toEqual(['143 Stellungnahmen', 'keine Frist angegeben'])
  })
})

describe('procedureStatusDe — the card\'s one-line answer', () => {
  it('names the end of the chain where it was reached', () => {
    expect(procedureStatusDe(draft())).toBe('Gesetz geworden')
  })

  it('separates "still in parliament" from "the period ended without a vote"', () => {
    const noBgbl = { ...draft().enactment!, bgblNumber: null }
    expect(procedureStatusDe(draft({ enactment: noBgbl, gpEnded: false })))
      .toBe('Im Parlament')
    expect(procedureStatusDe(draft({ enactment: noBgbl, gpEnded: true })))
      .toBe('Ohne Beschluss – Gesetzgebungsperiode beendet')
  })

  it('is temporal, never a verdict, while no Regierungsvorlage exists', () => {
    expect(procedureStatusDe(draft({ enactment: null, active: true, gpEnded: false })))
      .toBe('In Begutachtung')
    expect(procedureStatusDe(draft({ enactment: null, active: false, gpEnded: false })))
      .toBe('Bisher keine Regierungsvorlage')
    expect(procedureStatusDe(draft({ enactment: null, active: false, gpEnded: true })))
      .toBe('Ohne Regierungsvorlage – Gesetzgebungsperiode beendet')
  })
})
