import { describe, expect, it } from 'vitest'
import {
  deadlineDirection,
  deadlineOrderDe,
  deadlineReverseOrderDe,
  deadlineTabOf,
  euActComparator,
  euActHaystack,
  euActCredits,
  euActPageView,
  euActsRows,
  euRestatingRows,
  euSourceUnavailable,
  filterEuActs,
  incompleteNoteDe,
  laneNameOf,
  restatingCountsDe,
  restatingFoldHeading,
} from '../app/utils/euKarte'
import type { EuActDraft, EuActResponse, EuActsResponse } from '../shared/types/eu'
import type { LandCode } from '../shared/types/laender'
import type { SourceCode } from '../shared/utils/laender'
import { viewOfRow } from '../app/utils/entryView'
import { draftSummary } from './helpers/builders'

/* The EU map's act page: the drafts as the lists'
 * rows, and a chart of one lane per draft on one track, no verdict. */
describe('euActPageView', () => {
  // Each draft its own list row, as in the map: a row's key is its draft's.
  let next = 1000
  const draft = (over: Partial<EuActDraft>): EuActDraft => ({
    key: 'me:XXVIII-147',
    publisher: 'bund',
    path: '/entwuerfe/XXVIII/147',
    title: 'Plattformarbeitsgesetz',
    citation: '147/ME',
    kind: 'gesetz',
    begutachtung: { start: '2026-06-01', end: '2026-07-01' },
    stand: { date: '2026-11-04', label: 'Heute' },
    marker: 'umsetzung',
    isNew: true,
    row: over.key
      ? { kind: 'me', key: over.key, draft: draftSummary({ inr: next++ }) }
      : { kind: 'me', key: 'me:XXVIII-147', draft: draftSummary({ inr: 147, citation: '147/ME', title: 'Plattformarbeitsgesetz', statementCount: 12 }) },
    ...over,
  })
  const response = (over: Partial<EuActResponse>): EuActResponse => ({
    gp: 'XXVIII',
    window: { from: '2024-10-24', to: null },
    builtAt: '2026-11-04T20:00:00Z',
    act: {
      celex: '32024L1069',
      kind: 'richtlinie',
      label: 'Richtlinie (EU) 2024/1069',
      eurLexUrl: 'https://eur-lex.europa.eu/eli/dir/2024/1069/oj/deu',
      path: '/eu-recht/richtlinie/2024/1069',
      adopted: '2024-04-11',
      title: null,
      transposition: { deadline: '2026-05-07', otherDates: [] },
    },
    implementing: [draft({})],
    restating: [],
    landsWithout: [],
    incomplete: [],
    oj: null,
    eli: null,
    ...over,
  })
  const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000

  it('heads the page with the adoption, and leaves the deadline and its footnote to the chart that labels it', () => {
    const v = euActPageView(response({}))
    expect(v.title).toBe('Richtlinie (EU) 2024/1069')
    expect(v.implementingHeading).toBe('Entwürfe, die sie umsetzen')
    expect(v.head).toEqual(['beschlossen am 11.04.2024'])
    expect(v.chart!.deadlines).toMatchObject([{ lines: ['Umsetzungsfrist', '07.05.2026'] }])
    expect(v.footnote).toBeNull()
    expect(v.chart!.footnote).toBeNull()
    const further = euActPageView(response({ act: { ...response({}).act, transposition: { deadline: '2026-05-29', otherDates: ['2025-01-01'] } } }))
    expect(further.head).toEqual(['beschlossen am 11.04.2024'])
    expect(further.chart!.deadlines[0]!.lines[1]).toBe('29.05.2026¹')
    expect(further.chart!.footnote).toBe('¹ Weitere Fristen für einzelne Bestimmungen: 01.01.2025')
    expect(further.footnote).toBeNull()
    const reg = euActPageView(response({ act: { ...response({}).act, kind: 'verordnung', label: 'Verordnung (EU) 2023/1114', transposition: null, adopted: null } }))
    expect(reg.head).toEqual(['gilt unmittelbar, keine Umsetzungsfrist'])
  })

  it('keeps the deadline and its footnote in the head where there is no chart to label them', () => {
    const cold = euActPageView(response({
      act: { ...response({}).act, transposition: { deadline: '2026-05-29', otherDates: ['2025-01-01'] } },
      implementing: [draft({ stand: null })],
    }))
    expect(cold.chart).toBeNull()
    expect(cold.head).toEqual(['beschlossen am 11.04.2024', 'Umsetzungsfrist bis 29.05.2026¹'])
    expect(cold.footnote).toBe('¹ Weitere Fristen für einzelne Bestimmungen: 01.01.2025')
  })

  it('puts the act\'s subject from its official title under the citation, none without a title', () => {
    expect(euActPageView(response({})).subject).toBeNull()
    const titled = euActPageView(response({ act: { ...response({}).act, title: 'Richtlinie (EU) 2024/1069 des Europäischen Parlaments und des Rates vom 11. April 2024 über den Schutz von Personen, die sich öffentlich beteiligen' } }))
    expect(titled.title).toBe('Richtlinie (EU) 2024/1069')
    expect(titled.subject).toBe('über den Schutz von Personen, die sich öffentlich beteiligen')
  })

  it('renders the drafts as the lists render them: Ressort or Land, Stellungnahmen, Stand', () => {
    const v = euActPageView(response({
      implementing: [
        draft({}),
        draft({
          key: 'land:sbg-35442',
          publisher: 'sbg',
          citation: null,
          row: { kind: 'land', key: 'land:sbg-35442', item: { id: 'sbg-35442', land: 'sbg', kind: 'gesetz', title: 'Gesetz, mit dem das Salzburger Raumordnungsgesetz 2009 geändert wird', startedAt: '2025-12-04', deadline: null, url: 'https://example.org', documents: [], active: false, stage: { station: 'bgbl', label: 'Landesgesetzblatt', detail: 'LGBl. Nr. 12/2026', date: '2026-02-18' } } },
        }),
      ],
    }))
    expect(v.entries.map((e) => [e.title, e.kindLabel, e.citation, e.ministry?.code, e.participation])).toEqual([
      ['Plattformarbeitsgesetz', 'Ministerialentwurf', '147/ME', 'BMF', { kind: 'count', count: 12 }],
      ['Gesetz, mit dem das Salzburger Raumordnungsgesetz 2009 geändert wird', 'Gesetzesentwurf', null, 'Salzburg', { kind: 'unpublished' }],
    ])
    expect(v.entries[1]!.state).toMatchObject({ label: 'Landesgesetzblatt', detail: 'LGBl. Nr. 12/2026' })
    expect(v.entries.map((e) => e.to)).toEqual(['/entwuerfe/XXVIII/147', '/entwuerfe/salzburg/35442'])
  })

  it('draws every drawable draft as a lane on one track from the earliest drawn date to the latest, the deadline a tick on each', () => {
    const v = euActPageView(response({
      implementing: [
        draft({}),
        draft({ key: 'land:ooe-1', publisher: 'ooe', path: '/entwuerfe/oberoesterreich/ooe-1', citation: null, title: 'Landesgesetz über die Grundversorgung (Oö. Grundversorgungsgesetz 2026)', begutachtung: { start: '2026-09-01', end: null }, stand: { date: '2026-10-15', label: 'Beschluss' } }),
      ],
    }))
    const span = day('2026-11-04') - day('2026-05-07')
    const at = (iso: string) => ((day(iso) - day('2026-05-07')) / span) * 100
    const lanes = v.chart!.lanes
    expect(lanes.map((l) => [l.publisher, l.name])).toEqual([['Bund', 'Plattformarbeitsgesetz'], ['Oberösterreich', 'Oö. Grundversorgungsgesetz 2026']])
    expect(lanes[0]!.bar).toMatchObject({ band: [at('2026-06-01'), at('2026-07-01')], value: 100, dot: 'mark' })
    // A Begutachtung without an end is a band of one day, at its start.
    expect(lanes[1]!.bar).toMatchObject({ band: [at('2026-09-01'), at('2026-09-01')], value: at('2026-10-15'), dot: 'mark' })
    // Each draft's way begins with its own Begutachtung, not at the shared track's start.
    expect(lanes.map((l) => l.bar.from)).toEqual([at('2026-06-01'), at('2026-09-01')])
    // Each lane names its Begutachtung under the band, as the draft's timeline does, „ab" where only the start is dated, and its stand with the date.
    expect(lanes.map((l) => l.bar.marks)).toEqual([
      [
        { key: 'begutachtung', at: at('2026-06-01'), align: 'start', lines: ['Begutachtung', '01.06.–01.07.2026'] },
        { key: 'stand', at: 100, align: 'end', lines: ['Heute', '04.11.2026'] },
      ],
      [
        { key: 'begutachtung', at: at('2026-09-01'), align: 'end', lines: ['Begutachtung', 'ab 01.09.2026'] },
        { key: 'stand', at: at('2026-10-15'), align: 'center', lines: ['Beschluss', '15.10.2026'] },
      ],
    ])
    for (const l of lanes) expect(l.bar.ticks).toEqual([0])
    // The deadline's label once, over the lanes: on the first end, aligned inward.
    expect(v.chart!.deadlines).toMatchObject([{ key: 'frist', align: 'start', lines: ['Umsetzungsfrist', '07.05.2026'] }])
  })

  it('labels the deadline centred inside the track, and nothing for an act without one', () => {
    const middle = euActPageView(response({
      implementing: [draft({ begutachtung: { start: '2026-01-01', end: '2026-02-01' }, stand: { date: '2026-09-01', label: 'Heute' } })],
    }))
    expect(middle.chart!.deadlines).toMatchObject([{ key: 'frist', align: 'center' }])
    const reg = euActPageView(response({ act: { ...response({}).act, kind: 'verordnung', transposition: null } }))
    expect(reg.chart!.lanes).toHaveLength(1)
    expect(reg.chart!.deadlines).toEqual([])
    expect(reg.chart!.lanes[0]!.bar.ticks).toEqual([])
  })

  it('says each row\'s dates in two dates and the stand, never a verdict, by the row\'s key', () => {
    const v = euActPageView(response({
      implementing: [
        draft({}),
        draft({ key: 'ris:x', citation: null, kind: 'verordnung', begutachtung: { start: '2025-10-21', end: '2025-11-10' }, stand: { date: '2026-01-15', label: 'Bundesgesetzblatt' } }),
        draft({ key: 'land:w-1', publisher: 'w', citation: null, begutachtung: { start: '2026-10-21', end: null }, stand: { date: '2026-11-02', label: 'Landesgesetzblatt' } }),
      ],
    }))
    expect(v.entries.map((e) => v.said[e.key])).toEqual([
      'Begutachtung 01.06.–01.07.2026',
      'Begutachtung 21.10.–10.11.2025 · Bundesgesetzblatt am 15.01.2026',
      'Begutachtung ab 21.10.2026 · Landesgesetzblatt am 02.11.2026',
    ])
    expect(JSON.stringify([v.chart, v.said])).not.toMatch(/verspätet|säumig|zu spät|Tage\b|nach der Frist/i)
  })

  it('gives no lane to a draft without a stand or any Begutachtung date, and lets it not stretch the track', () => {
    const v = euActPageView(response({
      implementing: [
        draft({}),
        draft({ key: 'b', stand: null, begutachtung: { start: '2020-01-01', end: '2020-02-01' } }),
        draft({ key: 'c', begutachtung: { start: null, end: null } }),
      ],
    }))
    expect(v.chart!.lanes.map((l) => l.key)).toEqual(['me:XXVIII-147'])
    // Every draft is still a row.
    expect(v.entries).toHaveLength(3)
    // The track still begins at the deadline, not in 2020.
    expect(v.chart!.deadlines).toMatchObject([{ key: 'frist', at: 0 }])
  })

  it('draws a draft with only the Frist\'s end from that end, without a band, and lets it stretch the track', () => {
    // Burgenland dates only the Frist's end.
    const v = euActPageView(response({
      implementing: [
        draft({}),
        draft({ key: 'land:bgld-1', publisher: 'bgld', citation: null, begutachtung: { start: null, end: '2025-12-10' }, stand: { date: '2026-05-12', label: 'Landesgesetzblatt' } }),
      ],
    }))
    const span = day('2026-11-04') - day('2025-12-10')
    const at = (iso: string) => ((day(iso) - day('2025-12-10')) / span) * 100
    const [bund, bgld] = v.chart!.lanes
    expect(v.said[v.entries[1]!.key]).toBe('Begutachtung bis 10.12.2025 · Landesgesetzblatt am 12.05.2026')
    expect(bgld!.bar).toMatchObject({ band: null, from: 0, value: at('2026-05-12'), dot: 'ink' })
    expect(bgld!.bar.marks[0]).toEqual({ key: 'begutachtung', at: 0, align: 'start', lines: ['Begutachtung', 'bis 10.12.2025'] })
    expect(bund!.bar).toMatchObject({ from: at('2026-06-01') })
    expect(v.chart!.deadlines).toEqual([{ key: 'frist', at: at('2026-05-07'), align: 'center', lines: ['Umsetzungsfrist', '07.05.2026'] }])
  })

  it('draws no chart where every drawn date falls on one day, nor without any stand', () => {
    const oneDay = euActPageView(response({
      act: { ...response({}).act, transposition: null, kind: 'verordnung' },
      implementing: [draft({ begutachtung: { start: '2026-11-04', end: null }, stand: { date: '2026-11-04', label: 'Heute' } })],
    }))
    expect(oneDay.chart).toBeNull()
    expect(oneDay.entries).toHaveLength(1)
    expect(euActPageView(response({ implementing: [draft({ stand: null })] })).chart).toBeNull()
  })

  it('lists restating drafts apart and says only what could not be read', () => {
    const restating = draft({ key: 'r', publisher: 'sbg', title: 'Sbg. Gesetz', path: '/entwuerfe/salzburg/sbg-1', isNew: false })
    const v = euActPageView(response({
      restating: [restating],
      landsWithout: ['ktn', 't', 'vbg'],
      incomplete: ['stmk'],
    }))
    // The lists' row (`viewOfRow`), as the implementing drafts get it.
    expect(v.restating).toEqual([viewOfRow(restating.row)])
    // The Länder without a draft and the window are the method's, not the page's.
    expect(v).not.toHaveProperty('landsWithout')
    expect(v).not.toHaveProperty('window')
    expect(v.incomplete).toBe('Gerade nicht abrufbar: Steiermark – Entwürfe von dort können fehlen.')
    expect(euActPageView(response({})).incomplete).toBeNull()
    expect(incompleteNoteDe(['bund', 'stmk'])).toBe('Gerade nicht abrufbar: Bund und Steiermark – Entwürfe von dort können fehlen.')
  })
})

