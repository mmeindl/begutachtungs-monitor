import { describe, expect, it } from 'vitest'
import { deadlineActs, euFactView, euTimeline } from '../app/utils/euRecht'
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
    adopted: '2024-04-11',
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
      sources: [{ what: 'Vorblatt', publisher: 'ris', terms: 'cc-by' }, { what: 'Gesetzestext', publisher: 'ris', terms: 'cc-by' }, { what: 'Fristen', publisher: 'eurlex', terms: 'keine-lizenz' }],
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
      expect(v.sources.map((x) => x.publisher)).toEqual(['ris', 'ris'])
    }
    expect(deadlineActs([act({ kind: 'verordnung', transposition: null })])).toEqual([])
  })

  it('names a deadline\'s act by its number only where the row carries several, with the further dates for the footnote', () => {
    const one = euFactView(response({ acts: [act({ label: 'Richtlinie (EU) 2018/2001', base: true }), act({ label: 'Richtlinie (EU) 2024/1711', transposition: { deadline: '2026-07-17', otherDates: ['2025-01-17'] } })] }))!
    expect(one.deadlines).toEqual([{ of: null, date: '17.07.2026', iso: '2026-07-17', otherDates: ['17.01.2025'], note: 1, label: 'Richtlinie (EU) 2024/1711' }])
    const two = euFactView(response({ acts: [act({}), act({ label: 'Richtlinie 2009/43/EG', celex: '32009L0043', transposition: { deadline: '2011-06-30', otherDates: [] } })] }))!
    expect(two.deadlines.map((d) => d.of)).toEqual(['2009/43', '2024/1069'])
  })

  it('quotes acts of another kind than the lead as named, not as what the lead says (81/ME)', () => {
    const v = euFactView(response({ marker: 'flankierend-vo', acts: [act({ label: 'Richtlinie 2009/43/EG', isNew: false })] }))!
    expect(v).toMatchObject({ lead: 'Begleitet EU-Verordnungen', attach: 'named', namedIn: 'Gesetzestext' })
  })

  it('draws the dates that matter on one track, labelled as the Frist bar: term over date under each mark', () => {
    const ctx = { begutachtung: { start: '2026-10-21', end: '2026-11-10' }, stand: { date: '2026-11-04', label: 'Heute' } }
    const t = euTimeline(euFactView(response({})), ctx)!
    // Track 07.05.2026 → 10.11.2026, the first and last dates on its ends.
    const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000
    const at = (iso: string) => ((day(iso) - day('2026-05-07')) / (day('2026-11-10') - day('2026-05-07'))) * 100
    expect(t.band![0]).toBeCloseTo(at('2026-10-21'), 9)
    expect(t.band![1]).toBe(100)
    expect(t.value).toBeCloseTo(at('2026-11-04'), 9)
    expect(t.valueLabel).toBe('Heute')
    // The band lies in the right half: its label is anchored at its end and ends with it. The tick is a mark of its own.
    expect(t.marks).toEqual([
      { key: 'frist-2026-05-07', at: 0, align: 'start', tick: false, lines: ['Umsetzungsfrist', '07.05.2026'] },
      { key: 'begutachtung', at: 100, align: 'end', tick: false, lines: ['Begutachtung', '21.10.–10.11.2026'] },
      { key: 'tick-2026-05-07', at: 0, align: 'center', tick: true, lines: ['', ''] },
    ])
    expect(euFactView(response({}))!.adoptedNote).toBe('beschlossen am 11.04.2024')
  })

  it('ends the track at the later of today and the deadline, and names the Kundmachung where the procedure is over', () => {
    const ctx = { begutachtung: { start: '2026-10-22', end: '2026-11-05' }, stand: { date: '2026-11-04', label: 'Heute' } }
    const ahead = euTimeline(euFactView(response({ acts: [act({ transposition: { deadline: '2026-12-11', otherDates: [] } })] })), ctx)!
    expect(ahead.marks.find((m) => m.tick)).toMatchObject({ at: 100 })
    expect(ahead.marks.find((m) => m.lines[0] === 'Umsetzungsfrist')).toMatchObject({ at: 100, align: 'end' })
    // The band lies in the left half: its label starts with it.
    expect(ahead.marks.find((m) => !m.tick)).toMatchObject({ at: 0, align: 'start' })
    expect(ahead.value).toBeLessThan(100)
    const over = euTimeline(euFactView(response({})), { begutachtung: { start: '2025-07-07', end: '2025-08-15' }, stand: { date: '2025-12-30', label: 'Bundesgesetzblatt' } })!
    expect(over.valueLabel).toBe('Bundesgesetzblatt')
    // The deadline lies after the Kundmachung: the tick ends the track, the dot stands before it.
    expect(over.marks.find((m) => m.tick)!.at).toBe(100)
    expect(over.value).toBeLessThan(100)
  })

  it('shares one label between deadlines that would overlap, aligns neighbours away from each other, and carries the footnote mark', () => {
    const ctx = { begutachtung: { start: '2025-07-07', end: '2025-08-15' }, stand: { date: '2025-12-17', label: 'Beschluss' } }
    const three = euFactView(response({ acts: [
      act({ label: 'Richtlinie (EU) 2024/1711', celex: '32024L1711', transposition: { deadline: '2026-07-17', otherDates: ['2025-01-17'] } }),
      act({ label: 'Richtlinie (EU) 2024/1788', celex: '32024L1788', transposition: { deadline: '2026-08-05', otherDates: [] } }),
      act({ label: 'Richtlinie (EU) 2023/2413', celex: '32023L2413', transposition: { deadline: '2025-05-21', otherDates: [] } }),
    ] }))!
    const t = euTimeline(three, ctx)!
    const labelled = t.marks.filter((m) => m.lines[0])
    expect(labelled.map((m) => m.lines)).toEqual([
      ['Umsetzungsfrist', '21.05.2025'],
      ['Begutachtung', '07.07.–15.08.2025'],
      ['Umsetzungsfristen', '17.07.2026¹, 05.08.2026'],
    ])
    // The first label is pinned to the track's start and the band begins within 14 % of it: the band's label is pushed to start 14 % in.
    expect(labelled[0]).toMatchObject({ at: 0, align: 'start' })
    expect(labelled[1]).toMatchObject({ at: 14, align: 'start' })
    expect(labelled[2]!.align).toBe('end')
    // Every deadline keeps a tick of its own, on its own date.
    expect(t.marks.filter((m) => m.tick).map((m) => m.at)).toEqual([0, t.marks.filter((m) => m.tick)[1]!.at, 100])
    expect(three.deadlines.map((d) => d.note)).toEqual([null, 1, null])
  })

  it('draws nothing without a deadline act or where every date falls on one day, and notes the adoption only for a single act', () => {
    const ctx = { begutachtung: { start: '2026-10-21', end: '2026-11-10' }, stand: { date: '2026-11-04', label: 'Heute' } }
    expect(euTimeline(euFactView(response({ acts: [act({ isNew: false })] })), ctx)).toBeNull()
    expect(euTimeline(euFactView(response({ marker: null })), ctx)).toBeNull()
    expect(euTimeline(euFactView(response({})), { begutachtung: { start: '2026-05-07', end: null }, stand: { date: '2026-05-07', label: 'Heute' } })).toBeNull()
    const two = response({ acts: [act({}), act({ label: 'Richtlinie (EU) 2024/1711', celex: '32024L1711', adopted: '2024-06-13', transposition: { deadline: '2026-07-17', otherDates: [] } })] })
    expect(euFactView(two)!.adoptedNote).toBeNull()
    expect(euFactView(response({ acts: [act({ adopted: null })] }))!.adoptedNote).toBeNull()
  })

  it('shows nothing without a marker, and names no act on the Erläuterungen road', () => {
    expect(euFactView(response({ marker: null }))).toBeNull()
    expect(euFactView(response({ available: false }))).toBeNull()
    expect(euFactView(response({ markerSource: 'erlaeuterungen', acts: [], actsSource: null }))).toMatchObject({ attach: 'none', sources: [{ what: 'Erläuterungen', publisher: 'ris' }] })
  })
})
