/**
 * The fourth kind of Anliegen: the Petition an den Bundesrat (15.11.2026).
 * Its address under „BR", its own course (Eingebracht · Ausschuss with its
 * Erledigung · Bundesrat) read from a closed vocabulary, the strict
 * addressee of an Übermittlung, „Keine Veröffentlichung der Dokumente", no
 * blue door, its list rows, and the privacy sweep over its records.
 *
 * Fixtures: `tests/fixtures/anliegen/BR-PET-BR-{56,28,22}.json` (README),
 * every person's name a „Platzhalter".
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { AnliegenDetail, AnliegenRow } from '../shared/types'
import {
  anliegenCitation,
  anliegenKey,
  anliegenParliamentUrl,
  anliegenPath,
  anliegenRootOf,
  anliegenRootOfHref,
  anliegenStateOf,
} from '../shared/utils/anliegen'
import {
  assembleAnliegenDetail,
  bundesratRowOf,
  citationOf,
  lastStepDate,
  readAnliegenCourse,
  reduceAnliegenContent,
  transmissionAddressees,
  type AnliegenContent,
} from '../server/utils/parliament/anliegen'
import {
  anliegenCountLineDe,
  anliegenEmptyDe,
  anliegenRail,
  anliegenRowView,
  anliegenRowsInView,
  anliegenSections,
  anliegenView,
  bundesratRowsInPeriod,
  factText,
  type AnliegenRailRow,
  type AnliegenStationSection,
} from '../app/utils/anliegenView'

function content(nr: number): AnliegenContent {
  return (JSON.parse(readFileSync(new URL(`./fixtures/anliegen/BR-PET-BR-${nr}.json`, import.meta.url), 'utf8')) as { content: AnliegenContent }).content
}

function detail(nr: number): AnliegenDetail {
  return assembleAnliegenDetail({ gp: 'BR', kind: 'petition-bundesrat', inr: nr }, content(nr), { statements: 1, support: 285 })
}

function line(row: AnliegenRailRow): string {
  return `${row.name}${row.marked ? '*' : ''} [${row.state}] — ${row.facts.map(factText).join(' · ')}`
}

/** A section as lines: its heading, then „Title: fact · fact" per row, then „¶ note". */
function section(s: AnliegenStationSection): string[] {
  return [`## ${s.heading}`, ...s.rows.map((r) => `${r.title}: ${r.facts.map(factText).join(' · ')}`), ...(s.note ? [`¶ ${s.note}`] : [])]
}

function row(inr: number, extra: Partial<AnliegenRow> = {}): AnliegenRow {
  return {
    root: { gp: 'BR', kind: 'petition-bundesrat', inr },
    title: `Petition ${inr}`,
    arrivedAt: '2020-01-01',
    lastStepAt: null,
    state: { kind: 'uebermittelt', to: ['das Bundeskanzleramt'], date: '2020-07-01' },
    open: false,
    counts: { statements: 0, support: 3 },
    ...extra,
  }
}

describe('the address of a Petition an den Bundesrat', () => {
  const root = { gp: 'BR', kind: 'petition-bundesrat', inr: 56 } as const

  // „BR" in place of a period, as Parliament files it; only for this kind.
  it('stands under „BR", and only this kind does', () => {
    expect(anliegenRootOf('BR', 'petition-bundesrat', '56')).toEqual(root)
    expect(anliegenRootOf('XXVII', 'petition-bundesrat', '56')).toBeNull()
    expect(anliegenRootOf('BR', 'petition', '56')).toBeNull()
    expect(anliegenPath(root)).toBe('/anliegen/BR/petition-bundesrat/56')
    expect(anliegenParliamentUrl(root)).toBe('https://www.parlament.gv.at/gegenstand/BR/PET-BR/56')
    expect(anliegenKey(root)).toBe('BR-PET-BR-56')
    expect(anliegenRootOfHref('/gegenstand/BR/PET-BR/56')).toEqual(root)
  })

  // Cited as Parliament cites it on the record, with its year; without it, the bare form.
  it('is cited as Parliament cites it', () => {
    expect(anliegenCitation(root)).toBe('56/PET-BR')
    expect(citationOf(root, '56/PET-BR/2024')).toBe('56/PET-BR/2024')
    expect(citationOf(root, '57/PET-BR/2024')).toBe('56/PET-BR')
    expect(citationOf(root, 'irgendetwas')).toBe('56/PET-BR')
    expect(detail(56).citation).toBe('56/PET-BR/2024')
  })
})

