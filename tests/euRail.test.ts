import { describe, expect, it } from 'vitest'
import { euRailView, type EuRailView } from '../app/utils/euRail'
import type { EuActDraft, EuActHead, EuActRail, EuActResponse, EuConsultation, EuPortalPublication, EuProcedure } from '../shared/types/eu'

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
  measures: null,
  consultation: null,
  memberState: null,
  incomplete: [],
  ...over,
})

const TODAY = '2026-11-15'
const station = (v: EuRailView, id: string) => v.stations.find((s) => s.id === id)
const section = (v: EuRailView, id: string) => v.sections.find((s) => s.id === id)!
/** The dated steps of the two stations of the procedure, as „day label". */
const steps = (v: EuRailView) => (section(v, 'beschluss').record?.rows ?? []).map((r) => `${r.date} ${r.label}`)
/** A section's frame as lines „Name: fact", a link as „[label]"; the sentence without a name as „–: …". */
const frame = (v: EuRailView, id: string) => section(v, id).facts.map((f) => `${f.title ?? '–'}: ${f.parts.map((x) => (typeof x === 'string' ? x : `[${x.label}]`)).join(', ')}`)
const links = (v: EuRailView, id: string) => section(v, id).facts.flatMap((f) => f.parts.filter((x) => typeof x !== 'string'))
const allStrings = (v: EuRailView): string[] => [
  v.heading,
  v.status,
  v.note,
  ...v.stations.flatMap((s) => [s.name, s.gap, ...s.facts]),
  ...v.sections.flatMap((s) => [s.heading, ...s.notes, ...s.credits, s.record?.heading, s.record?.note, ...s.facts.flatMap((f) => [f.title, ...f.parts.map((x) => (typeof x === 'string' ? x : x.label))]), ...(s.record?.rows ?? []).flatMap((r) => [r.date, r.label])]),
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
      anchor: '#eu-vorschlag',
    })
    expect(station(v, 'beschluss')).toMatchObject({
      facts: ['Parlament 27.02.2024', 'Rat 19.03.2024', 'unterzeichnet 11.04.2024', '2022/0117(COD)'],
      gap: null,
      anchor: '#eu-beschluss',
    })
    expect(station(v, 'amtsblatt')).toMatchObject({
      facts: ['ABl. L, 2024/1069, 16.04.2024'],
      gap: null,
      anchor: '#eu-amtsblatt',
    })
    expect(station(v, 'wirkung')).toMatchObject({
      facts: ['Umsetzungsfrist 07.05.2026', '1 Entwurf im Monitor'],
      gap: null,
      anchor: '#eu-wirkung',
    })
    // A section per station, under the station's name, in the rail's order.
    expect(v.sections.map((s) => [s.id, s.elementId, s.heading])).toEqual([
      ['vorschlag', 'eu-vorschlag', 'Vorschlag'],
      ['beschluss', 'eu-beschluss', 'Parlament und Rat'],
      ['amtsblatt', 'eu-amtsblatt', 'Amtsblatt'],
      ['wirkung', 'eu-wirkung', 'Umsetzung'],
    ])
    expect(v.stations.map((s) => s.anchor)).toEqual(v.sections.map((s) => `#${s.elementId}`))
    // Each section opens with a frame of facts, the link inside the fact.
    expect(frame(v, 'vorschlag')).toEqual(['Vorschlag der Kommission: [COM(2022) 177], 27.04.2022'])
    expect(links(v, 'vorschlag')).toEqual([{ href: 'https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:52022PC0177', label: 'COM(2022) 177' }])
    expect(section(v, 'vorschlag')).toMatchObject({ record: null, notes: [], credits: ['Quelle:', 'Cellar des Amts für Veröffentlichungen der Europäischen Union (Metadaten)'] })
    expect(frame(v, 'beschluss')).toEqual([
      'Verfahren: 2022/0117(COD), Ordentliches Gesetzgebungsverfahren, [im Legislative Observatory (englisch)]',
      'Parlament: Standpunkt des EP in erster Lesung, 27.02.2024',
      'Rat: Billigung des Standpunkts des EP in erster Lesung durch den Rat (Annahme des Gesetzgebungsakts), 19.03.2024',
      'Unterzeichnung: 11.04.2024',
    ])
    expect(links(v, 'beschluss')).toEqual([{ href: 'https://oeil.europarl.europa.eu/oeil/en/procedure-file?reference=2022%2F0117(COD)', label: 'im Legislative Observatory (englisch)' }])
    // The record folded under the frame: every step the monitor reads, the
    // proposal on its document's day (the Cellar's adoption step a day later
    // stands aside). The Official Journal is its own station, not a row.
    expect(section(v, 'beschluss').notes).toEqual([])
    expect(section(v, 'beschluss').record).toEqual({
      heading: 'Alle gelesenen Schritte des Verfahrens (6)',
      rows: [
        { date: '27.04.2022', iso: '2022-04-27', label: 'Vorschlag der Kommission COM(2022) 177' },
        { date: '26.10.2022', iso: '2022-10-26', label: 'Stellungnahme des Europäischen Wirtschafts- und Sozialausschusses' },
        { date: '11.07.2023', iso: '2023-07-11', label: 'Beschluss des EP über Änderungen am Legislativvorschlag' },
        { date: '27.02.2024', iso: '2024-02-27', label: 'Standpunkt des EP in erster Lesung' },
        { date: '19.03.2024', iso: '2024-03-19', label: 'Billigung des Standpunkts des EP in erster Lesung durch den Rat (Annahme des Gesetzgebungsakts)' },
        { date: '11.04.2024', iso: '2024-04-11', label: 'Unterzeichnung durch den Präsidenten des EP und den Präsidenten des Rates' },
      ],
      note: 'Der Cellar verzeichnet 16 weitere Schritte dieses Verfahrens, die der Monitor nicht einzeln zeigt.',
    })
    // The citation is the link to the act, with „Zitieren" beside it.
    expect(frame(v, 'amtsblatt')).toEqual(['Fundstelle: [ABl. L, 2024/1069, 16.04.2024]'])
    expect(section(v, 'amtsblatt').facts[0]).toMatchObject({ cite: true, parts: [{ href: DIRECTIVE.eurLexUrl }] })
    // The drafts stand in the section themselves: their count is not a fact of the frame.
    expect(frame(v, 'wirkung')).toEqual(['Umsetzungsfrist: 07.05.2026'])
    expect(section(v, 'wirkung')).toMatchObject({ record: null, notes: [] })
  })

  it('heads the card with where the act stands: a date and what it is, never a verdict', () => {
    const status = (over: Partial<EuActResponse>, today = TODAY) => euRailView(response(over), today).status
    // A directive: the deadline to come, or the deadline that was — not „abgelaufen", not „nicht umgesetzt".
    expect(status({}, '2026-05-07')).toBe('Umzusetzen bis 07.05.2026')
    expect(status({})).toBe('Umsetzungsfrist war der 07.05.2026')
    expect(status({ act: { ...DIRECTIVE, transposition: null } })).toBe('Im Amtsblatt veröffentlicht')
    expect(status({ act: { ...DIRECTIVE, transposition: null }, oj: null })).toBeNull()
    // A regulation: applies, or in force with the day of application to come.
    expect(status({ act: REGULATION, rail: rail({ inForce: '2024-08-01', applies: '2026-08-02' }) })).toBe('Gilt seit 02.08.2026')
    expect(status({ act: REGULATION, rail: rail({ inForce: '2024-08-01', applies: '2026-08-02' }) }, '2025-01-01')).toBe('In Kraft seit 01.08.2024, gilt ab 02.08.2026')
    expect(status({ act: REGULATION, rail: rail({ inForce: '2024-08-01', applies: null }) })).toBe('In Kraft seit 01.08.2024')
    expect(status({ act: REGULATION, rail: rail({ inForce: '2027-01-01', applies: null }) })).toBe('In Kraft ab 01.01.2027')
    expect(status({ act: REGULATION, rail: rail({ inForce: null, effective: '2017-01-25' }) })).toBe('Wirksam seit 25.01.2017')
    expect(status({ act: REGULATION, rail: null, oj: null })).toBeNull()
    for (const s of [status({}), status({}, '2026-05-07')]) expect(s).not.toMatch(/abgelaufen|überfällig|verspätet|nicht umgesetzt|Tage/i)
  })

  it('names the earlier transposition dates beside the deadline (rule D3)', () => {
    const v = euRailView(response({ act: { ...DIRECTIVE, transposition: { deadline: '2026-05-29', otherDates: ['2025-01-01', '2025-06-01'] } } }), TODAY)
    expect(frame(v, 'wirkung')).toEqual(['Umsetzungsfrist: 29.05.2026', 'Weitere Fristen für einzelne Bestimmungen: 01.01.2025, 01.06.2025'])
  })

  describe('the station „Konsultation", from the Commission\'s portal', () => {
    const pub = (over: Partial<EuPortalPublication>): EuPortalPublication => ({ stage: 'OPC_LAUNCHED', type: 'OPC_LAUNCHED', reference: 'X', published: '2021-10-04', feedbackEnd: '2022-01-10', feedbackCount: 146, feedbackStatus: 'CLOSED', ...over })
    const found = (publications: EuPortalPublication[]): EuConsultation => ({
      state: 'gefunden',
      reference: 'COM(2022)177',
      initiative: { id: 13192, title: 'EU action', url: 'https://ec.europa.eu/info/law/better-regulation/have-your-say/initiatives/13192_de', publications },
    })
    const ANTISLAPP = found([
      pub({ stage: 'INIT_PLANNED', type: 'INIT_PLANNED', published: '2021-09-03', feedbackEnd: null, feedbackCount: 0 }),
      pub({ stage: 'ROADMAP', type: 'ROADMAP', feedbackEnd: '2021-11-01', feedbackCount: 10 }),
      pub({}),
      pub({ stage: 'ADOPTION_WORKFLOW', type: 'PROP_DIR', reference: 'COM(2022)177', published: '2022-04-29', feedbackEnd: '2022-06-29', feedbackCount: 22 }),
    ])

    it('stands first, with every feedback period before the proposal, in the portal\'s own words', () => {
      const v = euRailView(response({ consultation: ANTISLAPP }), TODAY)
      expect(v.stations.map((s) => s.name)).toEqual(['Konsultation', 'Vorschlag', 'Parlament und Rat', 'Amtsblatt', 'Umsetzung'])
      expect(station(v, 'konsultation')).toMatchObject({ facts: ['Fahrplan bis 01.11.2021', 'Öffentliche Konsultation bis 10.01.2022'], gap: null, anchor: '#eu-konsultation', current: false })
      expect(frame(v, 'konsultation')).toEqual([
        'Fahrplan: 04.10.2021 – 01.11.2021, 10 Rückmeldungen',
        'Öffentliche Konsultation: 04.10.2021 – 10.01.2022, 146 Rückmeldungen',
        'Vorhaben der Kommission: Nr. 13192, [im Portal „Ihre Meinung zählt“]',
      ])
      expect(section(v, 'konsultation')).toMatchObject({ heading: 'Konsultation', notes: [], record: null, credits: ['Quelle:', 'Europäische Kommission, Portal „Ihre Meinung zählt“'] })
    })

    it('sets the feedback period on the adopted proposal under „Vorschlag", with both sources credited', () => {
      const v = euRailView(response({ consultation: ANTISLAPP }), TODAY)
      expect(frame(v, 'vorschlag')).toEqual([
        'Vorschlag der Kommission: [COM(2022) 177], 27.04.2022',
        'Rückmeldungen zum Vorschlag: 29.04.2022 – 29.06.2022, 22 Rückmeldungen, [im Portal „Ihre Meinung zählt“]',
      ])
      expect(section(v, 'vorschlag').credits).toEqual(['Quellen:', 'Cellar des Amts für Veröffentlichungen der Europäischen Union (Metadaten)', 'Europäische Kommission, Portal „Ihre Meinung zählt“'])
    })

    it('says each way of not knowing in its own sentence — never „keine Konsultation"', () => {
      const gap = (c: EuConsultation) => {
        const v = euRailView(response({ consultation: c }), TODAY)
        expect(station(v, 'konsultation')!.facts).toEqual([])
        expect(frame(v, 'konsultation')).toEqual([`–: ${station(v, 'konsultation')!.gap}`])
        return station(v, 'konsultation')!.gap
      }
      expect(gap({ state: 'nicht-gefunden', reference: 'COM(2022)177' })).toBe('Im Portal „Ihre Meinung zählt“ der Kommission wurde zu COM(2022)177 kein Vorhaben gefunden.')
      expect(gap({ state: 'vor-portal', reference: 'COM(2016)593' })).toBe('Das Portal „Ihre Meinung zählt“ der Kommission führt Vorschläge erst ab 2017; COM(2016)593 ist älter.')
      expect(gap({ state: 'kein-vorschlag' })).toBe('Der Cellar nennt keine Nummer des Vorschlags, nach der im Portal der Kommission gesucht werden könnte.')
      expect(gap({ state: 'ungelesen', reference: null })).toMatch(/^Die Konsultation konnte nicht gelesen werden/)
      for (const c of [{ state: 'nicht-gefunden', reference: 'x' }, { state: 'ungelesen', reference: null }] as EuConsultation[]) {
        expect(allStrings(euRailView(response({ consultation: c }), TODAY)).join(' ')).not.toMatch(/keine Konsultation/i)
      }
    })

    it('keeps the initiative as a fact where it had no feedback period before the proposal', () => {
      const v = euRailView(response({ consultation: found([pub({ stage: 'ADOPTION_WORKFLOW', type: 'PROP_DIR', reference: 'COM(2022)177' })]) }), TODAY)
      expect(frame(v, 'konsultation')).toEqual(['Vorhaben der Kommission: Nr. 13192, [im Portal „Ihre Meinung zählt“]'])
      expect(section(v, 'konsultation').notes).toEqual(['Das Portal verzeichnet zu diesem Vorhaben vor dem Vorschlag keine Frist für Rückmeldungen.'])
    })

    it('has no such station for an act of the Commission, nor where nothing was asked', () => {
      expect(euRailView(response({ consultation: null }), TODAY).stations.map((s) => s.id)).toEqual(['vorschlag', 'beschluss', 'amtsblatt', 'wirkung'])
      const commission = euRailView(response({ act: REGULATION, rail: rail({ adoptedBy: 'kommission', procedure: null }), consultation: ANTISLAPP }), TODAY)
      expect(commission.stations.map((s) => s.id)).toEqual(['amtsblatt', 'wirkung'])
    })
  })

  it('counts drafts in the right number and says nothing for none', () => {
    expect(station(euRailView(response({ implementing: [draft, draft] }), TODAY), 'wirkung')!.facts).toEqual(['Umsetzungsfrist 07.05.2026', '2 Entwürfe im Monitor'])
    expect(station(euRailView(response(), TODAY), 'wirkung')!.facts).toEqual(['Umsetzungsfrist 07.05.2026'])
  })

  it('says one further step in the singular', () => {
    const v = euRailView(response({ rail: rail({ procedure: procedure({ otherEvents: 1 }) }) }), TODAY)
    expect(section(v, 'beschluss').record!.note).toBe('Der Cellar verzeichnet 1 weiteren Schritt dieses Verfahrens, den der Monitor nicht einzeln zeigt.')
    expect(section(euRailView(response({ rail: rail({ procedure: procedure({ otherEvents: 0 }) }) }), TODAY), 'beschluss').record!.note).toBeNull()
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
        anchor: '#eu-wirkung',
      })
      expect(section(v, 'wirkung').notes).toEqual(['Für einzelne Bestimmungen nennt der Cellar einen eigenen Geltungsbeginn: 02.02.2025, 02.08.2025, 02.08.2027.'])
      expect(frame(v, 'wirkung')).toEqual(['In Kraft: seit 01.08.2024', 'Gilt: ab 02.08.2026', 'Gilt unmittelbar: in jedem Mitgliedstaat'])
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
    expect(station(v, 'beschluss')).toMatchObject({ gap: null })
    expect(station(v, 'beschluss')!.facts).toContain('1992/0412(COD)')
    expect(frame(v, 'beschluss')[0]).toBe('Verfahren: 1992/0412(COD), Mitentscheidungsverfahren')
    expect(links(v, 'beschluss')).toEqual([])
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
    expect(frame(v, 'beschluss')[0]).toContain('Konsultationsverfahren')
    expect(steps(v).join('|')).toContain('Stellungnahme des Parlaments in 1. Lesung')
    expect(frame(v, 'beschluss').some((l) => l.startsWith('Parlament:'))).toBe(false)
  })

  it('gives an act of the Commission two stations and the note', () => {
    const v = euRailView(response({
      act: { ...REGULATION, celex: '32023R2772', label: 'Delegierte Verordnung (EU) 2023/2772' },
      rail: rail({ adoptedBy: 'kommission', procedure: null, inForce: '2024-01-01', applies: null }),
    }), TODAY)
    expect(v.stations.map((s) => s.name)).toEqual(['Amtsblatt', 'Geltung'])
    expect(v.stations.map((s) => s.current)).toEqual([false, true])
    expect(v.note).toBe('Rechtsakt der Kommission. Der Cellar verzeichnet dazu kein Verfahren zwischen den Organen.')
    expect(v.sections.map((s) => s.heading)).toEqual(['Amtsblatt', 'Geltung'])
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
    expect(v.sections.map((s) => s.id)).toEqual(['amtsblatt', 'wirkung'])
  })

  it('says every gap where the Cellar did not answer', () => {
    const v = euRailView(response({ rail: null, oj: null, act: { ...DIRECTIVE, transposition: null } }), TODAY)
    expect(v.stations.map((s) => s.name)).toEqual(['Vorschlag', 'Verfahren', 'Amtsblatt', 'Umsetzung'])
    const unread = 'Das Verfahren konnte nicht gelesen werden: Der Cellar des Amts für Veröffentlichungen hat nicht geantwortet.'
    expect(station(v, 'vorschlag')).toMatchObject({ facts: [], gap: unread, anchor: expect.any(String) })
    expect(station(v, 'beschluss')).toMatchObject({ facts: [], gap: unread, anchor: expect.any(String) })
    expect(station(v, 'amtsblatt')!.gap).toBe('Die Fundstelle im Amtsblatt konnte nicht gelesen werden.')
    // Without the Cellar's answer no absence is claimed.
    expect(station(v, 'wirkung')!.gap).toBe('Die Umsetzungsfrist konnte nicht gelesen werden.')
    // No section opens empty: where nothing was read, the reason is the frame.
    expect(v.sections.map((s) => [s.record, s.facts[0]!.title, typeof s.facts[0]!.parts[0]])).toEqual([[null, null, 'string'], [null, null, 'string'], [null, null, 'string'], [null, null, 'string']])
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
    expect(station(v, 'vorschlag')).toMatchObject({ gap: 'Der Cellar verknüpft diesen Rechtsakt mit keinem Verfahren; der Vorschlag kann hier nicht gezeigt werden.', anchor: '#eu-vorschlag' })
    expect(station(v, 'beschluss')).toMatchObject({ name: 'Parlament und Rat', gap: 'Der Cellar verknüpft diesen Rechtsakt mit keinem Verfahren; die Schritte können hier nicht gezeigt werden.', anchor: '#eu-beschluss' })
    expect(frame(v, 'vorschlag')).toEqual(['–: Der Cellar verknüpft diesen Rechtsakt mit keinem Verfahren; der Vorschlag kann hier nicht gezeigt werden.'])
    expect(frame(v, 'beschluss')).toEqual(['–: Der Cellar verknüpft diesen Rechtsakt mit keinem Verfahren; die Schritte können hier nicht gezeigt werden.'])
    expect(section(v, 'beschluss').record).toBeNull()
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
    })
    expect(links(v, 'vorschlag')[0]).toEqual({ href: 'https://eur-lex.europa.eu/a', label: 'COM(1995) 239' })
    expect(frame(v, 'vorschlag')).toHaveLength(2)
    const labels = steps(v)
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
    expect(steps(v)).toEqual([
      '26.10.2022 Vorschlag der Kommission',
      '26.10.2022 Stellungnahme des Europäischen Wirtschafts- und Sozialausschusses',
    ])
  })

  it('keeps the steps of an amended proposal beside the proposal', () => {
    const v = euRailView(response({
      rail: rail({ procedure: procedure({ events: [{ code: 'ADP_byCOM', date: '2022-04-28' }, { code: 'ADP_PROPAME_byCOM', date: '2023-01-10' }] }) }),
    }), TODAY)
    expect(steps(v)).toEqual([
      '27.04.2022 Vorschlag der Kommission COM(2022) 177',
      '10.01.2023 Annahme eines geänderten Vorschlags durch die Kommission',
    ])
  })

  it('dates a proposal without a date by the Commission\'s adoption step, or names it alone', () => {
    const undated = [{ reference: 'COM(2022) 177', celex: '52022PC0177', date: null, eurLexUrl: null }]
    const v = euRailView(response({ rail: rail({ procedure: procedure({ proposals: undated }) }) }), TODAY)
    expect(station(v, 'vorschlag')).toMatchObject({ facts: ['COM(2022) 177 vom 28.04.2022'] })
    expect(links(v, 'vorschlag')).toEqual([])
    expect(frame(v, 'vorschlag')).toEqual(['Vorschlag der Kommission: COM(2022) 177, 28.04.2022'])
    // No proposal carries a day: the Cellar's step stays, in its words.
    expect(section(v, 'beschluss').record!.rows[0]).toEqual({ date: '28.04.2022', iso: '2022-04-28', label: 'Annahme durch die Kommission' })
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
      anchor: '#eu-beschluss',
    })
    // A proposal step without a proposal record still dates the station.
    const stepOnly = euRailView(response({ rail: rail({ procedure: procedure({ proposals: [] }) }) }), TODAY)
    expect(station(stepOnly, 'vorschlag')).toMatchObject({ facts: ['28.04.2022'], gap: null, anchor: '#eu-vorschlag' })
    expect(section(stepOnly, 'beschluss').record!.rows[0]!.label).toBe('Annahme durch die Kommission')
    expect(frame(stepOnly, 'vorschlag')).toEqual(['Vorschlag der Kommission: 28.04.2022'])
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
    expect(steps(v)).toEqual([
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
