/**
 * Landesgesetze without a draft in the register — the list's rows and a
 * law's page (10.11.2026). The pure half is
 * `landLaws.ts`; this one reads RIS, the register and the Landtag's PDFs,
 * and caches.
 *
 * Caching and failure as `skippedLawsService.ts` and `cache/gathered.ts`
 * have it: what failed is not kept, and a read that failed or did not finish
 * produces no statement. A Landtag document's signal is held a week (the
 * document does not change, and the reader is one regex); a read that
 * throws is held nowhere. The list waits for the signals at most
 * `SIGNAL_BUDGET_MS`; what is not in by then stands without a statement,
 * the answer says `pending`, and the reads go on in the background — one
 * PDF at a time, on the process's slot (`READING`), so a cold window does
 * not parse thirty Vorlagen side by side.
 */
import type {
  LandCode,
  LandDraftDetail,
  LandLandtag,
  LandLaw,
  LandLawBegutachtung,
  LandLawDetail,
  LandLawSource,
  LandLawsResponse,
  LandProcedureStep,
  LandTextStation,
} from '#shared/types'
import { LAND_CODES, landDraftPath } from '#shared/utils/laender'
import { DERIVED_CACHE } from '../cache/base'
import { onlyComplete, type Gathered } from '../cache/gathered'
import { createSlots } from '../upstream/slots'
import { upstreamText } from '../upstream/fetch'
import { fetchLgblIndex, lgblRecord, type LgblRecord } from './lgblIndex'
import { lgblUnits } from './landLawDiff'
import { landLawsOfLgbl } from './landKonsLaws'
import { fetchLandPage, landJoins } from './sources'
import { ooeBeilagePdf } from './oberoesterreich'
import { pdfPages, TEXT_POLICY } from './texts/read'
import { salzburgLandtag } from './texts/salzburgLandtag'
import {
  classifyLandLaw,
  docSignalOf,
  hasSimilarDraft,
  isLandBudgetLaw,
  isLawEntry,
  landLawOf,
  lgblNrKey,
  materialsOf,
  routeOf,
  registerCoversFrom,
  STATEMENT_LANDS,
  type DocSignal,
  type LawEntry,
} from './landLaws'

const WEEK_S = 60 * 60 * 24 * 7
/** How long the list waits for the Landtag documents' signals. */
const SIGNAL_BUDGET_MS = 2_000
/** How long a law's page waits for its own Vorlage. */
const PAGE_SIGNAL_BUDGET_MS = 8_000
/** One PDF at a time, across every request (the heap note of `verdicts.ts`). */
const READING = createSlots(1)

const urlKey = (url: string) => encodeURIComponent(url)

/** What a Landtag PDF says about a Begutachtung (`docSignalOf`), held a week; a failed read throws and is held nowhere. */
export const landDocSignal = defineCachedFunction(
  async (url: string): Promise<DocSignal> => {
    const release = await READING.acquire()
    try {
      return docSignalOf((await pdfPages(url)).join(' '))
    } finally {
      release()
    }
  },
  { name: 'land-doc-signal', base: DERIVED_CACHE, getKey: urlKey, maxAge: WEEK_S, swr: false },
)

type Read<T> = { state: 'ok'; value: T } | { state: 'failed' } | { state: 'pending' }

/** Each promise's outcome after at most `ms`; the reads go on behind it. */
async function settleWithin<T>(promises: ReadonlyMap<string, Promise<T>>, ms: number): Promise<Map<string, Read<T>>> {
  const out = new Map<string, Read<T>>([...promises.keys()].map((k) => [k, { state: 'pending' }]))
  const all = [...promises].map(([k, p]) => p.then(
    (value) => { out.set(k, { state: 'ok', value }) },
    () => { out.set(k, { state: 'failed' }) },
  ))
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([Promise.all(all), new Promise<void>((resolve) => { timer = setTimeout(resolve, ms) })])
  if (timer) clearTimeout(timer)
  return new Map(out)
}

