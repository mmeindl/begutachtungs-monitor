import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { EuConsultation, EuInitiative, EuProposalAct, EuProposalDossier, EuProposalRecord, EuVorschlagResponse } from '../shared/types/eu'
import type { SparqlAnswer } from '../server/utils/eu/cellar'
import { PROPOSAL_QUERY_VERSION, parseProposalAnswer, proposalCelex, proposalQuery, proposalUrl } from '../server/utils/eu/cellarVorschlag'
import { EU_EVENTS } from '../shared/utils/euEvents'
import { euProposalAddress, euProposalPath, euProposalPathOfReference } from '../shared/utils/eu'
import { euProposalActs, euProposalLastStep, euProposalRedirect, euProposalStandOf } from '../shared/utils/euVorschlag'
import { EU_VORSCHLAG_DE, decisionBodyOf, effectKindOf, euVorschlagView } from '../app/utils/euVorschlag'
import { feedbackFoldsOf } from '../app/utils/euFeedback'

/*
 * Six answers of the Cellar to `proposalQuery`, as the SPARQL endpoint sent
 * them on 15.11.2026: two pending proposals (one of the ordinary procedure
 * with only an English title, one the Council decides alone), one adopted
 * into one act, one into two, and two withdrawn by the Commission with a
 * dated step. Metadata only — no person. No test touches the network.
 */
const FIXTURES = join(import.meta.dirname, 'fixtures', 'eu-vorschlag')
const answer = (celex: string) => JSON.parse(readFileSync(join(FIXTURES, `vorschlag-${celex}.json`), 'utf8')) as SparqlAnswer
const record = (celex: string) => parseProposalAnswer(answer(celex), celex)!

const TODAY = '2026-11-15'
const PORTAL = 'https://ec.europa.eu/info/law/better-regulation/have-your-say/initiatives'

