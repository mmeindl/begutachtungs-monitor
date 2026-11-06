import { describe, expect, it } from 'vitest'
import type { BundesrechtFinding, BundLandActResponse, LandConsultation } from '../shared/types'
import { bundesrechtLines, bundLandActPageView, draftsCountDe, fristQuoteOf, meLineView } from '../app/utils/bundesrecht'

const finding = (over: Partial<BundesrechtFinding>): BundesrechtFinding => ({ kind: 'grundsatzgesetz', name: null, bgbl: null, partial: false, path: null, kundmachung: null, risUrl: null, ...over })
const text = (l: ReturnType<typeof bundesrechtLines>[number]) => `${l.before}${l.linked ?? ''}${l.after}${l.citation ?? ''}.`

describe('the Land fact', () => {
  it('says „Führt das … aus, BGBl. …" with the name linked to the act page', () => {
    const [l] = bundesrechtLines({ findings: [finding({ name: 'Anstellungserfordernisse-Grundsatzgesetz', bgbl: { number: 44, year: 2025 }, path: '/bundesrecht/2025/44' })], sources: [] })
    expect(text(l!)).toBe('Führt das Anstellungserfordernisse-Grundsatzgesetz aus, BGBl. I Nr. 44/2025.')
    expect(l).toMatchObject({ linked: 'Anstellungserfordernisse-Grundsatzgesetz', path: '/bundesrecht/2025/44' })
  })

  it('says „teilweise" where the draft does', () => {
    expect(text(bundesrechtLines({ findings: [finding({ name: 'Sozialhilfe-Grundsatzgesetz', bgbl: { number: 25, year: 2025 }, partial: true })], sources: [] })[0]!)).toBe('Führt das Sozialhilfe-Grundsatzgesetz teilweise aus, BGBl. I Nr. 25/2025.')
  })

  it('never says „setzt … um" for a Grundsatzgesetz, and links no agreement', () => {
    const lines = bundesrechtLines({ findings: [finding({}), finding({ kind: 'vereinbarung', name: 'über Sozialbetreuungsberufe', path: '/x' })], sources: [] })
    expect(lines.map(text)).toEqual(['Führt Grundsatzbestimmungen des Bundes aus.', 'Setzt die Vereinbarung gemäß Art. 15a B-VG über Sozialbetreuungsberufe um.'])
    expect(lines[1]!.path).toBeNull()
  })

  it('says nothing where nothing was found', () => {
    expect(bundesrechtLines({ findings: [], sources: [] })).toEqual([])
    expect(bundesrechtLines(null)).toEqual([])
  })
})

describe('the Ministerialentwurf\'s line', () => {
  it('counts drafts, never Länder', () => {
    expect(meLineView({ path: '/bundesrecht/2025/44', drafts: 3, lands: ['ktn', 'ooe', 'stmk'], fristClause: null })?.link).toBe('Ausgeführt in 3 Entwürfen der Länder')
    expect(meLineView({ path: '/p', drafts: 1, lands: ['w'], fristClause: null })?.link).toBe('Ausgeführt in einem Entwurf der Länder')
  })

  it('says „noch kein Entwurf im Fenster" and the act\'s own Frist words where none exists — no zero', () => {
    const v = meLineView({ path: '/p', drafts: 0, lands: [], fristClause: 'Die Ausführungsgesetze der Länder sind binnen eines Jahres zu erlassen.' })
    expect(v).toEqual({ link: null, path: '/p', none: 'Ausführungsgesetze der Länder: noch kein Entwurf im Fenster', frist: 'Die Ausführungsgesetze der Länder sind binnen eines Jahres zu erlassen.' })
    expect(JSON.stringify(v)).not.toMatch(/\b0\b/)
  })

  it('has no line without an answer', () => {
    expect(meLineView(null)).toBeNull()
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

  it('draws a lane from the Kundmachung for a draft without Begutachtung dates (ktn-15193), none without a stand', () => {
    const undated = { ...draft('ktn-1', 'ktn'), begutachtung: { start: null, end: null }, stand: { date: '2026-07-30', label: 'Landesgesetzblatt' as const } }
    const nostand = { ...draft('ooe-2', 'ooe'), stand: null }
    const v = bundLandActPageView(response([undated, nostand, draft('w-3', 'w')]))
    expect(v.chart?.lanes.map((l) => l.key)).toEqual(['land:ktn-1', 'land:w-3'])
    const lane = v.chart!.lanes[0]!.bar
    expect(lane.band).toBeNull()
    expect(lane.from).toBe(0)
    expect(lane.value).toBeGreaterThan(lane.from)
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
