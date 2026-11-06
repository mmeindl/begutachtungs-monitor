import { describe, expect, it } from 'vitest'
import type { BundesrechtFinding, BundLandActResponse, EuRechtResponse, LandConsultation } from '../shared/types'
import { LAENDER_BLOCK_ANCHOR, bundesrechtSectionHeading, bundesrechtCreditItems, bundesrechtFollowUp, bundesrechtRows, bundLandActPageView, draftsCountDe, fristQuoteOf, fristSpanOf, withBundesrechtFollowUp } from '../app/utils/bundesrecht'
import type { Station } from '../app/utils/spine'
import { BUNDESRECHT_FACT_ANCHOR, EU_FACT_ANCHOR, originTokens, withOrigin } from '../app/utils/origin'

const finding = (over: Partial<BundesrechtFinding>): BundesrechtFinding => ({ kind: 'grundsatzgesetz', name: null, bgbl: null, partial: false, path: null, kundmachung: null, risUrl: null, ...over })
const text = (r: ReturnType<typeof bundesrechtRows>[number]) => `${r.label}${r.citation ?? ''}${r.partial ? ', teilweise' : ''}`

describe('the Land block „Bundesrecht:"', () => {
  it('names the act with its citation, linked to the act page', () => {
    const [r] = bundesrechtRows({ findings: [finding({ name: 'Anstellungserfordernisse-Grundsatzgesetz', bgbl: { number: 44, year: 2025 }, path: '/bundesrecht/2025/44' })], sources: [] })
    expect(text(r!)).toBe('Anstellungserfordernisse-Grundsatzgesetz, BGBl. I Nr. 44/2025')
    expect(r!.path).toBe('/bundesrecht/2025/44')
  })

  it('keeps „teilweise", names an agreement without a link, and never „umgesetzt" for a Grundsatzgesetz', () => {
    const rows = bundesrechtRows({ findings: [finding({ name: 'Sozialhilfe-Grundsatzgesetz', bgbl: { number: 25, year: 2025 }, partial: true }), finding({ kind: 'vereinbarung', name: 'über Sozialbetreuungsberufe', path: '/x' }), finding({})], sources: [] })
    // The unnamed finding gets no row: no act a reader could look up.
    expect(rows.map(text)).toEqual(['Sozialhilfe-Grundsatzgesetz, BGBl. I Nr. 25/2025, teilweise', 'Vereinbarung gemäß Art. 15a B-VG über Sozialbetreuungsberufe'])
    expect(bundesrechtSectionHeading(rows)).toBe('Welches Bundesgesetz der Entwurf ausführt und welche Vereinbarung er umsetzt')
    expect(bundesrechtSectionHeading(rows.slice(0, 1))).toBe('Welches Bundesgesetz der Entwurf ausführt')
    expect(bundesrechtSectionHeading(rows.slice(1))).toBe('Welche Vereinbarung der Entwurf umsetzt')
    expect(bundesrechtSectionHeading(bundesrechtRows({ findings: [finding({})], sources: [] }))).toBeNull()
    expect(rows[1]!.path).toBeNull()
  })

  it('says nothing where nothing was found', () => {
    expect(bundesrechtRows({ findings: [], sources: [] })).toEqual([])
    expect(bundesrechtRows(null)).toEqual([])
  })
})

describe('the origin at the Entwurf station', () => {
  const eu = (marker: EuRechtResponse['marker']): EuRechtResponse => ({ available: true, unavailableReason: null, marker, markerSource: 'vorblatt', vorblattSentence: null, acts: [], actsSource: null, begutachtungStart: null, sources: [] })
  it('names EU law, a Grundsatzgesetz and an agreement as short lower-case tokens', () => {
    const tokens = originTokens(eu('umsetzung'), { findings: [finding({ name: 'Anstellungserfordernisse-Grundsatzgesetz', path: '/bundesrecht/2025/44' }), finding({ kind: 'vereinbarung' })], sources: [] })
    expect(tokens).toEqual([
      // The EU fact names no act here: plain text.
      { label: 'setzt EU-Recht um', href: null },
      { label: 'führt das Anstellungserfordernisse-Grundsatzgesetz aus', href: BUNDESRECHT_FACT_ANCHOR },
      { label: 'setzt eine Art.-15a-Vereinbarung um', href: null },
    ])
    expect(originTokens(eu('flankierend-vo'))[0]!.label).toBe('begleitet EU-Verordnungen')
    const named = { ...eu('umsetzung'), acts: [{ kind: 'richtlinie' as const, label: 'Richtlinie (EU) 2024/1069', celex: '32024L1069', eurLexUrl: 'https://eur-lex.europa.eu', isNew: true, base: false, transposition: null, adopted: null, title: null }] }
    expect(originTokens(named)[0]).toEqual({ label: 'setzt EU-Recht um', href: EU_FACT_ANCHOR })
    // No named act, no section: the token is plain text.
    expect(originTokens(null, { findings: [finding({})], sources: [] })).toEqual([{ label: 'führt ein Grundsatzgesetz aus', href: null }])
    expect(originTokens(null, { findings: [finding({ bgbl: { number: 191, year: 2023 } })], sources: [] })).toEqual([{ label: 'führt ein Grundsatzgesetz aus', href: BUNDESRECHT_FACT_ANCHOR }])
    expect(originTokens(null, { findings: [finding({ kind: 'vereinbarung' })], sources: [] })).toEqual([{ label: 'setzt eine Art.-15a-Vereinbarung um', href: null }])
    expect(originTokens({ ...eu(null), available: true }, null)).toEqual([])
  })

  it('stands at „Entwurf" only', () => {
    const st = (id: Station['id']): Station => ({ id, name: id, state: 'done', facts: ['01.01.2026'], comparison: null })
    const out = withOrigin([st('entwurf'), st('begutachtung')], [{ label: 'setzt EU-Recht um', href: '#x' }])
    expect(out.map((s) => s.factLinks?.length ?? 0)).toEqual([1, 0])
  })
})

