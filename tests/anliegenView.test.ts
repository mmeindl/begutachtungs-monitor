/**
 * Step 2 of `docs/research/umsetzungsplan-petitionen-volksbegehren.md`: what
 * the page of an Anliegen says (`app/utils/anliegenView.ts`), built from the
 * recorded items through the real reader (`assembleAnliegenDetail`) — the
 * rail's rows and their order per kind with each row's summary, the station
 * sections under the rail's names with the details, the headline's
 * branches, the door on the item's own flag, the counts, and the words the
 * page never uses.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { AnliegenCounts, AnliegenDetail, AnliegenKind } from '../shared/types'
import { anliegenStatementFormUrl, anliegenSupportFormUrl } from '../shared/utils/anliegen'
import { assembleAnliegenDetail, type AnliegenContent } from '../server/utils/parliament/anliegen'
import {
  ANLIEGEN_BACK_DE,
  anliegenCounts,
  anliegenHeadline,
  anliegenNotShown,
  anliegenParticipation,
  anliegenRail,
  anliegenSections,
  anliegenView,
  factText,
  voteFacts,
  type AnliegenRailRow,
  type AnliegenStationSection,
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

const COUNTS: AnliegenCounts = { statements: 3, support: 24 }

function detail(name: string, extra: Partial<AnliegenDetail> = {}, counts: AnliegenCounts = COUNTS): AnliegenDetail {
  const kind = FIXTURES.find(([n]) => n === name)![1]
  const [gp, , nr] = name.split('-') as [string, string, string]
  const content = (JSON.parse(readFileSync(new URL(`./fixtures/anliegen/${name}.json`, import.meta.url), 'utf8')) as { content: AnliegenContent }).content
  // The running period is XXVIII in every fixture's world.
  return { ...assembleAnliegenDetail({ gp, kind, inr: Number(nr) }, content, counts), periodEnded: gp !== 'XXVIII', ...extra }
}

/** A row as one line of text: „Name [state] — fact · fact". */
function line(row: AnliegenRailRow): string {
  const mark = row.marked ? '*' : ''
  return `${row.name}${mark} [${row.state}] — ${row.facts.map(factText).join(' · ')}`
}

/** A section as lines: its heading, then „Title: fact · fact" per row, then „¶ note". */
function section(s: AnliegenStationSection): string[] {
  return [`## ${s.heading}`, ...s.rows.map((r) => `${r.title}: ${r.facts.map(factText).join(' · ')}`), ...(s.note ? [`¶ ${s.note}`] : [])]
}

const NR_NOTE = '¶ Der Nationalrat stimmt über den Bericht des Ausschusses ab, nicht über das einzelne Anliegen.'

