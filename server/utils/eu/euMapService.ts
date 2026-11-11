/**
 * The EU map: built where nobody waits, read by the lists under a budget.
 *
 * TWO HALVES, like the station map (`parliament/stationMap.ts`):
 *
 *  - `buildEuMap` reads every draft of a period's window — the
 *    Ministerialentwürfe, the RIS records without a Gegenstand, the Länder
 *    drafts — and keeps each fact on disk (`euMapStore.ts`). Only the
 *    prewarm route calls it (`/api/eu-recht/karte`): cold it costs hundreds
 *    of PDFs, and a Land paces us at one request a second.
 *  - `getEuMap` joins the stored facts with the current lists for dates and
 *    stand — a pure join (`euMap.ts`), cached in the derived layer for six
 *    hours. Without a store file there is no map: `null`, and every list
 *    says „not consulted" instead of „no EU matter".
 *
 * A FAILURE IS NOT AN ANSWER. A draft whose fact threw, or came
 * back incomplete (`Gathered.complete`), is not stored; its publisher is
 * named `incomplete` on every page the map feeds, until a build reads it.
 * An `available: false` fact IS an answer — no Vorblatt, no EU matter — and
 * is stored like any other.
 *
 * MEMORY STAYS FLAT: the builder holds keys, counters and the store's
 * small facts. PDFs and page texts live inside the services, which read
 * and drop them; the report samples the heap to show it.
 */
import type { EuMarker, EuPublisher, EuRechtResponse, LandCode, LandConsultation } from '#shared/types'
import { chainCoverageOf, mayClaimOutcome } from '#shared/utils/draftStations'
import { todayIso } from '#shared/utils/format'
import { gpHasEnded, gpWindow } from '#shared/utils/gp'
import { LAND_CODES } from '#shared/utils/laender'
import { DERIVED_CACHE } from '../cache/base'
import { onlyComplete, type Gathered } from '../cache/gathered'
import { withinBudget } from '../http/budget'
import { getCurrentGp, getDraftsForGp, reconcileActive } from '../parliament/drafts'
import { dedupeDraftList } from '../parliament/draftList'
import { getStationMapForGp } from '../parliament/stationMap'
import { findBgblIForVorlage, getBgblIssueDate, getBgblOutcomesForGp } from '../ris/bgblService'
import { getRisBegutRecord, getRisMapForGp } from '../ris/begutCorpus'
import { getRisOnlyForGp } from '../ris/risOnly'
import { withRisActiveOn, type RisBegutFlat } from '../ris/risRecord'
import { readLaenderInWindow, readLandDraft } from '../laender/sources'
import { readEuRecht, readRisEuRecht } from './euService'
import { readLandEuRecht } from './landEuService'
import { isVorblattDocument } from './vorblatt'
import {
  assembleEuMap,
  kundmachungDayPlan,
  landNumberOf,
  lookupKundmachungDays,
  lookupVorlagenKundmachung,
  markersOf,
  numbersWithoutDay,
  relatedActsOf,
  relatedPeriodOf,
  vorlagenWithoutNumber,
  withKundmachungDays,
  withVorlagenKundmachung,
  type EuMap,
} from './euMap'
import { emptyStore, landKey, loadEuStore, meKey, risKey, saveEuStore, type EuStoreFile } from './euMapStore'
import { fingerprintOf } from '../cache/factStore'
import { emptyReport, runAligned, runPopulation, type PopulationJob, type PopulationReport } from '../cache/population'
import { bundLandPopulation, finishBundLandBuild, type BundLandBuildReport } from '../bund-land/bundLandMapService'

/** As long as the station map: the stand a row shows comes from it. */
const EU_MAP_TTL_S = 60 * 60 * 6
/** The lists' brake on the station map and the outcomes inside an assembly — `/api/drafts`'s. */
const STAND_BUDGET_MS = 2_500
/** The concurrency the corpus runs held: 4 against RIS, 2 Länder drafts (their PDFs paced by `SitePacer`). */
const RIS_CONCURRENCY = 4
const LAND_CONCURRENCY = 2

/** What the prewarm route returns. */
export interface EuMapBuildReport {
  gp: string
  window: { from: string; to: string | null }
  builtAt: string
  populations: { ministerialentwuerfe: PopulationReport; ris: PopulationReport; laender: PopulationReport }
  heapPeakMb: number
  seconds: number
  drafts: number
  acts: number
  incomplete: EuPublisher[]
  /** The Bund-zu-Land map, built from the same Länder loop; null where the Länder could not be read. */
  bundLand: BundLandBuildReport | null
}

type Job = PopulationJob<EuRechtResponse>

