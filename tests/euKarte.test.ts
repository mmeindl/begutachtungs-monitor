import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { BgblOutcome, DraftChain, EuActView, EuMarker, EuRechtResponse, LandConsultation } from '../shared/types'
import { euActCelex, euActPath } from '../shared/utils/eu'
import { gpOfDay } from '../shared/utils/gp'
import {
  OPEN_DRAFT_MAX_AGE_MS,
  STORE_VERSION,
  emptyStore,
  fingerprintOf,
  isFresh,
  landKey,
  loadEuStore,
  meKey,
  risKey,
  saveEuStore,
  type EuStoreFile,
} from '../server/utils/eu/euMapStore'
import {
  actPageOf,
  actSummariesOf,
  assembleEuMap,
  isImplementing,
  markersOf,
  relatedActsOf,
  relatedPeriodOf,
  restatingOnlySummariesOf,
  standOfLand,
  standOfMe,
  standOfRis,
  type EuMapInputs,
} from '../server/utils/eu/euMap'
import { risConsultation } from './helpers/builders'

/*
 * The EU map (docs/architecture.md §12.66, Nachtrag 3): the facts on disk,
 * the join with the lists, and the three views the routes serve. Every
 * module here is pure; the store writes into a temp directory.
 */

const TODAY = '2026-11-04'
const WINDOW = { from: '2024-10-24', to: null }

function act(celex: string, over: Partial<EuActView> = {}): EuActView {
  return {
    kind: 'richtlinie',
    label: `Richtlinie (EU) ${celex.slice(1, 5)}/${Number(celex.slice(6))}`,
    celex,
    eurLexUrl: `https://eur-lex.europa.eu/eli/dir/${celex.slice(1, 5)}/${Number(celex.slice(6))}/oj/deu`,
    isNew: true,
    base: false,
    transposition: { deadline: '2026-05-07', otherDates: [] },
    adopted: '2024-04-11',
    title: null,
    ...over,
  }
}

function fact(marker: EuMarker | null, acts: EuActView[] = [], available = true): EuRechtResponse {
  return {
    available,
    unavailableReason: available ? null : 'Zu diesem Entwurf ist kein lesbares Vorblatt veröffentlicht.',
    marker,
    markerSource: marker ? 'vorblatt' : null,
    vorblattSentence: null,
    acts,
    actsSource: acts.length ? 'gesetzestext' : null,
    begutachtungStart: '2026-01-01',
    sources: [],
  }
}

function land(over: Partial<LandConsultation> & Pick<LandConsultation, 'id' | 'land'>): LandConsultation {
  return {
    kind: 'gesetz',
    title: `Entwurf ${over.id}`,
    startedAt: '2026-02-01',
    deadline: '2026-03-01',
    url: 'https://example.org',
    documents: [],
    active: false,
    ...over,
  }
}

function storeWith(entries: Record<string, EuRechtResponse>, over: Partial<EuStoreFile> = {}): EuStoreFile {
  return {
    ...emptyStore(),
    builtAt: '2026-11-04T03:00:00.000Z',
    window: WINDOW,
    entries: Object.fromEntries(Object.entries(entries).map(([k, f]) => [k, { fingerprint: 'fp', readAt: '2026-11-04T03:00:00.000Z', fact: f }])),
    ...over,
  }
}

const chain = (over: Partial<DraftChain>): DraftChain =>
  ({ station: 'begutachtung', rvCitation: null, rvDate: null, bgblNumber: null, filingOpen: false, ...over }) as DraftChain

function inputs(over: Partial<EuMapInputs> = {}): EuMapInputs {
  return {
    gp: 'XXVIII',
    window: WINDOW,
    store: emptyStore(),
    me: [],
    chains: {},
    ris: [],
    outcomes: {},
    laender: [],
    unavailableLands: [],
    today: TODAY,
    ...over,
  }
}