describe('the addressee of an Übermittlung', () => {
  // Only the strict institutional shape passes; anything else is no addressee.
  it('passes the Bundeskanzleramt and Bundesministerien, nothing else', () => {
    expect(transmissionAddressees('das Bundeskanzleramt')).toEqual(['das Bundeskanzleramt'])
    expect(transmissionAddressees('das Bundesministerium für Land- und Forstwirtschaft, Umwelt und Wasserwirtschaft'))
      .toEqual(['das Bundesministerium für Land- und Forstwirtschaft, Umwelt und Wasserwirtschaft'])
    expect(transmissionAddressees('das Bundesministerium für Justiz, das Bundesministerium für Inneres und das Bundesministerium für Verkehr, Innovation und Technologie'))
      .toEqual(['das Bundesministerium für Justiz', 'das Bundesministerium für Inneres', 'das Bundesministerium für Verkehr, Innovation und Technologie'])
    expect(transmissionAddressees('')).toBeNull()
    expect(transmissionAddressees('Herrn Max Mustermann')).toBeNull()
    expect(transmissionAddressees('das Bundesministerium für Inneres und Herrn Max Mustermann')).toBeNull()
    expect(transmissionAddressees('die Volksanwaltschaft')).toBeNull()
  })
})

describe('the course of a Petition an den Bundesrat — recorded items', () => {
  // 56/PET-BR/2024: committee, one adjourned sitting, Übermittlung to a ministry.
  it('reads an Übermittlung (56/PET-BR/2024)', () => {
    const c = readAnliegenCourse(content(56), 'petition-bundesrat')
    expect(c.end).toBe('uebermittlung')
    expect(c.unreadStages).toBe(0)
    expect(c.committee).toEqual({
      name: 'Ausschuss für BürgerInnenrechte und Petitionen des Bundesrates',
      assignedAt: '2024-04-05',
      reassignedFrom: null,
      sittings: [{ date: '2024-06-25', adjourned: true }],
      statementRequests: [],
    })
    expect(c.transmission).toEqual({ date: '2024-10-16', to: ['das Bundesministerium für Klimaschutz, Umwelt, Energie, Mobilität, Innovation und Technologie'] })
    expect(c.documentsWithheld).toBe(false)
    // The Übermittlung ends the record: no Bundesrat row after it.
    expect(anliegenRail(detail(56)).map(line)).toEqual([
      'Eingebracht [done] — am 05.04.2024',
      'Ausschuss für BürgerInnenrechte und Petitionen* [done] — An das Bundesministerium für Klimaschutz, Umwelt, Energie, Mobilität, Innovation und Technologie übermittelt am 16.10.2024',
    ])
    expect(anliegenSections(detail(56)).map(section)).toEqual([
      ['## Eingebracht', 'Einlangen: am 05.04.2024', 'Überreicht von: einem Mitglied des Bundesrates (FPÖ)', 'Unterstützungen: 285'],
      [
        '## Ausschuss für BürgerInnenrechte und Petitionen',
        'Beratung: zugewiesen am 05.04.2024 · 1 Sitzung am 25.06.2024 · vertagt',
        'Erledigung: An das Bundesministerium für Klimaschutz, Umwelt, Energie, Mobilität, Innovation und Technologie übermittelt am 16.10.2024',
        '¶ Berichtet der Ausschuss nicht binnen sechs Monaten nach der Zuweisung, leitet die Präsidentin oder der Präsident des Bundesrates die Petition an das zuständige Mitglied der Bundesregierung weiter (§ 25 Abs. 3 GO-BR).',
      ],
    ])
  })

  // 28/PET-BR/2011: a report the Bundesrat took note of, with an Entschließung; documents withheld.
  it('reads a report the Bundesrat took note of (28/PET-BR/2011)', () => {
    const c = readAnliegenCourse(content(28), 'petition-bundesrat')
    expect(c.end).toBe('plenum')
    expect(c.unreadStages).toBe(0)
    expect(c.committeeReport).toEqual({ citation: '8463/BR d.B.', url: 'https://www.parlament.gv.at/gegenstand/BR/I-BR/8463' })
    expect(c.plenary).toMatchObject({ date: '2011-03-17', kind: 'bericht-zur-kenntnis', vote: null, majorityOnly: true })
    expect(c.resolutions).toEqual([{ date: '2011-03-17', ref: '235/E-BR/2011' }])
    expect(c.documentsWithheld).toBe(true)
    expect(anliegenRail(detail(28)).map(line).at(-1)).toBe('Bundesrat* [done] — Bericht 8463/BR d.B. am 17.03.2011 zur Kenntnis genommen')
    expect(section(anliegenSections(detail(28)).at(-1)!)).toEqual([
      '## Bundesrat',
      'Beschluss: Bericht 8463/BR d.B. am 17.03.2011 zur Kenntnis genommen · mit Mehrheit',
      'Entschließung: angenommen (235/E-BR/2011)',
    ])
  })

  // 22/PET-BR/2008: assigned anew, three ministries at once, documents withheld.
  it('reads a reassignment and three addressees (22/PET-BR/2008)', () => {
    const c = readAnliegenCourse(content(22), 'petition-bundesrat')
    expect(c.unreadStages).toBe(0)
    expect(c.committee?.reassignedFrom).toBe('Ausschuss für Verkehr, Innovation und Technologie des Bundesrates')
    expect(c.committee?.sittings).toEqual([])
    expect(c.transmission?.to).toHaveLength(3)
    expect(anliegenSections(detail(22))[1]!.rows[0]).toEqual({
      key: 'beratung',
      title: 'Beratung',
      facts: [{ text: 'zuvor dem Ausschuss für Verkehr, Innovation und Technologie zugewiesen' }, { text: 'neu zugewiesen am 25.07.2008' }],
    })
  })

  // A stage outside the vocabulary is counted, its text goes nowhere.
  it('counts a stage it does not know and shows none of its text', () => {
    const c = content(56)
    const odd: AnliegenContent = { ...c, phase: [...(c.phase ?? []), { name: 'X', stages: [{ date: '01.01.2025', text: 'Eine unbekannte Zeile' }] }] }
    const d = assembleAnliegenDetail({ gp: 'BR', kind: 'petition-bundesrat', inr: 56 }, odd, { statements: null, support: null })
    expect(d.course.unreadStages).toBe(1)
    expect(JSON.stringify(anliegenView(d))).not.toContain('unbekannte Zeile')
  })

  // The archive mark of 2014 dates no step.
  it('does not date the last step by „Keine Veröffentlichung der Dokumente"', () => {
    expect(lastStepDate(content(22), 'petition-bundesrat')).toBe('2008-11-20')
    expect(lastStepDate(content(28), 'petition-bundesrat')).toBe('2011-03-17')
  })
})

