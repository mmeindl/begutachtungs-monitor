import { describe, expect, it } from 'vitest'
import { deadlineActs, euFactView } from '../app/utils/euRecht'
import type { EuActView, EuRechtResponse } from '../shared/types/eu'

/* The ProcedureCard's EU line as words (§12.66): two dates, no verdict. */
describe('euFactView — two dates, no verdict', () => {
  const act = (over: Partial<EuActView>): EuActView => ({
    kind: 'richtlinie',
    label: 'Richtlinie (EU) 2024/1069',
    celex: '32024L1069',
    eurLexUrl: 'https://eur-lex.europa.eu/eli/dir/2024/1069/oj/deu',
    isNew: true,
    base: false,
    transposition: { deadline: '2026-05-07', otherDates: [] },
    ...over,
  })
  const response = (over: Partial<EuRechtResponse>): EuRechtResponse => ({
    available: true,
    unavailableReason: null,
    marker: 'umsetzung',
    markerSource: 'vorblatt',
    vorblattSentence: null,
    acts: [act({})],
    actsSource: 'gesetzestext',
    begutachtungStart: '2026-10-21',
    sources: [],
    ...over,
  })

  it('states the deadline and the start as two dated facts, without a tense', () => {
    const v = euFactView(response({}))
    expect(v).toMatchObject({
      lead: 'Setzt EU-Recht um',
      attach: 'colon',
      deadlines: [{ of: null, date: '07.05.2026', otherDates: [] }],
      start: '21.10.2026',
      sourceLine: 'Vorblatt und Gesetzestext aus dem RIS, Fristen aus EUR-Lex',
    })
    expect(JSON.stringify(v)).not.toMatch(/\b(?:war|ist|begann)\b/)
  })

  it('carries no verdict in any word it builds', () => {
    const text = JSON.stringify(euFactView(response({ marker: 'ueber-umsetzung', vorblattSentence: 'Das Vorhaben geht über eine verpflichtende Umsetzung zwingender Vorschriften des Unionsrechtes hinaus' })))
    expect(text).not.toMatch(/verspätet|säumig|zu spät|Tage|Gold/i)
  })

  it('prints no deadline for an old act, a base text, or where the law in force could not be read', () => {
    for (const over of [{ isNew: false }, { isNew: null }, { base: true }] as Partial<EuActView>[]) {
      const v = euFactView(response({ acts: [act(over)] }))!
      expect(v.deadlines, JSON.stringify(over)).toEqual([])
      expect(v.start).toBeNull()
      expect(v.sourceLine).toBe('Vorblatt und Gesetzestext aus dem RIS')
    }
    expect(deadlineActs([act({ kind: 'verordnung', transposition: null })])).toEqual([])
  })

  it('names a deadline\'s act by its number only where the row carries several, with the further dates for the footnote', () => {
    const one = euFactView(response({ acts: [act({ label: 'Richtlinie (EU) 2018/2001', base: true }), act({ label: 'Richtlinie (EU) 2024/1711', transposition: { deadline: '2026-07-17', otherDates: ['2025-01-17'] } })] }))!
    expect(one.deadlines).toEqual([{ of: null, date: '17.07.2026', otherDates: ['17.01.2025'], label: 'Richtlinie (EU) 2024/1711' }])
    const two = euFactView(response({ acts: [act({}), act({ label: 'Richtlinie 2009/43/EG', celex: '32009L0043', transposition: { deadline: '2011-06-30', otherDates: [] } })] }))!
    expect(two.deadlines.map((d) => d.of)).toEqual(['2024/1069', '2009/43'])
  })

  it('quotes acts of another kind than the lead as named, not as what the lead says (81/ME)', () => {
    const v = euFactView(response({ marker: 'flankierend-vo', acts: [act({ label: 'Richtlinie 2009/43/EG', isNew: false })] }))!
    expect(v).toMatchObject({ lead: 'Begleitet EU-Verordnungen', attach: 'named', namedIn: 'Gesetzestext' })
  })

  it('shows nothing without a marker, and names no act on the Erläuterungen road', () => {
    expect(euFactView(response({ marker: null }))).toBeNull()
    expect(euFactView(response({ available: false }))).toBeNull()
    expect(euFactView(response({ markerSource: 'erlaeuterungen', acts: [], actsSource: null }))).toMatchObject({ attach: 'none', sourceLine: 'Erläuterungen aus dem RIS' })
  })
})
