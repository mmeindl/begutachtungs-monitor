import { describe, expect, it } from 'vitest'
import { dayOf, deadlineActs, euDotOf, euFactView, euLeadOf, euRelatedLines, euTimeline, laneBarOf } from '../app/utils/euRecht'
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
    title: null,
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

  it('names the act beside its date where the sentence names several, and numbers only the further dates for the footnote', () => {
    const one = euFactView(response({ acts: [act({ label: 'Richtlinie (EU) 2018/2001', base: true }), act({ label: 'Richtlinie (EU) 2024/1711', transposition: { deadline: '2026-07-17', otherDates: ['2025-01-17'] } })] }))!
    expect(one.deadlines).toEqual([{ date: '17.07.2026', iso: '2026-07-17', otherDates: ['17.01.2025'], note: 1, label: 'Richtlinie (EU) 2024/1711', number: '2024/1711' }])
    expect(one.notes).toEqual([{ number: 1, text: 'Weitere Fristen für einzelne Bestimmungen (2024/1711): 17.01.2025' }])
    // One act: its date needs no number.
    expect(euFactView(response({}))!.deadlines[0]!.number).toBeNull()
    const two = euFactView(response({ acts: [act({}), act({ label: 'Richtlinie 2009/43/EG', celex: '32009L0043', transposition: { deadline: '2011-06-30', otherDates: [] } })] }))!
    // The dated acts come first, in date order.
    expect(two.acts.map((a) => a.label)).toEqual(['Richtlinie 2009/43/EG', 'Richtlinie (EU) 2024/1069'])
    expect(two.deadlines.map((d) => [d.number, d.note])).toEqual([['2009/43', null], ['2024/1069', null]])
    expect(two.notes).toEqual([])
  })

  it('quotes acts of another kind than the lead as named, not as what the lead says (81/ME)', () => {
    const v = euFactView(response({ marker: 'flankierend-vo', acts: [act({ label: 'Richtlinie 2009/43/EG', isNew: false })] }))!
    expect(v).toMatchObject({ lead: 'Begleitet EU-Verordnungen', attach: 'named', namedIn: 'Im Gesetzestext' })
  })

  it('draws the draft as the one lane of a chart: the deadline over the line, the Begutachtung and the stand under it', () => {
    const ctx = { begutachtung: { start: '2026-10-21', end: '2026-11-10' }, stand: { date: '2026-11-04', label: 'Heute' } }
    const t = euTimeline(euFactView(response({})), ctx)!
    // Track 07.05.2026 → 10.11.2026, the first and last dates on its ends.
    const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000
    const at = (iso: string) => ((day(iso) - day('2026-05-07')) / (day('2026-11-10') - day('2026-05-07'))) * 100
    expect(t.deadlines).toEqual([{ key: 'frist-2026-05-07', at: 0, align: 'start', lines: ['Umsetzungsfrist', '07.05.2026'] }])
    expect(t.lanes).toHaveLength(1)
    const bar = t.lanes[0]!.bar
    expect(bar.band![0]).toBeCloseTo(at('2026-10-21'), 9)
    expect(bar.band![1]).toBe(100)
    // The ink line begins with the draft's Begutachtung, not with the deadline months before.
    expect(bar.from).toBeCloseTo(at('2026-10-21'), 9)
    expect(bar.value).toBeCloseTo(at('2026-11-04'), 9)
    expect(bar.dot).toBe('mark')
    expect(bar.ticks).toEqual([0])
    // The band lies in the right half: its label ends with it. The stand, days before the band's end, would meet it: a tier lower, on its own date.
    expect(bar.marks).toEqual([
      { key: 'begutachtung', at: 100, align: 'end', lines: ['Begutachtung', '21.10.–10.11.2026'] },
      { key: 'stand', at: at('2026-11-04'), align: 'end', lines: ['Heute', '04.11.2026'], tier: 1, narrowTier: 1 },
    ])
    expect(t.footnote).toBeNull()
    expect(euFactView(response({}))!.adoptedNote).toBe('beschlossen am 11.04.2024')
  })

  it('ends the track at the later of today and the deadline, and names the Kundmachung with its date where the procedure is over', () => {
    const ctx = { begutachtung: { start: '2026-10-22', end: '2026-11-05' }, stand: { date: '2026-11-04', label: 'Heute' } }
    const ahead = euTimeline(euFactView(response({ acts: [act({ transposition: { deadline: '2026-12-11', otherDates: [] } })] })), ctx)!
    expect(ahead.lanes[0]!.bar.ticks).toEqual([100])
    expect(ahead.deadlines[0]).toMatchObject({ at: 100, align: 'end' })
    // The band lies in the left half: its label starts with it.
    expect(ahead.lanes[0]!.bar.marks[0]).toMatchObject({ key: 'begutachtung', at: 0, align: 'start' })
    expect(ahead.lanes[0]!.bar.value).toBeLessThan(100)
    const over = euTimeline(euFactView(response({})), { begutachtung: { start: '2025-07-07', end: '2025-08-15' }, stand: { date: '2025-12-30', label: 'Bundesgesetzblatt' } })!
    const bar = over.lanes[0]!.bar
    expect(bar.marks.find((m) => m.key === 'stand')!.lines).toEqual(['Bundesgesetzblatt', '30.12.2025'])
    expect(bar.dot).toBe('ink')
    // The deadline lies after the Kundmachung: the tick ends the track, the dot stands before it.
    expect(bar.ticks).toEqual([100])
    expect(bar.value).toBeLessThan(100)
  })

  it('shares one label between deadlines that would overlap, one line per day with its acts, and carries the footnote mark', () => {
    const ctx = { begutachtung: { start: '2025-07-07', end: '2025-08-15' }, stand: { date: '2025-12-17', label: 'Beschluss' } }
    const three = euFactView(response({ acts: [
      act({ label: 'Richtlinie (EU) 2024/1711', celex: '32024L1711', transposition: { deadline: '2026-07-17', otherDates: ['2025-01-17'] } }),
      act({ label: 'Richtlinie (EU) 2024/1788', celex: '32024L1788', transposition: { deadline: '2026-08-05', otherDates: [] } }),
      act({ label: 'Richtlinie (EU) 2023/2413', celex: '32023L2413', transposition: { deadline: '2025-05-21', otherDates: [] } }),
    ] }))!
    const t = euTimeline(three, ctx)!
    expect(t.deadlines.map((m) => m.lines)).toEqual([
      ['Umsetzungsfrist', '2023/2413 bis 21.05.2025'],
      ['Umsetzungsfristen', '2024/1711 bis 17.07.2026¹', '2024/1788 bis 05.08.2026'],
    ])
    expect(t.deadlines[0]).toMatchObject({ at: 0, align: 'start' })
    expect(t.deadlines[1]!.align).toBe('end')
    // Every deadline keeps a tick of its own, on its own date.
    const ticks = t.lanes[0]!.bar.ticks
    expect(ticks[0]).toBe(0)
    expect(ticks[2]).toBe(100)
    expect(ticks).toHaveLength(3)
    expect(three.notes).toEqual([{ number: 1, text: 'Weitere Fristen für einzelne Bestimmungen (2024/1711): 17.01.2025' }])
  })

  it('names two directives due on one day in one line, and keeps the Begutachtung at its band (a Land draft, 04.11.2026)', () => {
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
    const cluster = t.deadlines.find((m) => m.lines[0] === 'Umsetzungsfristen')!
    expect(cluster.lines.slice(1)).toEqual(['2022/2041 bis 15.11.2024', '2023/970 bis 07.06.2026', '2024/1499, 2024/1500 bis 19.06.2026'])
    expect(cluster.align).toBe('end')
    expect(fact.notes).toEqual([])
    // Under the line: the band's label ends at the band, never pushed off it; the Landesgesetzblatt, weeks later, a tier lower.
    const bar = t.lanes[0]!.bar
    const band = bar.marks.find((m) => m.key === 'begutachtung')!
    expect(band).toMatchObject({ at: bar.band![1], align: 'end' })
    expect(bar.marks.find((m) => m.key === 'stand')).toMatchObject({ at: 100, align: 'end', tier: 1, lines: ['Landesgesetzblatt', '10.07.2026'] })
  })

  it('never lets two deadline labels meet: aligned away, else one label, at either width (58/ME, eight directives)', () => {
    const ctx = { begutachtung: { start: '2025-10-10', end: '2025-11-07' }, stand: { date: '2026-02-27', label: 'Bundesgesetzblatt' } }
    const due: [string, string][] = [['2019/633', '2021-11-01'], ['2022/2041', '2024-11-15'], ['2022/2381', '2024-12-28'], ['2023/2413', '2025-05-21'], ['2024/1203', '2026-05-21'], ['2023/970', '2026-06-07'], ['2024/1760', '2029-07-26']]
    const fact = euFactView(response({ acts: due.map(([n, d]) => act({ label: `Richtlinie (EU) ${n}`, celex: n, transposition: { deadline: d, otherDates: [] } })) }))!
    const t = euTimeline(fact, ctx)!
    for (const [marks, charPct] of [[t.deadlines, 1.1], [t.narrowDeadlines!, 2.1]] as const) {
      const spans = marks.map((m) => {
        const w = Math.max(...m.lines.map((l) => l.length)) * charPct
        return m.align === 'start' ? [m.at, m.at + w] : m.align === 'end' ? [m.at - w, m.at] : [m.at - w / 2, m.at + w / 2]
      })
      for (let i = 1; i < spans.length; i++) expect(spans[i - 1]![1] + 1, `${charPct}: ${marks[i]!.key}`).toBeLessThanOrEqual(spans[i]![0]!)
      // Every day is named once, in date order.
      expect(marks.flatMap((m) => m.lines.slice(1)).map((l) => l.split(' bis ')[0])).toEqual(due.map(([n]) => n))
    }
    // On a phone, more days share a label.
    expect(t.narrowDeadlines!.length).toBeLessThan(t.deadlines.length)
  })

  it('drops the stand a tier on a phone only, where the labels meet at its width alone (the act page, Oberösterreich)', () => {
    // A track of 07.10.2025 → 30.09.2026; the Begutachtung dated only by its end, the Landesgesetzblatt six weeks later.
    const at = (iso: string) => ((dayOf(iso) - dayOf('2025-10-07')) / (dayOf('2026-09-30') - dayOf('2025-10-07'))) * 100
    const bar = laneBarOf(at, { start: null, end: '2026-06-18' }, { date: '2026-07-30', label: 'Landesgesetzblatt' }, ['2026-06-07'])
    expect(bar.marks.map((m) => [m.key, m.align, m.tier, m.narrowTier])).toEqual([
      ['begutachtung', 'end', undefined, undefined],
      ['stand', 'center', undefined, 1],
    ])
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
      { celex: '32024L1069', path: '/eu-recht/richtlinie/2024/1069', phrase: 'Weitere Entwürfe zur Richtlinie (EU) 2024/1069', counts: '1 des Bundes · 3 der Länder' },
      { celex: '32023R1114', path: '/eu-recht/verordnung/2023/1114', phrase: 'Weitere Entwürfe zur Verordnung (EU) 2023/1114', counts: '2 der Länder' },
      { celex: '32022D2481', path: '/eu-recht/beschluss/2022/2481', phrase: 'Weitere Entwürfe zum Beschluss (EU) 2022/2481', counts: '2 des Bundes' },
      { celex: '32019R0980', path: '/eu-recht/verordnung/2019/980', phrase: 'Weitere Entwürfe zur Delegierten Verordnung (EU) 2019/980', counts: '1 des Bundes' },
    ])
    // Only the acts the caller shows: a folded act gets no line.
    expect(euRelatedLines(v.acts.slice(0, 1), related).map((l) => l.celex)).toEqual(['32024L1069'])
    expect(euRelatedLines(v.acts, undefined)).toEqual([])
  })

  it('fills the dot by the stand: yellow while it moves, ink once a Gesetzblatt fixed it', () => {
    expect(euDotOf('Heute')).toBe('mark')
    expect(euDotOf('Beschluss')).toBe('mark')
    expect(euDotOf('Bundesgesetzblatt')).toBe('ink')
    expect(euDotOf('Landesgesetzblatt')).toBe('ink')
  })

  it('gives the list row the fact\'s own lead words', () => {
    expect(euLeadOf('umsetzung')).toBe('Setzt EU-Recht um')
    expect(euLeadOf('ueber-umsetzung')).toBe('Setzt EU-Recht um')
    expect(euLeadOf('flankierend-vo')).toBe('Begleitet EU-Verordnungen')
    expect(euLeadOf(null)).toBeNull()
    expect(euLeadOf(undefined)).toBeNull()
  })
})