describe('euActPath and euActCelex', () => {
  it('builds the act page from a CELEX and reads it back', () => {
    expect(euActPath('32024L1069')).toBe('/eu-recht/richtlinie/2024/1069')
    expect(euActPath('32022R2554')).toBe('/eu-recht/verordnung/2022/2554')
    expect(euActPath('32009L0043')).toBe('/eu-recht/richtlinie/2009/43')
    expect(euActPath('32008F0913')).toBe('/eu-recht/rahmenbeschluss/2008/913')
    expect(euActCelex('richtlinie', '2009', '43')).toBe('32009L0043')
    expect(euActCelex('beschluss', '2023', '2749')).toBe('32023D2749')
    for (const celex of ['32024L1069', '32022R2554', '32009L0043', '32008F0913', '32023D2749']) {
      const [, , kind, year, number] = euActPath(celex)!.split('/')
      expect(euActCelex(kind!, year!, number!), celex).toBe(celex)
    }
  })

  it('names nothing for what is no act', () => {
    expect(euActPath('52024PC0001')).toBeNull()
    expect(euActPath('32024X1069')).toBeNull()
    expect(euActCelex('richtlinie', '2024', '0043')).toBeNull()
    expect(euActCelex('empfehlung', '2024', '43')).toBeNull()
    expect(euActCelex('richtlinie', '24', '43')).toBeNull()
  })
})

describe('the store', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'bm-eu-'))
    process.env.BM_STATE_DIR = dir
  })
  afterEach(() => {
    delete process.env.BM_STATE_DIR
  })

  it('round-trips one period into <state>/eu-recht/<gp>.json, and leaves no temp file', async () => {
    const store = storeWith({ [meKey('XXVIII', 147)]: fact('umsetzung', [act('32024L1069')]) }, { incomplete: ['stmk'] })
    expect(await saveEuStore('XXVIII', store)).toBe(true)
    expect(await readdir(join(dir, 'eu-recht'))).toEqual(['XXVIII.json'])
    const back = await loadEuStore('XXVIII')
    expect(back).toEqual({ ...store, version: STORE_VERSION })
  })

  it('has nothing for a period without a file, and builds no path from a malformed one', async () => {
    expect(await loadEuStore('XXVII')).toBeNull()
    expect(await saveEuStore('../x', emptyStore())).toBe(false)
    expect(await loadEuStore('../x')).toBeNull()
  })

  it('drops a file of another version whole — the readers changed what they say', async () => {
    await saveEuStore('XXVIII', storeWith({ [meKey('XXVIII', 1)]: fact(null) }))
    const file = join(dir, 'eu-recht', 'XXVIII.json')
    const raw = JSON.parse(await readFile(file, 'utf8')) as EuStoreFile
    await writeFile(file, JSON.stringify({ ...raw, version: STORE_VERSION - 1 }), 'utf8')
    expect(await loadEuStore('XXVIII')).toBeNull()
    await writeFile(file, '{"version":', 'utf8')
    expect(await loadEuStore('XXVIII')).toBeNull()
  })

  it('keys the three populations apart', () => {
    expect(meKey('XXVIII', 147)).toBe('me:XXVIII-147')
    expect(risKey('BEGUT_COO_2026_100_2_1')).toBe('ris:BEGUT_COO_2026_100_2_1')
    expect(landKey('ooe', '2026-16120')).toBe('land:ooe-2026-16120')
  })
})

describe('freshness', () => {
  const a = fingerprintOf(['https://ris/b.pdf', 'https://ris/a.xml', null, ''], { beginn: '2026-01-01' })

  it('reads the fingerprint independent of document order, but not of a date', () => {
    expect(fingerprintOf(['https://ris/a.xml', 'https://ris/b.pdf'], { beginn: '2026-01-01' })).toBe(a)
    expect(fingerprintOf(['https://ris/a.xml', 'https://ris/b.pdf'], { beginn: '2026-01-02' })).not.toBe(a)
    expect(fingerprintOf(['https://ris/a.xml', 'https://ris/c.pdf'], { beginn: '2026-01-01' })).not.toBe(a)
  })

  it('reuses a closed draft\'s fact as long as its documents and dates stand', () => {
    const entry = { fingerprint: a, readAt: '2025-01-01T00:00:00.000Z', fact: fact(null) }
    const now = Date.parse('2026-11-04T12:00:00.000Z')
    expect(isFresh(entry, a, false, now)).toBe(true)
    expect(isFresh(entry, `${a}x`, false, now)).toBe(false)
    expect(isFresh(undefined, a, false, now)).toBe(false)
  })

  it('reads an open draft again after 24 hours', () => {
    const now = Date.parse('2026-11-04T12:00:00.000Z')
    const at = (ms: number) => ({ fingerprint: a, readAt: new Date(now - ms).toISOString(), fact: fact(null) })
    expect(isFresh(at(OPEN_DRAFT_MAX_AGE_MS - 60_000), a, true, now)).toBe(true)
    expect(isFresh(at(OPEN_DRAFT_MAX_AGE_MS + 60_000), a, true, now)).toBe(false)
    expect(isFresh({ ...at(0), readAt: 'kaputt' }, a, true, now)).toBe(false)
  })
})

