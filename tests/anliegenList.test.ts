/**
 * Step 3 of `docs/research/umsetzungsplan-petitionen-volksbegehren.md`: the
 * list of Anliegen. The state decision (`anliegenStateOf`) shared by the
 * page's headline and the list's row, the row's words, the sort by the last
 * step, the count line, the empty states, and the words no row may carry.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { AnliegenDetail, AnliegenKind, AnliegenRow, AnliegenState } from '../shared/types'
import { anliegenStateOf } from '../shared/utils/anliegen'
import { assembleAnliegenDetail, lastStageDate, type AnliegenContent } from '../server/utils/parliament/anliegen'
import {
  anliegenArtOf,
  anliegenCountLineDe,
  anliegenEmptyDe,
  anliegenHeadline,
  anliegenRowStateDe,
  anliegenRowStateParts,
  anliegenRowView,
  anliegenStateDe,
  anliegenUnreadDe,
  filterAnliegenRows,
  sortAnliegenRows,
} from '../app/utils/anliegenView'

const FIXTURES: [name: string, kind: AnliegenKind][] = [
  ['XXVIII-BI-5', 'buergerinitiative'],
  ['XXVIII-BI-1', 'buergerinitiative'],
  ['XXVIII-PET-13', 'petition'],
  ['XXV-BI-1', 'buergerinitiative'],
  ['XXV-BI-12', 'buergerinitiative'],
  ['XXVIII-I-98', 'volksbegehren'],
  ['XXVIII-I-2', 'volksbegehren'],
]

function content(name: string): AnliegenContent {
  return (JSON.parse(readFileSync(new URL(`./fixtures/anliegen/${name}.json`, import.meta.url), 'utf8')) as { content: AnliegenContent }).content
}

function detail(name: string): AnliegenDetail {
  const kind = FIXTURES.find(([n]) => n === name)![1]
  const [gp, , nr] = name.split('-') as [string, string, string]
  return { ...assembleAnliegenDetail({ gp, kind, inr: Number(nr) }, content(name), { statements: 4, support: 997 }), periodEnded: gp !== 'XXVIII' }
}

/** The row the server builds for a fixture, from the same record read. */
function rowOf(name: string, extra: Partial<AnliegenRow> = {}): AnliegenRow {
  const d = detail(name)
  return {
    root: d.root,
    title: d.title,
    arrivedAt: d.course.arrivedAt,
    lastStepAt: lastStageDate(content(name).phase),
    state: anliegenStateOf(d.root, d.course, d.periodEnded),
    open: d.participation.statements === 'open',
    counts: d.counts,
    ...extra,
  }
}

function row(kind: AnliegenKind, inr: number, extra: Partial<AnliegenRow> = {}): AnliegenRow {
  return {
    root: { gp: 'XXVIII', kind, inr },
    title: `Titel ${inr}`,
    arrivedAt: '2025-01-01',
    lastStepAt: null,
    state: { kind: 'in-behandlung' },
    open: false,
    counts: { statements: null, support: null },
    ...extra,
  }
}

describe('anliegenStateOf — one decision for the headline and the row', () => {
  // The state decided for each recorded item words exactly as the page's headline.
  it('words every fixture’s state as the page headline says it', () => {
    for (const [name] of FIXTURES) {
      const d = detail(name)
      const state = anliegenStateOf(d.root, d.course, d.periodEnded)
      expect(anliegenStateDe(state), name).toBe(anliegenHeadline(d).text)
      expect(state.kind, name).toBe(anliegenHeadline(d).kind)
    }
  })

  // The states of the recorded items, with the data the words need.
  it('decides the recorded items’ states', () => {
    const state = (name: string) => { const d = detail(name); return anliegenStateOf(d.root, d.course, d.periodEnded) }
    expect(state('XXVIII-BI-5')).toEqual({ kind: 'kenntnisnahme-ausschuss', date: '2025-06-26' })
    expect(state('XXVIII-BI-1')).toEqual({ kind: 'weitergeleitet', committee: 'Bildungsausschuss', date: '2025-04-03' })
    expect(state('XXVIII-PET-13')).toEqual({ kind: 'in-behandlung' })
    expect(state('XXVIII-I-98')).toEqual({ kind: 'volksbegehren-kenntnisnahme', date: '2025-09-24' })
  })

  // A carried-over item names its successor as a root of the same kind.
  it('names the successor of a carried-over item', () => {
    const d = detail('XXVIII-BI-5')
    expect(anliegenStateOf(d.root, { ...d.course, carriedTo: { gp: 'XXIX', inr: 7 } }, false))
      .toEqual({ kind: 'uebernommen', successor: { gp: 'XXIX', kind: 'buergerinitiative', inr: 7 } })
  })
})