/** The documents a RIS record's fact rests on: the draft, its Vorblätter, its Erläuterungen — and the first day. */
function recordFingerprint(record: RisBegutFlat): string {
  const formats = (u: { html: string | null; xml: string | null; pdf: string | null } | null) => (u ? [u.html, u.xml, u.pdf] : [])
  return fingerprintOf(
    [
      ...formats(record.mainDocument),
      ...record.otherDocuments.filter((d) => isVorblattDocument(d.name)).map((d) => d.urls.pdf),
      ...formats(record.explanations),
    ],
    { beginn: record.beginn, ris: record.id },
  )
}

/** A Land draft's fingerprint: its documents, the start of its Begutachtung and its Frist. */
function landFingerprint(d: LandConsultation): string {
  return fingerprintOf(d.documents.map((doc) => doc.url), { startedAt: d.startedAt, deadline: d.deadline })
}

/** The Ministerialentwürfe of the period, folded, each through the RIS↔ME join to its record's documents. */
async function meJobs(gp: string): Promise<Job[]> {
  const drafts = dedupeDraftList((await getDraftsForGp(gp)).items).map(reconcileActive)
  const rows = new Map((await getRisMapForGp(gp)).rows.map((r) => [r.inr, r]))
  const jobs: Job[] = []
  for (const d of drafts) {
    const row = rows.get(d.inr)
    const record = row?.risId ? await getRisBegutRecord(row.risId) : null
    jobs.push({
      key: meKey(gp, d.inr),
      // Without a record the fact says „no RIS record"; the join's status is
      // what can change that, so it is the fingerprint.
      fingerprint: record ? recordFingerprint(record) : fingerprintOf([], { join: row?.status ?? 'none' }),
      open: d.active,
      read: () => readEuRecht(gp, d.inr),
    })
  }
  return jobs
}

async function risJobs(gp: string): Promise<Job[]> {
  const items = withRisActiveOn((await getRisOnlyForGp(gp)).items)
  const jobs: Job[] = []
  for (const r of items) {
    const record = await getRisBegutRecord(r.id)
    jobs.push({
      key: risKey(r.id),
      fingerprint: record ? recordFingerprint(record) : fingerprintOf([], { ris: 'none' }),
      open: r.active,
      read: () => readRisEuRecht(r.id),
    })
  }
  return jobs
}

function landJobs(items: readonly LandConsultation[]): Job[] {
  return items.map((d) => {
    const number = landNumberOf(d.id)
    return {
      key: landKey(d.land, number),
      fingerprint: landFingerprint(d),
      open: d.active,
      read: async () => {
        const detail = await readLandDraft(d.land, number)
        if (!detail) throw new Error('Der Entwurf steht nicht mehr im Verzeichnis des Landes')
        return readLandEuRecht(d.land, number, detail)
      },
    }
  })
}

/** The Länder a population names incomplete: an unreadable list, or a draft not stored. */
function landsMissing(items: readonly LandConsultation[], store: EuStoreFile, unavailable: readonly LandCode[]): Set<LandCode> {
  const out = new Set<LandCode>(unavailable)
  for (const d of items) if (!store.entries[landKey(d.land, landNumberOf(d.id))]) out.add(d.land)
  return out
}

/** One build per period at a time: a second call waits for the first. */
const building = new Map<string, Promise<EuMapBuildReport>>()

/** Asks the derived cache to assemble afresh on its next read — after a build. */
const invalidated = new Set<string>()

/** The next assembly of these periods is the build's: patient with a Kundmachung's day (`kundmachungDayPlan`). */
const forBuild = new Set<string>()

/**
 * Reads every draft of a period's window into the store, then assembles
 * the map with the station map and the outcomes awaited in full. The
 * prewarm route's job.
 */
export function buildEuMap(gp: string): Promise<EuMapBuildReport> {
  let run = building.get(gp)
  if (!run) {
    run = runBuild(gp).finally(() => building.delete(gp))
    building.set(gp, run)
  }
  return run
}

