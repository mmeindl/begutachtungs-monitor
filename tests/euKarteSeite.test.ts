import { describe, expect, it } from 'vitest'
import { euActPageView, euActsRows, incompleteNoteDe } from '../app/utils/euKarte'
import type { EuActDraft, EuActResponse, EuActsResponse } from '../shared/types/eu'

/* The EU map's act page (§12.66, Nachtrag 3): two dates and a stand per
 * draft on one track for the page, no verdict. */
describe('euActPageView', () => {
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
      transposition: { deadline: '2026-05-07', otherDates: [] },
    },
    implementing: [draft({})],
    restating: [],
    landsWithout: [],
    incomplete: [],
    ...over,
  })
  const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000

  it('heads the page with the adoption and the deadline, in the fact\'s words', () => {
    const v = euActPageView(response({}))
    expect(v.title).toBe('Richtlinie (EU) 2024/1069')
    expect(v.implementingHeading).toBe('Entwürfe, die sie umsetzen')
    expect(v.head).toEqual(['beschlossen am 11.04.2024', 'Umsetzungsfrist bis 07.05.2026'])
    expect(v.footnote).toBeNull()
    const further = euActPageView(response({ act: { ...response({}).act, transposition: { deadline: '2026-05-29', otherDates: ['2025-01-01'] } } }))
    expect(further.head[1]).toBe('Umsetzungsfrist bis 29.05.2026¹')
    expect(further.footnote).toBe('¹ Weitere Fristen für einzelne Bestimmungen: 01.01.2025')
    const reg = euActPageView(response({ act: { ...response({}).act, kind: 'verordnung', label: 'Verordnung (EU) 2023/1114', transposition: null, adopted: null } }))
    expect(reg.head).toEqual(['gilt unmittelbar, keine Umsetzungsfrist'])
  })

  it('places every row on one track from the earliest drawn date to the latest, the deadline a tick on each', () => {
    const v = euActPageView(response({
      implementing: [
        draft({}),
        draft({ key: 'land:ooe-1', publisher: 'ooe', path: '/entwuerfe/oberoesterreich/ooe-1', citation: null, title: 'Oö. Gesetz', begutachtung: { start: '2026-09-01', end: null }, stand: { date: '2026-10-15', label: 'Beschluss' } }),
      ],
    }))
    const span = day('2026-11-04') - day('2026-05-07')
    const at = (iso: string) => ((day(iso) - day('2026-05-07')) / span) * 100
    expect(v.rows.map((r) => r.publisher)).toEqual(['Bund', 'Oberösterreich'])
    expect(v.rows[0]!.bar).toMatchObject({ band: [at('2026-06-01'), at('2026-07-01')], value: 100, valueLabel: 'Heute' })
    // A Begutachtung without an end is a band of one day, at its start.
    expect(v.rows[1]!.bar).toMatchObject({ band: [at('2026-09-01'), at('2026-09-01')], value: at('2026-10-15'), valueLabel: 'Beschluss' })
    // Each draft's way begins with its own Begutachtung, not at the shared track's start.
    expect(v.rows.map((r) => r.bar!.from)).toEqual([at('2026-06-01'), at('2026-09-01')])
    for (const r of v.rows) expect(r.bar!.marks).toEqual([{ key: 'tick-frist', at: 0, align: 'center', tick: true, lines: ['', ''] }])
    // The axis once: the deadline is the first end and labels it; the last end as a date.
    expect(v.axis.map((m) => [m.key, m.align, m.lines])).toEqual([
      ['frist', 'start', ['Umsetzungsfrist', '07.05.2026']],
      ['ende', 'end', ['', '04.11.2026']],
    ])
  })

  it('labels both ends where the deadline lies inside the track, and keeps the labels apart', () => {
    const v = euActPageView(response({
      implementing: [draft({ begutachtung: { start: '2026-05-01', end: '2026-05-20' }, stand: { date: '2026-11-04', label: 'Heute' } })],
    }))
    expect(v.axis.map((m) => m.key)).toEqual(['anfang', 'frist', 'ende'])
    const [anfang, frist] = v.axis
    // 07.05. is six days into a half-year track: the deadline's label is pushed past the start's date.
    expect(anfang!.align).toBe('start')
    expect(frist!.align).toBe('start')
    expect(frist!.at).toBeGreaterThanOrEqual(anfang!.at + 14)
  })

  it('writes each row\'s Kennung with two dates and the stand, never a verdict', () => {
    const v = euActPageView(response({
      implementing: [
        draft({}),
        draft({ key: 'ris:x', citation: null, kind: 'verordnung', begutachtung: { start: '2025-10-21', end: '2025-11-10' }, stand: { date: '2026-01-15', label: 'Bundesgesetzblatt' } }),
        draft({ key: 'land:w-1', publisher: 'w', citation: null, begutachtung: { start: '2026-10-21', end: null }, stand: { date: '2026-11-02', label: 'Landesgesetzblatt' } }),
      ],
    }))
    expect(v.rows.map((r) => r.kennung)).toEqual([
      'Gesetzesentwurf 147/ME · Begutachtung 01.06.–01.07.2026',
      'Verordnungsentwurf · Begutachtung 21.10.–10.11.2025 · Bundesgesetzblatt am 15.01.2026',
      'Gesetzesentwurf · Begutachtung ab 21.10.2026 · Landesgesetzblatt am 02.11.2026',
    ])
    expect(JSON.stringify(v)).not.toMatch(/verspätet|säumig|zu spät|Tage\b|Gold/i)
  })

  it('draws no bar for a row without a stand or a start, and lets it not stretch the track', () => {
    const v = euActPageView(response({
      implementing: [
        draft({}),
        draft({ key: 'b', stand: null, begutachtung: { start: '2020-01-01', end: '2020-02-01' } }),
        draft({ key: 'c', begutachtung: { start: null, end: null } }),
      ],
    }))
    expect(v.rows.map((r) => r.bar === null)).toEqual([false, true, true])
    expect(v.rows[1]!.kennung).toBe('Gesetzesentwurf 147/ME · Begutachtung 01.01.–01.02.2020')
    expect(v.rows[2]!.kennung).toBe('Gesetzesentwurf 147/ME')
    // Burgenland dates only the Frist's end.
    const bgld = euActPageView(response({ implementing: [draft({ begutachtung: { start: null, end: '2024-12-10' } })] }))
    expect(bgld.rows[0]!.kennung).toBe('Gesetzesentwurf 147/ME · Begutachtung bis 10.12.2024')
    expect(bgld.rows[0]!.bar).toBeNull()
    // The track still begins at the deadline, not in 2020.
    expect(v.axis[0]).toMatchObject({ key: 'frist', at: 0 })
  })

  it('draws no bars where every drawn date falls on one day, nor without any stand', () => {
    const oneDay = euActPageView(response({
      act: { ...response({}).act, transposition: null, kind: 'verordnung' },
      implementing: [draft({ begutachtung: { start: '2026-11-04', end: null }, stand: { date: '2026-11-04', label: 'Heute' } })],
    }))
    expect(oneDay.rows[0]!.bar).toBeNull()
    expect(oneDay.axis).toEqual([])
    const noStand = euActPageView(response({ implementing: [draft({ stand: null })] }))
    expect(noStand.rows[0]!.bar).toBeNull()
    expect(noStand.axis).toEqual([])
  })

  it('lists restating drafts apart, names the Länder without a draft, the window and what could not be read', () => {
    const v = euActPageView(response({
      restating: [draft({ key: 'r', publisher: 'sbg', title: 'Sbg. Gesetz', path: '/entwuerfe/salzburg/sbg-1', isNew: false })],
      landsWithout: ['ktn', 't', 'vbg'],
      incomplete: ['stmk'],
    }))
    expect(v.restating).toEqual([{ key: 'r', publisher: 'Salzburg', title: 'Sbg. Gesetz', path: '/entwuerfe/salzburg/sbg-1' }])
    expect(v.landsWithout).toBe('Keine Entwürfe im Fenster der XXVIII. GP aus: Kärnten, Tirol und Vorarlberg.')
    expect(v.window).toContain('seit dem 24.10.2024')
    expect(v.window).toContain('nur die, die der Monitor kennt')
    expect(v.incomplete).toBe('Gerade nicht abrufbar: Steiermark – Entwürfe von dort können fehlen.')
    expect(euActPageView(response({})).landsWithout).toBeNull()
    // A Land that could not be read is named as such, never as one without a draft.
    expect(euActPageView(response({ landsWithout: ['ktn', 'stmk'], incomplete: ['stmk'] })).landsWithout).toBe('Keine Entwürfe im Fenster der XXVIII. GP aus: Kärnten.')
    expect(euActPageView(response({})).incomplete).toBeNull()
    expect(incompleteNoteDe(['bund', 'stmk'])).toBe('Gerade nicht abrufbar: Bund und Steiermark – Entwürfe von dort können fehlen.')
  })
})