describe('the row’s words', () => {
  // Each state in the row's short words, with its own date or the last step's.
  it('words each state with the right date, short', () => {
    const at = (state: AnliegenState | null, lastStepAt: string | null = '2026-10-22') => anliegenRowStateDe({ state, lastStepAt })
    expect(at({ kind: 'in-behandlung' })).toBe('In Behandlung · zuletzt 22.10.2026')
    expect(at({ kind: 'kenntnisnahme-ausschuss', date: '2025-06-26' })).toBe('Im Ausschuss erledigt · 26.06.2025')
    expect(at({ kind: 'weitergeleitet', committee: 'Bildungsausschuss', date: '2025-04-03' })).toBe('Im Fachausschuss · 03.04.2025')
    expect(at({ kind: 'weitergeleitet', committee: 'Bildungsausschuss', date: null })).toBe('Im Fachausschuss · zuletzt 22.10.2026')
    expect(at({ kind: 'weitergeleitet-bericht', committee: 'Bildungsausschuss', report: '300 d.B.' })).toBe('Im Fachausschuss · zuletzt 22.10.2026')
    expect(at({ kind: 'volksbegehren-kenntnisnahme', date: '2025-09-24' })).toBe('Zur Kenntnis genommen · 24.09.2025')
    expect(at({ kind: 'bericht-zur-kenntnis', date: '2014-07-09' })).toBe('Bericht zur Kenntnis genommen · 09.07.2014')
    expect(at({ kind: 'ohne-erledigung-periode-beendet' })).toBe('Ohne Erledigung – GP beendet · zuletzt 22.10.2026')
    expect(at({ kind: 'uebernommen', successor: { gp: 'XXIX', kind: 'petition', inr: 3 } })).toBe('In die XXIX. GP übernommen · zuletzt 22.10.2026')
    expect(at({ kind: 'in-behandlung' }, null)).toBe('In Behandlung')
  })

  // A closed row's first line: the headline's words where they fit two lines.
  it('words a closed row’s state', () => {
    const closed = (state: AnliegenState) => anliegenRowStateParts({ state, lastStepAt: '2026-10-22' })
    expect(closed({ kind: 'bericht-zur-kenntnis', date: '2014-07-09' })).toEqual({ text: 'Bericht vom Nationalrat zur Kenntnis genommen', date: '09.07.2014' })
    expect(closed({ kind: 'weitergeleitet-bericht', committee: 'Bildungsausschuss', report: '300 d.B.' }))
      .toEqual({ text: 'An einen Fachausschuss weitergeleitet', date: 'dort Bericht 300 d.B.' })
    expect(closed({ kind: 'ohne-erledigung-periode-beendet' })).toEqual({ text: 'Ohne Erledigung – GP beendet', date: 'zuletzt 22.10.2026' })
  })

  // A record that did not arrive: the row says so, never a guess.
  it('says „Stand nicht gelesen" without a state', () => {
    expect(anliegenRowStateDe({ state: null, lastStepAt: null })).toBe('Stand nicht gelesen')
  })

  // The state in two parts for the Stand box: the words, and what dates them.
  it('splits the state into its words and its day', () => {
    expect(anliegenRowStateParts({ state: { kind: 'in-behandlung' }, lastStepAt: '2026-10-22' })).toEqual({ text: 'In Behandlung', date: 'zuletzt 22.10.2026' })
    expect(anliegenRowStateParts({ state: { kind: 'kenntnisnahme-ausschuss', date: '2025-06-26' }, lastStepAt: '2026-10-22' }))
      .toEqual({ text: 'Im Ausschuss zur Kenntnis genommen', date: '26.06.2025' })
    expect(anliegenRowStateParts({ state: null, lastStepAt: null })).toEqual({ text: 'Stand nicht gelesen', date: null })
  })

  // The open Petition, in the draft rows' anatomy: Kennung, two counts, the blue box.
  it('words an open Petition’s row (XXVIII/PET/13)', () => {
    expect(anliegenRowView(rowOf('XXVIII-PET-13'))).toEqual({
      key: 'petition-13',
      to: '/anliegen/XXVIII/petition/13',
      href: null,
      title: 'Koralmbahn-Ticket (Klimaticket Süd)',
      titleFull: null,
      kindLabel: 'Petition',
      citation: '13/PET',
      ministry: null,
      coMinistries: [],
      aliases: [],
      note: null,
      eu: null,
      newLabel: null,
      participation: { kind: 'count', count: 4 },
      secondCount: { value: { kind: 'count', count: 997 }, one: 'Unterstützung', many: 'Unterstützungen' },
      state: {
        label: 'Beteiligung möglich',
        detail: 'In Behandlung · zuletzt 22.10.2026',
        tone: 'neutral',
        actionable: true,
      },
    })
  })

  // A count not read is „nicht abrufbar" in its column, never 0; a real 0 stays 0.
  it('never turns a count that was not read into 0', () => {
    const v = anliegenRowView(row('petition', 1, { counts: { statements: null, support: null } }))
    expect(v.participation).toEqual({ kind: 'unavailable' })
    expect(v.secondCount?.value).toEqual({ kind: 'unavailable' })
    const z = anliegenRowView(row('petition', 1, { counts: { statements: 0, support: 12582 } }))
    expect(z.participation).toEqual({ kind: 'count', count: 0 })
    expect(z.secondCount?.value).toEqual({ kind: 'count', count: 12582 })
  })

  // Closed: the one grey box, the state on line 1 and its day on line 2.
  it('gives every closed state the same grey box', () => {
    const v = anliegenRowView(row('buergerinitiative', 2, { open: false, state: { kind: 'kenntnisnahme-ausschuss', date: '2025-06-26' } }))
    expect(v.state).toEqual({ label: 'Im Ausschuss zur Kenntnis genommen', detail: '26.06.2025', tone: 'inactive', actionable: false })
    const w = anliegenRowView(row('petition', 3, { open: false, state: { kind: 'weitergeleitet', committee: 'Bildungsausschuss', date: '2025-04-03' } }))
    expect(w.state).toEqual({ label: 'An einen Fachausschuss weitergeleitet', detail: '03.04.2025', tone: 'inactive', actionable: false })
    expect(anliegenRowView(row('petition', 4, { open: false, state: null, lastStepAt: null })).state)
      .toEqual({ label: 'Stand nicht gelesen', detail: null, tone: 'inactive', actionable: false })
  })

  // open === null: nothing blue, and the box says the participation was not read.
  it('never makes the box blue where the participation was not read', () => {
    const v = anliegenRowView(row('buergerinitiative', 2, { open: null, counts: { statements: null, support: null } }))
    expect(v.state.tone).toBe('inactive')
    expect(v.state.actionable).toBe(false)
    expect(v.state.label).toBe('Beteiligung nicht gelesen')
    expect(v.state.detail).toBe(anliegenRowStateDe(row('buergerinitiative', 2, { open: null })))
  })

  // A Volksbegehren: no Unterstützung possible, and its box says only what is possible.
  it('gives a Volksbegehren row no Unterstützungen', () => {
    const v = anliegenRowView(rowOf('XXVIII-I-98', { counts: { statements: 4, support: 30 }, open: true }))
    expect(v.secondCount?.value).toEqual({ kind: 'impossible' })
    expect(v.participation).toEqual({ kind: 'count', count: 4 })
    expect(v.state.label).toBe('Stellungnahme möglich')
    expect(v.state.tone).toBe('neutral')
    expect(`${v.kindLabel} ${v.citation}`).toBe('Volksbegehren 98 d.B.')
  })

  // No row says „einstimmig", a name or an addressee.
  it('keeps every row free of „einstimmig", names and addressees', () => {
    for (const [name] of FIXTURES) {
      const text = JSON.stringify(anliegenRowView(rowOf(name)))
      expect(text, name).not.toMatch(/einstimmig/i)
      expect(text, name).not.toContain('(gekürzt)')
      expect(text, name).not.toContain('Stellungnahme von')
      expect(text, name).not.toContain('überreicht')
      expect(text, name).not.toContain('Erstunterzeichner')
    }
  })
})