async function runBuild(gp: string): Promise<EuMapBuildReport> {
  const window = gpWindow(gp)
  if (!window) throw createError({ statusCode: 404, statusMessage: 'Für diese Periode gibt es kein Fenster' })
  const t0 = Date.now()
  let heapPeak = process.memoryUsage().heapUsed
  const sampler = setInterval(() => {
    heapPeak = Math.max(heapPeak, process.memoryUsage().heapUsed)
  }, 500)
  sampler.unref?.()

  try {
    const store = (await loadEuStore(gp)) ?? emptyStore()
    store.window = window
    const incomplete = new Set<EuPublisher>()

    // (a) The Ministerialentwürfe.
    let me = emptyReport()
    try {
      me = await runPopulation(store, await meJobs(gp), RIS_CONCURRENCY, 'eu-karte')
    } catch (err) {
      console.warn('[eu-karte] Ministerialentwürfe nicht lesbar:', err instanceof Error ? err.message : err)
      incomplete.add('bund')
    }
    if (me.failed || me.partial) incomplete.add('bund')
    await saveEuStore(gp, store)

    // (b) The RIS records without a Gegenstand.
    let ris = emptyReport()
    try {
      ris = await runPopulation(store, await risJobs(gp), RIS_CONCURRENCY, 'eu-karte')
    } catch (err) {
      console.warn('[eu-karte] RIS-Begutachtungen nicht lesbar:', err instanceof Error ? err.message : err)
      incomplete.add('bund')
    }
    if (ris.failed || ris.partial) incomplete.add('bund')
    await saveEuStore(gp, store)

    // (c) The Länder, two drafts at a time — Steiermark and Tirol pace us —
    // and with each draft its Bund-zu-Land finding: one loop over
    // both stores, so a changed draft's PDFs are read once for both facts
    // (`runAligned`, `laender/landDraftTexts.ts`).
    let laender = emptyReport()
    let bundLand: { run: () => Promise<BundLandBuildReport> } | null = null
    try {
      const { items, sources } = await readLaenderInWindow(window, 'all')
      const unavailable = sources.filter((s) => s.state === 'unavailable').map((s) => s.land)
      const bl = await bundLandPopulation(gp, items)
      const [eu, blReport] = await runAligned([{ store, jobs: landJobs(items), label: 'eu-karte' }, bl], LAND_CONCURRENCY)
      laender = eu!
      for (const land of landsMissing(items, store, unavailable)) incomplete.add(land)
      bundLand = { run: () => finishBundLandBuild(gp, bl.store, blReport!, items, unavailable) }
    } catch (err) {
      console.warn('[eu-karte] Länder nicht lesbar:', err instanceof Error ? err.message : err)
      for (const land of LAND_CODES) incomplete.add(land)
    }
    store.builtAt = new Date().toISOString()
    store.incomplete = [...incomplete]
    await saveEuStore(gp, store)

    // Warm what the stand rests on, in full — nobody waits here — and let
    // the next read of the map assemble against it.
    await Promise.allSettled([getStationMapForGp(gp), getBgblOutcomesForGp(gp)])
    invalidated.add(gp)
    forBuild.add(gp)
    const map = await getEuMap(gp)
    // The Bund-zu-Land map after the EU's: its acts' heads read the station map warmed above.
    const bundLandReport = bundLand
      ? await bundLand.run().catch((err) => {
          console.warn('[bund-land] Karte nicht gebaut:', err instanceof Error ? err.message : err)
          return null
        })
      : null

    return {
      gp,
      window,
      builtAt: store.builtAt,
      populations: { ministerialentwuerfe: me, ris, laender },
      heapPeakMb: Math.round(heapPeak / 1024 / 1024),
      seconds: Math.round((Date.now() - t0) / 100) / 10,
      drafts: map?.drafts.length ?? 0,
      acts: map ? Object.keys(map.acts).length : 0,
      incomplete: map?.incomplete ?? [...incomplete],
      bundLand: bundLandReport,
    }
  } finally {
    clearInterval(sampler)
  }
}

/**
 * The stored facts joined with today's lists. Incomplete — and so not
 * cached — where the station map or the outcomes missed their budget: the
 * rows then carry `stand: null`, and the next read tries again. Not where
 * a Kundmachung's day or a Vorlage's Kundmachung went unanswered: that is a
 * soft gap (below).
 */