describe('laneNameOf', () => {
  it('takes the short name a title ends with, else the first law an amending title names, else the title', () => {
    expect(laneNameOf('Gesetz, mit dem das S.EU-Rechtsvorschriften-Begleitgesetz, das Salzburger Landeselektrizitätsgesetz 1999 und das Baupolizeigesetz 1997 geändert werden (1. Salzburger Erneuerbaren Ausbaugesetz)')).toBe('1. Salzburger Erneuerbaren Ausbaugesetz')
    expect(laneNameOf('Gesetz, mit dem das Salzburger Raumordnungsgesetz 2009 geändert wird')).toBe('Salzburger Raumordnungsgesetz 2009')
    expect(laneNameOf('Gesetz mit dem das Salzburger Grundversorgungsgesetz geändert wird')).toBe('Salzburger Grundversorgungsgesetz')
    expect(laneNameOf('Gesetz, mit dem das Salzburger Energieeffizienzgesetz erlassen und das S.EU-Rechtsvorschriften-Begleitgesetz geändert wird')).toBe('Salzburger Energieeffizienzgesetz')
    expect(laneNameOf('Vergaberechtsgesetz 2026')).toBe('Vergaberechtsgesetz 2026')
  })

  it('keeps a hyphenated „und" inside the name, and takes a short name before a stray semicolon', () => {
    expect(laneNameOf('Gesetz, mit dem das Salzburger Kinder- und Jugendhilfegesetz geändert wird')).toBe('Salzburger Kinder- und Jugendhilfegesetz')
    expect(laneNameOf('Gesetz, über Maßnahmen zum Schutz der Pflanzen vor Krankheiten und Schädlingen (Salzburger Pflanzengesundheitsgesetz 2025 – S.PfGG 2025);')).toBe('Salzburger Pflanzengesundheitsgesetz 2025')
  })

  it('shortens Parliament\'s collective titles to the lead law, without „Änderung" and the abbreviation', () => {
    expect(laneNameOf('Kreditdienstleister- und Kreditkäufergesetz – KKG; Bankwesengesetz, Finanzmarktaufsichtsbehördengesetz u.a., Änderung')).toBe('Kreditdienstleister- und Kreditkäufergesetz')
    expect(laneNameOf('Bankwesengesetz, Finanzmarktaufsichtsbehördengesetz u.a., Änderung')).toBe('Bankwesengesetz, Finanzmarktaufsichtsbehördengesetz u.a.')
    expect(laneNameOf('Wirtschaftliche Eigentümer Registergesetz, Änderung; Wirtschaftliche Eigentümer Registergesetz')).toBe('Wirtschaftliche Eigentümer Registergesetz')
    expect(laneNameOf('Landesgesetz, über die Gewährung von Grundversorgungsleistungen (Oö. Grundversorgungsgesetz 2026 - Oö. GVG 2026)')).toBe('Oö. Grundversorgungsgesetz 2026')
    expect(laneNameOf('Oö. EU -Gebäuderichtlinie-Baurechts-Umsetzungsgesetz')).toBe('Oö. EU -Gebäuderichtlinie-Baurechts-Umsetzungsgesetz')
  })
})