describe('the page of a Petition an den Bundesrat', () => {
  // Headline in full, the period-less identity, the Bundesrat's headings.
  it('words the page for the Bundesrat', () => {
    const v = anliegenView(detail(56))
    expect(v.headline.text).toBe('An das Bundesministerium für Klimaschutz, Umwelt, Energie, Mobilität, Innovation und Technologie übermittelt')
    expect(v.identity).toEqual({ kind: 'Petition an den Bundesrat', rest: '56/PET-BR/2024' })
    expect(v.railLabel).toBe('Die Petition im Bundesrat')
    expect(v.statementsHeading).toBe('Stellungnahmen an den Bundesrat')
    expect(v.documentsNote).toBeNull()
    expect(anliegenView(detail(28)).headline.text).toBe('Bericht des Ausschusses vom Bundesrat zur Kenntnis genommen')
  })

  // Both flags „0": no door, nothing blue, the closed line.
  it('opens no door', () => {
    const v = anliegenView(detail(56))
    expect(v.participation.door.open).toBe(false)
    expect(v.participation.closedLine).toBe('Unterstützung und Stellungnahme sind nicht möglich.')
  })

  // „Keine Veröffentlichung der Dokumente": the page says so and lists none.
  it('says the documents are not published, and lists none', () => {
    const d = detail(28)
    expect(d.documents).toEqual([])
    expect(anliegenView(d).documentsNote).toBe('Nicht veröffentlicht: die Dokumente dieser Petition.')
  })

  // An addressee outside the strict shape is never passed through.
  it('says „eine Stelle der Bundesverwaltung" for an addressee it cannot verify', () => {
    const d = detail(56)
    const unknown = { ...d, course: { ...d.course, transmission: { date: '2024-10-16', to: null } } }
    expect(anliegenView(unknown).headline.text).toBe('An eine Stelle der Bundesverwaltung übermittelt')
  })
})