describe('sort, filter and the count line', () => {
  // Newest last step first; a row without one falls back to its arrival.
  it('sorts by the last step, falling back to the arrival', () => {
    const rows = [
      row('petition', 1, { lastStepAt: '2025-03-01' }),
      row('petition', 2, { lastStepAt: null, arrivedAt: '2025-06-01' }),
      row('petition', 3, { lastStepAt: '2026-01-01', state: { kind: 'kenntnisnahme-ausschuss', date: '2025-12-01' } }),
      row('petition', 4, { lastStepAt: null, arrivedAt: null }),
    ]
    expect(sortAnliegenRows(rows).map((r) => r.root.inr)).toEqual([3, 2, 1, 4])
  })

  // The toggle shows only rows whose window is known to be open.
  it('filters by kind and by a known open window', () => {
    const rows = [row('petition', 1, { open: true }), row('petition', 2, { open: null }), row('volksbegehren', 3, { open: true })]
    expect(filterAnliegenRows(rows, 'petition', true).map((r) => r.root.inr)).toEqual([1])
    expect(filterAnliegenRows(rows, 'alle', false).map((r) => r.root.inr)).toEqual([1, 2, 3])
  })

  // An ended period counts its items and says nothing of an open window.
  it('says nothing of open items in an ended period', () => {
    expect(anliegenCountLineDe('XXVII', [row('petition', 1), row('petition', 2)], 'alle', false, true)).toBe('2 in der XXVII. Gesetzgebungsperiode')
    expect(anliegenCountLineDe('XXVII', [row('petition', 1)], 'petition', false, true)).toBe('1 Petition in der XXVII. Gesetzgebungsperiode')
  })

  // „44 offen von 65 …" and „65 …, 44 davon offen".
  it('words the count line in both toggle positions', () => {
    const rows = [...Array.from({ length: 44 }, (_, i) => row('petition', i + 1, { open: true })), ...Array.from({ length: 21 }, (_, i) => row('buergerinitiative', i + 1))]
    expect(anliegenCountLineDe('XXVIII', rows, 'alle', true)).toBe('44 offen von 65 in der XXVIII. Gesetzgebungsperiode')
    expect(anliegenCountLineDe('XXVIII', rows, 'alle', false)).toBe('65 in der XXVIII. Gesetzgebungsperiode, 44 davon offen')
    expect(anliegenCountLineDe('XXVIII', rows, 'buergerinitiative', true)).toBe('0 offen von 21 Bürgerinitiativen in der XXVIII. Gesetzgebungsperiode')
  })

  // A failed kind is named and not counted; an unread participation is said.
  it('names a failed kind and never counts it as 0', () => {
    const rows = [row('petition', 1, { open: true }), row('volksbegehren', 2)]
    expect(anliegenCountLineDe('XXVIII', rows, 'alle', true)).toBe('1 offen von 2 in der XXVIII. Gesetzgebungsperiode')
    expect(anliegenUnreadDe(['buergerinitiative'], 'alle')).toEqual(['Bürgerinitiativen konnten nicht gelesen werden.'])
    expect(anliegenUnreadDe(['buergerinitiative'], 'petition')).toEqual([])
    expect(anliegenCountLineDe('XXVIII', [row('petition', 1, { open: null })], 'alle', true))
      .toBe('0 offen von 1 in der XXVIII. Gesetzgebungsperiode; bei 1 ist die Beteiligung nicht gelesen')
  })

  // Empty states say what was read; an unread participation claims no emptiness.
  it('says what an empty list means for each kind', () => {
    const closed = [row('petition', 1), row('buergerinitiative', 2), row('volksbegehren', 3)]
    expect(anliegenEmptyDe(closed, 'XXVIII', 'petition', true).title).toBe('Derzeit ist keine Petition offen.')
    expect(anliegenEmptyDe(closed, 'XXVIII', 'buergerinitiative', true).title).toBe('Derzeit ist keine Bürgerinitiative offen.')
    expect(anliegenEmptyDe(closed, 'XXVIII', 'volksbegehren', true)).toEqual({
      title: 'Derzeit liegt kein Volksbegehren im Nationalrat, zu dem eine Stellungnahme möglich ist.',
      note: 'Unterstützt und unterschrieben wird ein Volksbegehren, bevor es im Nationalrat einlangt; das verfolgt der Monitor nicht.',
    })
    expect(anliegenEmptyDe([row('petition', 1, { open: null })], 'XXVIII', 'petition', true).title)
      .toBe('Ob Unterstützung und Stellungnahme möglich sind, konnte gerade nicht gelesen werden.')
  })

  // An unknown `?art=` is „Alle", never an error.
  it('reads `?art=` and falls back to „Alle"', () => {
    expect(anliegenArtOf('volksbegehren')).toBe('volksbegehren')
    expect(anliegenArtOf('foo')).toBe('alle')
    expect(anliegenArtOf(undefined)).toBe('alle')
    expect(anliegenArtOf(['petition'])).toBe('petition')
  })
})