describe('anliegenRail — recorded items', () => {
  // XXVIII/BI/5: carried over from XXVII, Kenntnisnahme im Ausschuss, the
  // plenary took note of the Sammelbericht. Three rows, all reached, the
  // last marked; the committee's ending is an event in its row. The rail
  // carries the summary, the sections the rest, links included.
  it('reads a Kenntnisnahme im Ausschuss that the plenary reported (XXVIII/BI/5)', () => {
    const d = detail('XXVIII-BI-5')
    const rows = anliegenRail(d)
    expect(rows.map(line)).toEqual([
      'Eingebracht [done] — aus der XXVII. Gesetzgebungsperiode übernommen',
      'Ausschuss für Petitionen und Bürgerinitiativen [done] — Zur Kenntnis genommen am 26.06.2025',
      'Nationalrat* [done] — Sammelbericht 159 d.B. am 24.09.2025 zur Kenntnis genommen',
    ])
    expect(rows.map((r) => r.href)).toEqual(['#eingebracht', '#ausschuss', '#nationalrat'])
    // The rail's summaries hold no link: the row itself is the link.
    expect(rows.flatMap((r) => r.facts).some((f) => f.link)).toBe(false)
    const sections = anliegenSections(d)
    expect(sections.map(section)).toEqual([
      [
        '## Eingebracht',
        'Übernommen: aus der XXVII. Gesetzgebungsperiode (53/BI) · in der XXVIII. Gesetzgebungsperiode seit 24.10.2024',
        'Eingebracht von: mindestens 500 Bürgerinnen und Bürgern',
        'Unterstützungen: 24',
      ],
      [
        '## Ausschuss für Petitionen und Bürgerinitiativen',
        'Beratung: zugewiesen am 26.02.2025 · 2 Sitzungen, zuletzt am 26.06.2025 · 1 Stellungnahme angefordert',
        'Erledigung: Zur Kenntnis genommen am 26.06.2025 · dafür: ÖVP, SPÖ, NEOS · dagegen: FPÖ, GRÜNE',
      ],
      ['## Nationalrat', 'Beschluss: Sammelbericht 159 d.B. am 24.09.2025 zur Kenntnis genommen', NR_NOTE],
    ])
    expect(sections[0]!.rows[0]!.facts[0]!.link).toEqual({ href: '/anliegen/XXVII/buergerinitiative/53', label: '53/BI', external: false })
    expect(sections[2]!.rows[0]!.facts[0]!.link).toEqual({ href: 'https://www.parlament.gv.at/gegenstand/XXVIII/I/159', label: '159 d.B.', external: true })
    expect(anliegenHeadline(d).text).toBe('Im Ausschuss zur Kenntnis genommen')
  })

  // XXVIII/BI/1: forwarded to the Bildungsausschuss; the plenary took note of
  // the Sammelbericht reporting that, and the item lives on there.
  it('puts the subject committee after the Nationalrat once the plenary took note (XXVIII/BI/1)', () => {
    const d = detail('XXVIII-BI-1')
    const rows = anliegenRail(d)
    expect(rows.map((r) => r.id)).toEqual(['eingebracht', 'ausschuss', 'nationalrat', 'fachausschuss'])
    expect(rows.map(line)).toEqual([
      'Eingebracht [done] — aus der XXVII. Gesetzgebungsperiode übernommen',
      'Ausschuss für Petitionen und Bürgerinitiativen [done] — An den Bildungsausschuss weitergeleitet am 03.04.2025',
      'Nationalrat [done] — Sammelbericht 65 d.B. am 24.04.2025 zur Kenntnis genommen',
      'Bildungsausschuss* [current] — zuletzt am 25.06.2025 behandelt',
    ])
    // The sections follow the rail's order: the subject committee last.
    expect(anliegenSections(d).map((s) => s.id)).toEqual(['eingebracht', 'ausschuss', 'nationalrat', 'fachausschuss'])
    expect(section(anliegenSections(d).at(-1)!)).toEqual([
      '## Bildungsausschuss',
      'Beratung: zugewiesen am 10.04.2025 · zuletzt am 25.06.2025 behandelt · vertagt',
    ])
    expect(anliegenHeadline(d).text).toBe('An den Bildungsausschuss weitergeleitet')
  })

  // Before the plenary took note of the Sammelbericht, the subject committee
  // already holds the item: its row stands before the pale Nationalrat.
  it('puts the subject committee before a Nationalrat that has not taken note yet', () => {
    const d = detail('XXVIII-BI-1')
    const rows = anliegenRail({ ...d, course: { ...d.course, plenary: null, end: 'zuweisung' } })
    expect(rows.map((r) => `${r.id}:${r.state}`)).toEqual([
      'eingebracht:done', 'ausschuss:done', 'fachausschuss:current', 'nationalrat:open',
    ])
    // A step not reached has no section, and its row no link.
    expect(rows.find((r) => r.id === 'nationalrat')!.href).toBeNull()
    expect(anliegenSections({ ...d, course: { ...d.course, plenary: null, end: 'zuweisung' } }).map((s) => s.id))
      .toEqual(['eingebracht', 'ausschuss', 'fachausschuss'])
  })

  // XXV/BI/1: forwarded, and the subject committee has no entry at all.
  it('says that the subject committee has no entry (XXV/BI/1)', () => {
    const d = detail('XXV-BI-1')
    expect(line(anliegenRail(d).at(-1)!)).toBe('Ausschuss für Arbeit und Soziales* [done] — zugewiesen am 26.03.2014')
    expect(section(anliegenSections(d).at(-1)!)).toEqual([
      '## Ausschuss für Arbeit und Soziales',
      'Beratung: zugewiesen am 26.03.2014',
      '¶ Im Verlauf des Parlaments steht zu diesem Ausschuss kein Eintrag.',
    ])
  })

  // 13/PET XXVIII: open, in deliberation, adjourned and resumed; two members
  // handed it in. Requests counted, never whom they ask.
  it('reads an open Petition in deliberation (XXVIII/PET/13)', () => {
    const d = detail('XXVIII-PET-13')
    const rows = anliegenRail(d)
    expect(rows.map(line)).toEqual([
      'Eingebracht [done] — am 25.09.2025',
      'Ausschuss für Petitionen und Bürgerinitiativen* [current] — zugewiesen am 26.09.2025',
      'Nationalrat [open] — ',
    ])
    expect(anliegenSections(d).map(section)).toEqual([
      ['## Eingebracht', 'Einlangen: am 25.09.2025', 'Überreicht von: Mitgliedern des Nationalrates (ÖVP)', 'Unterstützungen: 24'],
      ['## Ausschuss für Petitionen und Bürgerinitiativen', 'Beratung: zugewiesen am 26.09.2025 · 4 Sitzungen, zuletzt am 22.10.2026 · 6 Stellungnahmen angefordert'],
    ])
    expect(anliegenHeadline(d).text).toBe('In Behandlung')
  })

  // 12/BI XXV: „mehrstimmig ( dafür: S,V … )" is not read into clubs.
  it('says „mit Mehrheit" and names no club for the older vote shape (XXV/BI/12)', () => {
    const committee = anliegenSections(detail('XXV-BI-12')).find((s) => s.id === 'ausschuss')!
    expect(committee.rows.find((r) => r.key === 'erledigung')!.facts.map(factText)).toEqual(['Zur Kenntnis genommen am 01.07.2014', 'mit Mehrheit'])
  })

  // 98 d.B. XXVIII: erste Lesung, the Verfassungsausschuss with both duties,
  // Bericht 200 d.B., Kenntnisnahme in plenary.
  it('reads a Volksbegehren with an erste Lesung and the committee’s duties (XXVIII/I/98)', () => {
    const d = detail('XXVIII-I-98')
    expect(anliegenRail(d).map(line)).toEqual([
      'Eingelangt [done] — am 28.05.2025',
      'Erste Lesung [done] — am 11.07.2025',
      'Verfassungsausschuss [done] — Bericht 200 d.B.',
      'Nationalrat* [done] — Zur Kenntnis genommen am 24.09.2025',
    ])
    // The Erste Lesung is a date and nothing more: no section, no link.
    expect(anliegenRail(d).map((r) => r.href)).toEqual(['#eingebracht', null, '#ausschuss', '#nationalrat'])
    expect(anliegenSections(d).map(section)).toEqual([
      ['## Eingelangt', 'Einlangen: am 28.05.2025'],
      [
        '## Verfassungsausschuss',
        'Beratung: zugewiesen am 11.07.2025 · 1 Sitzung am 15.09.2025',
        'Fristen: Vorberatung aufzunehmen bis 05.10.2025 · Bericht zu erstatten bis 05.02.2026',
        'Bericht: 200 d.B.',
      ],
      ['## Nationalrat', 'Beschluss: Zur Kenntnis genommen am 24.09.2025 · alle Klubs dafür'],
    ])
    expect(anliegenHeadline(d).text).toBe('Vom Nationalrat zur Kenntnis genommen')
  })

  // 2 d.B. XXVIII: carried over from XXVII, no erste Lesung, the adopted
  // Entschließung 6/AEA with the Kenntnisnahme.
  it('reads a carried-over Volksbegehren with a resolution and no first reading (XXVIII/I/2)', () => {
    const d = detail('XXVIII-I-2')
    const rows = anliegenRail(d)
    expect(rows.map((r) => r.id)).toEqual(['eingebracht', 'ausschuss', 'nationalrat'])
    expect(rows.map(line)).toEqual([
      'Eingelangt [done] — aus der XXVII. Gesetzgebungsperiode übernommen',
      'Umweltausschuss [done] — Bericht 180 d.B.',
      'Nationalrat* [done] — Zur Kenntnis genommen am 10.07.2025',
    ])
    const sections = anliegenSections(d)
    expect(section(sections[0]!)).toEqual(['## Eingelangt', 'Übernommen: aus der XXVII. Gesetzgebungsperiode (2547 d.B.) · in der XXVIII. Gesetzgebungsperiode seit 24.10.2024'])
    expect(sections[0]!.rows[0]!.facts[0]!.link?.href).toBe('/anliegen/XXVII/volksbegehren/2547')
    expect(section(sections[2]!)).toEqual(['## Nationalrat', 'Beschluss: Zur Kenntnis genommen am 10.07.2025 · alle Klubs dafür', 'Entschließung: angenommen (6/AEA)'])
  })

  // Every row says its state in a word; exactly one is marked.
  it('announces every row’s state in a word and marks exactly one row', () => {
    for (const [name] of FIXTURES) {
      const rows = anliegenRail(detail(name))
      expect(rows.filter((r) => r.marked)).toHaveLength(1)
      for (const r of rows) expect(r.announce).toBe(r.state === 'open' ? 'nicht erreicht' : 'erreicht')
    }
  })

  // The rail is the table of contents: a row links exactly where a section
  // renders, under the row's own name.
  it('links every row to the section of its name, and only those', () => {
    for (const [name] of FIXTURES) {
      const d = detail(name)
      const sections = anliegenSections(d)
      for (const r of anliegenRail(d)) {
        const s = sections.find((x) => x.id === r.id)
        expect(r.href, `${name} ${r.id}`).toBe(s ? `#${s.anchor}` : null)
        if (s) expect(s.heading).toBe(r.name)
      }
    }
  })

  // The Stellungnahmen stand with the committee; „Stellungnahmen: 0" only
  // where no table counts them.
  it('puts the Stellungnahmen in the committee’s section, and their count only where no table says it', () => {
    const v = anliegenView(detail('XXVIII-BI-5'))
    expect(v.statementsAt).toBe('ausschuss')
    const committeeRows = (view: typeof v) => view.sections.find((s) => s.id === 'ausschuss')!.rows.map((r) => r.key)
    expect(committeeRows(v)).not.toContain('statements')
    const none = anliegenView(detail('XXVIII-BI-5', {}, { statements: 0, support: 3 }))
    expect(none.sections.find((s) => s.id === 'ausschuss')!.rows.at(-1)).toEqual({ key: 'statements', title: 'Stellungnahmen', facts: [{ text: '0' }] })
    // Open with none yet: the table says „Bisher keine eingebracht", no row.
    const open = anliegenView(detail('XXVIII-PET-13', {}, { statements: 0, support: 3 }))
    expect(committeeRows(open)).not.toContain('statements')
    // Before a committee holds the item, the Einbringung's section holds them.
    const d = detail('XXVIII-PET-13')
    expect(anliegenView({ ...d, course: { ...d.course, committee: null } }).statementsAt).toBe('eingebracht')
  })
})