/** The documents a law's statement needs read — nothing for a Land that makes none, a joined law or a budget law. */
function docsNeeded(land: LandCode, e: LawEntry, joined: boolean): string[] {
  if (!STATEMENT_LANDS.has(land) || joined || isLandBudgetLaw(e.titel, e.meta.kurztitel)) return []
  const route = routeOf(land, e.meta)
  if (!route?.url) return []
  return e.meta.ausschussUrl ? [route.url, e.meta.ausschussUrl] : [route.url]
}

interface LandRead {
  laws: LawEntry[]
  joins: Map<string, string> | null
  drafts: Parameters<typeof hasSimilarDraft>[2] | null
  /** `registerCoversFrom`: from this day the register covers a law; null where nothing is known. */
  coversFrom: string | null
}

const covers = (read: LandRead, e: LawEntry) => read.coversFrom !== null && e.datum >= read.coversFrom

function classifyEntry(land: LandCode, e: LawEntry, read: LandRead, signal: (url: string) => Read<DocSignal> | undefined): { begutachtung: LandLawBegutachtung; pending: boolean } {
  const key = lgblNrKey(e.nr)
  const joined = read.joins ? (key !== null && read.joins.has(key)) : null
  const route = routeOf(land, e.meta)
  const doc = route?.url ? signal(route.url) : undefined
  const value = doc?.state === 'ok' ? doc.value : null
  const reportUrl = e.meta.ausschussUrl
  const reportRead = reportUrl ? signal(reportUrl) : undefined
  const begutachtung = classifyLandLaw({
    land,
    joined,
    covered: covers(read, e),
    budget: isLandBudgetLaw(e.titel, e.meta.kurztitel),
    similarDraft: read.drafts ? hasSimilarDraft(e, e.meta.beschluss, read.drafts) : null,
    route,
    vorlage: route?.kind === 'vorlage' ? value : null,
    antrag: route?.kind === 'antrag' ? value : null,
    report: reportUrl ? (reportRead?.state === 'ok' ? reportRead.value : null) : undefined,
  })
  // A statement that waits for a document still being read is no „unread": it comes.
  const pending = doc?.state === 'pending' || reportRead?.state === 'pending'
  return { begutachtung: pending && begutachtung.kind === 'silent' && begutachtung.reason === 'unread' ? { kind: 'silent', reason: 'pending' } : begutachtung, pending }
}

/**
 * The laws of one Land kundgemacht in `window`, as rows: those without a
 * joined draft — every one of them; the register's reach (`registerCoversFrom`)
 * decides only what the row and the page may say about a draft. Throws
 * where the index or the register could not be read — then nothing about
 * that Land's laws is known, and its state says so.
 */
async function readLandWindow(land: LandCode, window: { from: string; to: string | null }): Promise<{ items: LandLaw[]; source: LandLawSource; tally: Record<string, number> }> {
  const [index, { drafts, joins }] = await Promise.all([fetchLgblIndex(land), landJoins(land)])
  const laws = index.filter(isLawEntry).filter((e) => e.datum >= window.from && (window.to === null || e.datum <= window.to))
  const from = registerCoversFrom(drafts)
  const read: LandRead = { laws, joins, drafts, coversFrom: from }
  const urls = new Map<string, Promise<DocSignal>>()
  for (const e of laws) {
    const key = lgblNrKey(e.nr)
    for (const url of docsNeeded(land, e, key !== null && joins.has(key))) if (!urls.has(url)) urls.set(url, landDocSignal(url))
  }
  const signals = urls.size ? await settleWithin(urls, SIGNAL_BUDGET_MS) : new Map<string, Read<DocSignal>>()
  const tally: Record<string, number> = {}
  const items: LandLaw[] = []
  let pending = false
  let failed = false
  for (const e of laws) {
    const c = classifyEntry(land, e, read, (url) => signals.get(url))
    if (c.pending) pending = true
    if (c.begutachtung.kind === 'silent' && c.begutachtung.reason === 'unread') failed = true
    const cls = c.begutachtung.kind === 'consulted' ? `consulted-${c.begutachtung.by}` : c.begutachtung.kind === 'none' ? 'none' : `silent-${c.begutachtung.reason}`
    tally[cls] = (tally[cls] ?? 0) + 1
    const isRow = c.begutachtung.kind !== 'consulted' || c.begutachtung.by !== 'draft'
    if (!isRow) continue
    const law = landLawOf(land, e, c.begutachtung, covers(read, e))
    if (law) items.push(law)
  }
  return {
    items,
    source: {
      land,
      state: 'ok',
      registerCoversFrom: from,
      ...(STATEMENT_LANDS.has(land) ? { statements: pending ? 'pending' : failed ? 'unread' : 'complete' } : {}),
    },
    tally,
  }
}

