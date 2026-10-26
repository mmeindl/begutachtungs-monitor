/**
 * Upstream client for the RIS OGD API, Applikation=Begut
 * (docs/api-exploration.md §2, docs/ris-join.md §4).
 *
 * Same cache rules as parliament/drafts.ts: caching only at the leaves, swr:false,
 * errors thrown rather than cached. RIS reports errors inside an HTTP-200
 * envelope (`OgdSearchResult.Error`), so success is checked on the body.
 * The full Begut corpus is ~4,600 records = 46 pages of 100; it changes a
 * few times a week, so one fetch per day is plenty.
 */
import type { RisMapResponse, RisMapRow } from '#shared/types'
import { GP_RE } from '#shared/utils/gp'
import { getDraftsForGp } from '../parliament/drafts'
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
import { RIS_API_BASE, risJson, sleep, type UpstreamPolicy } from '../upstream/fetch'
import { unpack } from '../cache/memoryDriver'

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
const RIS_POLICY: UpstreamPolicy = {
  timeoutMs: RIS_TIMEOUT_MS,
  retries: RIS_MAX_RETRIES,
  backoffMs: (attempt) => RIS_RETRY_BACKOFF_MS * attempt,
  accept: 'application/json',
  // Every non-OK status is retried here, not only 5xx — the behaviour this
  // client had before the shared one, kept because the corpus fetch runs
  // unattended in the prewarm and a page lost to a transient 4xx would
  // silently shorten it.
  retryOnHttpError: true,
}

interface RisBegutCorpus {
  fetchedAt: string
  hits: number
  records: RisBegutFlat[]
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
  let result: any
  try {
    result = await risJson<any>(`${RIS_API_BASE}?${params}`, RIS_POLICY)
  } catch (cause) {
    throw createError({ statusCode: 502, statusMessage: 'RIS-API nicht erreichbar', cause })
  }
  const docs = asArray<any>(result.OgdDocumentResults?.OgdDocumentReference)
  const hits = Number(result.OgdDocumentResults?.Hits?.['#text'] ?? 0)
  return { hits, docs }
}
/**
 * One page of the result set, as RIS sent it. The politeness pause sits
 * inside the function, so it is paid on a fetch and not on a cache hit:
 * re-flattening the corpus from 46 cached pages must not cost 14 seconds of
 * sleeping. Bypassing the cache keeps the pause, because it is part of `fn`.
 *
 * **Cached in dev only.** The pages exist so that re-deriving the corpus
 * after a worker reload costs no network (`cache/base.ts`), and that is a dev
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
 * The pages underneath are the cached half (`cache/base.ts`).
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
    const corpus = { fetchedAt: new Date().toISOString(), hits, records }
    corpusIndex = indexOf(corpus)
    return corpus
  },
  { name: 'ris-begut-corpus', base: DERIVED_CACHE, getKey: () => 'all', maxAge: RIS_CORPUS_TTL_S, swr: false },
)

/**
 * ONE RECORD WITHOUT THE CORPUS (26.10.2026). A draft page, or one of its
 * sections, needs one record of the ~4.600 — and `getRisConsultation` found
 * it by reading the whole corpus out of the cache: 10 MB of JSON parsed into
 * ~50 MB of objects to keep one, twice on a first page view and once per
 * section. Over the prewarm's pages those reads were the largest burst left
 * on the heap.
 *
 * So the build that makes a corpus files its records by id as well: their
 * JSON as one block of UTF-8 bytes, one per character as the cache keeps a
 * value (`cache/memoryDriver.ts`), and where each record lies in it. A
 * lookup decodes a few kilobytes and parses a fresh copy, so no reader
 * shares an object with another. The block is the corpus once more, ~10 MB
 * beside the heap; there is one, and the next build replaces it.
 *
 * TIED TO THE CORPUS IT CAME FROM, so no answer can differ from a read of
 * the corpus: the index answers only while the cache still holds the
 * corpus built with it — not past that corpus's lifetime, counted from a
 * moment before Nitro stamps it, and not once the budget has pushed the
 * corpus out. Then a lookup reads the corpus as it always did: a fresh one
 * where it is gone, failing as that build fails.
 */
interface CorpusIndex {
  fetchedAt: string
  builtAt: number
  /** Every record's JSON, its UTF-8 bytes one per character. */
  block: string
  /** Where each record's bytes lie in `block`, by RIS id. */
  spans: Map<string, readonly [number, number]>
}

/** The index of the corpus this process built last. */
let corpusIndex: CorpusIndex | null = null

/**
 * Where Nitro keeps the corpus: `[base, group, name, key + '.json']` joined
 * by colons, the group `nitro/functions` by default (nitropack 2.13,
 * runtime/internal/cache.mjs; `tests/risCorpusIndex.test.ts` holds both
 * halves — this key and the corpus's options above).
 */
const CORPUS_STORAGE_KEY = [DERIVED_CACHE, 'nitro/functions', 'ris-begut-corpus', 'all.json'].join(':')

function indexOf(corpus: RisBegutCorpus): CorpusIndex {
  const json = corpus.records.map((r) => JSON.stringify(r))
  const lengths = json.map((j) => Buffer.byteLength(j))
  const bytes = Buffer.allocUnsafeSlow(lengths.reduce((sum, n) => sum + n, 0))
  const spans = new Map<string, readonly [number, number]>()
  let at = 0
  corpus.records.forEach((r, i) => {
    bytes.write(json[i]!, at, 'utf8')
    spans.set(r.id, [at, at + lengths[i]!])
    at += lengths[i]!
  })
  return { fetchedAt: corpus.fetchedAt, builtAt: Date.now(), block: bytes.toString('latin1'), spans }
}

function recordIn(index: CorpusIndex, id: string): RisBegutFlat | null {
  const span = index.spans.get(id)
  return span ? (JSON.parse(unpack(index.block.slice(span[0], span[1]))) as RisBegutFlat) : null
}

/** Whether the cache still serves the corpus `index` was built with. */
async function stillServed(index: CorpusIndex): Promise<boolean> {
  if (Date.now() - index.builtAt <= RIS_CORPUS_TTL_S * 1000 && (await useStorage().hasItem(CORPUS_STORAGE_KEY))) return true
  // Gone or expired: the index answers nothing more, and need not be kept.
  if (corpusIndex === index) corpusIndex = null
  return false
}

/** One record of the corpus by RIS id — what `getRisBegutCorpus().records.find(…)` would answer. */
export async function getRisBegutRecord(id: string): Promise<RisBegutFlat | null> {
  const index = corpusIndex
  if (index && (await stillServed(index))) return recordIn(index, id)
  const corpus = await getRisBegutCorpus()
  // Read just now, or built just now with its index.
  if (corpusIndex?.fetchedAt === corpus.fetchedAt) return recordIn(corpusIndex, id)
  return corpus.records.find((r) => r.id === id) ?? null
}

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
    textComparisonParts: rec?.textComparisonParts ?? [],
    // `?? []` twice over: no record, or a corpus cached before the field existed.
    textComparisonCandidates: rec?.textComparisonCandidates ?? [],
    textComparisonBundles: rec?.textComparisonBundles ?? [],
    explanations: rec?.explanations ?? null,
    score: c?.score ?? null,
    risBeginn: rec?.beginn ?? null,
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
