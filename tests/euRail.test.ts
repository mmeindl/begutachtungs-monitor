import { describe, expect, it } from 'vitest'
import { euRailView, type EuRailView } from '../app/utils/euRail'
import type { EuActDraft, EuActHead, EuActRail, EuActResponse, EuProcedure } from '../shared/types/eu'

/* The rail of an EU act: the stations of the act's life from the Cellar,
 * dates only (rule D6), every gap a sentence with its reason. */

const DIRECTIVE: EuActHead = {
  celex: '32024L1069',
  kind: 'richtlinie',
  label: 'Richtlinie (EU) 2024/1069',
  eurLexUrl: 'https://eur-lex.europa.eu/eli/dir/2024/1069/oj/deu',
  path: '/eu-recht/richtlinie/2024/1069',
  adopted: '2024-04-11',
  title: null,
  transposition: { deadline: '2026-05-07', otherDates: [] },
}

const REGULATION: EuActHead = {
  celex: '32024R1689',
  kind: 'verordnung',
  label: 'Verordnung (EU) 2024/1689',
  eurLexUrl: 'https://eur-lex.europa.eu/eli/reg/2024/1689/oj/deu',
  path: '/eu-recht/verordnung/2024/1689',
  adopted: '2024-06-13',
  title: null,
  transposition: null,
}

const procedure = (over: Partial<EuProcedure> = {}): EuProcedure => ({
  reference: '2022/0117(COD)',
  type: 'OLP',
  observatoryUrl: 'https://oeil.europarl.europa.eu/oeil/en/procedure-file?reference=2022%2F0117(COD)',
  proposals: [{ reference: 'COM(2022) 177', celex: '52022PC0177', date: '2022-04-27', eurLexUrl: 'https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:52022PC0177' }],
  events: [
    { code: 'ADP_byCOM', date: '2022-04-28' },
    { code: 'OPI_byEESC', date: '2022-10-26' },
    { code: 'AMEND_byEP', date: '2023-07-11' },
    { code: 'ADP_R1_POS_byEP', date: '2024-02-27' },
    { code: 'APR_R1_byCONSIL', date: '2024-03-19' },
    { code: 'SIGN_byEP_CONSIL', date: '2024-04-11' },
    { code: 'PUB_OJ', date: '2024-04-16' },
  ],
  // As the Cellar's answer for 2024/1069 reads since AMEND_byEP is read (tests/euDossier.test.ts).
  otherEvents: 16,
  ...over,
})

const rail = (over: Partial<EuActRail> = {}): EuActRail => ({
  adoptedBy: 'parlament-rat',
  procedure: procedure(),
  inForce: '2024-05-06',
  effective: null,
  applies: null,
  partialApplication: [],
  ...over,
})

const draft = { key: 'me:XXVIII-147' } as EuActDraft

const response = (over: Partial<EuActResponse> = {}): EuActResponse => ({
  gp: 'XXVIII',
  window: { from: '2024-10-24', to: null },
  builtAt: '2026-11-15T20:00:00Z',
  act: DIRECTIVE,
  implementing: [],
  restating: [],
  landsWithout: [],
  oj: { form: 'act', series: 'L', act: '2024/1069', date: '2024-04-16' },
  eli: null,
  rail: rail(),
  incomplete: [],
  ...over,
})

const TODAY = '2026-11-15'
const station = (v: EuRailView, id: string) => v.stations.find((s) => s.id === id)
const allStrings = (v: EuRailView): string[] => [
  v.heading,
  v.note,
  v.partial,
  ...v.stations.flatMap((s) => [s.name, s.gap, s.source?.label, ...s.facts]),
  ...(v.procedure
    ? [v.procedure.heading, v.procedure.other, v.procedure.typeLabel, v.procedure.reference, ...v.procedure.facts, ...v.procedure.credits, ...v.procedure.rows.flatMap((r) => [r.date, r.label])]
    : []),
].filter((x): x is string => typeof x === 'string')