describe('euActsRows', () => {
  it('lists each act with its deadline, its counts and the Länder by name, in the API\'s order', () => {
    const r: EuActsResponse = {
      gp: 'XXVIII',
      window: { from: '2024-10-24', to: null },
      builtAt: '2026-11-04T20:00:00Z',
      incomplete: [],
      acts: [
        { celex: '32024L1069', kind: 'richtlinie', label: 'Richtlinie (EU) 2024/1069', eurLexUrl: 'x', path: '/eu-recht/richtlinie/2024/1069', adopted: null, transposition: { deadline: '2026-05-07', otherDates: [] }, counts: { bund: 1, laender: 3 }, lands: ['ooe', 'sbg', 'w'] },
        { celex: '32023R1114', kind: 'verordnung', label: 'Verordnung (EU) 2023/1114', eurLexUrl: 'y', path: '/eu-recht/verordnung/2023/1114', adopted: null, transposition: null, counts: { bund: 2, laender: 0 }, lands: [] },
      ],
    }
    expect(euActsRows(r)).toEqual([
      { key: '32024L1069', label: 'Richtlinie (EU) 2024/1069', path: '/eu-recht/richtlinie/2024/1069', deadline: 'Umsetzungsfrist bis 07.05.2026', counts: 'Bund 1 · Länder 3', lands: ['Oberösterreich', 'Salzburg', 'Wien'] },
      { key: '32023R1114', label: 'Verordnung (EU) 2023/1114', path: '/eu-recht/verordnung/2023/1114', deadline: 'gilt unmittelbar', counts: 'Bund 2', lands: [] },
    ])
  })
})