describe('anliegenHeadline — each branch', () => {
  // Carried over: the successor's page beside the headline.
  it('names the next period and links the successor', () => {
    const d = detail('XXVIII-BI-5')
    const h = anliegenHeadline({ ...d, course: { ...d.course, carriedTo: { gp: 'XXIX', inr: 7 }, end: 'uebernommen' } })
    expect(h.text).toBe('In die XXIX. Gesetzgebungsperiode übernommen')
    expect(h.link).toEqual({ href: '/anliegen/XXIX/buergerinitiative/7', label: '7/BI', external: false })
  })

  // A subject committee that reported: both facts, nothing about the plenary.
  it('says the subject committee’s report beside the forwarding', () => {
    const d = detail('XXVIII-BI-1')
    const sc = { ...d.course.subjectCommittee!, report: { citation: '300 d.B.', url: null } }
    expect(anliegenHeadline({ ...d, course: { ...d.course, subjectCommittee: sc } }).text)
      .toBe('An den Bildungsausschuss weitergeleitet, dort Bericht 300 d.B.')
  })

  // Kenntnisnahme im Ausschuss, before the plenary took note of the report too.
  it('says „Im Ausschuss zur Kenntnis genommen" with or without the plenary', () => {
    const d = detail('XXVIII-BI-5')
    expect(anliegenHeadline({ ...d, course: { ...d.course, plenary: null, end: 'kenntnisnahme-ausschuss' } }).text)
      .toBe('Im Ausschuss zur Kenntnis genommen')
  })

  // An open item in a period that has ended; the same item in the running one.
  it('says the period ended only for an open item of an ended period', () => {
    const d = detail('XXVIII-PET-13')
    expect(anliegenHeadline({ ...d, periodEnded: true }).text).toBe('Ohne Erledigung – Gesetzgebungsperiode beendet')
    expect(anliegenHeadline({ ...d, periodEnded: false }).text).toBe('In Behandlung')
    expect(anliegenHeadline({ ...d, periodEnded: undefined }).text).toBe('In Behandlung')
  })

  // A Volksbegehren without a plenary step yet.
  it('says „In Behandlung" for a Volksbegehren before the plenary', () => {
    const d = detail('XXVIII-I-98')
    expect(anliegenHeadline({ ...d, course: { ...d.course, plenary: null, end: 'offen' } }).text).toBe('In Behandlung')
  })

  // An ended item's rail marks its last step, but nothing is „current".
  it('marks no row as current once the item’s period ended', () => {
    const d = detail('XXVIII-PET-13', { periodEnded: true })
    expect(anliegenRail(d).some((r) => r.state === 'current')).toBe(false)
  })
})

