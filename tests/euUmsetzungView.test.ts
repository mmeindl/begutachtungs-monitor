import { describe, expect, it } from 'vitest'
import { euUmsetzungView } from '../app/utils/euUmsetzung'
import { euRailView } from '../app/utils/euRail'
import type { EuActResponse, EuNationalMeasure, EuUmsetzungResponse, EuUmsetzungRow } from '../shared/types/eu'

/* The list of directives to transpose and the measures on a directive's
 * page: two observations, each with its own „unknown", never a verdict. */

const row = (over: Partial<EuUmsetzungRow>): EuUmsetzungRow => ({
  celex: '32024L1069',
  title: 'Richtlinie (EU) 2024/1069 des Europäischen Parlaments und des Rates vom 11. April 2024 über den Schutz von Personen',
  form: 'richtlinie',
  deadline: '2026-05-07',
  otherDates: [],
  label: 'Richtlinie (EU) 2024/1069',
  path: '/eu-recht/richtlinie/2024/1069',
  drafts: { bund: 1, laender: 0 },
  measures: 0,
  ...over,
})
const response = (rows: EuUmsetzungRow[] | null): EuUmsetzungResponse => ({
  country: 'AUT',
  window: { from: '2024-11-15', to: '2028-11-15' },
  rows,
  draftsWindow: { from: '2024-10-24', to: null },
  incomplete: [],
})
const TODAY = '2026-11-15'

describe('euUmsetzungView', () => {
  it('splits by the deadline and orders by it: the next first, the most recently passed first', () => {
    const v = euUmsetzungView(response([
      row({ celex: 'a', deadline: '2025-01-01' }),
      row({ celex: 'b', deadline: '2026-05-07' }),
      row({ celex: 'c', deadline: '2026-11-15' }),
      row({ celex: 'd', deadline: '2028-07-26' }),
    ]), TODAY)
    expect(v.tabs!.laufend.map((r) => r.key)).toEqual(['c', 'd'])
    expect(v.tabs!.abgelaufen.map((r) => r.key)).toEqual(['b', 'a'])
    expect(v.heading).toBe('Richtlinien, die Österreich umzusetzen hat')
    expect(v.lede).toContain('zwischen 15.11.2024 und 15.11.2028')
  })

  it('says each observation in a sentence of its own', () => {
    const one = (over: Partial<EuUmsetzungRow>) => euUmsetzungView(response([row(over)]), TODAY).tabs!.abgelaufen[0]!
    expect(one({}).observations).toEqual(['Im Monitor: 1 Entwurf des Bundes.', 'Österreich hat der Kommission bisher keine Maßnahme gemeldet.'])
    expect(one({ drafts: { bund: 2, laender: 3 }, measures: 118 }).observations).toEqual(['Im Monitor: 2 Entwürfe des Bundes und 3 Entwürfe der Länder.', 'Österreich hat der Kommission 118 Maßnahmen gemeldet.'])
    expect(one({ drafts: { bund: 0, laender: 0 }, measures: 1 }).observations).toEqual(['Der Monitor hat keinen Entwurf gefunden.', 'Österreich hat der Kommission 1 Maßnahme gemeldet.'])
  })

  it('keeps „unknown" apart from „none"', () => {
    const r = euUmsetzungView(response([row({ drafts: null, measures: null })]), TODAY).tabs!.abgelaufen[0]!
    expect(r.observations).toEqual(['Die Entwürfe sind noch nicht gelesen.', 'Die Meldungen an die Kommission konnten nicht gelesen werden.'])
    expect(euUmsetzungView(response(null), TODAY)).toMatchObject({ tabs: null, commissionCount: 0 })
  })

  it('marks the Commission\'s directives and counts them for the chip', () => {
    const v = euUmsetzungView(response([row({ celex: 'a', form: 'delegierte-richtlinie' }), row({ celex: 'b', form: 'durchfuehrungsrichtlinie' }), row({ celex: 'c' }), row({ celex: 'd', form: null })]), TODAY)
    expect(v.commissionCount).toBe(2)
    expect(v.tabs!.abgelaufen.map((r) => [r.key, r.commission])).toEqual([['d', false], ['c', false], ['b', true], ['a', true]])
  })

  it('shows the deadline as a date on every row, grey, and never a verdict (rule D6)', () => {
    const v = euUmsetzungView(response([row({}), row({ celex: 'x', deadline: '2028-01-01', drafts: { bund: 0, laender: 0 } })]), TODAY)
    const all = [...v.tabs!.laufend, ...v.tabs!.abgelaufen]
    expect(all.map((r) => r.state)).toEqual([
      { label: 'Umsetzungsfrist', detail: 'bis 01.01.2028', tone: 'inactive', actionable: false },
      { label: 'Umsetzungsfrist', detail: 'bis 07.05.2026', tone: 'inactive', actionable: false },
    ])
    for (const s of all.flatMap((r) => [...r.observations, r.state.label, r.state.detail ?? ''])) {
      expect(s).not.toMatch(/überfällig|verspätet|säumig|nicht umgesetzt|\bumgesetzt\b|offen|Tage|Monate/i)
    }
  })
})

