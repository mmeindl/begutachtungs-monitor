import { describe, expect, it } from 'vitest'
import type { AnliegenListResponse, AnliegenRow, EciOpenRow, EuBuergerinitiativenResponse, EuFensterResponse, EuOpenInitiative, OpenVorlage } from '../shared/types'
import { ANLIEGEN_PATH } from '../shared/utils/anliegen'
import { GAP_LEAD_DE } from '../shared/utils/gaps'
import { euPath } from '../shared/utils/eu'
import { anliegenCountLineDe, anliegenRowsInView } from '../app/utils/anliegenView'
import { EU_ECI_LIST_DE, euEciListView } from '../app/utils/euEciList'
import { EU_FENSTER_DE, euFensterView } from '../app/utils/euFenster'
import { WEGE_PATH, WEGE_STATE } from '../app/utils/wege'
import {
  DOORS,
  HOME_DE,
  anliegenDoorAnswer,
  doorFailedDe,
  homeDoorOf,
  doorStatus,
  eciDoorAnswer,
  fensterDoorAnswer,
  parlamentDoorAnswer,
} from '../app/utils/doors'

/* The homepage's doors (16.11.2026): what is open, said only once the
 * source answered, never as a zero for a failure, and the same number the
 * linked list states (docs/decisions.md, „The homepage"). */

const anliegenRow = (over: Partial<AnliegenRow> & { kind?: AnliegenRow['root']['kind']; inr?: number }): AnliegenRow => ({
  root: { gp: 'XXVIII', kind: over.kind ?? 'petition', inr: over.inr ?? 1 },
  title: 'Titel',
  arrivedAt: '2026-01-01',
  lastStepAt: '2026-02-01',
  state: null,
  open: true,
  counts: { statements: null, support: null },
  ...over,
})
const anliegenList = (rows: AnliegenRow[], over: Partial<AnliegenListResponse> = {}): AnliegenListResponse => ({
  gp: 'XXVIII',
  currentGp: 'XXVIII',
  rows,
  unread: { kinds: [] },
  bundesrat: { rows: [], unread: false },
  ...over,
})
const vorlage = (citation: string): OpenVorlage => ({
  kind: 'regierungsvorlage',
  citation,
  title: 'Titel',
  date: '2026-11-01',
  parliamentUrl: 'https://www.parlament.gv.at/gegenstand/XXVIII/I/1',
  statementCount: 0,
  consultation: { kind: 'unknown' },
})
const openWindow = (id: number): EuOpenInitiative => ({
  id, reference: null, actType: null, title: `Vorhaben ${id}`, titleIsGerman: true, topics: [],
  windows: [{ stage: 'PLANNING_WORKFLOW', start: '2026-11-01', end: '2026-12-31' }],
})
const fenster = (initiatives: EuOpenInitiative[] | null, cut: EuFensterResponse['cut'] = null): EuFensterResponse =>
  ({ initiatives, cut, portalUrl: 'https://ec.europa.eu/info/law/better-regulation/have-your-say_de' })
const eciRow = (number: number): EciOpenRow => ({ year: 2026, number, reference: `ECI(2026)00000${number}`, title: 'Titel', titleIsGerman: true, status: 'ONGOING', supporters: 10, updated: null, deadline: '2027-01-01', details: 'gelesen' })
const eci = (initiatives: EciOpenRow[] | null): EuBuergerinitiativenResponse => ({ initiatives, counts: null, registerUrl: 'https://citizens-initiative.europa.eu/_de' })

describe('the doors as data', () => {
  it('are tagged with their jurisdiction, the country\'s first, then the EU\'s', () => {
    expect(DOORS.map((d) => [d.id, d.jurisdiction])).toEqual([
      ['begutachtung', WEGE_STATE],
      ['parlament', WEGE_STATE],
      ['anliegen', WEGE_STATE],
      ['eu-rueckmeldung', 'eu'],
      ['eu-buergerinitiative', 'eu'],
    ])
  })

  it('expand the first door only', () => {
    expect(DOORS.filter((d) => d.expanded).map((d) => d.id)).toEqual(['begutachtung'])
  })

  it('lead to the lists that state the same set', () => {
    expect(homeDoorOf('begutachtung').href).toBe('/entwuerfe?status=open&station=begutachtung')
    expect(homeDoorOf('parlament').href).toBe('/entwuerfe?status=open&station=parlament')
    expect(homeDoorOf('anliegen').href).toBe(ANLIEGEN_PATH)
    expect(homeDoorOf('eu-rueckmeldung').href).toBe(`${euPath()}#eu-fenster`)
    expect(homeDoorOf('eu-buergerinitiative').href).toBe(`${euPath()}#eu-buergerinitiativen`)
    expect(HOME_DE.wegeLink.href).toBe(WEGE_PATH)
  })

  it('write no host name: every address is a path of this site', () => {
    for (const d of DOORS) expect(d.href.startsWith('/'), d.id).toBe(true)
  })

  it('open the lede with where, then who may, then what follows', () => {
    expect(HOME_DE.lede).toEqual([
      'Bei Gesetzen von Bund, Ländern und EU: wo Sie jetzt mitreden können.',
      'Eine Stellungnahme abgeben kann jede und jeder, ohne Organisation, juristische Ausbildung oder bestimmte Form.',
      'Und was danach aus jedem Entwurf wurde – Regierungsvorlage, Beschluss, Gesetzblatt –, soweit Bund und Länder es veröffentlichen.',
    ])
  })

  it('keep the product name at the head of the title', () => {
    expect(HOME_DE.title.startsWith('Begutachtungs-Monitor')).toBe(true)
    expect(HOME_DE.ogTitle.startsWith('Begutachtungs-Monitor')).toBe(true)
  })

  it('spell „Paragraph", never „Paragraf"', () => {
    expect(JSON.stringify({ DOORS, HOME_DE })).not.toMatch(/Paragraf/)
  })
})