describe('euActsRows', () => {
  it('lists each act with its deadline as a grey state box, its counts and the Länder by name', () => {
    const r: EuActsResponse = {
      gp: 'XXVIII',
      window: { from: '2024-10-24', to: null },
      builtAt: '2026-11-04T20:00:00Z',
      incomplete: [],
      restatingOnly: [],
      acts: [
        { celex: '32024L1069', kind: 'richtlinie', label: 'Richtlinie (EU) 2024/1069', eurLexUrl: 'x', path: '/eu-recht/richtlinie/2024/1069', adopted: null, title: 'Richtlinie (EU) 2024/1069 des Europäischen Parlaments und des Rates vom 11.\u00a0April 2024 über den Schutz von Personen, die sich öffentlich beteiligen (Text von Bedeutung für den EWR)', transposition: { deadline: '2026-05-07', otherDates: [] }, counts: { bund: 1, laender: 3 }, lands: ['ooe', 'sbg', 'w'] },
        { celex: '32023R1114', kind: 'verordnung', label: 'Verordnung (EU) 2023/1114', eurLexUrl: 'y', path: '/eu-recht/verordnung/2023/1114', adopted: null, title: null, transposition: null, counts: { bund: 2, laender: 0 }, lands: [] },
      ],
    }
    expect(euActsRows(r)).toEqual([
      { key: '32024L1069', label: 'Richtlinie (EU) 2024/1069', path: '/eu-recht/richtlinie/2024/1069', subject: 'über den Schutz von Personen, die sich öffentlich beteiligen', state: { label: 'Umsetzungsfrist', detail: 'bis 07.05.2026', tone: 'inactive', actionable: false }, counts: '1 Entwurf des Bundes · 3 Entwürfe der Länder', lands: ['Oberösterreich', 'Salzburg', 'Wien'] },
      { key: '32023R1114', label: 'Verordnung (EU) 2023/1114', path: '/eu-recht/verordnung/2023/1114', subject: null, state: { label: 'Gilt unmittelbar', detail: 'keine Umsetzungsfrist', tone: 'inactive', actionable: false }, counts: '2 Entwürfe des Bundes', lands: [] },
    ])
  })
})