describe('the measures on a directive\'s page', () => {
  const measure = (over: Partial<EuNationalMeasure>): EuNationalMeasure => ({
    title: 'Bundesgesetz über die Vergabe von Aufträgen (Bundesvergabegesetz 2018)',
    kind: 'Bundesgesetz',
    notified: '2026-01-19',
    gazette: { name: 'Bundesgesetzblatt', number: 'BGBl. I Nr. 65/2018', date: '2018-08-20' },
    url: 'https://www.ris.bka.gv.at/Dokumente/BgblAuth/BGBLA_2018_I_65',
    ...over,
  })
  const act = (over: Partial<EuActResponse>): EuActResponse => ({
    gp: 'XXVIII',
    window: { from: '2024-10-24', to: null },
    builtAt: '2026-11-15T20:00:00Z',
    act: { celex: '32024L1760', kind: 'richtlinie', label: 'Richtlinie (EU) 2024/1760', eurLexUrl: 'https://eur-lex.europa.eu/eli/dir/2024/1760/oj/deu', path: '/eu-recht/richtlinie/2024/1760', adopted: '2024-06-13', title: null, transposition: { deadline: '2028-07-26', otherDates: [] } },
    implementing: [],
    restating: [],
    landsWithout: [],
    measures: [measure({}), measure({ title: null, kind: 'Landesgesetz', notified: null, gazette: { name: null, number: null, date: null }, url: null })],
    memberState: 'AUT',
    oj: null,
    eli: null,
    rail: null,
    incomplete: [],
    ...over,
  })
  const section = (r: EuActResponse) => euRailView(r, TODAY).sections.find((s) => s.id === 'wirkung')!
  const said = (r: EuActResponse) => section(r).facts.map((f) => `${f.title}: ${f.parts.join(', ')}`)

  it('states the count as a fact and lists the measures as the folded record', () => {
    const s = section(act({}))
    expect(said(act({}))).toEqual(['Umsetzungsfrist: 26.07.2028', 'Der Kommission gemeldet: 2 Maßnahmen'])
    expect(s.record).toMatchObject({ heading: 'Gemeldete Maßnahmen (2), nach dem Tag der Meldung' })
    expect(s.record!.rows[0]).toEqual({
      date: '19.01.2026',
      iso: '2026-01-19',
      label: 'Bundesgesetz über die Vergabe von Aufträgen (Bundesvergabegesetz 2018)',
      detail: 'Bundesgesetz · BGBl. I Nr. 65/2018 vom 20.08.2018',
      href: 'https://www.ris.bka.gv.at/Dokumente/BgblAuth/BGBLA_2018_I_65',
    })
    expect(s.record!.rows[1]).toEqual({ date: '–', iso: '', label: 'Maßnahme ohne Titel', detail: 'Landesgesetz', href: null })
    // What a notification is, under the list — and no word that it transposes.
    expect(s.record!.note).toContain('Ob die Richtlinie damit vollständig umgesetzt ist, steht in diesen Daten nicht.')
  })

  it('tells nothing notified from notifications that could not be read', () => {
    expect(said(act({ measures: [] }))[1]).toBe('Der Kommission gemeldet: Österreich hat der Kommission bisher keine Maßnahme gemeldet.')
    expect(section(act({ measures: [] })).record).toBeNull()
    expect(said(act({ measures: null }))[1]).toBe('Der Kommission gemeldet: Die Meldungen an die Kommission konnten nicht gelesen werden.')
  })

  it('says nothing about notifications for an act that is no directive', () => {
    const reg = act({ act: { ...act({}).act, kind: 'verordnung', transposition: null }, measures: null, memberState: null })
    expect(said(reg).some((l) => l.startsWith('Der Kommission gemeldet'))).toBe(false)
  })
})