describe('the stand', () => {
  it('Ministerialentwurf: Kundmachung, else the Beschluss once past the Vorlage, else today', () => {
    expect(standOfMe(chain({ station: 'bgbl', bgblNumber: 'BGBl. I Nr. 5/2026', bgblDate: '2026-02-01', decidedAt: '2026-01-20' }), true, TODAY))
      .toEqual({ date: '2026-02-01', label: 'Bundesgesetzblatt' })
    expect(standOfMe(chain({ station: 'parlament', decidedAt: '2026-01-20', bundesratDecidedAt: '2026-01-29' }), true, TODAY))
      .toEqual({ date: '2026-01-29', label: 'Beschluss' })
    expect(standOfMe(chain({ station: 'bgbl', bgblNumber: 'BGBl. I Nr. 5/2026', decidedAt: '2026-01-20' }), true, TODAY))
      .toEqual({ date: '2026-01-20', label: 'Beschluss' })
    expect(standOfMe(chain({ station: 'rv', decidedAt: null }), true, TODAY)).toEqual({ date: TODAY, label: 'Heute' })
  })

  it('Ministerialentwurf: unknown, never today, where the station map was not at hand or misses the draft', () => {
    expect(standOfMe(undefined, false, TODAY)).toBeNull()
    expect(standOfMe(undefined, true, TODAY)).toBeNull()
  })

  it('RIS record: the dated Kundmachung, else today — unknown without the outcomes', () => {
    const k: BgblOutcome = { state: 'kundgemacht', nummer: 'BGBl. II Nr. 50/2026', datum: '2026-03-20', url: null, days: 19 }
    expect(standOfRis(k, true, TODAY)).toEqual({ date: '2026-03-20', label: 'Bundesgesetzblatt' })
    expect(standOfRis({ ...k, datum: null }, true, TODAY)).toEqual({ date: TODAY, label: 'Heute' })
    expect(standOfRis(undefined, true, TODAY)).toEqual({ date: TODAY, label: 'Heute' })
    expect(standOfRis(k, false, TODAY)).toBeNull()
  })

  it('Land: Landesgesetzblatt, the Landtag\'s dated Beschluss, else today — unknown where the stage is', () => {
    expect(standOfLand({ station: 'bgbl', label: 'LGBl.', detail: '57/2026', date: '2026-06-01' }, TODAY)).toEqual({ date: '2026-06-01', label: 'Landesgesetzblatt' })
    expect(standOfLand({ station: 'parlament', label: 'Beschluss', detail: null, date: '2026-05-01' }, TODAY)).toEqual({ date: '2026-05-01', label: 'Beschluss' })
    expect(standOfLand({ station: 'parlament', label: 'Landtag', detail: null, date: null }, TODAY)).toEqual({ date: TODAY, label: 'Heute' })
    expect(standOfLand(null, TODAY)).toEqual({ date: TODAY, label: 'Heute' })
    expect(standOfLand('unknown', TODAY)).toBeNull()
  })
})