describe('the overview\'s tabs and orders', () => {
  const act = (celex: string, deadline: string | null, label = celex) => ({ celex, label, transposition: deadline ? { deadline, otherDates: [] } : null })

  it('sorts a deadline today under „Frist läuft", a passed one under „Abgelaufen", none under „Ohne Frist"', () => {
    expect(deadlineTabOf(act('a', '2026-11-06'), '2026-11-06')).toBe('laufend')
    expect(deadlineTabOf(act('a', '2026-11-05'), '2026-11-06')).toBe('abgelaufen')
    expect(deadlineTabOf(act('a', null), '2026-11-06')).toBe('ohne')
  })

  it('gives each tab its deadline direction: nearest or most recent first, and the words both ways', () => {
    expect(deadlineDirection('laufend')).toBe('auf')
    expect(deadlineDirection('abgelaufen')).toBe('ab')
    expect(deadlineOrderDe('laufend')).toBe('nächste zuerst')
    expect(deadlineOrderDe('abgelaufen')).toBe('zuletzt abgelaufene zuerst')
    expect(deadlineReverseOrderDe('laufend')).toBe('späteste zuerst')
    expect(deadlineReverseOrderDe('abgelaufen')).toBe('am längsten abgelaufene zuerst')
  })

  it('orders by deadline either way, the acts without one last both ways, ties by name', () => {
    const acts = [act('x', '2029-12-21'), act('none', null), act('y', '2026-11-20'), act('b', '2027-01-01', 'B'), act('a', '2027-01-01', 'A')]
    expect([...acts].sort(euActComparator('frist', 'auf')).map((a) => a.celex)).toEqual(['y', 'a', 'b', 'x', 'none'])
    expect([...acts].sort(euActComparator('frist', 'ab')).map((a) => a.celex)).toEqual(['x', 'a', 'b', 'y', 'none'])
  })

  it('orders by name with numbers read as numbers — 2024/927 before 2024/1385', () => {
    const acts = [act('1', null, 'Richtlinie (EU) 2024/1385'), act('2', null, 'Richtlinie (EU) 2024/927'), act('3', null, 'Delegierte Richtlinie (EU) 2024/1262')]
    expect([...acts].sort(euActComparator('name')).map((a) => a.label)).toEqual(['Delegierte Richtlinie (EU) 2024/1262', 'Richtlinie (EU) 2024/927', 'Richtlinie (EU) 2024/1385'])
    expect([...acts].sort(euActComparator('name', 'ab')).map((a) => a.label)).toEqual(['Richtlinie (EU) 2024/1385', 'Richtlinie (EU) 2024/927', 'Delegierte Richtlinie (EU) 2024/1262'])
  })

  it('searches the label, the official title and the CELEX', () => {
    expect(euActHaystack({ label: 'Richtlinie (EU) 2022/2555', title: 'Richtlinie … (NIS-2-Richtlinie)', celex: '32022L2555' })).toBe('Richtlinie (EU) 2022/2555 Richtlinie … (NIS-2-Richtlinie) 32022L2555')
  })
})

