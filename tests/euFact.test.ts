import { describe, expect, it } from 'vitest'
import { deadlineActs, euFactView, euLeadOf, euRelatedLines, euTimeline } from '../app/utils/euRecht'
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
      deadlines: [{ date: '07.05.2026', otherDates: [] }],
      start: '21.10.2026',
      sources: [{ what: 'Vorblatt', publisher: 'ris', terms: 'cc-by' }, { what: 'Gesetzestext', publisher: 'ris', terms: 'cc-by' }, { what: 'Fristen', publisher: 'eurlex', terms: 'cc0' }],
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

  it('numbers the dated acts in the sentence as the bar numbers their days, with the further dates for the footnote', () => {
    const one = euFactView(response({ acts: [act({ label: 'Richtlinie (EU) 2018/2001', base: true }), act({ label: 'Richtlinie (EU) 2024/1711', transposition: { deadline: '2026-07-17', otherDates: ['2025-01-17'] } })] }))!
    expect(one.deadlines).toEqual([{ date: '17.07.2026', iso: '2026-07-17', otherDates: ['17.01.2025'], note: 1, label: 'Richtlinie (EU) 2024/1711' }])
    // One day: the footnote alone carries the number, the act none (the base text is not listed).
    expect(one.acts.map((a) => a.note)).toEqual([null])
    expect(one.notes).toEqual([{ number: 1, text: 'Weitere Fristen für einzelne Bestimmungen: 17.01.2025' }])
    const two = euFactView(response({ acts: [act({}), act({ label: 'Richtlinie 2009/43/EG', celex: '32009L0043', transposition: { deadline: '2011-06-30', otherDates: [] } })] }))!
    // Two days: the dated acts come first, in date order, numbered as their days are.
    expect(two.acts.map((a) => [a.label, a.note])).toEqual([['Richtlinie 2009/43/EG', 1], ['Richtlinie (EU) 2024/1069', 2]])
    expect(two.notes).toEqual([])
  })

  it('quotes acts of another kind than the lead as named, not as what the lead says (81/ME)', () => {
    const v = euFactView(response({ marker: 'flankierend-vo', acts: [act({ label: 'Richtlinie 2009/43/EG', isNew: false })] }))!
    expect(v).toMatchObject({ lead: 'Begleitet EU-Verordnungen', attach: 'named', namedIn: 'Im Gesetzestext' })
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
      ['Umsetzungsfrist', '21.05.2025¹'],
      ['Begutachtung', '07.07.–15.08.2025'],
      ['Umsetzungsfristen', '17.07.2026², 05.08.2026³'],
    ])
    // The first label is pinned to the track's start and the band begins within 14 % of it: the band's label is pushed to start past the first one's text („Umsetzungsfrist", 15 characters at 1,1 % each, and 1 % of air).
    expect(labelled[0]).toMatchObject({ at: 0, align: 'start' })
    expect(labelled[1]).toMatchObject({ at: 15 * 1.1 + 1, align: 'start' })
    expect(labelled[2]!.align).toBe('end')
    // Every deadline keeps a tick of its own, on its own date.
    expect(t.marks.filter((m) => m.tick).map((m) => m.at)).toEqual([0, t.marks.filter((m) => m.tick)[1]!.at, 100])
    // Several days: every day has a number, the same one stands at its act; only the further dates make a footnote.
    expect(three.deadlines.map((d) => d.note)).toEqual([1, 2, 3])
    expect(three.acts.map((a) => a.note)).toEqual([1, 2, 3])
    expect(three.notes).toEqual([{ number: 2, text: 'Weitere Fristen für einzelne Bestimmungen: 17.01.2025' }])
  })

  it('ends a wide cluster label before the band label pinned to the track end (a Land draft, 04.11.2026)', () => {
    // Oberösterreich 2026-16120: four deadlines from 2012 to 2026, the last three one label, the Begutachtung at the very end.
    const ctx = { begutachtung: { start: '2026-05-20', end: '2026-06-18' }, stand: { date: '2026-07-10', label: 'Landesgesetzblatt' } }
    const fact = euFactView(response({ acts: [
      act({ label: 'Richtlinie 2010/41/EU', celex: '32010L0041', transposition: { deadline: '2012-08-05', otherDates: [] } }),
      act({ label: 'Richtlinie (EU) 2022/2041', celex: '32022L2041', transposition: { deadline: '2024-11-15', otherDates: [] } }),
      act({ label: 'Richtlinie (EU) 2023/970', celex: '32023L0970', transposition: { deadline: '2026-06-07', otherDates: [] } }),
      act({ label: 'Richtlinie (EU) 2024/1499', celex: '32024L1499', transposition: { deadline: '2026-06-19', otherDates: [] } }),
      act({ label: 'Richtlinie (EU) 2024/1500', celex: '32024L1500', transposition: { deadline: '2026-06-19', otherDates: [] } }),
    ] }))!
    const t = euTimeline(fact, ctx)!
    const cluster = t.marks.find((m) => m.lines[0] === 'Umsetzungsfristen')!
    const band = t.marks.find((m) => m.key === 'begutachtung')!
    // Two directives due on one day share the date and its number; no footnote repeats the sentence.
    expect(cluster.lines[1]).toBe('15.11.2024², 07.06.2026³, 19.06.2026⁴')
    expect(fact.acts.map((a) => `${a.label}${a.note ?? ''}`)).toEqual(['Richtlinie 2010/41/EU1', 'Richtlinie (EU) 2022/20412', 'Richtlinie (EU) 2023/9703', 'Richtlinie (EU) 2024/14994', 'Richtlinie (EU) 2024/15004'])
    expect(fact.notes).toEqual([])
    expect(band).toMatchObject({ align: 'end' })
    // The cluster's text ends before the band label's text begins: 14 % apart was not enough for 34 characters.
    expect(cluster.align).toBe('end')
    expect(cluster.at).toBeLessThanOrEqual(band.at - '20.05.–18.06.2026'.length * 1.1 - 1)
    expect(cluster.at).toBeGreaterThan(50)
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

  /* The way to the EU map (§12.66, Nachtrag 3): one line per shown act that
   * other drafts implement too, each side only where it has any. */
  it('links the shown acts other drafts implement too, in the fact\'s own words, and leaves zero counts out', () => {
    const v = euFactView(response({ acts: [
      act({}),
      act({ kind: 'verordnung', label: 'Verordnung (EU) 2023/1114', celex: '32023R1114', transposition: null }),
      act({ kind: 'beschluss', label: 'Beschluss (EU) 2022/2481', celex: '32022D2481', transposition: null }),
      act({ kind: 'verordnung', label: 'Delegierte Verordnung (EU) 2019/980', celex: '32019R0980', transposition: null }),
      act({ label: 'Richtlinie 2009/43/EG', celex: '32009L0043', transposition: null }),
    ] }))!
    const related = [
      { celex: '32024L1069', path: '/eu-recht/richtlinie/2024/1069', others: { bund: 1, laender: 3 } },
      { celex: '32023R1114', path: '/eu-recht/verordnung/2023/1114', others: { bund: 0, laender: 2 } },
      { celex: '32022D2481', path: '/eu-recht/beschluss/2022/2481', others: { bund: 2, laender: 0 } },
      { celex: '32019R0980', path: '/eu-recht/verordnung/2019/980', others: { bund: 1, laender: 0 } },
      { celex: '32009L0043', path: '/eu-recht/richtlinie/2009/43', others: { bund: 0, laender: 0 } },
    ]
    expect(euRelatedLines(v.acts, related)).toEqual([
      { celex: '32024L1069', path: '/eu-recht/richtlinie/2024/1069', phrase: 'Weitere Entwürfe zur Richtlinie (EU) 2024/1069', counts: 'Bund 1 · Länder 3' },
      { celex: '32023R1114', path: '/eu-recht/verordnung/2023/1114', phrase: 'Weitere Entwürfe zur Verordnung (EU) 2023/1114', counts: 'Länder 2' },
      { celex: '32022D2481', path: '/eu-recht/beschluss/2022/2481', phrase: 'Weitere Entwürfe zum Beschluss (EU) 2022/2481', counts: 'Bund 2' },
      { celex: '32019R0980', path: '/eu-recht/verordnung/2019/980', phrase: 'Weitere Entwürfe zur Delegierten Verordnung (EU) 2019/980', counts: 'Bund 1' },
    ])
    // Only the acts the caller shows: a folded act gets no line.
    expect(euRelatedLines(v.acts.slice(0, 1), related).map((l) => l.celex)).toEqual(['32024L1069'])
    expect(euRelatedLines(v.acts, undefined)).toEqual([])
  })

  it('gives the list row the fact\'s own lead words', () => {
    expect(euLeadOf('umsetzung')).toBe('Setzt EU-Recht um')
    expect(euLeadOf('ueber-umsetzung')).toBe('Setzt EU-Recht um')
    expect(euLeadOf('flankierend-vo')).toBe('Begleitet EU-Verordnungen')
    expect(euLeadOf(null)).toBeNull()
    expect(euLeadOf(undefined)).toBeNull()
  })
})