describe('anliegenParticipation — the door', () => {
  // An open Petition: both actions, Parliament's own form addresses.
  it('opens the door on the item’s own flags (XXVIII/PET/13)', () => {
    const d = detail('XXVIII-PET-13')
    const p = anliegenParticipation(d)
    expect(p.door.open).toBe(true)
    expect(p.door.actions).toEqual([
      { key: 'support', label: 'Unterstützen', href: 'https://www.parlament.gv.at/gegenstand/XXVIII/PET/13?selectedStage=103&appForm=1#appForm' },
      { key: 'statement', label: 'Stellungnahme als Privatperson', href: 'https://www.parlament.gv.at/gegenstand/XXVIII/PET/13?selectedStage=101&persForm=1#persForm' },
      { key: 'statement-organisation', label: 'Stellungnahme für eine Organisation', href: 'https://www.parlament.gv.at/gegenstand/XXVIII/PET/13?selectedStage=101&orgForm=1#orgForm' },
    ])
    expect(p.door.windowNote).toBe('Das Fenster hat keine Frist. Es schließt, wenn die Behandlung im Nationalrat endet.')
    expect(p.door.supportQuote?.source).toBe('Parlament')
    expect(p.closedLine).toBeNull()
  })

  // Closed: no door, one muted line.
  it('says in one line that nothing is possible (XXVIII/BI/5)', () => {
    const p = anliegenParticipation(detail('XXVIII-BI-5'))
    expect(p.door.open).toBe(false)
    expect(p.door.actions).toEqual([])
    expect(p.closedLine).toBe('Unterstützung und Stellungnahme sind nicht möglich.')
  })

  // A Volksbegehren never offers Unterstützung — not even on a flag that says open.
  it('never offers Unterstützung for a Volksbegehren', () => {
    for (const name of ['XXVIII-I-98', 'XXVIII-I-2']) {
      const d = detail(name)
      for (const support of ['impossible', 'open', 'closed'] as const) {
        for (const statements of ['open', 'closed'] as const) {
          const p = anliegenParticipation({ ...d, participation: { support, statements } })
          expect(p.door.actions.map((a) => a.key)).not.toContain('support')
          expect(p.door.supportQuote).toBeNull()
          expect(p.volksbegehrenLine).toBe('Nicht im Monitor: Unterstützung und Eintragung, bevor ein Volksbegehren im Nationalrat einlangt.')
        }
      }
    }
  })

  // The two form addresses follow Parliament's `appformlink` and `formlink`.
  it('builds Parliament’s two form addresses', () => {
    const root = { gp: 'XXVIII', kind: 'buergerinitiative' as const, inr: 5 }
    expect(anliegenSupportFormUrl(root)).toBe('https://www.parlament.gv.at/gegenstand/XXVIII/BI/5?selectedStage=103&appForm=1#appForm')
    expect(anliegenStatementFormUrl(root)).toBe('https://www.parlament.gv.at/gegenstand/XXVIII/BI/5?selectedStage=101&persForm=1#persForm')
    expect(anliegenStatementFormUrl(root, 'organisation')).toBe('https://www.parlament.gv.at/gegenstand/XXVIII/BI/5?selectedStage=101&orgForm=1#orgForm')
  })
})