describe('the Bundesgesetzblatt station\'s line on a Ministerialentwurf', () => {
  const station = (id: Station['id']): Station => ({ id, name: id, state: 'done', facts: [], comparison: null })
  it('counts drafts, never Länder, as a link at the station', () => {
    expect(bundesrechtFollowUp({ path: '/bundesrecht/2025/44', drafts: 3, lands: ['ktn', 'ooe', 'stmk'], fristClause: null, citation: 'BGBl. I Nr. 44/2025', rows: [] })).toEqual({ before: '', link: { href: LAENDER_BLOCK_ANCHOR, label: 'In 3 Entwürfen der Länder ausgeführt →' }, after: '' })
    expect(bundesrechtFollowUp({ path: '/p', drafts: 1, lands: ['w'], fristClause: null, citation: 'c', rows: [] })?.link.label).toBe('In einem Entwurf der Länder ausgeführt →')
  })

  it('says „noch kein Entwurf" and the Frist span, the word „Frist" linked — no zero', () => {
    const v = bundesrechtFollowUp({ path: '/p', drafts: 0, lands: [], citation: 'c', rows: [], fristClause: 'Die Ausführungsgesetze der Länder sind binnen sechs Monaten nach Inkrafttreten der Grundsatzbestimmungen gemäß Absatz 8, zu erlassen.' })
    expect(v).toEqual({ before: 'Ausführung durch die Länder: noch kein Entwurf · ', link: { href: LAENDER_BLOCK_ANCHOR, label: 'Frist' }, after: ': binnen sechs Monaten nach Inkrafttreten der Grundsatzbestimmungen' })
    expect(JSON.stringify(v)).not.toMatch(/\b0\b/)
    expect(bundesrechtFollowUp({ path: '/p', drafts: 0, lands: [], fristClause: null, citation: 'c', rows: [] })?.link.label).toBe('Ausführung durch die Länder: noch kein Entwurf')
  })

  it('puts it at the Bundesgesetzblatt and nowhere without an answer', () => {
    const line = { path: '/p', drafts: 2, lands: [], fristClause: null, citation: 'c', rows: [] }
    expect(withBundesrechtFollowUp([station('rv'), station('bgbl')], line).map((s) => Boolean(s.followUp))).toEqual([false, true])
    expect(withBundesrechtFollowUp([station('bgbl')], null)[0]!.followUp).toBeUndefined()
    expect(bundesrechtCreditItems(line)).toEqual(['Bundesgesetzblatt (RIS)', 'Dokumente der Länder'])
    expect(bundesrechtCreditItems({ ...line, drafts: 0 })).toEqual(['Bundesgesetzblatt (RIS)'])
    expect(bundesrechtCreditItems(null)).toEqual([])
  })

  it('reads the Frist span out of the three real clauses', () => {
    expect(fristSpanOf('Die Ausführungsgesetze der Länder sind binnen eines Jahres zu erlassen.')).toBe('binnen eines Jahres')
    expect(fristSpanOf('Die Ausführungsgesetze der Länder sind binnen neun Monaten zu erlassen.')).toBe('binnen neun Monaten')
    expect(fristSpanOf('Die Ausführungsgesetze der Länder sind binnen sechs Monaten nach Inkrafttreten der Grundsatzbestimmungen gemäß Absatz 8, zu erlassen.')).toBe('binnen sechs Monaten nach Inkrafttreten der Grundsatzbestimmungen')
  })

  it('quotes the whole Frist sentence, the unresolvable reference cut with „…", never ending on a comma', () => {
    // The three clauses as RIS prints them (44/2025, 47/2026, 91/2025).
    expect(fristQuoteOf('Die Ausführungsgesetze der Länder sind binnen eines Jahres zu erlassen.')).toBe('Die Ausführungsgesetze der Länder sind binnen eines Jahres zu erlassen.')
    expect(fristQuoteOf('Die Ausführungsgesetze der Länder sind binnen neun Monaten zu erlassen.')).toBe('Die Ausführungsgesetze der Länder sind binnen neun Monaten zu erlassen.')
    const q = fristQuoteOf('Die Ausführungsgesetze der Länder sind binnen sechs Monaten nach Inkrafttreten der Grundsatzbestimmungen gemäß Absatz 8, zu erlassen.')
    expect(q).toBe('Die Ausführungsgesetze der Länder sind binnen sechs Monaten nach Inkrafttreten der Grundsatzbestimmungen … zu erlassen.')
    expect(q).not.toMatch(/,\s*zu erlassen/)
    expect(fristQuoteOf('Die Ausführungsgesetze der Länder sind binnen drei Monaten nach Inkrafttreten der Bestimmungen gemäß § 41 Abs. 2 zu erlassen.')).toBe('Die Ausführungsgesetze der Länder sind binnen drei Monaten nach Inkrafttreten der Bestimmungen … zu erlassen.')
  })
})

