import { describe, expect, it } from 'vitest'
import type { AmendedLawsResponse, BundesrechtFinding, EuRechtResponse } from '../shared/types'
import { entwurfFrameCredits, entwurfFrameView } from '../app/utils/entwurfFrame'

const act = { kind: 'richtlinie' as const, label: 'Richtlinie (EU) 2024/1069', celex: '32024L1069', eurLexUrl: 'https://eur-lex.europa.eu', isNew: true, base: false, transposition: { deadline: '2026-05-07', otherDates: [] }, adopted: null, title: null }
const eu = (acts = [act]): EuRechtResponse => ({ available: true, unavailableReason: null, marker: 'umsetzung', markerSource: 'vorblatt', vorblattSentence: null, acts, actsSource: 'gesetzestext', begutachtungStart: '2026-01-01', sources: [{ label: 'Erläuterungen', url: 'https://land/erl.pdf' }] })
const finding = (over: Partial<BundesrechtFinding>): BundesrechtFinding => ({ kind: 'grundsatzgesetz', name: null, bgbl: null, partial: false, path: null, kundmachung: null, risUrl: null, ...over })
const laws = { createsNewLaw: false, laws: [{ title: 'ASVG' }], asOf: '2026-01-01' } as unknown as AmendedLawsResponse

describe('the opening frame of „Der Entwurf"', () => {
  it('has rows in the order of the Entwurf station: Ändert, the EU marker, Führt aus, Setzt um', () => {
    const v = entwurfFrameView({
      laws,
      eu: eu(),
      bundesrecht: { findings: [finding({ name: 'Anstellungserfordernisse-Grundsatzgesetz', bgbl: { number: 44, year: 2025 }, risUrl: 'https://ris' }), finding({ kind: 'vereinbarung', name: 'über Sozialbetreuungsberufe' })], sources: [] },
    })
    expect(v.facts.map((f) => f.title)).toEqual(['Ändert', 'Setzt EU-Recht um', 'Führt aus', 'Setzt um'])
  })

  it('has no EU row without a named act and no Bund row without a named one', () => {
    expect(entwurfFrameView({ eu: eu([]), bundesrecht: { findings: [finding({})], sources: [] } }).facts).toEqual([])
  })

  it('names every source once in one line: RIS on a Bund draft, the Land\'s documents on a Land\'s', () => {
    const bund = { eu: { ...eu(), sources: [] }, laws }
    const c = entwurfFrameCredits(bund, entwurfFrameView(bund))
    expect(c.items).toEqual(['Geltende Fassung, Vorblatt und Gesetzestext (RIS)', 'Fristen (EUR-Lex)'])
    expect(c.asOf).toBe('2026-01-01')
    const land = { eu: eu(), bundesrecht: { findings: [finding({ name: 'X-Grundsatzgesetz', bgbl: { number: 1, year: 2025 }, risUrl: 'https://ris' })], sources: [{ label: 'Erläuterungen', url: 'https://land/erl.pdf' }] }, publisher: 'Land Tirol' }
    const l = entwurfFrameCredits(land, entwurfFrameView(land))
    expect(l.items).toEqual(['Bundesgesetzblatt (RIS)', 'Fristen (EUR-Lex)'])
    expect(l.landDocs).toEqual([{ label: 'Erläuterungen', url: 'https://land/erl.pdf' }])
    expect(l.landPublisher).toBe('Land Tirol')
  })
})