describe('the address of a proposal', () => {
  it('turns a COM number into the CELEX and nothing else into a query', () => {
    expect(proposalCelex(2026, 780)).toBe('52026PC0780')
    expect(proposalCelex(2022, 1)).toBe('52022PC0001')
    for (const [y, n] of [[2026, 0], [2026, 10000], [26, 780], [2026, 1.5]] as const) expect(proposalCelex(y, n), `${y}/${n}`).toBeNull()
    const q = proposalQuery('52026PC0780')
    expect(q).toContain('?p owl:sameAs <http://publications.europa.eu/resource/celex/52026PC0780>')
    for (const k of ['proposal', 'title', 'dossier', 'event', 'act']) expect(q).toContain(`BIND("${k}" AS ?k)`)
    // Never addressed by a FILTER on the CELEX literal: 55–90 s instead of 0.25 s (15.11.2026).
    expect(q).not.toMatch(/FILTER\s*\(\s*(STR|\?celex|CONTAINS)/i)
    expect(proposalUrl('52026PC0780')).toMatch(/^https:\/\/publications\.europa\.eu\/webapi\/rdf\/sparql\?query=/)
    expect(PROPOSAL_QUERY_VERSION).toBe(1)
    for (const bad of ['52026PC780', '52026PC0780> . ?x ?y ?z', '32024L1069', '52026PC0780(01)', '52026DC0780', '']) expect(() => proposalQuery(bad), bad).toThrow()
  })

  it('builds the page\'s address without padding and validates the path\'s segments', () => {
    expect(euProposalPath(2026, 780)).toBe('/eu-recht/vorschlag/2026/780')
    expect(euProposalPath(2022, 177)).toBe('/eu-recht/vorschlag/2022/177')
    for (const [y, n] of [[1989, 1], [2026, 0], [2026, 10000], [2026, 1.5], [10000, 1]] as const) expect(euProposalPath(y, n), `${y}/${n}`).toBeNull()
    expect(euProposalAddress('2026', '780', TODAY)).toEqual({ year: 2026, number: 780 })
    expect(euProposalAddress('2027', '1', TODAY)).toEqual({ year: 2027, number: 1 })
    expect(euProposalAddress('1990', '9999', TODAY)).toEqual({ year: 1990, number: 9999 })
    // Padded („0780") is no canonical address: the page 301s it, the API answers 400.
    for (const [y, n] of [['2026', '0780'], ['2026', '0'], ['2028', '1'], ['1989', '1'], ['26', '780'], ['2026', '10000'], ['2026', '78a'], ['', '']]) {
      expect(euProposalAddress(y!, n!, TODAY), `${y}/${n}`).toBeNull()
    }
  })

  it('reads a COM number as the portal or the Cellar writes it', () => {
    expect(euProposalPathOfReference('COM(2026)780')).toBe('/eu-recht/vorschlag/2026/780')
    expect(euProposalPathOfReference('COM(2022) 177')).toBe('/eu-recht/vorschlag/2022/177')
    expect(euProposalPathOfReference(' COM (2022) 0177 ')).toBe('/eu-recht/vorschlag/2022/177')
    for (const bad of ['Ares(2021)6011536', 'COM(1995) 722 - 3', 'SWD(2022)117', 'COM(2022)', null]) expect(euProposalPathOfReference(bad), String(bad)).toBeNull()
  })
})

describe('parseProposalAnswer — the six answers of 15.11.2026', () => {
  it('a pending proposal of the ordinary procedure, English title only (COM(2026) 780)', () => {
    const r = record('52026PC0780')
    expect(r).toMatchObject({ celex: '52026PC0780', date: '2026-10-06', titleIsGerman: false })
    expect(r.title).toMatch(/^Proposal for a REGULATION OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL on European standa/)
    expect(r.dossiers).toHaveLength(1)
    const d = r.dossiers[0]!
    expect(d.procedure).toMatchObject({
      reference: '2026/0307(COD)',
      type: 'OLP',
      observatoryUrl: 'https://oeil.europarl.europa.eu/oeil/en/procedure-file?reference=2026%2F0307(COD)',
      proposals: [{ reference: 'COM(2026) 780', celex: '52026PC0780', date: '2026-10-06', eurLexUrl: 'https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:52026PC0780' }],
      events: [{ code: 'ADP_PROPLEG_byCOM', date: '2026-10-06' }],
      // DELIB_WP_byCONSIL: a working party's deliberation, not on the allowlist.
      otherEvents: 1,
    })
    expect(d.flags).toEqual({ pending: true, withdrawn: false, adopted: false })
    expect(d).toMatchObject({ withdrawn: null, lastStep: '2026-10-19', acts: [] })
  })

  it('a pending proposal the Council decides alone (COM(2026) 308)', () => {
    const r = record('52026PC0308')
    expect(r.titleIsGerman).toBe(true)
    expect(r.title).toMatch(/^Vorschlag für eine RICHTLINIE DES RATES/)
    const d = r.dossiers[0]!
    expect(d.procedure).toMatchObject({ reference: '2026/0168(CNS)', type: 'CNS', events: [{ code: 'ADP_byCOM', date: '2026-06-24' }], otherEvents: 4 })
    expect(d.flags).toEqual({ pending: true, withdrawn: false, adopted: false })
    expect(d.lastStep).toBe('2026-11-11')
  })

  it('an adopted proposal and the one act it produced (COM(2022) 177 → 32024L1069)', () => {
    const r = record('52022PC0177')
    expect(r.title).toMatch(/^Vorschlag für eine RICHTLINIE DES EUROPÄISCHEN PARLAMENTS UND DES RATES/)
    const d = r.dossiers[0]!
    expect(d.flags).toEqual({ pending: false, withdrawn: false, adopted: true })
    expect(d.acts).toEqual(['32024L1069'])
    expect(d.procedure.events.map((e) => e.code)).toEqual(['ADP_byCOM', 'OPI_byEESC', 'AMEND_byEP', 'ADP_R1_POS_byEP', 'APR_R1_byCONSIL', 'SIGN_byEP_CONSIL', 'PUB_OJ'])
    expect(d.lastStep).toBe('2024-04-16')
  })

  it('an adopted proposal that produced two acts, of a split procedure (COM(2023) 148)', () => {
    const d = record('52023PC0148').dossiers[0]!
    expect(d.acts).toEqual(['32024L1711', '32024R1747'])
    expect(d.procedure.reference).toBe('2023/0077(COD)')
    // The Observatory split it into files A and B: the plain number answers 404 there.
    expect(d.procedure.observatoryUrl).toBeNull()
  })

  it('two proposals withdrawn by the Commission, each with its dated step', () => {
    const a = record('52021PC0890').dossiers[0]!
    expect(a.flags).toEqual({ pending: false, withdrawn: true, adopted: false })
    expect(a.withdrawn).toBe('2025-10-06')
    expect(a.procedure.events).toContainEqual({ code: 'WDW_byCOM', date: '2025-10-06' })
    const b = record('52022PC0305').dossiers[0]!
    expect(b.withdrawn).toBe('2024-05-06')
    expect(b.acts).toEqual([])
    // Parliament had taken its position before the withdrawal.
    expect(b.procedure.events).toContainEqual({ code: 'ADP_R1_POS_byEP', date: '2023-11-22' })
  })

  it('shows only steps on the allowlist, in every answer', () => {
    for (const celex of ['52026PC0780', '52026PC0308', '52022PC0177', '52023PC0148', '52021PC0890', '52022PC0305']) {
      for (const d of record(celex).dossiers) for (const e of d.procedure.events) expect(Object.hasOwn(EU_EVENTS, e.code), `${celex} ${e.code}`).toBe(true)
    }
  })

  it('tells „the Cellar does not know the number" from „not read"', () => {
    // An answer without the proposal row: the Cellar's proof that it does not know the number.
    expect(parseProposalAnswer({ head: { vars: ['k'] }, results: { bindings: [] } } as unknown as SparqlAnswer, '52026PC9999')).toBeNull()
    const onlyTitle = { results: { bindings: [{ k: { value: 'title' }, a: { value: 'x' }, b: { value: 'http://publications.europa.eu/resource/authority/language/DEU' } }] } }
    expect(parseProposalAnswer(onlyTitle as unknown as SparqlAnswer, '52026PC9999')).toBeNull()
    // A shape the reader does not know is no answer: it throws, and the service says „not read".
    for (const bad of [{}, { results: {} }, null]) expect(() => parseProposalAnswer(bad as unknown as SparqlAnswer, '52026PC0780')).toThrow()
    expect(() => parseProposalAnswer(answer('52026PC0780'), '32024L1069')).toThrow()
  })
})

/* ------------------------------------------------------------------ */

const dossier = (over: Partial<EuProposalDossier> = {}): EuProposalDossier => ({
  procedure: { reference: '2026/0307(COD)', type: 'OLP', observatoryUrl: null, proposals: [], events: [], otherEvents: 0 },
  flags: { pending: null, withdrawn: null, adopted: null },
  withdrawn: null,
  lastStep: '2026-10-19',
  acts: [],
  ...over,
})
const synthetic = (...dossiers: EuProposalDossier[]): EuProposalRecord => ({ celex: '52026PC0780', date: '2026-10-06', title: null, titleIsGerman: false, dossiers })

describe('euProposalStandOf — the rules, in their order', () => {
  it('reads the six answers as the Cellar records them', () => {
    expect(euProposalStandOf(record('52026PC0780'))).toEqual({ kind: 'anhaengig', lastStep: '2026-10-19' })
    expect(euProposalStandOf(record('52026PC0308'))).toEqual({ kind: 'anhaengig', lastStep: '2026-11-11' })
    expect(euProposalStandOf(record('52022PC0177'))).toEqual({ kind: 'rechtsakt', acts: ['32024L1069'] })
    expect(euProposalStandOf(record('52023PC0148'))).toEqual({ kind: 'rechtsakt', acts: ['32024L1711', '32024R1747'] })
    expect(euProposalStandOf(record('52021PC0890'))).toEqual({ kind: 'zurueckgezogen', date: '2025-10-06' })
    expect(euProposalStandOf(record('52022PC0305'))).toEqual({ kind: 'zurueckgezogen', date: '2024-05-06' })
  })

  it('takes an act only with the adopted flag AND an act produced', () => {
    expect(euProposalStandOf(synthetic(dossier({ flags: { pending: false, withdrawn: false, adopted: true } }))).kind).toBe('unklar')
    expect(euProposalStandOf(synthetic(dossier({ flags: { pending: false, withdrawn: false, adopted: false }, acts: ['32024L1069'] })))).toEqual({ kind: 'unklar', lastStep: '2026-10-19', acts: ['32024L1069'] })
  })

  it('dates a withdrawal only by the Commission\'s step; the flag alone says no day', () => {
    expect(euProposalStandOf(synthetic(dossier({ flags: { pending: false, withdrawn: true, adopted: false } })))).toEqual({ kind: 'zurueckgezogen-undatiert' })
    expect(euProposalStandOf(synthetic(dossier({ flags: { pending: null, withdrawn: true, adopted: null } })))).toEqual({ kind: 'zurueckgezogen-undatiert' })
    // The dated step stands even where the flags contradict it: it is what the steps show.
    expect(euProposalStandOf(synthetic(dossier({ flags: { pending: true, withdrawn: false, adopted: false }, withdrawn: '2025-01-01' })))).toEqual({ kind: 'zurueckgezogen', date: '2025-01-01' })
  })

  it('claims no stand where flags are missing or contradict each other', () => {
    for (const flags of [
      { pending: null, withdrawn: null, adopted: null },
      { pending: false, withdrawn: false, adopted: false },
      { pending: true, withdrawn: true, adopted: false },
      { pending: true, withdrawn: false, adopted: true },
    ]) expect(euProposalStandOf(synthetic(dossier({ flags }))), JSON.stringify(flags)).toEqual({ kind: 'unklar', lastStep: '2026-10-19', acts: [] })
    // Two dossiers that disagree are two flags at once.
    expect(euProposalStandOf(synthetic(
      dossier({ flags: { pending: true, withdrawn: false, adopted: false } }),
      dossier({ flags: { pending: false, withdrawn: true, adopted: false }, lastStep: '2026-11-01' }),
    ))).toEqual({ kind: 'unklar', lastStep: '2026-11-01', acts: [] })
  })

  it('knows a proposal without a procedure', () => {
    expect(euProposalStandOf(synthetic())).toEqual({ kind: 'ohne-verfahren' })
    expect(euProposalLastStep(synthetic())).toBeNull()
    expect(euProposalActs(synthetic(dossier({ acts: ['32024R1747'] }), dossier({ acts: ['32024L1711', '32024R1747'] })))).toEqual(['32024L1711', '32024R1747'])
  })
})

describe('euProposalRedirect — the stronger address', () => {
  it('answers 301 to the act only for exactly one act with a page', () => {
    expect(euProposalRedirect([{ celex: '32024L1069', path: '/eu-recht/richtlinie/2024/1069' }])).toBe('/eu-recht/richtlinie/2024/1069')
    expect(euProposalRedirect([{ celex: '32024R0001', path: null }])).toBeNull()
    expect(euProposalRedirect([{ celex: '32024L1711', path: '/eu-recht/richtlinie/2024/1711' }, { celex: '32024R1747', path: '/eu-recht/verordnung/2024/1747' }])).toBeNull()
    expect(euProposalRedirect([])).toBeNull()
  })
})

/* ------------------------------------------------------------------ */

const initiative = (publications: EuInitiative['publications']): EuInitiative => ({
  id: 19000,
  title: 'European standardisation',
  titleDe: null,
  actType: 'PROP_REG',
  url: `${PORTAL}/19000_de`,
  publications,
})

const OPEN_ON_PROPOSAL: EuConsultation = {
  state: 'gefunden',
  reference: 'COM(2026)780',
  initiative: initiative([
    { stage: 'PLANNING_WORKFLOW', type: 'CALL_FOR_EVIDENCE', reference: 'Ares(2025)1', published: '2025-05-02', feedbackEnd: '2025-05-30', feedbackCount: 210, feedbackStatus: 'CLOSED' },
    { stage: 'ADOPTION_WORKFLOW', type: 'PROP_REG', reference: 'COM(2026)780', published: '2026-10-07', feedbackEnd: '2026-12-09', feedbackCount: 31, feedbackStatus: 'OPEN' },
  ]),
}

const act = (celex: string, label: string, path: string | null): EuProposalAct => ({ celex, label, path, eurLexUrl: `https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:${celex}` })

function response(celex: string, over: Partial<EuVorschlagResponse> = {}): EuVorschlagResponse {
  const r = record(celex)
  const m = /^5(\d{4})PC(\d{4})$/.exec(celex)!
  return {
    reference: `COM(${m[1]}) ${Number(m[2])}`,
    celex,
    eurLexUrl: `https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:${celex}`,
    proposal: r,
    acts: [],
    redirect: null,
    consultation: { state: 'nicht-gefunden', reference: `COM(${m[1]})${Number(m[2])}`, exhaustive: true },
    ...over,
  }
}

describe('the page of a proposal', () => {
  it('gives the feedback periods their folds: before the proposal, and on it (step 4)', () => {
    const withIds: EuConsultation = {
      ...OPEN_ON_PROPOSAL,
      initiative: initiative([
        { ...(OPEN_ON_PROPOSAL as Extract<EuConsultation, { state: 'gefunden' }>).initiative.publications[0]!, id: 31001 },
        { ...(OPEN_ON_PROPOSAL as Extract<EuConsultation, { state: 'gefunden' }>).initiative.publications[1]!, id: 31002 },
      ]),
    }
    const v = euVorschlagView(response('52026PC0780', { consultation: withIds }), TODAY)
    const folds = (id: string) => feedbackFoldsOf(v.sections.find((s) => s.id === id)!.facts)
    expect(folds('konsultation')).toEqual([{ key: 'rueckmeldungen-19000-31001', heading: 'Wer Rückmeldung gegeben hat', initiative: 19000, publication: 31001 }])
    expect(folds('vorschlag')).toEqual([{ key: 'rueckmeldungen-19000-31002', heading: 'Wer Rückmeldung gegeben hat', initiative: 19000, publication: 31002 }])
    // Without the publication's number (a record built by hand): no fold, the facts unchanged.
    const without = euVorschlagView(response('52026PC0780', { consultation: OPEN_ON_PROPOSAL }), TODAY)
    expect(without.sections.flatMap((s) => feedbackFoldsOf(s.facts))).toEqual([])
  })

  it('pending, with the feedback period on it open: the stand, the one action, Parliament and Council not yet deciding', () => {
    const v = euVorschlagView(response('52026PC0780', { consultation: OPEN_ON_PROPOSAL }), TODAY)
    expect(v.status).toBe('Anhängig laut EUR-Lex')
    // The card says the stand alone; what it rests on stands in the rail.
    expect(v.stations[2]!.facts).toContain('letzter verzeichneter Schritt 19.10.2026')
    expect(v.identity).toBe('Vorschlag der Europäischen Kommission · COM(2026) 780')
    expect(v.action).toEqual({
      end: '2026-12-09',
      heading: null,
      href: `${PORTAL}/19000_de`,
      label: 'Rückmeldung im Portal der Kommission geben',
      // No sentence under the heading: the heading says the day, the button the portal.
      note: null,
      // Feedback on a legislative proposal: the Commission's sentence for the adoption's stage.
      quote: {
        text: 'Alle eingegangenen Rückmeldungen werden von der Europäischen Kommission zusammengefasst und dem Europäischen Parlament und dem Rat vorgelegt, um in die Gesetzgebungsdebatte einfließen zu können.',
        source: 'Europäische Kommission',
      },
    })
    // One action, standing twice: the card's door once more at the end of „Vorschlag", which holds the period, with the card's label — and no fact carries it.
    expect(v.sections.filter((x) => x.door).map((x) => [x.id, x.door])).toEqual([['vorschlag', { href: `${PORTAL}/19000_de`, label: 'Rückmeldung im Portal der Kommission geben' }]])
    expect(JSON.stringify(v.sections.map((x) => x.facts))).not.toContain('Rückmeldung im Portal der Kommission geben')
    expect(v.stations.map((s) => [s.id, s.name, !!s.ahead, s.current])).toEqual([
      ['konsultation', 'Konsultation', false, false],
      ['vorschlag', 'Vorschlag', false, false],
      ['beschluss', 'Parlament und Rat', false, true],
      ['amtsblatt', 'Amtsblatt', true, false],
      ['wirkung', 'Geltung', true, false],
    ])
    expect(v.stations[1]!.facts).toEqual(['COM(2026) 780 vom 06.10.2026', 'Rückmeldungen zum Vorschlag bis 09.12.2026'])
    const vorschlag = v.sections[1]!
    expect(vorschlag.facts.map((f) => [f.title, f.parts])).toEqual([
      ['Vorschlag der Kommission', [{ href: 'https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:52026PC0780', label: 'COM(2026) 780' }, '06.10.2026']],
      ['Rückmeldungen zum Vorschlag', ['07.10.2026 – 09.12.2026', '31 Rückmeldungen', { href: `${PORTAL}/19000_de`, label: 'im Portal „Ihre Meinung zählt“' }]],
    ])
    const beschluss = v.sections[2]!
    expect(beschluss.facts[0]).toMatchObject({ title: 'Verfahren', parts: ['2026/0307(COD)', 'Ordentliches Gesetzgebungsverfahren', { href: 'https://oeil.europarl.europa.eu/oeil/en/procedure-file?reference=2026%2F0307(COD)', label: 'im Legislative Observatory (englisch)' }] })
    expect(beschluss.notes).toEqual([
      'EUR-Lex verzeichnet zu diesem Vorschlag bisher keinen Beschluss von Parlament oder Rat, den der Monitor liest.',
      'Bei Parlament und Rat sieht das Verfahren keinen Weg vor, auf dem sich Einzelne zu einem Vorschlag äußern können.',
    ])
    expect(beschluss.record).toMatchObject({ heading: 'Alle gelesenen Schritte des Verfahrens (1)', note: 'Der Cellar verzeichnet 1 weiteren Schritt dieses Verfahrens, den der Monitor nicht einzeln zeigt.' })
    // Stations ahead have no section, as on a draft's page; the first says in the rail what the record holds.
    expect(v.sections.map((x) => x.id)).toEqual(['konsultation', 'vorschlag', 'beschluss'])
    expect(v.stations[3]!.gap).toBe('EUR-Lex verzeichnet zu diesem Vorschlag noch keinen Rechtsakt.')
    expect(v.stations[4]!.gap).toBeNull()
    // The day after the period closed, no action, and no second door either.
    const closed = euVorschlagView(response('52026PC0780', { consultation: OPEN_ON_PROPOSAL }), '2026-12-10')
    expect(closed.action).toBeNull()
    expect(closed.sections.some((x) => x.door)).toBe(false)
  })

  it('flags an English-only title', () => {
    const v = euVorschlagView(response('52026PC0780'), TODAY)
    expect(v.title).toMatch(/^Proposal for a REGULATION/)
    expect(v.titleNote).toBe('EUR-Lex führt den Titel bisher nur auf Englisch')
    expect(euVorschlagView(response('52026PC0308'), TODAY).titleNote).toBeNull()
  })

  it('takes no action from another proposal\'s open period or a call for evidence', () => {
    const other: EuConsultation = { ...OPEN_ON_PROPOSAL, initiative: initiative([{ ...(OPEN_ON_PROPOSAL as { initiative: EuInitiative }).initiative.publications[1]!, reference: 'COM(2026)781' }]) }
    const v = euVorschlagView(response('52026PC0780', { consultation: other }), TODAY)
    expect(v.action).toBeNull()
    expect(v.sections.some((x) => x.door)).toBe(false)
  })

  it('names the station „Rat" for a procedure the Council decides alone', () => {
    const v = euVorschlagView(response('52026PC0308'), TODAY)
    expect(v.stations.map((s) => s.name)).toEqual(['Konsultation', 'Vorschlag', 'Rat', 'Amtsblatt', 'Umsetzung'])
    expect(decisionBodyOf({ type: 'OLP', reference: null })).toBe('parlament-rat')
    expect(decisionBodyOf({ type: null, reference: '2026/0307(COD)' })).toBe('parlament-rat')
    for (const t of ['CNS', 'APP', 'NLE']) expect(decisionBodyOf({ type: t, reference: null }), t).toBe('rat')
    expect(decisionBodyOf({ type: 'SYN', reference: null })).toBe('andere')
    expect(decisionBodyOf(null)).toBe('andere')
  })

  it('withdrawn: no action, and no act claimed — the page says none came of it', () => {
    // The portal still calling the period OPEN does not make an action of it.
    const stillOpen: EuConsultation = { ...OPEN_ON_PROPOSAL, reference: 'COM(2022)305', initiative: initiative([{ ...(OPEN_ON_PROPOSAL as { initiative: EuInitiative }).initiative.publications[1]!, reference: 'COM(2022)305' }]) }
    const v = euVorschlagView(response('52022PC0305', { consultation: stillOpen }), TODAY)
    // The heading names the state; the day stands at the station.
    expect(v.status).toBe('Zurückgezogen')
    expect(v.action).toBeNull()
    expect(v.sections.some((x) => x.door)).toBe(false)
    // The withdrawal ends the rail on a station of its own; „Amtsblatt" and the last station are not drawn.
    expect(v.stations.map((x) => [x.id, x.name, x.current])).toEqual([
      ['konsultation', 'Konsultation', false],
      ['vorschlag', 'Vorschlag', false],
      ['beschluss', 'Parlament und Rat', false],
      ['ruecknahme', 'Zurückgezogen', true],
    ])
    expect(v.stations[3]!.facts).toEqual(['Rücknahme durch die Kommission am 06.05.2024'])
    expect(JSON.stringify(v.stations[1])).not.toMatch(/zurückgezogen/i)
    expect(v.sections.map((x) => x.heading)).toEqual(['Konsultation', 'Vorschlag', 'Parlament und Rat', 'Zurückgezogen'])
    expect(v.sections[3]!.facts.map((f) => [f.title, f.parts])).toEqual([['Rücknahme durch die Kommission', ['06.05.2024']]])
    // Said once on the page.
    expect(JSON.stringify(v).match(/keinen Rechtsakt/g)).toHaveLength(1)
    expect(v.sections[3]!.notes).toEqual(['EUR-Lex verzeichnet keinen Rechtsakt, der aus diesem Vorschlag hervorgegangen ist.'])
    // Parliament's position before the withdrawal is a recorded step, shown as on an act's page.
    expect(v.stations[2]!.facts).toContain('Parlament 22.11.2023')
    expect(v.sections[2]!.notes).not.toContain('Bei Parlament und Rat sieht das Verfahren keinen Weg vor, auf dem sich Einzelne zu einem Vorschlag äußern können.')
    expect(JSON.stringify(v)).not.toMatch(/Rechtsakt geworden|Rechtsakte geworden|\/eu-recht\/(richtlinie|verordnung)/)
  })

  it('withdrawn by flag alone: said without a day', () => {
    const r = record('52021PC0890')
    const undated: EuProposalRecord = { ...r, dossiers: r.dossiers.map((d) => ({ ...d, withdrawn: null, procedure: { ...d.procedure, events: d.procedure.events.filter((e) => e.code !== 'WDW_byCOM') } })) }
    const v = euVorschlagView({ ...response('52021PC0890'), proposal: undated }, TODAY)
    expect(v.status).toBe('Laut EUR-Lex zurückgezogen')
    expect(v.stations.at(-1)).toMatchObject({ id: 'ruecknahme', facts: ['laut EUR-Lex, ohne Datum'], current: true })
    expect(v.sections.at(-1)!.facts[0]!.parts).toEqual(['laut EUR-Lex, ohne Datum'])
  })

  it('two acts: the page stays and links both', () => {
    const acts = [act('32024L1711', 'Richtlinie (EU) 2024/1711', '/eu-recht/richtlinie/2024/1711'), act('32024R1747', 'Verordnung (EU) 2024/1747', null)]
    const v = euVorschlagView(response('52023PC0148', { acts }), TODAY)
    expect(v.status).toBe('2 Rechtsakte geworden')
    expect(v.stations.at(-1)!.facts).toEqual(['steht bei den Rechtsakten'])
    expect(v.stations.map((s) => [s.id, s.name, !!s.ahead, s.current])).toEqual([
      ['konsultation', 'Konsultation', false, false],
      ['vorschlag', 'Vorschlag', false, false],
      ['beschluss', 'Parlament und Rat', false, false],
      ['amtsblatt', 'Amtsblatt', false, false],
      // The highlight is on the last station reached, not on the one before it.
      ['wirkung', 'Umsetzung und Geltung', false, true],
    ])
    const links = v.sections[3]!.facts[0]!
    expect(links).toMatchObject({ title: 'Rechtsakte' })
    expect(links.parts).toEqual([
      { href: '/eu-recht/richtlinie/2024/1711', label: 'Richtlinie (EU) 2024/1711', internal: true },
      { href: 'https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32024R1747', label: 'Verordnung (EU) 2024/1747' },
    ])
    // The split procedure: no Observatory link under the plain number.
    expect(JSON.stringify(v.sections[2])).not.toContain('oeil.europarl')
    // No decision of Parliament or Council on record (2023/0077(COD), as on its acts' pages).
    expect(v.sections[2]!.notes[0]).toBe('EUR-Lex verzeichnet zu diesem Vorschlag keinen Beschluss von Parlament oder Rat, den der Monitor liest.')
  })

  it('says it could not read the Cellar, and claims no stand', () => {
    const v = euVorschlagView({ ...response('52026PC0780'), proposal: null }, TODAY)
    expect(v.status).toBe('Der Vorschlag im Verfahren')
    expect(v.title).toBe('Vorschlag COM(2026) 780')
    expect(v.stations.find((s) => s.id === 'beschluss')).toMatchObject({ ahead: true, gap: expect.stringMatching(/^Gerade nicht abrufbar: /) })
    expect(JSON.stringify(v)).not.toMatch(/Anhängig|Zurückgezogen|Rechtsakt geworden|noch keinen Rechtsakt/)
    // Unread is not „ahead": nobody knows whether the stations are reached, so each keeps its section and says so.
    expect(v.sections.map((x) => x.id)).toEqual(['konsultation', 'vorschlag', 'beschluss', 'amtsblatt', 'wirkung'])
    for (const x of v.sections.slice(3)) expect(x.facts[0]!.parts[0]).toMatch(/^Gerade nicht abrufbar: /)
  })

  it('says a proposal without a procedure is one, not that nothing happened', () => {
    const v = euVorschlagView({ ...response('52026PC0780'), proposal: synthetic() }, TODAY)
    expect(v.stations.find((s) => s.id === 'beschluss')!.gap).toBe('EUR-Lex verzeichnet zu diesem Vorschlag kein Verfahren zwischen den Organen.')
    expect(v.stations.find((s) => s.id === 'beschluss')!.ahead).toBe(true)
  })

  it('names the last station from the kind the title names first', () => {
    const none: EuConsultation = { state: 'kein-vorschlag' }
    expect(effectKindOf('Vorschlag für eine VERORDNUNG DES EUROPÄISCHEN PARLAMENTS UND DES RATES zur Änderung der Richtlinie 2009/73', none)).toBe('geltung')
    expect(effectKindOf('Proposal for a COUNCIL DIRECTIVE on administrative cooperation', none)).toBe('umsetzung')
    expect(effectKindOf('Vorschlag für einen BESCHLUSS DES RATES', none)).toBe('geltung')
    expect(effectKindOf(null, OPEN_ON_PROPOSAL)).toBe('geltung')
    expect(effectKindOf(null, none)).toBeNull()
    expect(euVorschlagView({ ...response('52026PC0780'), proposal: { ...record('52026PC0780'), title: null } }, TODAY).stations.at(-1)!.name).toBe('Umsetzung oder Geltung')
  })

  it('says no duration, no countdown and no verdict (rule D6), and names no person', () => {
    const views = [
      euVorschlagView(response('52026PC0780', { consultation: OPEN_ON_PROPOSAL }), TODAY),
      euVorschlagView(response('52026PC0308'), TODAY),
      euVorschlagView(response('52021PC0890'), TODAY),
      euVorschlagView(response('52023PC0148', { acts: [act('32024L1711', 'Richtlinie (EU) 2024/1711', null)] }), TODAY),
      euVorschlagView({ ...response('52026PC0780'), proposal: synthetic(dossier({ flags: { pending: true, withdrawn: true, adopted: null } })) }, TODAY),
    ]
    // The monitor's words only — the Cellar's titles are not ours to hold to it.
    const words = JSON.stringify([views.map(({ title: _t, ...rest }) => rest), EU_VORSCHLAG_DE])
    expect(words).not.toMatch(/\bTage?n?\b|überfällig|verspätet|abgelaufen|seit \d|noch \d/i)
    expect(words).not.toMatch(/@|authorName|surname/i)
  })
})