describe('anliegenCounts and anliegenNotShown', () => {
  // An unread count is „nicht lesbar", never 0; a Volksbegehren has no Unterstützungen line.
  it('says „nicht lesbar" for a count that was not read', () => {
    const none = { statements: null, support: null }
    const text = (d: AnliegenDetail) => anliegenCounts(d).map((c) => `${c.title}: ${c.text}`)
    expect(text(detail('XXVIII-BI-5', {}, none))).toEqual(['Unterstützungen: nicht lesbar', 'Stellungnahmen: nicht lesbar'])
    expect(text(detail('XXVIII-I-98', {}, none))).toEqual(['Stellungnahmen: nicht lesbar'])
    expect(text(detail('XXVIII-BI-5', {}, { statements: 0, support: 12582 }))).toEqual(['Unterstützungen: 12.582', 'Stellungnahmen: 0'])
  })

  // Singular and plural of the unread stages; no line where none.
  it('counts the stages the reader could not place, singular and plural', () => {
    const d = detail('XXVIII-BI-5')
    const unread = (n: number) => anliegenNotShown({ ...d, course: { ...d.course, unreadStages: n } }).filter((x) => x.lead === null).map(factText)
    expect(unread(0)).toEqual([])
    expect(unread(1)).toEqual(['1 Eintrag im Verlauf des Parlaments konnte der Monitor nicht zuordnen; er steht auf parlament.gv.at.'])
    expect(unread(3)).toEqual(['3 Einträge im Verlauf des Parlaments konnte der Monitor nicht zuordnen; sie stehen auf parlament.gv.at.'])
  })

  // The reason gap only after a Kenntnisnahme, the addressee gap only where a request was adopted.
  it('names a committee gap only where the item has what it is about', () => {
    const leads = (d: AnliegenDetail) => anliegenNotShown(d).map((x) => x.lead)
    const why = 'Warum der Ausschuss zur Kenntnis genommen hat:'
    const whom = 'Von wem der Ausschuss Stellungnahmen angefordert hat:'
    // 13/PET XXVIII: in deliberation, six adopted requests.
    expect(leads(detail('XXVIII-PET-13'))).not.toContain(why)
    expect(leads(detail('XXVIII-PET-13'))).toContain(whom)
    // 1/BI XXVIII: forwarded, no request.
    expect(leads(detail('XXVIII-BI-1'))).not.toContain(why)
    expect(leads(detail('XXVIII-BI-1'))).not.toContain(whom)
    // A request that was not adopted is no request the page speaks of.
    const d = detail('XXVIII-BI-5')
    const rejected = { ...d.course.committee!, statementRequests: [{ date: '2025-04-03', adopted: false }] }
    expect(leads({ ...d, course: { ...d.course, committee: rejected } })).toEqual(['Was aus dem Anliegen nach dem Nationalrat wurde:', why])
  })

  // The gaps per kind.
  it('names the gaps of each kind', () => {
    expect(anliegenNotShown(detail('XXVIII-BI-5')).map((x) => x.lead)).toEqual([
      'Was aus dem Anliegen nach dem Nationalrat wurde:',
      'Warum der Ausschuss zur Kenntnis genommen hat:',
      'Von wem der Ausschuss Stellungnahmen angefordert hat:',
    ])
    expect(anliegenNotShown(detail('XXVIII-I-2')).map((x) => x.lead)).toEqual([
      'Was aus dem Anliegen nach dem Nationalrat wurde:',
      'Unterstützung und Eintragung vor dem Einlangen im Nationalrat:',
    ])
  })
})