/** Every Land's rows for a period's window (`/api/laender/gesetze`), each Land on its own: one failing takes only its rows. */
export async function readLandLaws(gp: string, window: { from: string; to: string | null } | null, lands: readonly LandCode[] = LAND_CODES): Promise<LandLawsResponse> {
  if (!window) return { gp, items: [], sources: lands.map((land) => ({ land, state: 'ok', registerCoversFrom: null })), tally: {} }
  const results = await Promise.allSettled(lands.map((land) => readLandWindow(land, window)))
  const items: LandLaw[] = []
  const tally: LandLawsResponse['tally'] = {}
  const sources: LandLawSource[] = lands.map((land, i) => {
    const r = results[i]!
    if (r.status === 'fulfilled') {
      items.push(...r.value.items)
      tally[land] = r.value.tally
      return r.value.source
    }
    console.warn(`[laender] Gesetze ${land} nicht abrufbar:`, r.reason instanceof Error ? r.reason.message : r.reason)
    return { land, state: 'unavailable', registerCoversFrom: null }
  })
  items.sort((a, b) => b.date.localeCompare(a.date) || b.year - a.year || b.number - a.number)
  return { gp, items, sources, tally }
}

/* ------------------------------------------------------------------ *
 * One law's page
 * ------------------------------------------------------------------ */

type TextGroups = NonNullable<LandLawDetail['text']>

/** The law text as promulgated, from RIS's XML (`lgblUnits`), grouped by Artikel — held a week, a failed read nowhere. */
export const landLawText = defineCachedFunction(
  async (xmlUrl: string): Promise<TextGroups> => {
    const units = lgblUnits(await upstreamText(xmlUrl, TEXT_POLICY))
    const groups: TextGroups = []
    for (const u of units) {
      // „Artikel I – Änderung des …" where the Artikel has a title; its number alone where it has none.
      const named = u.article && u.article !== u.articleNumber ? u.article : null
      const article = u.articleNumber ? (named ? `${u.articleNumber} – ${named}` : u.articleNumber) : null
      let g = groups.at(-1)
      if (!g || g.article !== article) {
        g = { article, units: [] }
        groups.push(g)
      }
      // A Ziffer's heading is its instruction line, which its text repeats.
      g.units.push({ id: u.id, heading: u.id.startsWith('§') ? u.heading : null, text: u.text })
    }
    return groups
  },
  { name: 'land-law-text', base: DERIVED_CACHE, getKey: urlKey, maxAge: WEEK_S, swr: false },
)

/** Salzburg's Landtag, read off the law's own record (`salzburgLandtag`) — a day, and only when the report was read. */
const salzburgLawLandtag = defineCachedFunction(
  async (nr: string, record: LgblRecord): Promise<Gathered<{ procedure: LandProcedureStep[]; landtag: LandLandtag | null } | null>> => {
    const reads = { complete: true }
    const value = await salzburgLandtag(record, reads)
    return { value, complete: reads.complete }
  },
  { name: 'land-law-sbg-landtag', base: DERIVED_CACHE, getKey: (nr: string) => nr.replace(/\D+/g, '-'), maxAge: 60 * 60 * 24, swr: false, validate: onlyComplete },
)

/**
 * The procedure from RIS's fields alone, where no Landtag document is read:
 * the route, the Beschluss, the Kundmachung — each only where RIS has it.
 * An Initiativantrag is a step of the Landtag, not the station
 * „Regierungsvorlage".
 */
function risReport(e: LawEntry): LandProcedureStep | null {
  const nr = e.meta.ausschuss
  if (!nr && !e.meta.ausschussUrl) return null
  return { date: null, label: nr ? `Ausschussbericht, Nr. ${nr}` : 'Ausschussbericht', url: e.meta.ausschussUrl, linkText: nr ? `Nr. ${nr}` : 'Ausschussbericht' }
}