describe('the fold of acts drafts only restate', () => {
  const restating = [
    { celex: '32009L0043', kind: 'richtlinie', label: 'Richtlinie 2009/43/EG', eurLexUrl: 'x', path: '/eu-recht/richtlinie/2009/43', adopted: null, title: null, transposition: { deadline: '2011-06-30', otherDates: [] }, counts: { bund: 3, laender: 1 }, lands: ['sbg'] },
    { celex: '32016R0679', kind: 'verordnung', label: 'Verordnung (EU) 2016/679', eurLexUrl: 'y', path: '/eu-recht/verordnung/2016/679', adopted: null, title: null, transposition: null, counts: { bund: 1, laender: 0 }, lands: [] },
    { celex: '32014L0024', kind: 'richtlinie', label: 'Richtlinie 2014/24/EU', eurLexUrl: 'z', path: '/eu-recht/richtlinie/2014/24', adopted: null, title: null, transposition: null, counts: { bund: 0, laender: 2 }, lands: ['bgld', 'ktn'] },
  ] satisfies EuActsResponse['restatingOnly']

  it('counts restating drafts, never Länder, in the dative after „wiederholt in"', () => {
    expect(restatingCountsDe({ bund: 3, laender: 1 })).toBe('wiederholt in 3 Entwürfen des Bundes · 1 Entwurf der Länder')
    expect(restatingCountsDe({ bund: 1, laender: 0 })).toBe('wiederholt in 1 Entwurf des Bundes')
    expect(restatingCountsDe({ bund: 0, laender: 2 })).toBe('wiederholt in 2 Entwürfen der Länder')
  })

  it('gives the rows the overview\'s anatomy and order; a directive without a date says „keine bekannt"', () => {
    expect(euRestatingRows({ restatingOnly: restating })).toEqual([
      { key: '32009L0043', label: 'Richtlinie 2009/43/EG', path: '/eu-recht/richtlinie/2009/43', subject: null, state: { label: 'Umsetzungsfrist', detail: 'bis 30.06.2011', tone: 'inactive', actionable: false }, counts: 'wiederholt in 3 Entwürfen des Bundes · 1 Entwurf der Länder', lands: ['Salzburg'] },
      { key: '32014L0024', label: 'Richtlinie 2014/24/EU', path: '/eu-recht/richtlinie/2014/24', subject: null, state: { label: 'Umsetzungsfrist', detail: 'keine bekannt', tone: 'inactive', actionable: false }, counts: 'wiederholt in 2 Entwürfen der Länder', lands: ['Burgenland', 'Kärnten'] },
      { key: '32016R0679', label: 'Verordnung (EU) 2016/679', path: '/eu-recht/verordnung/2016/679', subject: null, state: { label: 'Gilt unmittelbar', detail: 'keine Umsetzungsfrist', tone: 'inactive', actionable: false }, counts: 'wiederholt in 1 Entwurf des Bundes', lands: [] },
    ])
  })

  it('is filtered by the same chips, and empty where the selection leaves none', () => {
    expect(filterEuActs(restating, ['sbg']).map((a) => a.celex)).toEqual(['32009L0043'])
    expect(filterEuActs(restating, ['bund']).map((a) => a.celex)).toEqual(['32009L0043', '32016R0679'])
    expect(filterEuActs(restating, ['w'])).toEqual([])
    // A Land with restating drafts only is available on the site's chips, as the page passes both lists.
    expect(Object.keys(euSourceUnavailable(restating, [])).sort()).toEqual(['noe', 'ooe', 'stmk', 't', 'vbg', 'w'])
  })

  it('names its count in the heading, in brackets', () => {
    expect(restatingFoldHeading(12)).toBe('Nur in Umsetzungshinweisen wiederholt (12)')
  })
})