describe('euRailView', () => {
  it('reads an ordinary directive as four stations, the last one marked', () => {
    const v = euRailView(response({ implementing: [draft] }), TODAY)
    expect(v.heading).toBe('Der Rechtsakt im Verfahren')
    expect(v.note).toBeNull()
    expect(v.stations.map((s) => s.name)).toEqual(['Vorschlag', 'Parlament und Rat', 'Amtsblatt', 'Umsetzung'])
    expect(v.stations.map((s) => s.current)).toEqual([false, false, false, true])
    expect(station(v, 'vorschlag')).toMatchObject({
      facts: ['COM(2022) 177 vom 27.04.2022'],
      gap: null,
      anchor: '#eu-verfahren',
      source: { href: 'https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:52022PC0177', label: 'Vorschlag auf EUR-Lex' },
    })
    expect(station(v, 'beschluss')).toMatchObject({
      facts: ['Parlament 27.02.2024', 'Rat 19.03.2024', 'unterzeichnet 11.04.2024', '2022/0117(COD)'],
      gap: null,
      anchor: '#eu-verfahren',
      source: { href: 'https://oeil.europarl.europa.eu/oeil/en/procedure-file?reference=2022%2F0117(COD)', label: 'Verfahren im Legislative Observatory (englisch)' },
    })
    expect(station(v, 'amtsblatt')).toMatchObject({
      facts: ['ABl. L, 2024/1069, 16.04.2024'],
      gap: null,
      anchor: null,
      source: { href: DIRECTIVE.eurLexUrl, label: 'Rechtsakt auf EUR-Lex' },
    })
    expect(station(v, 'wirkung')).toMatchObject({
      facts: ['Umsetzungsfrist 07.05.2026', '1 Entwurf im Monitor'],
      gap: null,
      anchor: '#eu-umsetzung-heading',
      source: null,
    })
    expect(v.procedure).toMatchObject({
      heading: 'Das Verfahren',
      facts: ['2022/0117(COD)', 'Ordentliches Gesetzgebungsverfahren'],
      reference: '2022/0117(COD)',
      typeLabel: 'Ordentliches Gesetzgebungsverfahren',
      other: 'Der Cellar verzeichnet 16 weitere Schritte dieses Verfahrens, die der Monitor nicht einzeln zeigt.',
      observatory: { label: 'Verfahren im Legislative Observatory (englisch)' },
      credits: ['Quelle:', 'Cellar des Amts für Veröffentlichungen der Europäischen Union (Metadaten)'],
    })
    // The Official Journal is its own station, not a row; the proposal stands
    // on its document's day, the Cellar's adoption step a day later aside.
    expect(v.procedure!.rows).toEqual([
      { date: '27.04.2022', iso: '2022-04-27', label: 'Vorschlag der Kommission COM(2022) 177' },
      { date: '26.10.2022', iso: '2022-10-26', label: 'Stellungnahme des Europäischen Wirtschafts- und Sozialausschusses' },
      { date: '11.07.2023', iso: '2023-07-11', label: 'Beschluss des EP über Änderungen am Legislativvorschlag' },
      { date: '27.02.2024', iso: '2024-02-27', label: 'Standpunkt des EP in erster Lesung' },
      { date: '19.03.2024', iso: '2024-03-19', label: 'Billigung des Standpunkts des EP in erster Lesung durch den Rat (Annahme des Gesetzgebungsakts)' },
      { date: '11.04.2024', iso: '2024-04-11', label: 'Unterzeichnung durch den Präsidenten des EP und den Präsidenten des Rates' },
    ])
    expect(v.partial).toBeNull()
  })

  it('counts drafts in the right number and says nothing for none', () => {
    expect(station(euRailView(response({ implementing: [draft, draft] }), TODAY), 'wirkung')!.facts).toEqual(['Umsetzungsfrist 07.05.2026', '2 Entwürfe im Monitor'])
    expect(station(euRailView(response(), TODAY), 'wirkung')!.facts).toEqual(['Umsetzungsfrist 07.05.2026'])
  })

  it('says one further step in the singular', () => {
    const v = euRailView(response({ rail: rail({ procedure: procedure({ otherEvents: 1 }) }) }), TODAY)
    expect(v.procedure!.other).toBe('Der Cellar verzeichnet 1 weiteren Schritt dieses Verfahrens, den der Monitor nicht einzeln zeigt.')
    expect(euRailView(response({ rail: rail({ procedure: procedure({ otherEvents: 0 }) }) }), TODAY).procedure!.other).toBeNull()
  })

  describe('a regulation', () => {
    const reg = response({
      act: REGULATION,
      oj: { form: 'act', series: 'L', act: '2024/1689', date: '2024-07-12' },
      rail: rail({ inForce: '2024-08-01', applies: '2026-08-02', partialApplication: ['2025-02-02', '2025-08-02', '2027-08-02'] }),
      implementing: [draft, draft, draft],
    })

    it('applies from a day in the future', () => {
      const v = euRailView(reg, '2026-08-01')
      expect(station(v, 'wirkung')).toMatchObject({
        name: 'Geltung',
        current: true,
        facts: ['in Kraft seit 01.08.2024', 'gilt ab 02.08.2026', 'gilt unmittelbar in jedem Mitgliedstaat', '3 Entwürfe im Monitor'],
        gap: null,
        anchor: '#eu-umsetzung-heading',
      })
      expect(v.partial).toBe('Für einzelne Bestimmungen nennt der Cellar einen eigenen Geltungsbeginn: 02.02.2025, 02.08.2025, 02.08.2027.')
    })

    it('applies since that day once it has come', () => {
      expect(station(euRailView(reg, '2026-08-02'), 'wirkung')!.facts[1]).toBe('gilt seit 02.08.2026')
      expect(station(euRailView(reg, '2026-11-15'), 'wirkung')!.facts[1]).toBe('gilt seit 02.08.2026')
    })

    it('does not repeat an application day that is the day of entry into force', () => {
      const v = euRailView({ ...reg, rail: rail({ inForce: '2024-08-01', applies: '2024-08-01' }) }, TODAY)
      expect(station(v, 'wirkung')!.facts).toEqual(['in Kraft seit 01.08.2024', 'gilt unmittelbar in jedem Mitgliedstaat', '3 Entwürfe im Monitor'])
    })

    it('says nothing of direct application for a decision', () => {
      const v = euRailView(response({ act: { ...REGULATION, kind: 'beschluss' }, rail: rail({ inForce: '2024-08-01' }) }), TODAY)
      expect(station(v, 'wirkung')).toMatchObject({ name: 'Geltung', facts: ['in Kraft seit 01.08.2024'] })
    })

    it('names a missing day of entry into force', () => {
      const v = euRailView({ ...reg, rail: rail({ inForce: null }) }, TODAY)
      expect(station(v, 'wirkung')!.gap).toBe('Der Cellar nennt kein Datum des Inkrafttretens.')
    })

    it('enters into force from a day in the future, and since it once it has come', () => {
      const future = { ...reg, rail: rail({ inForce: '2026-12-01', applies: null }) }
      expect(station(euRailView(future, TODAY), 'wirkung')!.facts[0]).toBe('in Kraft ab 01.12.2026')
      expect(station(euRailView(future, '2026-12-01'), 'wirkung')!.facts[0]).toBe('in Kraft seit 01.12.2026')
    })
  })

  describe('a decision that takes effect („PE") instead of entering into force', () => {
    const decision = (over: Partial<EuActRail>) => response({
      act: { ...REGULATION, celex: '32017D0131', kind: 'beschluss', label: 'Beschluss (EU) 2017/131' },
      rail: rail({ adoptedBy: 'kommission', procedure: null, inForce: null, ...over }),
    })

    it('says since when it takes effect, and names no gap', () => {
      expect(station(euRailView(decision({ effective: '2017-01-25' }), TODAY), 'wirkung')).toMatchObject({ name: 'Geltung', facts: ['wirksam seit 25.01.2017'], gap: null })
    })

    it('says from when, for a day still to come', () => {
      expect(station(euRailView(decision({ effective: '2027-01-01' }), TODAY), 'wirkung')!.facts).toEqual(['wirksam ab 01.01.2027'])
      expect(station(euRailView(decision({ effective: '2027-01-01' }), '2027-01-01'), 'wirkung')!.facts).toEqual(['wirksam seit 01.01.2027'])
    })

    it('prefers the entry into force where both are typed, and names the gap only where neither is', () => {
      expect(station(euRailView(decision({ inForce: '2017-01-20', effective: '2017-01-25' }), TODAY), 'wirkung')!.facts).toEqual(['in Kraft seit 20.01.2017'])
      expect(station(euRailView(decision({ effective: null }), TODAY), 'wirkung')).toMatchObject({ facts: [], gap: 'Der Cellar nennt kein Datum des Inkrafttretens.' })
    })
  })

  it('keeps the procedure number where no Observatory page can be expected, and says nothing about the Observatory', () => {
    const v = euRailView(response({ rail: rail({ procedure: procedure({ reference: '1992/0412(COD)', type: 'COD', observatoryUrl: null }) }) }), TODAY)
    expect(station(v, 'beschluss')).toMatchObject({ source: null, gap: null })
    expect(station(v, 'beschluss')!.facts).toContain('1992/0412(COD)')
    expect(v.procedure).toMatchObject({ reference: '1992/0412(COD)', observatory: null })
    for (const text of allStrings(v)) expect(text).not.toMatch(/Observatory/)
  })

  it('names the Council alone where it adopted a directive', () => {
    const v = euRailView(response({
      rail: rail({
        adoptedBy: 'rat',
        procedure: procedure({
          reference: '2019/0020(CNS)',
          type: 'CNS',
          events: [
            { code: 'ADP_byCOM', date: '2019-01-25' },
            { code: 'OPI_R1_byEP', date: '2019-10-10' },
            { code: 'ADP_FRM_byCONSIL', date: '2020-02-18' },
          ],
          otherEvents: 4,
        }),
      }),
    }), TODAY)
    expect(v.stations.map((s) => s.name)).toEqual(['Vorschlag', 'Rat', 'Amtsblatt', 'Umsetzung'])
    // Parliament's opinion is a row of the procedure, not the Council's decision.
    expect(station(v, 'beschluss')!.facts).toEqual(['Rat 18.02.2020', '2019/0020(CNS)'])
    expect(v.procedure!.typeLabel).toBe('Konsultationsverfahren')
    expect(v.procedure!.rows.map((r) => r.label)).toContain('Stellungnahme des Parlaments in 1. Lesung')
  })

  it('gives an act of the Commission two stations and the note', () => {
    const v = euRailView(response({
      act: { ...REGULATION, celex: '32023R2772', label: 'Delegierte Verordnung (EU) 2023/2772' },
      rail: rail({ adoptedBy: 'kommission', procedure: null, inForce: '2024-01-01', applies: null }),
    }), TODAY)
    expect(v.stations.map((s) => s.name)).toEqual(['Amtsblatt', 'Geltung'])
    expect(v.stations.map((s) => s.current)).toEqual([false, true])
    expect(v.note).toBe('Rechtsakt der Kommission. Der Cellar verzeichnet dazu kein Verfahren zwischen den Organen.')
    expect(v.procedure).toBeNull()
  })

  it('shows no proposal and no procedure for a Commission act whose dossier holds only its own adoption', () => {
    const v = euRailView(response({
      act: REGULATION,
      rail: rail({
        adoptedBy: 'kommission',
        procedure: procedure({ reference: null, type: null, observatoryUrl: null, proposals: [], events: [{ code: 'ADP_byCOM', date: '2023-07-31' }], otherEvents: 0 }),
      }),
    }), TODAY)
    expect(v.stations.map((s) => s.id)).toEqual(['amtsblatt', 'wirkung'])
    expect(v.procedure).toBeNull()
  })

  it('says every gap where the Cellar did not answer', () => {
    const v = euRailView(response({ rail: null, oj: null, act: { ...DIRECTIVE, transposition: null } }), TODAY)
    expect(v.stations.map((s) => s.name)).toEqual(['Vorschlag', 'Verfahren', 'Amtsblatt', 'Umsetzung'])
    const unread = 'Das Verfahren konnte nicht gelesen werden: Der Cellar des Amts für Veröffentlichungen hat nicht geantwortet.'
    expect(station(v, 'vorschlag')).toMatchObject({ facts: [], gap: unread, anchor: null, source: null })
    expect(station(v, 'beschluss')).toMatchObject({ facts: [], gap: unread, anchor: null, source: null })
    expect(station(v, 'amtsblatt')!.gap).toBe('Die Fundstelle im Amtsblatt konnte nicht gelesen werden.')
    // Without the Cellar's answer no absence is claimed.
    expect(station(v, 'wirkung')!.gap).toBe('Die Umsetzungsfrist konnte nicht gelesen werden.')
    expect(v.procedure).toBeNull()
    expect(v.note).toBeNull()

    const reg = euRailView(response({ act: REGULATION, rail: null }), TODAY)
    expect(station(reg, 'wirkung')).toMatchObject({ facts: ['gilt unmittelbar in jedem Mitgliedstaat'], gap: 'Das Inkrafttreten konnte nicht gelesen werden.' })
  })

  it('names a missing deadline where the Cellar answered', () => {
    expect(station(euRailView(response({ act: { ...DIRECTIVE, transposition: null } }), TODAY), 'wirkung')!.gap).toBe('Der Cellar nennt für diese Richtlinie keine Umsetzungsfrist.')
    expect(station(euRailView(response({ act: { ...DIRECTIVE, kind: 'rahmenbeschluss', transposition: null } }), TODAY), 'wirkung')).toMatchObject({
      name: 'Umsetzung',
      gap: 'Der Cellar nennt für diesen Rahmenbeschluss keine Umsetzungsfrist.',
    })
  })

  it('says where an act of Parliament and Council hangs on no procedure', () => {
    const v = euRailView(response({ rail: rail({ procedure: null }) }), TODAY)
    expect(station(v, 'vorschlag')).toMatchObject({ gap: 'Der Cellar verknüpft diesen Rechtsakt mit keinem Verfahren; der Vorschlag kann hier nicht gezeigt werden.', anchor: null })
    expect(station(v, 'beschluss')).toMatchObject({ name: 'Parlament und Rat', gap: 'Der Cellar verknüpft diesen Rechtsakt mit keinem Verfahren; die Schritte können hier nicht gezeigt werden.', anchor: null })
    expect(v.procedure).toBeNull()
  })

  it('lists two proposals, each with its own date', () => {
    const v = euRailView(response({
      rail: rail({
        procedure: procedure({
          proposals: [
            { reference: 'COM(1995) 239', celex: '51995PC0239', date: '1995-06-07', eurLexUrl: 'https://eur-lex.europa.eu/a' },
            { reference: 'COM(1997) 651', celex: '51997PC0651', date: '1997-12-05', eurLexUrl: 'https://eur-lex.europa.eu/b' },
          ],
        }),
      }),
    }), TODAY)
    expect(station(v, 'vorschlag')).toMatchObject({
      facts: ['COM(1995) 239 vom 07.06.1995', 'COM(1997) 651 vom 05.12.1997'],
      source: { href: 'https://eur-lex.europa.eu/a' },
    })
    const labels = v.procedure!.rows.map((r) => `${r.date} ${r.label}`)
    expect(labels.slice(0, 2)).toEqual(['07.06.1995 Vorschlag der Kommission COM(1995) 239', '05.12.1997 Vorschlag der Kommission COM(1997) 651'])
    expect(labels.some((l) => l.includes('Annahme durch die Kommission'))).toBe(false)
  })

  it('puts a proposal before a step of the same day, and one without a number by its name alone', () => {
    const v = euRailView(response({
      rail: rail({
        procedure: procedure({
          proposals: [{ reference: null, celex: null, date: '2022-10-26', eurLexUrl: null }],
          events: [{ code: 'OPI_byEESC', date: '2022-10-26' }, { code: 'ADP_byCOM', date: '2022-10-27' }],
        }),
      }),
    }), TODAY)
    expect(v.procedure!.rows.map((r) => `${r.date} ${r.label}`)).toEqual([
      '26.10.2022 Vorschlag der Kommission',
      '26.10.2022 Stellungnahme des Europäischen Wirtschafts- und Sozialausschusses',
    ])
  })

  it('keeps the steps of an amended proposal beside the proposal', () => {
    const v = euRailView(response({
      rail: rail({ procedure: procedure({ events: [{ code: 'ADP_byCOM', date: '2022-04-28' }, { code: 'ADP_PROPAME_byCOM', date: '2023-01-10' }] }) }),
    }), TODAY)
    expect(v.procedure!.rows.map((r) => `${r.date} ${r.label}`)).toEqual([
      '27.04.2022 Vorschlag der Kommission COM(2022) 177',
      '10.01.2023 Annahme eines geänderten Vorschlags durch die Kommission',
    ])
  })

  it('dates a proposal without a date by the Commission\'s adoption step, or names it alone', () => {
    const undated = [{ reference: 'COM(2022) 177', celex: '52022PC0177', date: null, eurLexUrl: null }]
    const v = euRailView(response({ rail: rail({ procedure: procedure({ proposals: undated }) }) }), TODAY)
    expect(station(v, 'vorschlag')).toMatchObject({ facts: ['COM(2022) 177 vom 28.04.2022'], source: null })
    // No proposal carries a day: the Cellar's step stays, in its words.
    expect(v.procedure!.rows[0]).toEqual({ date: '28.04.2022', iso: '2022-04-28', label: 'Annahme durch die Kommission' })
    const bare = euRailView(response({ rail: rail({ procedure: procedure({ proposals: undated, events: [{ code: 'APR_R1_byCONSIL', date: '2024-03-19' }] }) }) }), TODAY)
    expect(station(bare, 'vorschlag')!.facts).toEqual(['COM(2022) 177'])
  })

  it('names a procedure with no proposal and no decision it reads', () => {
    const v = euRailView(response({
      rail: rail({ procedure: procedure({ proposals: [], events: [{ code: 'OPI_byEESC', date: '2022-10-26' }] }) }),
    }), TODAY)
    expect(station(v, 'vorschlag')!.gap).toBe('Der Cellar nennt zu diesem Verfahren keinen Vorschlag der Kommission.')
    expect(station(v, 'beschluss')).toMatchObject({
      facts: ['2022/0117(COD)'],
      gap: 'Der Cellar nennt zu diesem Verfahren keinen Beschluss von Parlament oder Rat, den der Monitor liest.',
      anchor: '#eu-verfahren',
    })
    // A proposal step without a proposal record still dates the station.
    const stepOnly = euRailView(response({ rail: rail({ procedure: procedure({ proposals: [] }) }) }), TODAY)
    expect(station(stepOnly, 'vorschlag')).toMatchObject({ facts: ['28.04.2022'], gap: null, source: null })
    expect(stepOnly.procedure!.rows[0]!.label).toBe('Annahme durch die Kommission')
  })

  it('shows a step once where two codes carry the same label on the same day', () => {
    const v = euRailView(response({
      rail: rail({
        procedure: procedure({
          events: [
            { code: 'AMEND_R1_byEP', date: '2024-02-27' },
            { code: 'ADP_R1_POS_byEP', date: '2024-02-27' },
            { code: 'APR_R1_byCONSIL', date: '2024-03-19' },
          ],
        }),
      }),
    }), TODAY)
    expect(v.procedure!.rows.map((r) => `${r.date} ${r.label}`)).toEqual([
      '27.04.2022 Vorschlag der Kommission COM(2022) 177',
      '27.02.2024 Standpunkt des EP in erster Lesung',
      '19.03.2024 Billigung des Standpunkts des EP in erster Lesung durch den Rat (Annahme des Gesetzgebungsakts)',
    ])
  })

  it('never states a duration or a verdict (rule D6)', () => {
    const cases: EuActResponse[] = [
      response({ implementing: [draft] }),
      response({ act: REGULATION, rail: rail({ inForce: '2024-08-01', applies: '2026-08-02', partialApplication: ['2025-02-02'] }) }),
      response({ act: { ...DIRECTIVE, transposition: { deadline: '2020-01-01', otherDates: [] } } }),
      response({ rail: rail({ adoptedBy: 'rat' }) }),
      response({ act: REGULATION, rail: rail({ adoptedBy: 'kommission', procedure: null }) }),
      response({ rail: null, oj: null }),
      response({ rail: rail({ procedure: null }) }),
      response({ rail: rail({ procedure: procedure({ otherEvents: 1 }) }) }),
      response({ act: { ...REGULATION, kind: 'beschluss' }, rail: rail({ inForce: null, effective: '2027-01-01' }) }),
      response({ act: REGULATION, rail: rail({ inForce: '2027-01-01' }) }),
    ]
    for (const c of cases) {
      for (const text of allStrings(euRailView(c, TODAY))) {
        expect(text).not.toMatch(/Tage|Wochen|Monate|Jahre|verspätet|überfällig|zu spät/)
      }
    }
  })
})