describe('no name reaches a Petition an den Bundesrat’s answer', () => {
  // Every placeholder of the fixtures — member, Berichterstatter, movers — stays out
  // of the reduced record, the detail, the view and the row.
  it('keeps every name out of the record, the detail, the view and the row', () => {
    for (const nr of [56, 28, 22]) {
      const root = { gp: 'BR', kind: 'petition-bundesrat', inr: nr } as const
      const reduced = reduceAnliegenContent(content(nr))
      const d = detail(nr)
      const row: AnliegenRow = {
        root, title: d.title, arrivedAt: d.course.arrivedAt, lastStepAt: lastStepDate(reduced, root.kind),
        state: anliegenStateOf(root, d.course, false), open: false, counts: d.counts,
      }
      for (const text of [JSON.stringify(reduced), JSON.stringify(d), JSON.stringify(anliegenView(d)), JSON.stringify(anliegenRowView(row))]) {
        expect(text, String(nr)).not.toContain('Platzhalter')
        expect(text, String(nr)).not.toMatch(/einstimmig/i)
      }
      // The reduced record reads the same course.
      expect(readAnliegenCourse(reduced, root.kind)).toEqual(readAnliegenCourse(content(nr), root.kind))
    }
  })
})

describe('the list’s Petitionen an den Bundesrat', () => {
  // List 101's row: type, document type and its own HIS_URL; the period column is no address.
  it('checks a list-101 row by its own address', () => {
    const r = ['XXVI', 'PET-BR', '43', null, '19.09.2018', 'PET-BR', 'T', '43/PET-BR/2018', '', '', '', 'PET-BR', '', '', '/gegenstand/BR/PET-BR/43']
    expect(bundesratRowOf(r)).toEqual({ inr: 43, citation: '43/PET-BR/2018' })
    expect(bundesratRowOf([...r.slice(0, 14), '/gegenstand/XXVI/PET-BR/43'])).toBeNull()
    expect(bundesratRowOf(['XXVI', 'PET', ...r.slice(2)])).toBeNull()
  })

  // „Alle" of a period holds those of its days; the tab holds every one.
  it('puts them under „Alle" by their day of arrival, and all of them in their tab', () => {
    const br = [row(55, { arrivedAt: '2024-02-15' }), row(56, { arrivedAt: '2024-10-24' }), row(15, { arrivedAt: '1997-04-10' })]
    expect(bundesratRowsInPeriod(br, 'XXVII').map((r) => r.root.inr)).toEqual([55])
    expect(bundesratRowsInPeriod(br, 'XXVIII').map((r) => r.root.inr)).toEqual([56])
    const data = { gp: 'XXVII', rows: [], bundesrat: { rows: br, unread: false } }
    expect(anliegenRowsInView(data, 'petition-bundesrat')).toHaveLength(3)
    expect(anliegenRowsInView(data, 'alle').map((r) => r.root.inr)).toEqual([55])
    expect(anliegenRowsInView(data, 'petition')).toEqual([])
  })

  // The tab's count line: computed newest day, and that the period does not apply.
  it('says how many, the newest, and that the period does not apply', () => {
    const br = [row(55, { arrivedAt: '2024-02-15' }), row(56, { arrivedAt: '2024-04-05' })]
    expect(anliegenCountLineDe('XXVIII', br, 'petition-bundesrat', false))
      .toBe('2 Petitionen an den Bundesrat, die letzte vom 05.04.2024, 0 davon offen – unabhängig vom Zeitraum: der Bundesrat hat keine Gesetzgebungsperioden')
    expect(anliegenCountLineDe('XXVII', br, 'petition-bundesrat', false, true))
      .toBe('2 Petitionen an den Bundesrat, die letzte vom 05.04.2024 – unabhängig vom Zeitraum: der Bundesrat hat keine Gesetzgebungsperioden')
    expect(anliegenCountLineDe('XXVII', [row(55, { arrivedAt: '2024-02-15' })], 'alle', false, true))
      .toBe('1 in der XXVII. Gesetzgebungsperiode (davon 1 Petition an den Bundesrat, nach dem Tag des Einlangens)')
    expect(anliegenEmptyDe(br, 'XXVIII', 'petition-bundesrat', true))
      .toEqual({ title: 'Derzeit ist keine Petition an den Bundesrat offen.', note: 'Alle 2 zeigt die Liste ohne „Nur offene".' })
  })

  // The row: Parliament's citation, a grey box, the ministry not named.
  it('words a row', () => {
    const v = anliegenRowView(row(56, { citation: '56/PET-BR/2024', state: { kind: 'uebermittelt', to: ['das Bundesministerium für Finanzen'], date: '2024-10-16' } }))
    expect(`${v.kindLabel} ${v.citation}`).toBe('Petition an den Bundesrat 56/PET-BR/2024')
    expect(v.state).toEqual({ label: 'An ein Bundesministerium übermittelt', detail: '16.10.2024', tone: 'inactive', actionable: false })
    expect(anliegenRowView(row(1, { state: { kind: 'zurueckgezogen', date: '2023-06-20' } })).state.label).toBe('Gilt als zurückgezogen')
  })
})
