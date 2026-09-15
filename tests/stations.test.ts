import { describe, expect, it } from 'vitest'
import type { DraftDetail } from '../shared/types'
import { formatNumberDe } from '../shared/utils/format'
import { stations } from '../shared/utils/stations'

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
    },
    ...overrides,
  } as unknown as DraftDetail
}

const rvRow = (d: DraftDetail, ctx?: Parameters<typeof stations>[1]) =>
  stations(d, ctx).find((s) => s.id === 'rv')!

describe('stations — the Regierungsvorlage row', () => {
  it('adds the Vorlage\'s own Stellungnahmen after its date, phrased "zur Vorlage"', () => {
    expect(rvRow(draft(), { rvStatementTotal: 10 }).facts).toEqual(['04.10.2023', '10 Stellungnahmen zur Vorlage'])
    expect(rvRow(draft(), { rvStatementTotal: 1 }).facts).toEqual(['04.10.2023', '1 Stellungnahme zur Vorlage'])
  })

  it('says nothing about them while unknown or when there are none', () => {
    expect(rvRow(draft()).facts).toEqual(['04.10.2023'])
    expect(rvRow(draft(), { rvStatementTotal: 0 }).facts).toEqual(['04.10.2023'])
    expect(rvRow(draft(), { rvStatementTotal: null }).facts).toEqual(['04.10.2023'])
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
})
