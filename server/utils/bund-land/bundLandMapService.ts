/**
 * The Bund-zu-Land map: built with the EU map, read by the act page and the
 * Ministerialentwurf's line (docs/architecture.md §12.67).
 *
 * BUILT IN THE EU MAP'S BUILD, not in a route of its own. Both maps read
 * the same Länder drafts, and both facts rest on one read of each draft's
 * PDFs (`laender/landDraftTexts.ts`); the EU build runs the Länder as one
 * loop over both stores (`runAligned`), so a draft that changed is fetched
 * once for both. A route of its own would read every Land's PDFs a second
 * time, at one request a second where a Land paces us. The prewarm unit
 * therefore needs no new line: `/api/eu-recht/karte` reports both.
 *
 * TWO HALVES, as the EU map: the build keeps each Land draft's finding on
 * disk (`bundLandStore.ts`); `getBundLandMap` joins the stored findings with
 * the current Länder list and the federal Grundsatzgesetze of the window —
 * a pure join (`bundLandMap.ts`), cached six hours. Each act's own side —
 * its RIS record, its Frist clause, its Ministerialentwurf — is
 * `getActHead`, cached on its own and warmed by the build.
 */
import type { BundLandActHead, LandCode, LandConsultation, MeBundesrechtLine } from '#shared/types'
import { bgblLong, todayIso } from '#shared/utils/format'
import { gpWindow } from '#shared/utils/gp'
import { LAND_CODES } from '#shared/utils/laender'
import { DERIVED_CACHE } from '../cache/base'
import { fingerprintOf } from '../cache/factStore'
import { onlyComplete, type Gathered } from '../cache/gathered'
import type { Population, PopulationJob, PopulationReport } from '../cache/population'
import { PUBLISHED_DOCUMENT_TTL_S } from '../cache/ttl'
import { withinBudget } from '../http/budget'
import { getDraftArticles } from '../lawtext/draftArticlesService'
import { readLaenderInWindow, readLandDraft } from '../laender/sources'
import { getStationMapForGp } from '../parliament/stationMap'
import { RIS_API_BASE, risJson, type UpstreamPolicy } from '../upstream/fetch'
import { landKey } from '../eu/euMapStore'
import { landNumberOf } from '../eu/euMap'
import { bgblActFor, getFristClause } from './bgblActService'
import { assembleBundLandMap, type BundLandMap, type BundLandMapAct, type FederalAct } from './bundLandMap'
import { bundLandStore, type BundLandStoreFile, type LandAusfuehrungFact } from './bundLandStore'
import { bgblActOf, bgblCitationDe, bgblKeyOf, meCarriesGrundsatz, vorlageDe } from './bundesgesetzblatt'
import { readLandAusfuehrung } from './landBundesrechtService'

/** As long as the EU map. */
const MAP_TTL_S = 60 * 60 * 6
/** How long a page waits for the station map an act's Ministerialentwurf is read from. */
const HEAD_BUDGET_MS = 2_500

// ---------------------------------------------------------------------------
// The build's half
// ---------------------------------------------------------------------------

/** A Land draft's fingerprint — the EU map's (`landFingerprint`), so a changed draft is read for both at once. */
function landFingerprint(d: LandConsultation): string {
  return fingerprintOf(d.documents.map((doc) => doc.url), { startedAt: d.startedAt, deadline: d.deadline })
}

function landJobs(items: readonly LandConsultation[]): PopulationJob<LandAusfuehrungFact>[] {
  return items.map((d) => {
    const number = landNumberOf(d.id)
    return {
      key: landKey(d.land, number),
      fingerprint: landFingerprint(d),
      open: d.active,
      read: async () => {
        const detail = await readLandDraft(d.land, number)
        if (!detail) throw new Error('Der Entwurf steht nicht mehr im Verzeichnis des Landes')
        return readLandAusfuehrung(d.land, number, detail)
      },
    }
  })
}

/** The Bund-zu-Land population of one build, aligned with the EU map's Länder (`runAligned`). */
export async function bundLandPopulation(gp: string, items: readonly LandConsultation[]): Promise<Population<LandAusfuehrungFact> & { store: BundLandStoreFile }> {
  const store = (await bundLandStore.load(gp)) ?? bundLandStore.empty()
  store.window = gpWindow(gp)
  return { store, jobs: landJobs(items), label: 'bund-land' }
}

/** What the EU build reports for this map. */
export interface BundLandBuildReport {
  population: PopulationReport
  acts: number
  /** Land drafts per act, by key („2025-44"). */
  drafts: Record<string, number>
  /** Acts with a Ministerialentwurf attached, and with a Frist clause. */
  withMe: string[]
  withFrist: string[]
  incomplete: LandCode[]
}

/** Asks the derived cache to assemble afresh on its next read — after a build. */
const invalidated = new Set<string>()