describe('the overview\'s source chips', () => {
  const acts = [
    { celex: 'A', counts: { bund: 1, laender: 0 }, lands: [] },
    { celex: 'B', counts: { bund: 0, laender: 2 }, lands: ['sbg', 'bgld'] },
    { celex: 'C', counts: { bund: 2, laender: 1 }, lands: ['ktn'] },
    { celex: 'D', counts: { bund: 0, laender: 1 }, lands: ['vbg'] },
  ] as const satisfies readonly { celex: string; counts: { bund: number; laender: number }; lands: readonly LandCode[] }[]
  const pick = (chosen: SourceCode[]) => filterEuActs(acts.map((a) => ({ ...a, lands: [...a.lands] })), chosen).map((a) => a.celex)

  it('shows every act where nothing is chosen', () => {
    expect(pick([])).toEqual(['A', 'B', 'C', 'D'])
  })

  it('keeps an act where the chosen Bund or any chosen Land implements it', () => {
    expect(pick(['bund'])).toEqual(['A', 'C'])
    expect(pick(['sbg'])).toEqual(['B'])
    expect(pick(['bund', 'vbg'])).toEqual(['A', 'C', 'D'])
    expect(pick(['w'])).toEqual([])
  })

  it('makes a Land without an act unavailable, saying why — unread or not in the map', () => {
    const lands = acts.map((a) => ({ lands: [...a.lands] }))
    const reasons = euSourceUnavailable(lands, ['stmk'])
    expect(Object.keys(reasons).sort()).toEqual(['noe', 'ooe', 'stmk', 't', 'w'])
    expect(reasons.stmk).toBe('Gerade nicht abrufbar')
    expect(reasons.w).toBe('Kein Entwurf des Landes setzt einen Rechtsakt um, den der Monitor kennt')
    expect(reasons.bund).toBeUndefined()
  })
})