describe('singular and plural', () => {
  // One sitting, one request; several of each.
  it('words one Sitzung and one Stellungnahme in the singular', () => {
    const d = detail('XXVIII-BI-5')
    const c = d.course.committee!
    const one = { ...c, sittings: [{ date: '2025-04-03', adjourned: true }], statementRequests: [{ date: '2025-04-03', adopted: true }, { date: '2025-04-03', adopted: false }] }
    const deliberation = (dd: AnliegenDetail) => anliegenSections(dd).find((s) => s.id === 'ausschuss')!.rows.find((r) => r.key === 'beratung')!.facts.map(factText)
    const facts = deliberation({ ...d, course: { ...d.course, committee: one } })
    expect(facts).toEqual(['zugewiesen am 26.02.2025', '1 Sitzung am 03.04.2025', 'vertagt', '1 Stellungnahme angefordert'])
    const many = { ...c, sittings: [...c.sittings, { date: '2025-07-01', adjourned: true }] }
    const manyFacts = deliberation({ ...d, course: { ...d.course, committee: many } })
    expect(manyFacts).toEqual(['zugewiesen am 26.02.2025', '3 Sitzungen, zuletzt am 01.07.2025', 'zuletzt vertagt', '1 Stellungnahme angefordert'])
  })
})

describe('words the page never uses', () => {
  // „alle Klubs dafür", never „einstimmig".
  it('says „alle Klubs dafür" where no club voted against', () => {
    expect(voteFacts({ for: ['FPÖ', 'ÖVP'], against: [] }, false).map(factText)).toEqual(['alle Klubs dafür'])
    expect(voteFacts(null, true).map(factText)).toEqual(['mit Mehrheit'])
    expect(voteFacts(null, false)).toEqual([])
  })

  // The whole view of every fixture: no „einstimmig", no request text, no
  // Erstunterzeichner, no masked addressee.
  it('keeps every fixture’s whole view free of the forbidden words', () => {
    for (const [name] of FIXTURES) {
      const text = JSON.stringify(anliegenView(detail(name)))
      expect(text, name).not.toMatch(/einstimmig/i)
      expect(text, name).not.toContain('Stellungnahme von')
      expect(text, name).not.toContain('Einholung')
      expect(text, name).not.toContain('Erstunterzeichner')
      // „(gekürzt)" is how the fixtures mask every name, presenters included.
      expect(text, name).not.toContain('(gekürzt)')
    }
  })

  // A Petition's presenters by club, in the wording an Initiativantrag's movers have.
  it('states a Petition’s presenters by club, never by name (XXVIII/PET/13)', () => {
    const d = detail('XXVIII-PET-13')
    const eingebracht = (presenters: AnliegenDetail['presenters']) =>
      anliegenSections({ ...d, presenters })[0]!.rows.filter((r) => r.key === 'presenters').map((r) => `${r.title}: ${r.facts.map(factText).join('')}`)
    expect(eingebracht([{ club: 'V' }])).toEqual(['Überreicht von: einem Mitglied des Nationalrates (ÖVP)'])
    expect(eingebracht([{ club: 'V' }, { club: 'V' }])).toEqual(['Überreicht von: Mitgliedern des Nationalrates (ÖVP)'])
    expect(eingebracht([{ club: 'S' }, { club: 'V' }, { club: 'S' }])).toEqual(['Überreicht von: Mitgliedern des Nationalrates (SPÖ, ÖVP)'])
    expect(eingebracht([{ club: null }])).toEqual(['Überreicht von: einem Mitglied des Nationalrates'])
    expect(eingebracht([{ club: 'Q' }, { club: null }])).toEqual(['Überreicht von: Mitgliedern des Nationalrates'])
    expect(eingebracht([])).toEqual([])
  })

  // A Bürgerinitiative never names anyone, even with a „Petition überreicht von" entry.
  it('names nobody on a Bürgerinitiative', () => {
    const d = detail('XXVIII-BI-5', { presenters: [{ club: 'V' }] })
    expect(JSON.stringify(anliegenView(d))).not.toMatch(/überreicht/i)
  })

  // The back link leads to the list of Anliegen (step 3).
  it('leads back to the list of Anliegen', () => {
    expect(ANLIEGEN_BACK_DE).toEqual({ to: '/anliegen', label: 'Alle Anliegen' })
  })
})