describe('a door\'s status', () => {
  const door = homeDoorOf('eu-rueckmeldung')

  it('says it is on its way while the block is, never a zero', () => {
    expect(doorStatus(door, 'loading', null)).toEqual({ kind: 'loading', text: 'Die offenen Fristen der Kommission werden noch geladen.' })
  })

  it('says a failure as a gap sentence with the lead word', () => {
    const s = doorStatus(door, 'failed', null)
    expect(s).toEqual({ kind: 'failed', text: `${GAP_LEAD_DE.unavailable}: die offenen Fristen der Kommission.` })
  })

  it('reads an answer that says the source could not be read as a failure', () => {
    expect(doorStatus(door, 'ready', 'unread').kind).toBe('failed')
  })

  it('drops the clause\'s comma in the gap sentence', () => {
    expect(doorFailedDe(homeDoorOf('parlament'))).toBe(`${GAP_LEAD_DE.unavailable}: die Vorlagen, zu denen Stellung genommen werden kann.`)
    expect(doorStatus(homeDoorOf('parlament'), 'loading', null)).toEqual({
      kind: 'loading',
      text: 'Die Vorlagen, zu denen Stellung genommen werden kann, werden noch geladen.',
    })
  })
})

describe('Stellung nehmen im Parlament', () => {
  it('says „Derzeit möglich" where some are open, without a figure: the list behind it prints none for the set', () => {
    expect(parlamentDoorAnswer({ items: [vorlage('1 d.B.'), vorlage('2 d.B.')] })).toEqual({ text: 'Derzeit möglich', notes: [] })
  })

  it('says a true zero in words', () => {
    expect(parlamentDoorAnswer({ items: [] })).toEqual({ text: 'Derzeit zu keiner Vorlage möglich', notes: [] })
  })
})

describe('Anliegen an das Parlament', () => {
  it('counts what the list\'s count line counts as „offen", the Petitionen an den Bundesrat of the period included', () => {
    const data = anliegenList(
      [anliegenRow({ inr: 1 }), anliegenRow({ inr: 2, open: false }), anliegenRow({ inr: 3, kind: 'volksbegehren' })],
      { bundesrat: { rows: [anliegenRow({ inr: 9, kind: 'petition-bundesrat', root: { gp: 'BR', kind: 'petition-bundesrat', inr: 9 }, arrivedAt: '2025-01-10' })], unread: false } },
    )
    const answer = anliegenDoorAnswer(data)
    expect(answer).toEqual({ text: '3 offen', notes: [] })
    // The list's own line on arrival: „Alle", „Nur offene".
    expect(anliegenCountLineDe(data.gp, anliegenRowsInView(data, 'alle'), 'alle', true)).toMatch(/^3 offen von 4 /)
  })

  it('says a true zero in words, and only then', () => {
    expect(anliegenDoorAnswer(anliegenList([anliegenRow({ open: false })]))).toEqual({ text: 'Derzeit kein Anliegen offen', notes: [] })
  })

  it('claims no zero while a kind could not be read, and names it as the list does', () => {
    const answer = anliegenDoorAnswer(anliegenList([], { unread: { kinds: ['buergerinitiative'] } }))
    expect(answer).toEqual({ text: null, notes: [`${GAP_LEAD_DE.unavailable}: die Bürgerinitiativen.`] })
  })

  it('counts rows whose participation was not read apart, never as closed', () => {
    const answer = anliegenDoorAnswer(anliegenList([anliegenRow({ inr: 1 }), anliegenRow({ inr: 2, open: null })]))
    expect(answer).toEqual({ text: '1 offen', notes: [`${GAP_LEAD_DE.unreadable}: ob Unterstützung und Stellungnahme möglich sind, bei 1 Anliegen.`] })
  })
})

describe('Rückmeldung an die EU-Kommission', () => {
  it('states the list\'s own count line on its first tab', () => {
    const data = fenster([openWindow(1), openWindow(2), openWindow(3)])
    expect(fensterDoorAnswer(data)).toEqual({ text: EU_FENSTER_DE.count(euFensterView(data).counts.alle), notes: [] })
    expect(fensterDoorAnswer(data)).toEqual({ text: '3 offene Fristen', notes: [] })
  })

  it('carries the list\'s note where the page cap cut what was read', () => {
    const answer = fensterDoorAnswer(fenster([openWindow(1)], { read: 1, total: 4 }))
    expect(answer).not.toBe('unread')
    expect((answer as { notes: string[] }).notes).toEqual([`${GAP_LEAD_DE.outOfScope}: ${EU_FENSTER_DE.cut(1, 4)}`])
  })

  it('is a failure where the portal could not be read, and a zero in words where it lists none', () => {
    expect(fensterDoorAnswer(fenster(null))).toBe('unread')
    expect(fensterDoorAnswer(fenster([]))).toEqual({ text: 'Derzeit keine offene Frist', notes: [] })
  })
})

describe('Europäische Bürgerinitiative unterstützen', () => {
  it('states the list\'s own count line', () => {
    const data = eci([eciRow(1), eciRow(2)])
    expect(eciDoorAnswer(data)).toEqual({ text: EU_ECI_LIST_DE.count(euEciListView(data).rows!.length), notes: [] })
    expect(eciDoorAnswer(data)).toEqual({ text: '2 Initiativen in der Sammlung', notes: [] })
  })

  it('is a failure where the register could not be read, and a zero in words where it lists none', () => {
    expect(eciDoorAnswer(eci(null))).toBe('unread')
    expect(eciDoorAnswer(eci([]))).toEqual({ text: 'Derzeit keine Initiative in der Sammlung', notes: [] })
  })
})