/**
 * Saves the store after the Länder ran, assembles the map and warms each
 * act's head with patience — nobody waits here.
 */
export async function finishBundLandBuild(gp: string, store: BundLandStoreFile, population: PopulationReport, items: readonly LandConsultation[], unavailable: readonly LandCode[]): Promise<BundLandBuildReport> {
  const missing = new Set<LandCode>(unavailable)
  for (const d of items) if (!store.entries[landKey(d.land, landNumberOf(d.id))]) missing.add(d.land)
  store.builtAt = new Date().toISOString()
  store.incomplete = LAND_CODES.filter((l) => missing.has(l))
  await bundLandStore.save(gp, store)
  invalidated.add(gp)
  const map = await getBundLandMap(gp)
  const heads = map ? await Promise.all(Object.values(map.acts).map(async (a) => ({ a, head: (await readActHead(a.bgbl.year, a.bgbl.number, a.names, true).catch(() => null))?.value ?? null }))) : []
  return {
    population,
    acts: heads.length,
    drafts: Object.fromEntries(heads.map(({ a }) => [a.key, a.drafts.length])),
    withMe: heads.filter((h) => h.head?.me).map((h) => `${h.a.key} ← ${h.head!.me!.citation}`),
    withFrist: heads.filter((h) => h.head?.fristClause).map((h) => h.a.key),
    incomplete: map?.incomplete ?? store.incomplete,
  }
}

// ---------------------------------------------------------------------------
// The federal Grundsatzgesetze of the window
// ---------------------------------------------------------------------------

const SEARCH_POLICY: UpstreamPolicy = { timeoutMs: 20_000, retries: 2, backoffMs: (attempt) => 600 * attempt, accept: 'application/json' }

/**
 * The words a Grundsatzgesetz carries, for RIS's full-text search in
 * `BgblAuth` (measured 06.11.2026 over the window of GP XXVIII: together
 * 2/2026, 25/2025, 44/2025, 47/2026, 50/2025, 91/2025, 117/2025 — the
 * seven acts of §12.66 Nachtrag 10). `Suchworte` works there; `Teil` and
 * `Jahrgang` are ignored, so Teil I is filtered here and the window by
 * `VonKundmachungsdatum` (docs/api-exploration.md).
 */
const GRUNDSATZ_WORDS = ['"Ausführungsgesetze der Länder"', 'Grundsatzbestimmung', 'Grundsatzbestimmungen', 'Grundsatzgesetz']

/* eslint-disable @typescript-eslint/no-explicit-any */
const searchBgbl = defineCachedFunction(
  (words: string, from: string): Promise<any> =>
    risJson<any>(`${RIS_API_BASE}?${new URLSearchParams({ Applikation: 'BgblAuth', DokumenteProSeite: 'OneHundred', Seitennummer: '1', Suchworte: words, VonKundmachungsdatum: from })}`, SEARCH_POLICY),
  { name: 'bund-land-suche', getKey: (words: string, from: string) => `${words}|${from}`, maxAge: MAP_TTL_S, swr: false },
)