function risProcedure(law: LandLaw, report: LandProcedureStep | null): LandProcedureStep[] {
  const steps: LandProcedureStep[] = []
  const r = law.route
  if (r?.kind === 'vorlage') steps.push({ date: null, label: r.number ? `Regierungsvorlage, Nr. ${r.number}` : 'Regierungsvorlage', url: r.url, station: 'rv' })
  if (r?.kind === 'antrag') steps.push({ date: null, label: r.number ? `Initiativantrag, Nr. ${r.number}` : 'Initiativantrag', url: r.url, kind: 'antrag' })
  if (report) steps.push(report)
  if (law.decidedAt) steps.push({ date: law.decidedAt, label: 'Beschluss des Landtags', url: null, station: 'parlament' })
  steps.push({ date: law.date, label: `Kundmachung, ${law.nr}`, url: law.url, station: 'bgbl' })
  return steps
}

/**
 * One law's page, by its number: null where RIS holds no Landesgesetz of
 * that number in the Land (a Verordnung, or none at all) — the route's 404.
 * Throws where the index could not be read (503).
 */
export async function readLandLawPage(land: LandCode, year: number, number: number): Promise<LandLawDetail | null> {
  const index = await fetchLgblIndex(land)
  const key = `${number}/${year}`
  const e = index.find((x) => lgblNrKey(x.nr) === key)
  if (!e || !isLawEntry(e)) return null
  const joined = await landJoins(land).catch((err: unknown) => {
    console.warn(`[laender] Zuordnung ${land} nicht abrufbar:`, err instanceof Error ? err.message : err)
    return null
  })
  const draftId = joined?.joins.get(key) ?? null

  // The Landtag document's signal, for the statement (Salzburg), within the page's budget.
  const urls = new Map<string, Promise<DocSignal>>()
  for (const url of docsNeeded(land, e, draftId !== null)) urls.set(url, landDocSignal(url))
  const signals = urls.size ? await settleWithin(urls, PAGE_SIGNAL_BUDGET_MS) : new Map<string, Read<DocSignal>>()
  const read: LandRead = { laws: [e], joins: joined?.joins ?? null, drafts: joined?.drafts ?? null, coversFrom: joined ? registerCoversFrom(joined.drafts) : null }
  const { begutachtung } = classifyEntry(land, e, read, (url) => signals.get(url))
  const law = landLawOf(land, e, begutachtung, joined ? covers(read, e) : null)
  if (!law) return null

  // RIS's record for the XML; Salzburg's Landtag off its links.
  const record = await lgblRecord(land, e.nr).catch(() => null)
  const sbg = land === 'sbg' && record?.vorlageUrl ? (await salzburgLawLandtag(e.nr, record).catch(() => null))?.value ?? null : null
  const text = record?.xmlUrl ? await landLawText(record.xmlUrl).catch(() => null) : null
  const report = risReport(e)
  const procedure = sbg?.procedure ?? risProcedure(law, report)
  const landtag: LandLandtag | null = sbg?.landtag ?? (law.decidedAt || report ? { committee: null, subcommittee: false, report, motions: [], decision: law.decidedAt ? { date: law.decidedAt, vote: null } : null } : null)
  const firstText = await firstTextOf(land, law, e.meta.periode).catch(() => null)
  // What the law changed (RIS, § by §), where its own text can be read for the instructions; then the first text against it.
  const comparisons: [LandTextStation, LandTextStation][] = [
    ...(record?.xmlUrl ? [['vorher', 'nachher'] as [LandTextStation, LandTextStation]] : []),
    ...(firstText && record?.xmlUrl ? [[firstText.station, 'lgbl'] as [LandTextStation, LandTextStation]] : []),
  ]
  return {
    law,
    draftPath: draftId ? landDraftPath(land, draftId) : null,
    procedure,
    landtag,
    materials: materialsOf(land, e.meta),
    materialsText: land === 'stmk' ? e.meta.materialien : null,
    procedureFrom: sbg ? 'bericht' : 'ris',
    periode: e.meta.periode,
    comparisons,
    firstText,
    text,
  }
}