describe('assembling the map', () => {
  const L1069 = act('32024L1069')
  const store = storeWith({
    [meKey('XXVIII', 147)]: fact('umsetzung', [L1069, act('32018L2001', { isNew: true, base: true, transposition: { deadline: '2021-06-30', otherDates: [] } })]),
    [meKey('XXVIII', 81)]: fact('umsetzung', [act('32024L1069', { isNew: false })]),
    [meKey('XXVIII', 90)]: fact(null),
    [meKey('XXVIII', 91)]: fact(null, [], false),
    [risKey('BEGUT_R1')]: fact('flankierend-vo', [act('32022R2554', { kind: 'verordnung', label: 'Verordnung (EU) 2022/2554', transposition: null })]),
    [landKey('ooe', '2026-16120')]: fact('umsetzung', [act('32024L1069', { isNew: null, adopted: null })]),
    [landKey('sbg', '35442')]: fact('ueber-umsetzung', [L1069]),
    [landKey('ktn', '1-2026-1')]: fact('umsetzung', [act('32024L1069', { isNew: false })]),
    // A stored fact whose draft is no longer listed: not in the map.
    [meKey('XXVIII', 999)]: fact('umsetzung', [L1069]),
  }, { incomplete: ['stmk'] })
  const me = [147, 81, 90, 91, 100].map((inr) => ({ gp: 'XXVIII', inr, citation: `${inr}/ME`, title: `Entwurf ${inr}`, arrivedAt: `2026-0${(inr % 9) + 1}-01`, deadline: '2026-10-01' }))
  const map = assembleEuMap(inputs({
    store,
    me,
    chains: { 147: chain({ station: 'begutachtung' }), 81: chain({ station: 'bgbl', bgblNumber: 'BGBl. I Nr. 1/2026', bgblDate: '2026-01-10' }) },
    ris: [risConsultation({ id: 'BEGUT_R1', kind: 'verordnung', title: 'DORA-Begleitverordnung', startedAt: '2026-03-01', deadline: '2026-04-01' })],
    outcomes: {},
    laender: [
      land({ id: 'ooe-2026-16120', land: 'ooe', startedAt: '2026-05-01', stage: { station: 'bgbl', label: 'LGBl.', detail: '57/2026', date: '2026-07-01' } }),
      land({ id: 'sbg-35442', land: 'sbg', startedAt: '2026-06-01' }),
      land({ id: 'ktn-1-2026-1', land: 'ktn', startedAt: null, stage: 'unknown' }),
    ],
    unavailableLands: ['t'],
  }))

  it('takes only the listed drafts whose fact carries a marker', () => {
    expect(map.drafts.map((d) => d.key).sort()).toEqual([
      'land:ktn-1-2026-1', 'land:ooe-2026-16120', 'land:sbg-35442', 'me:XXVIII-147', 'me:XXVIII-81', 'ris:BEGUT_R1',
    ])
    // Read, nothing: null. Not read at all (listed, no stored fact): no entry.
    expect(markersOf(map).get(meKey('XXVIII', 90))).toBeNull()
    expect(markersOf(map).get(meKey('XXVIII', 91))).toBeNull()
    expect(markersOf(map).has(meKey('XXVIII', 100))).toBe(false)
    expect(markersOf(map).get(landKey('sbg', '35442'))).toBe('ueber-umsetzung')
  })

  it('joins the lists for path, citation, kind, dates and stand', () => {
    const byKey = new Map(map.drafts.map((d) => [d.key, d]))
    expect(byKey.get('me:XXVIII-147')).toMatchObject({
      publisher: 'bund', path: '/entwuerfe/XXVIII/147', citation: '147/ME', kind: 'gesetz',
      begutachtung: { start: '2026-04-01', end: '2026-10-01' }, stand: { date: TODAY, label: 'Heute' }, marker: 'umsetzung',
    })
    expect(byKey.get('me:XXVIII-81')?.stand).toEqual({ date: '2026-01-10', label: 'Bundesgesetzblatt' })
    expect(byKey.get('ris:BEGUT_R1')).toMatchObject({ path: '/entwuerfe/BEGUT_R1', citation: null, kind: 'verordnung', stand: { date: TODAY, label: 'Heute' } })
    expect(byKey.get('land:ooe-2026-16120')).toMatchObject({ publisher: 'ooe', path: '/entwuerfe/oberoesterreich/2026-16120', stand: { date: '2026-07-01', label: 'Landesgesetzblatt' } })
    expect(byKey.get('land:ktn-1-2026-1')?.stand).toBeNull()
  })

  it('names the Bund\'s stand unknown when the station map is not at hand, without calling the Bund incomplete', () => {
    const cold = assembleEuMap(inputs({ store, me, chains: null, outcomes: null }))
    expect(cold.drafts.filter((d) => d.publisher === 'bund').map((d) => d.stand)).toEqual([null, null])
    expect(cold.incomplete).toEqual(['stmk'])
  })

  it('carries the build\'s incomplete publishers and the Länder unread now, in display order', () => {
    expect(map.incomplete).toEqual(['stmk', 't'])
    expect(map.builtAt).toBe('2026-11-04T03:00:00.000Z')
  })

  it('collects each act once, keeping a date a later reading knows', () => {
    expect(Object.keys(map.acts).sort()).toEqual(['32018L2001', '32022R2554', '32024L1069'])
    expect(map.acts['32024L1069']).toMatchObject({ path: '/eu-recht/richtlinie/2024/1069', adopted: '2024-04-11', transposition: { deadline: '2026-05-07' } })
  })

  it('takes the act\'s title as it takes its dates: the first reading, or a later one where the first had none', () => {
    const T = 'Richtlinie (EU) 2024/1069 des Europäischen Parlaments und des Rates vom 11. April 2024 über den Schutz …'
    const titled = (first: EuActView, second: EuActView) => assembleEuMap(inputs({
      store: storeWith({ [meKey('XXVIII', 147)]: fact('umsetzung', [first]), [meKey('XXVIII', 81)]: fact('umsetzung', [second]) }),
      me: [147, 81].map((inr) => ({ gp: 'XXVIII', inr, citation: `${inr}/ME`, title: `Entwurf ${inr}`, arrivedAt: '2026-01-01', deadline: null })),
    })).acts['32024L1069']!
    expect(titled(act('32024L1069', { title: T }), act('32024L1069', { title: 'anders' })).title).toBe(T)
    expect(titled(act('32024L1069'), act('32024L1069', { title: T })).title).toBe(T)
    expect(titled(act('32024L1069'), act('32024L1069')).title).toBeNull()
    // A fact stored before the title existed carries no key at all.
    const { title: _, ...old } = act('32024L1069')
    expect(titled(old as EuActView, old as EuActView).title).toBeNull()
  })

  it('splits implementing from restating by D4 and the base text', () => {
    expect(isImplementing({ isNew: true, base: false })).toBe(true)
    expect(isImplementing({ isNew: null, base: false })).toBe(true)
    expect(isImplementing({ isNew: false, base: false })).toBe(false)
    expect(isImplementing({ isNew: true, base: true })).toBe(false)
  })

  it('orders an act page Bund first, then the Länder in display order, the latest Begutachtung first', () => {
    const page = actPageOf(map, '32024L1069')!
    expect(page.implementing.map((d) => d.key)).toEqual(['me:XXVIII-147', 'land:ooe-2026-16120', 'land:sbg-35442'])
    expect(page.implementing[1]!.isNew).toBeNull()
    expect(page.restating.map((d) => d.key)).toEqual(['me:XXVIII-81', 'land:ktn-1-2026-1'])
    expect(page.restating[0]!.isNew).toBe(false)
    // Kärnten names the act, if only restating it: it is not „without"; the
    // Steiermark and Tirol are unread (`incomplete`), which is not „without" either.
    expect(page.landsWithout).toEqual(['bgld', 'noe', 'vbg', 'w'])
    expect(actPageOf(map, '32099L0001')).toBeNull()
  })

  it('orders drafts of one publisher by start, undated last', () => {
    const two = assembleEuMap(inputs({
      store: storeWith({ [landKey('w', '1')]: fact('umsetzung', [L1069]), [landKey('w', '2')]: fact('umsetzung', [L1069]), [landKey('w', '3')]: fact('umsetzung', [L1069]) }),
      laender: [land({ id: 'w-1', land: 'w', startedAt: '2026-01-01' }), land({ id: 'w-2', land: 'w', startedAt: null }), land({ id: 'w-3', land: 'w', startedAt: '2026-03-01' })],
    }))
    expect(actPageOf(two, '32024L1069')!.implementing.map((d) => d.key)).toEqual(['land:w-3', 'land:w-1', 'land:w-2'])
  })

  it('lists in the overview only acts a draft implements, the latest deadline first, undated by label', () => {
    const summaries = actSummariesOf(map)
    expect(summaries.map((s) => s.celex)).toEqual(['32024L1069', '32022R2554'])
    expect(summaries[0]).toMatchObject({ counts: { bund: 1, laender: 2 }, lands: ['ooe', 'sbg'] })
    expect(summaries[1]).toMatchObject({ counts: { bund: 1, laender: 0 }, lands: [] })
  })

  it('lists apart the acts drafts only restate or name as a base, counted by those drafts, never one a draft implements', () => {
    const only = restatingOnlySummariesOf(map)
    // 32024L1069 is restated by 81/ME and Kärnten but implemented by 147/ME: not here.
    expect(only.map((s) => s.celex)).toEqual(['32018L2001'])
    expect(only[0]).toMatchObject({ counts: { bund: 1, laender: 0 }, lands: [] })
    const restated = assembleEuMap(inputs({
      store: storeWith({
        [meKey('XXVIII', 81)]: fact('umsetzung', [act('32009L0043', { isNew: false, transposition: null })]),
        [landKey('sbg', '1')]: fact('umsetzung', [act('32009L0043', { isNew: false, transposition: null }), act('32011L0093', { isNew: false, transposition: { deadline: '2013-12-18', otherDates: [] } })]),
        [landKey('ktn', '2')]: fact('umsetzung', [act('32009L0043', { isNew: false, transposition: null })]),
      }),
      me: [{ gp: 'XXVIII', inr: 81, citation: '81/ME', title: 'Novelle', arrivedAt: '2026-01-01', deadline: null }],
      laender: [land({ id: 'sbg-1', land: 'sbg' }), land({ id: 'ktn-2', land: 'ktn' })],
    }))
    expect(actSummariesOf(restated)).toEqual([])
    // Sorted like the overview: a deadline first, then by label.
    expect(restatingOnlySummariesOf(restated).map((s) => [s.celex, s.counts, s.lands])).toEqual([
      ['32011L0093', { bund: 0, laender: 1 }, ['sbg']],
      ['32009L0043', { bund: 1, laender: 2 }, ['ktn', 'sbg']],
    ])
  })

  it('counts the OTHER implementing drafts of each act for a draft\'s own fact', () => {
    expect(relatedActsOf(map, 'me:XXVIII-147', ['32024L1069', '32018L2001'])).toEqual([
      { celex: '32024L1069', path: '/eu-recht/richtlinie/2024/1069', others: { bund: 0, laender: 2 } },
    ])
    expect(relatedActsOf(map, 'land:ktn-1-2026-1', ['32024L1069'])).toEqual([
      { celex: '32024L1069', path: '/eu-recht/richtlinie/2024/1069', others: { bund: 1, laender: 2 } },
    ])
    expect(relatedActsOf(map, 'ris:BEGUT_R1', ['32022R2554'])).toEqual([])
  })
})

describe('the period a draft\'s related lines come from', () => {
  it('places a day in the period whose window holds it, the open-ended newest one included', () => {
    expect(gpOfDay('2024-10-24')).toBe('XXVIII')
    expect(gpOfDay('2024-10-23')).toBe('XXVII')
    expect(gpOfDay('2021-03-01T00:00:00')).toBe('XXVII')
    expect(gpOfDay('2031-01-01')).toBe('XXVIII')
    expect(gpOfDay('1995-12-31')).toBeNull()
  })

  it('takes the map of the Begutachtung\'s own period, not the running one\'s', () => {
    expect(relatedPeriodOf('2023-05-02', 'XXVIII')).toEqual({ gp: 'XXVII', onlyIfRead: false })
    expect(relatedPeriodOf('2026-02-01', 'XXVIII')).toEqual({ gp: 'XXVIII', onlyIfRead: false })
  })

  it('falls to the running period only for an undated draft, and then only if its build read it', () => {
    expect(relatedPeriodOf(null, 'XXVIII')).toEqual({ gp: 'XXVIII', onlyIfRead: true })
  })

  it('has no period before the calendar — no map, no lines', () => {
    expect(relatedPeriodOf('1990-01-01', 'XXVIII')).toBeNull()
  })
})
