import { describe, expect, it } from 'vitest'
import type { BgblLaw, BgblLawsResponse } from '../shared/types'
import { fassungFacts, fassungSources, listDe, NOT_CONSOLIDATED_YET } from '../app/utils/geltendeFassung'

const law = (title: string): BgblLaw => ({ title, gesetzesnummer: title, url: `https://www.ris.bka.gv.at/${encodeURIComponent(title)}` })
const repealed = (title: string) => ({ title, gesetzesnummer: title, stammnorm: null })
const answer = (over: Partial<BgblLawsResponse>): BgblLawsResponse => ({ bgbl: 'BGBl. I Nr. 131/2022', laws: [], ...over })

describe('fassungFacts', () => {
  it('says nothing while the answer is on its way or names no Bundesgesetzblatt', () => {
    expect(fassungFacts(null, 'Gesetze')).toEqual([])
    expect(fassungFacts(answer({ bgbl: null }), 'Gesetze')).toEqual([])
  })

  it('counts the laws it links, in the section’s noun', () => {
    expect(fassungFacts(answer({ laws: [law('Epidemiegesetz 1950')] }), 'Gesetze')).toEqual([{ key: 'fassung', title: 'Geltende Fassung' }])
    expect(fassungFacts(answer({ laws: [law('A'), law('B')] }), 'Verordnungen')).toEqual([{ key: 'fassung', title: 'Geltende Fassung, 2 Verordnungen' }])
  })

  it('waits for RIS where the Kundmachung is in it but no law is consolidated yet', () => {
    expect(fassungFacts(answer({}), 'Gesetze')).toEqual([{ key: 'fassung', title: 'Geltende Fassung', text: NOT_CONSOLIDATED_YET }])
  })

  it('names what a Kundmachung repealed whole, and does not wait for a consolidation that never comes', () => {
    // BGBl. I Nr. 131/2022 repealed the COVID-19-Impfpflichtgesetz and its two Verordnungen.
    const facts = fassungFacts(answer({ repealed: [repealed('COVID-19-Impfpflichtgesetz'), repealed('COVID-19-Impfpflichtverordnung'), repealed('COVID-19-Nichtanwendungsverordnung')] }), 'Gesetze')
    expect(facts).toEqual([{ key: 'aufgehoben', title: 'Aufgehoben', text: 'COVID-19-Impfpflichtgesetz, COVID-19-Impfpflichtverordnung und COVID-19-Nichtanwendungsverordnung.' }])
    expect(facts.some((f) => f.text === NOT_CONSOLIDATED_YET)).toBe(false)
  })

  it('shows both where it amended some laws and repealed others', () => {
    const facts = fassungFacts(answer({ laws: [law('Epidemiegesetz 1950')], repealed: [repealed('COVID-19-Impfpflichtgesetz')] }), 'Gesetze')
    expect(facts.map((f) => f.key)).toEqual(['fassung', 'aufgehoben'])
  })
})

describe('fassungSources', () => {
  it('credits RIS for what the section shows of it, and for nothing else', () => {
    expect(fassungSources(answer({}))).toEqual([])
    expect(fassungSources(answer({ laws: [law('A')] })).map((s) => s.what)).toEqual(['Geltende Fassung'])
    expect(fassungSources(answer({ repealed: [repealed('A')] })).map((s) => s.what)).toEqual(['Aufhebungen'])
    expect(fassungSources(answer({ laws: [law('A')], repealed: [repealed('B')] })).map((s) => s.what)).toEqual(['Geltende Fassung und Aufhebungen'])
  })
})

describe('listDe', () => {
  it('enumerates the German way', () => {
    expect(listDe([])).toBe('')
    expect(listDe(['A'])).toBe('A')
    expect(listDe(['A', 'B'])).toBe('A und B')
    expect(listDe(['A', 'B', 'C'])).toBe('A, B und C')
  })
})
