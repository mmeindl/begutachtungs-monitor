import { describe, expect, it } from 'vitest'
import type { AmendedLawsResponse, BundesrechtFinding, EuRechtResponse } from '../shared/types'
import { entwurfFrameCredits, entwurfFrameView, NEW_LAW_DE, newLawText } from '../app/utils/entwurfFrame'

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

  it('says the laws in force could not be read instead of dropping the row (14.11.2026)', () => {
    const unread = (u: 'no-text' | 'unnamed') => ({ createsNewLaw: false, laws: [], asOf: '2020-02-14', unread: u }) as unknown as AmendedLawsResponse
    const v = entwurfFrameView({ laws: unread('unnamed') })
    expect(v.facts).toEqual([{ key: 'recht-offen', title: 'Geltendes Recht', text: 'Nicht lesbar: Welche Gesetze der Entwurf ändert, ließ sich aus seinem Text nicht lesen.' }])
    expect(entwurfFrameView({ laws: unread('no-text') }).facts[0]!.text).toMatch(/^Nicht lesbar: Der Monitor fand keinen Gesetzestext/)
    // No RIS Fassung is linked, so none is credited.
    expect(entwurfFrameCredits({ laws: unread('unnamed') }, v)).toMatchObject({ items: [], asOf: null })
  })

  it('links a new law\'s Gesetzestext in „Neues Gesetz", PDF first, and credits Parliament (20.11.2026)', () => {
    const neu = { createsNewLaw: true, laws: [], asOf: '2026-01-01', unread: null } as unknown as AmendedLawsResponse
    const documents = [
      { title: 'Kurzinformation', formats: [{ type: 'pdf' as const, url: 'https://www.parlament.gv.at/k.pdf' }] },
      { title: 'Gesetzestext', formats: [{ type: 'html' as const, url: 'https://www.parlament.gv.at/g.html' }, { type: 'pdf' as const, url: 'https://www.parlament.gv.at/g.pdf' }] },
    ]
    const input = { laws: neu, documents, citeAs: 'Ministerialentwurf 120/ME XXVIII. GP' }
    const v = entwurfFrameView(input)
    expect(v.facts).toEqual([{ key: 'neu', title: 'Neues Gesetz', text: NEW_LAW_DE }])
    expect(v.newLaw).toEqual({ title: 'Gesetzestext', url: 'https://www.parlament.gv.at/g.pdf', format: 'PDF', cite: 'Gesetzestext zu Ministerialentwurf 120/ME XXVIII. GP, https://www.parlament.gv.at/g.pdf' })
    expect(entwurfFrameCredits(input, v)).toMatchObject({ items: ['Gesetzestext (Parlament)'], asOf: null })
  })

  it('keeps „Neues Gesetz" in words where no Gesetzestext can be linked, and links none on an amending draft', () => {
    const neu = { createsNewLaw: true, laws: [], asOf: '2026-01-01', unread: null } as unknown as AmendedLawsResponse
    const antrag = [{ title: 'Antrag', formats: [{ type: 'pdf' as const, url: 'https://www.parlament.gv.at/a.pdf' }] }]
    expect(entwurfFrameView({ laws: neu, documents: antrag })).toMatchObject({ facts: [{ key: 'neu', text: NEW_LAW_DE }], newLaw: null })
    const unsafe = [{ title: 'Gesetzestext', formats: [{ type: 'pdf' as const, url: 'javascript:alert(1)' }] }]
    expect(entwurfFrameView({ laws: neu, documents: unsafe }).newLaw).toBeNull()
    expect(newLawText([{ title: 'Gesetzestext', formats: [{ type: 'html' as const, url: 'https://www.parlament.gv.at/g.html' }] }])).toMatchObject({ format: 'HTML', cite: null })
    const gesetz = [{ title: 'Gesetzestext', formats: [{ type: 'pdf' as const, url: 'https://www.parlament.gv.at/g.pdf' }] }]
    expect(entwurfFrameView({ laws, documents: gesetz }).newLaw).toBeNull()
  })
})