async function assembleFromStore(gp: string): Promise<Gathered<EuMap | null>> {
  const patient = forBuild.delete(gp)
  const store = await loadEuStore(gp)
  const window = gpWindow(gp)
  if (!store?.builtAt || !window) return { value: null, complete: true }

  const [drafts, risOnly, laender, chains, outcomes, currentGp] = await Promise.all([
    getDraftsForGp(gp),
    getRisOnlyForGp(gp),
    readLaenderInWindow(window, 'all'),
    withinBudget(getStationMapForGp(gp), STAND_BUDGET_MS),
    withinBudget(getBgblOutcomesForGp(gp), STAND_BUDGET_MS),
    getCurrentGp(),
  ])
  // A readable map is not yet a period one may speak about: where
  // it may not, no Ministerialentwurf gets a stand.
  const speakable = chains && mayClaimOutcome(chainCoverageOf(Object.values(chains), gpHasEnded(gp, currentGp)))
  let stands = speakable ? chains : null
  // A decided Vorlage the station map found no Kundmachung for — its RIS
  // search missed the map's budget, or the law came out since: asked again
  // by the Vorlage the chain names (`bgblSearch`), under the same plan as
  // the day below. Before the day: a number found here comes with its day.
  const searches = stands ? vorlagenWithoutNumber(stands) : []
  if (stands && searches.length) {
    const plan = kundmachungDayPlan(patient)
    const { found, unanswered } = await lookupVorlagenKundmachung(searches, (s) => findBgblIForVorlage(s.gp, s.inr, s.from), plan)
    stands = withVorlagenKundmachung(stands, found)
    if (patient && unanswered) console.warn(`[eu-karte] ${gp}: ${unanswered} von ${searches.length} Kundmachungssuchen ohne Antwort`)
  }
  // A chain with a BGBl number and no day missed the station map's date
  // lookup; asked again here, patiently where a build waits — else a
  // promulgated law stood at „Beschluss" until the next build.
  const missing = stands ? numbersWithoutDay(stands) : []
  if (stands && missing.length) {
    const { days, unanswered } = await lookupKundmachungDays(missing, getBgblIssueDate, kundmachungDayPlan(patient))
    stands = withKundmachungDays(stands, days)
    if (patient && unanswered) console.warn(`[eu-karte] ${gp}: ${unanswered} von ${missing.length} Kundmachungstagen ohne Antwort`)
  }
  const map = assembleEuMap({
    gp,
    window,
    store,
    me: dedupeDraftList(drafts.items),
    chains: stands,
    ris: risOnly.items,
    outcomes,
    laender: laender.items,
    unavailableLands: laender.sources.filter((s) => s.state === 'unavailable').map((s) => s.land),
    today: todayIso(),
  })
  // A day — or a Vorlage's Kundmachung — nobody answered is not a failure
  // of the map: the row says „Beschluss" with its date, which is true, and
  // the next build asks again.
  // Calling the map incomplete here would keep it out of the cache and
  // re-assemble it, with the wait, on every page view while RIS is slow.
  return { value: map, complete: chains !== null && outcomes !== null }
}

const cachedEuMap = defineCachedFunction(assembleFromStore, {
  name: 'eu-karte',
  base: DERIVED_CACHE,
  getKey: (gp: string) => gp,
  maxAge: EU_MAP_TTL_S,
  swr: false,
  validate: onlyComplete,
  shouldInvalidateCache: (gp: string) => invalidated.delete(gp),
})

/** The period's EU map, or null where no build has finished yet. */
export async function getEuMap(gp: string): Promise<EuMap | null> {
  return (await cachedEuMap(gp)).value
}

/** How long a fact endpoint waits for the map before answering without `related`. */
const RELATED_BUDGET_MS = 1_000

/**
 * A draft's fact with the other drafts of the map that implement its acts
 * (`EuRelatedAct`). Without the map in time the field is absent; the fact
 * itself is never changed, and `related` is never stored with it.
 */
export async function withRelated(fact: EuRechtResponse, gp: string, key: string): Promise<EuRechtResponse> {
  const map = await withinBudget(getEuMap(gp), RELATED_BUDGET_MS)
  if (!map) return fact
  return { ...fact, related: relatedActsOf(map, key, fact.acts.map((a) => a.celex)) }
}

/**
 * `withRelated` for a draft without a period of its own — a RIS record, a
 * Land's draft: the map of the period its Begutachtung began in
 * (`relatedPeriodOf`), not the running one's.
 *
 * READ, NEVER BUILT. `getEuMap` only joins a store a prewarm build wrote
 * (`assembleFromStore` → `loadEuStore`); a period without one answers null
 * and the field stays off — no related lines, which is the honest answer
 * for a period nobody mapped. Nothing on this path reaches `buildEuMap`.
 */
export async function withRelatedOfOwnPeriod(fact: EuRechtResponse, key: string, currentGp: string): Promise<EuRechtResponse> {
  const period = relatedPeriodOf(fact.begutachtungStart, currentGp)
  if (!period) return fact
  const map = await withinBudget(getEuMap(period.gp), RELATED_BUDGET_MS)
  if (!map || (period.onlyIfRead && !map.read.includes(key))) return fact
  return { ...fact, related: relatedActsOf(map, key, fact.acts.map((a) => a.celex)) }
}

/** How long a list waits for the map — the station map's brake (`/api/drafts`). */
export const EU_MAP_LIST_BUDGET_MS = 2_500

/** The map's markers for a list, by key, or null where the map is not at hand within the budget. */
export async function euMarkersForList(gp: string): Promise<Map<string, EuMarker | null> | null> {
  const map = await withinBudget(getEuMap(gp), EU_MAP_LIST_BUDGET_MS)
  return map ? markersOf(map) : null
}