/** Every Grundsatzgesetz in BGBl I since `from`; null where RIS did not answer. */
async function federalGrundsatzgesetze(from: string): Promise<FederalAct[] | null> {
  try {
    const out = new Map<string, FederalAct>()
    for (const words of GRUNDSATZ_WORDS) {
      const refs: any[] = [(await searchBgbl(words, from))?.OgdDocumentResults?.OgdDocumentReference ?? []].flat()
      for (const ref of refs) {
        const act = bgblActOf(ref)
        const m = /^BGBl\. I Nr\. (\d+)\/(\d{4})$/.exec(act?.nummer ?? '')
        if (m) out.set(`${m[2]}-${m[1]}`, { bgbl: { number: Number(m[1]), year: Number(m[2]) }, title: act?.titel ?? null, datum: act?.datum ?? null })
      }
    }
    return [...out.values()]
  } catch {
    return null
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// The map
// ---------------------------------------------------------------------------

async function assembleFromStore(gp: string): Promise<Gathered<BundLandMap | null>> {
  const store = await bundLandStore.load(gp)
  const window = gpWindow(gp)
  if (!store?.builtAt || !window) return { value: null, complete: true }
  const [laender, federal] = await Promise.all([readLaenderInWindow(window, 'all'), federalGrundsatzgesetze(window.from)])
  const map = assembleBundLandMap({
    gp,
    window,
    store,
    laender: laender.items,
    unavailableLands: laender.sources.filter((s) => s.state === 'unavailable').map((s) => s.land),
    federal: federal ?? [],
    today: todayIso(),
  })
  // Without the federal search the acts no Land has reached are missing: served, not kept.
  return { value: map, complete: federal !== null }
}

const cachedMap = defineCachedFunction(assembleFromStore, {
  name: 'bund-land-karte',
  base: DERIVED_CACHE,
  getKey: (gp: string) => gp,
  maxAge: MAP_TTL_S,
  swr: false,
  validate: onlyComplete,
  shouldInvalidateCache: (gp: string) => invalidated.delete(gp),
})

/** The period's map, or null where no build has finished yet. Read, never built. */
export async function getBundLandMap(gp: string): Promise<BundLandMap | null> {
  return (await cachedMap(gp)).value
}

// ---------------------------------------------------------------------------
// One act's own side
// ---------------------------------------------------------------------------

/** The Ministerialentwurf's law text, flat. */
async function meText(gp: string, inr: number): Promise<string> {
  const { blocks } = await getDraftArticles(gp, inr, 'ris-xml')
  return blocks.map((b) => b.text).join('\n')
}

/**
 * The act's head: RIS record, Frist clause, and the Ministerialentwurf
 * whose chain reaches the act and whose own text carried the Grundsatz
 * content (`meCarriesGrundsatz`, the Budgetbegleitgesetz case). `patient`
 * waits for a cold station map (the build); a page gives it a budget and,
 * without it, answers without the ME and does not keep the answer.
 */
async function assembleActHead(year: number, number: number, names: readonly string[], patient: boolean): Promise<Gathered<BundLandActHead | null>> {
  const bgbl = { year, number }
  const act = await bgblActFor(bgbl)
  if (!act) return { value: null, complete: true }
  let complete = true
  const fristClause = act.html
    ? await getFristClause(act.html).catch(() => {
        complete = false
        return null
      })
    : null

  let me: BundLandActHead['me'] = null
  if (act.gp) {
    const chains = patient ? await getStationMapForGp(act.gp).catch(() => null) : await withinBudget(getStationMapForGp(act.gp), HEAD_BUDGET_MS)
    if (!chains) complete = false
    const long = bgblLong(bgblCitationDe(bgbl))
    const inrs = Object.entries(chains ?? {}).filter(([, c]) => c.bgblNumber === long).map(([inr]) => Number(inr)).sort((a, b) => a - b)
    for (const inr of inrs) {
      const text = await meText(act.gp, inr).catch(() => {
        complete = false
        return null
      })
      if (text && meCarriesGrundsatz(text, names)) {
        me = { gp: act.gp, inr, citation: `${inr}/ME`, path: `/entwuerfe/${act.gp}/${inr}` }
        break
      }
    }
  }
  return {
    value: {
      bgbl,
      citation: bgblCitationDe(bgbl),
      path: `/bundesrecht/${year}/${number}`,
      title: act.titel,
      shortName: names[0] ?? null,
      kundmachung: act.datum,
      risUrl: act.page,
      vorlage: vorlageDe(act),
      me,
      fristClause,
    },
    complete,
  }
}

const cachedActHead = defineCachedFunction(assembleActHead, {
  name: 'bund-land-akt',
  base: DERIVED_CACHE,
  getKey: (year: number, number: number, names: readonly string[]) => `${year}-${number}|${names.join(';')}`,
  maxAge: PUBLISHED_DOCUMENT_TTL_S,
  swr: false,
  validate: onlyComplete,
})

/** The cached head; `patient` only from the build. */
export function readActHead(year: number, number: number, names: readonly string[], patient = false): Promise<Gathered<BundLandActHead | null>> {
  return cachedActHead(year, number, names, patient)
}

/** The head of a map act. */
export async function actHeadOf(act: BundLandMapAct): Promise<BundLandActHead | null> {
  return (await readActHead(act.bgbl.year, act.bgbl.number, act.names)).value
}

// ---------------------------------------------------------------------------
// The Ministerialentwurf's line
// ---------------------------------------------------------------------------

/** How long the line waits for the maps; without them in time, no line. */
const LINE_BUDGET_MS = 2_500

/**
 * The line on a Ministerialentwurf: only where its chain reaches a
 * Kundmachung that is an act of the map AND the act names this draft as its
 * origin — never during Begutachtung or Parliament, never „0 Länder".
 */
export async function meLineOf(gp: string, inr: number): Promise<MeBundesrechtLine | null> {
  const [chains, map] = await Promise.all([withinBudget(getStationMapForGp(gp), LINE_BUDGET_MS), withinBudget(getBundLandMap(gp), LINE_BUDGET_MS)])
  const number = chains?.[inr]?.bgblNumber
  const m = number ? /I Nr\. (\d+)\/(\d{4})$/.exec(number) : null
  if (!map || !m) return null
  const act = map.acts[bgblKeyOf({ number: Number(m[1]), year: Number(m[2]) })]
  if (!act) return null
  const head = await withinBudget(actHeadOf(act), LINE_BUDGET_MS)
  if (!head?.me || head.me.gp !== gp || head.me.inr !== inr) return null
  return { path: head.path, drafts: act.drafts.length, lands: LAND_CODES.filter((l) => act.drafts.some((d) => d.publisher === l)), fristClause: head.fristClause }
}