/**
 * The law's first text, where the monitor can fetch it as a PDF: Salzburg links the Vorlage's or the Antrag's PDF itself;
 * Oberösterreich links the Beilage's page (until 2023), whose PDF is read
 * off it (`ooeBeilagePdf`, the page cached like every Land page). Nothing
 * for the other Länder: their links lead to the Landtag's item, not to a
 * text (measured).
 */
async function firstTextOf(land: LandCode, law: LandLaw, periode: string | null): Promise<LandLawDetail['firstText']> {
  const r = law.route
  if (!r?.url) return null
  const station = r.kind === 'vorlage' ? 'rv' as const : 'antrag' as const
  const word = r.kind === 'vorlage' ? 'Regierungsvorlage' : 'Initiativantrag'
  if (land === 'sbg') return { station, label: `${word}${salzburgBeilage(r.number, r.url, periode)}`, url: r.url }
  if (land === 'ooe') {
    const pdf = ooeBeilagePdf(await fetchLandPage(r.url), r.url, r.kind)
    // „Regierungsvorlage, Beilage 632/2023" — the Landtag's own citation, which „Zitieren" reads (`landTextCiteDe`).
    return pdf ? { station, label: r.number && /^\d+\/\d{4}$/.test(r.number) ? `${word}, Beilage ${r.number}` : word, url: pdf } : null
  }
  return null
}

/**
 * „, Nr 547 der Beilagen (4. Session der 17. GP)" — how Salzburg's Landtag
 * cites a Beilage (`salzburgLandtag`), the session read off the PDF's
 * address; without session or period only „, Nr. 547", which „Zitieren"
 * does not cite: the numbers start again each session.
 */
function salzburgBeilage(number: string | null, url: string, periode: string | null): string {
  if (!number) return ''
  const session = /\/(\d+)Session\//.exec(url)?.[1]
  const gp = periode?.replace(/\.$/, '')
  return session && gp ? `, Nr ${number} der Beilagen (${session}. Session der ${gp}. GP)` : `, Nr. ${number}`
}

/**
 * The law as the comparison service reads a draft (`compareLandTexts`): no
 * Begutachtungsentwurf, its Landtag's procedure, and a Kundmachung that is
 * certain because it is the law itself. Its number in the comparison cache
 * is the law's address (`lgbl/<year>/<nr>`), which no draft number can be.
 */
export function lawAsDraftDetail(d: LandLawDetail): LandDraftDetail {
  const l = d.law
  return {
    draft: {
      id: `${l.land}-lgbl/${l.year}/${l.number}`,
      land: l.land,
      kind: 'gesetz',
      title: l.title,
      startedAt: null,
      deadline: null,
      url: l.url ?? '',
      documents: [],
      active: false,
      stage: { station: 'bgbl', label: 'Kundgemacht', detail: l.nr, date: l.date, url: l.url },
    },
    statements: null,
    statementsUrl: null,
    statementsGap: null,
    filing: { kind: 'document' },
    summary: null,
    // The first text the comparison reads (`firstText`) in the step `textSources` looks for.
    procedure: d.firstText
      ? [
          d.firstText.station === 'rv'
            ? { date: null, label: d.firstText.label, url: d.firstText.url, station: 'rv' as const }
            : { date: null, label: d.firstText.label, url: d.firstText.url, kind: 'antrag' as const },
          ...d.procedure.filter((s) => s.station !== 'rv' && s.kind !== 'antrag'),
        ]
      : d.procedure.filter((s) => s.station !== 'rv' && s.kind !== 'antrag'),
    landtag: d.landtag,
    retentionNote: null,
    listUrl: '',
    comparisons: d.comparisons,
  }
}

/**
 * The laws a Landesgesetzblatt changed, created or repealed, at their
 * geltende Fassung (`landKonsLaws.ts`) — a day in the derived layer, as the
 * Bund's (`readBgblLaws`): an empty answer (RIS has not consolidated yet) is
 * an answer for that long and no longer; a failure throws and is not stored.
 */
export const readLandKonsLaws = defineCachedFunction(
  (land: LandCode, nr: string) => landLawsOfLgbl(land, nr),
  { name: 'land-kons-gesetze', base: DERIVED_CACHE, getKey: (land: LandCode, nr: string) => `${land}-${nr.replace(/\D+/g, '-')}`, maxAge: 60 * 60 * 24, swr: false },
)
