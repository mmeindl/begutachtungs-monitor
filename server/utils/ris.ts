/**
 * Upstream client for the RIS OGD API, Applikation=Begut
 * (docs/api-exploration.md §2, docs/ris-join.md §4).
 *
 * Same cache rules as parliament.ts: caching only at the leaves, swr:false,
 * errors thrown rather than cached. RIS reports errors inside an HTTP-200
 * envelope (`OgdSearchResult.Error`), so success is checked on the body.
 * The full Begut corpus is ~4,600 records = 46 pages of 100; it changes a
 * few times a week, so one fetch per day is plenty.
 */
import type { RisMapResponse, RisMapRow } from '#shared/types'
import { GP_RE } from '#shared/utils/gp'
import { getDraftsForGp } from './parliament'
import {
  dedupeMeRows,
  joinRisToMe,
  RULE_VERSION,
  toMeListRows,
  type JoinCandidate,
} from './risJoin'
// Record shape and flattening live in `risRecord.ts` (pure, so scripts and
// vitest can run the shipped mapper); both are auto-imported server-side, so
// nothing is re-exported here.
import { asArray, flattenRisRecord, risDocumentUrl, type RisBegutFlat } from './risRecord'

export const RIS_API_BASE = 'https://data.bka.gv.at/ris/api/v2.6/Bundesrecht'
const RIS_PAGE_SIZE = 100
const RIS_MAX_PAGES = 80
const RIS_TIMEOUT_MS = 20_000
const RIS_MAX_RETRIES = 2
const RIS_RETRY_BACKOFF_MS = 1_000
const RIS_PAGE_PAUSE_MS = 300
// 20 h, not 24: the prewarm timer fires daily, and a TTL equal to its period
// would let the timer find a still-valid cache and refresh nothing.
const RIS_CORPUS_TTL_S = 60 * 60 * 20
const RIS_MAP_TTL_S = 60 * 30
const USER_AGENT = 'begutachtungs-monitor/0.1 (+https://begutachtungs-monitor.at)'

export interface RisBegutCorpus {
  fetchedAt: string
  hits: number
  records: RisBegutFlat[]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Loosely typed: the OGD JSON is generated from XML and not contractual.
/* eslint-disable @typescript-eslint/no-explicit-any */

async function fetchRisPage(page: number): Promise<{ hits: number; docs: any[] }> {
  const params = new URLSearchParams({
    Applikation: 'Begut',
    DokumenteProSeite: 'OneHundred',
    Seitennummer: String(page),
    'Sortierung.SortedByColumn': 'EndeBegutachtungsfrist',
    'Sortierung.SortDirection': 'Ascending',
  })
  const url = `${RIS_API_BASE}?${params}`
  let lastError: unknown
  for (let attempt = 0; attempt <= RIS_MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(RIS_RETRY_BACKOFF_MS * attempt)
    let body: any
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(RIS_TIMEOUT_MS),
      })
      if (!res.ok) {
        lastError = new Error(`RIS ${res.status} für Seite ${page}`)
        continue
      }
      body = await res.json()
    } catch (err) {
      lastError = err
      continue
    }
    const result = body?.OgdSearchResult
    if (!result || result.Error) {
      lastError = new Error(`RIS-Fehler auf Seite ${page}: ${JSON.stringify(result?.Error ?? body).slice(0, 200)}`)
      continue
    }
    const docs = asArray<any>(result.OgdDocumentResults?.OgdDocumentReference)
    const hits = Number(result.OgdDocumentResults?.Hits?.['#text'] ?? 0)
    return { hits, docs }
  }
  throw createError({ statusCode: 502, statusMessage: 'RIS-API nicht erreichbar', cause: lastError })
}
/**
 * One page of the result set, as RIS sent it. The politeness pause sits
 * inside the function, so it is paid on a fetch and not on a cache hit:
 * re-flattening the corpus from 46 cached pages must not cost 14 seconds of
 * sleeping. Bypassing the cache keeps the pause, because it is part of `fn`.
 *
 * **Cached in dev only.** The pages exist so that re-deriving the corpus
 * after a worker reload costs no network (`cacheBase.ts`), and that is a dev
 * concern by construction. In production they would earn nothing: page and
 * corpus share the 20 h TTL and expire together, so a rebuild re-fetches
 * either way — and until then the raw pages hold the whole corpus a second
 * time in its bulkier form, for no hit that would not have happened anyway
 * (measured 2026-09-09, warm resident memory on the VPS: 133 MB with the
 * pages cached, 90 MB without, of 952).
 */