describe('the act page\'s credit line', () => {
  const row = (publisher: EuActDraft['publisher'], label: 'Heute' | 'Beschluss' | 'Bundesgesetzblatt' | 'Landesgesetzblatt' | null): EuActDraft => ({
    key: `${publisher}-${label}`,
    publisher,
    path: '/x',
    title: 't',
    citation: null,
    kind: 'gesetz',
    begutachtung: { start: '2026-01-01', end: '2026-02-01' },
    stand: label ? { date: '2026-03-01', label } : null,
    marker: 'umsetzung',
    isNew: true,
    row: { kind: 'me', key: `${publisher}-${label}`, draft: draftSummary() },
  })

  it('names only the documents and EUR-Lex where every stand is today or unknown', () => {
    const c = euActCredits({ implementing: [row('bund', 'Heute'), row('sbg', null)] })
    expect(c.items).toEqual(['Vorblatt und Gesetzestext (RIS)', 'Dokumente der Länder', 'Fristen (EUR-Lex)'])
    expect(c.sources.map((s) => [s.what, s.publisher, s.terms])).toEqual([
      ['Vorblatt', 'ris', 'cc-by'], ['Gesetzestext', 'ris', 'cc-by'], ['Fristen', 'eurlex', 'cc0'],
    ])
  })

  it('names where each stand comes from, only where its label is on the page', () => {
    const c = euActCredits({ implementing: [row('bund', 'Bundesgesetzblatt'), row('bund', 'Beschluss'), row('ooe', 'Beschluss'), row('bgld', 'Landesgesetzblatt')] })
    expect(c.items).toEqual([
      'Vorblatt, Gesetzestext und Bundesgesetzblatt (RIS)',
      'Beschluss (Parlament)',
      'Dokumente, Landtagsbeschlüsse und Landesgesetzblätter der Länder',
      'Fristen (EUR-Lex)',
    ])
    // Parliament's Beschluss is procedure data of a parliamentary station: CC BY, as its Verlauf.
    expect(c.sources.find((s) => s.publisher === 'parlament')).toEqual({ what: 'Beschluss', publisher: 'parlament', terms: 'cc-by' })
  })

  it('takes a Land\'s Beschluss for the Landtag\'s, never for Parliament\'s', () => {
    const c = euActCredits({ implementing: [row('sbg', 'Beschluss')] })
    expect(c.items).toEqual(['Vorblatt und Gesetzestext (RIS)', 'Dokumente und Landtagsbeschlüsse der Länder', 'Fristen (EUR-Lex)'])
    expect(c.sources.some((s) => s.publisher === 'parlament')).toBe(false)
  })

  it('reads the restating drafts\' stands too — their rows are the lists\' rows and show them', () => {
    const c = euActCredits({ implementing: [row('bund', 'Heute')], restating: [row('bund', 'Bundesgesetzblatt'), row('sbg', 'Landesgesetzblatt')] })
    expect(c.items).toEqual([
      'Vorblatt, Gesetzestext und Bundesgesetzblatt (RIS)',
      'Dokumente und Landesgesetzblätter der Länder',
      'Fristen (EUR-Lex)',
    ])
  })
})