describe('the act page', () => {
  const item = (id: string, land: LandConsultation['land']): LandConsultation => ({ id, land, kind: 'gesetz', title: `Gesetz, mit dem das Kinderbildungsgesetz ${id} geändert wird`, startedAt: '2025-10-01', deadline: '2025-11-01', url: 'https://example.org', documents: [], active: false })
  const response = (drafts: BundLandActResponse['drafts']): BundLandActResponse => ({
    gp: 'XXVIII',
    window: { from: '2024-10-24', to: null },
    builtAt: '2026-11-06T00:00:00Z',
    act: { bgbl: { number: 44, year: 2025 }, citation: 'BGBl. I Nr. 44/2025', path: '/bundesrecht/2025/44', title: 'Bundesgesetz, mit dem …', shortName: 'Anstellungserfordernisse-Grundsatzgesetz', kundmachung: '2025-07-24', risUrl: 'https://ris', vorlage: '128 d.B. (XXVIII. GP)', me: { gp: 'XXVIII', inr: 13, citation: '13/ME', path: '/entwuerfe/XXVIII/13' }, fristClause: 'Die Ausführungsgesetze der Länder sind binnen eines Jahres zu erlassen.' },
    drafts,
    incomplete: [],
  })
  const draft = (id: string, land: LandConsultation['land'], partial = false): BundLandActResponse['drafts'][number] => ({
    key: `land:${id}`, publisher: land, path: `/entwuerfe/x/${id}`, title: item(id, land).title, begutachtung: { start: '2025-10-01', end: '2025-11-01' }, stand: { date: '2026-11-06', label: 'Heute' }, partial, row: { kind: 'land', key: `land:${id}`, item: item(id, land) },
  })

  it('counts drafts with their Länder, draws the Kundmachung over the lanes, marks the partial row', () => {
    const v = bundLandActPageView(response([draft('ktn-1', 'ktn', true), draft('ooe-2', 'ooe'), draft('ooe-3', 'ooe')]))
    expect(v.count).toBe('3 Entwürfe der Länder (Kärnten und Oberösterreich)')
    expect(v.kundmachung).toBe('Kundgemacht am 24.07.2025')
    expect(v.chart?.deadlines[0]?.lines).toEqual(['Kundmachung', '24.07.2025'])
    expect(v.chart?.lanes).toHaveLength(3)
    expect(Object.values(v.partial)).toEqual(['führt es teilweise aus'])
    expect(JSON.stringify(v)).not.toMatch(/überfällig|verspätet|Tage/)
  })

  it('draws a lane without ink for a draft without Begutachtung dates (ktn-15193), none without a stand', () => {
    const undated = { ...draft('ktn-1', 'ktn'), begutachtung: { start: null, end: null }, stand: { date: '2026-07-30', label: 'Landesgesetzblatt' as const } }
    const nostand = { ...draft('ooe-2', 'ooe'), stand: null }
    const v = bundLandActPageView(response([undated, nostand, draft('w-3', 'w')]))
    expect(v.chart?.lanes.map((l) => l.key)).toEqual(['land:ktn-1', 'land:w-3'])
    const lane = v.chart!.lanes[0]!.bar
    expect(lane.band).toBeNull()
    // No ink: the line begins where the dot stands.
    expect(lane.from).toBe(lane.value)
    expect(v.entries).toHaveLength(3)
  })

  it('has no count and no chart without drafts', () => {
    const v = bundLandActPageView(response([]))
    expect(v.count).toBeNull()
    expect(v.chart).toBeNull()
  })

  it('counts one draft as one', () => {
    expect(draftsCountDe(['Wien'], 1)).toBe('1 Entwurf der Länder (Wien)')
  })
})