const risPage = defineCachedFunction(
  async (page: number): ReturnType<typeof fetchRisPage> => {
    await sleep(RIS_PAGE_PAUSE_MS)
    return fetchRisPage(page)
  },
  {
    name: 'ris-begut-page',
    getKey: (page: number) => String(page),
    maxAge: RIS_CORPUS_TTL_S,
    swr: false,
    shouldBypassCache: () => !import.meta.dev,
  },
)
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * The whole Begut corpus, flattened and deduped by ID.
 *
 * Derived, not fetched: `flattenRisRecord` decides among other things
 * whether a draft has a Textgegenüberstellung, and a field it stopped
 * writing would read as "there is none" — a wrong answer, not a stale one.
 * The pages underneath are the cached half (`cacheBase.ts`).
 */
export const getRisBegutCorpus = defineCachedFunction(
  async (): Promise<RisBegutCorpus> => {
    const seen = new Set<string>()
    const records: RisBegutFlat[] = []
    let hits = 0
    for (let page = 1; page <= RIS_MAX_PAGES; page++) {
      const res = await risPage(page)
      hits = res.hits
      for (const doc of res.docs) {
        const flat = flattenRisRecord(doc)
        if (flat && !seen.has(flat.id)) {
          seen.add(flat.id)
          records.push(flat)
        }
      }
      if (res.docs.length < RIS_PAGE_SIZE || page * RIS_PAGE_SIZE >= hits) break
    }
    return { fetchedAt: new Date().toISOString(), hits, records }
  },
  { name: 'ris-begut-corpus', base: DERIVED_CACHE, getKey: () => 'all', maxAge: RIS_CORPUS_TTL_S, swr: false },
)

function toMapRow(
  row: { cite: string; inr: number; status: RisMapRow['status']; tier: RisMapRow['tier']; risId: string | null; reason: string | null; candidates: JoinCandidate[] },
  byId: Map<string, RisBegutFlat>,
): RisMapRow {
  const c = row.risId ? row.candidates.find((x) => x.risId === row.risId) ?? null : null
  const rec = row.risId ? byId.get(row.risId) ?? null : null
  return {
    citation: row.cite,
    inr: row.inr,
    status: row.status,
    tier: row.tier,
    risId: row.risId,
    risKurztitel: c?.risKurztitel ?? null,
    risUrl: row.risId ? risDocumentUrl(row.risId) : null,
    risDocument: rec?.mainDocument ?? null,
    textComparison: rec?.textComparison ?? null,
    score: c?.score ?? null,
    risBeginn: rec?.beginn ?? null,
    beginnOffsetDays: c?.dateOffset ?? null,
    endeOffsetDays: c?.endOffset ?? null,
    risEnde: c?.ende ?? null,
    reason: row.reason,
  }
}

/** RIS ↔ ME map for one GP: list 81 (cached) joined against the RIS corpus (cached). */
export const getRisMapForGp = defineCachedFunction(
  async (gp: string): Promise<RisMapResponse> => {
    if (!GP_RE.test(gp)) throw createError({ statusCode: 400, statusMessage: 'Ungültige Gesetzgebungsperiode' })
    const [drafts, corpus] = await Promise.all([getDraftsForGp(gp), getRisBegutCorpus()])
    const mes = dedupeMeRows(toMeListRows(drafts.items))
    const byId = new Map(corpus.records.map((r) => [r.id, r]))
    const rows = joinRisToMe(mes, corpus.records).map((r) => toMapRow(r, byId))
    const counts: RisMapResponse['counts'] = { matched: 0, matched_weak: 0, ambiguous: 0, unmatched: 0 }
    for (const r of rows) counts[r.status]++
    return {
      gp,
      ruleVersion: RULE_VERSION,
      risFetchedAt: corpus.fetchedAt,
      risRecordsConsidered: corpus.records.length,
      counts,
      rows,
    }
  },
  { name: 'ris-map-gp', base: DERIVED_CACHE, getKey: (gp: string) => gp, maxAge: RIS_MAP_TTL_S, swr: false },
)
