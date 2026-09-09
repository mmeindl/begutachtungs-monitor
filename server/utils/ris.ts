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
import { getConsultationsForGp } from './parliament'
import {
  dedupeMeRows,
  joinRisToMe,
  RULE_VERSION,
  toMeListRows,
  type JoinCandidate,
  type RisBegutRecord,
} from './risJoin'

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

/** RIS record plus the document URLs the UI needs. */
export interface RisBegutFlat extends RisBegutRecord {
  geaendert: string | null
  mainDocument: { html: string | null; xml: string | null; pdf: string | null }
  /**
   * The ressort's own Textgegenüberstellung, when the draft carries one.
   * RIS offers it as XML, Parliament only as PDF (docs/api-exploration.md
   * §2c) — which is why this comes from here and not from the Parliament
   * document list the rest of the detail page uses.
   */
  textComparison: { html: string | null; xml: string | null; pdf: string | null } | null
}

export interface RisBegutCorpus {
  fetchedAt: string
  hits: number
  records: RisBegutFlat[]
}

/** XML-to-JSON trap: one element → bare object, several → array. */
function asArray<T>(x: T | T[] | null | undefined): T[] {
  if (x === null || x === undefined) return []
  return Array.isArray(x) ? x : [x]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** ISO date `YYYY-MM-DD` or null; RIS dates arrive as `YYYY-MM-DD` or `YYYY-MM-DDT…`. */
function isoDate(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v)
  return m ? m[1]! : null
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

/**
 * The annex is named inconsistently across ressorts: "Textgegenüberstellung",
 * "TGÜ", "TGG", and a misspelt "Textgegenbüberstellung" all occur in the
 * corpus, so the match has to be loose (docs/api-exploration.md §2c).
 */
const TEXT_COMPARISON_NAME = /gegen.?über|^TG(Ü|G|UE)$/i

/** Human-readable RIS page of one Begut record. */
export function risDocumentUrl(id: string): string {
  return `https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Begut&Dokumentnummer=${encodeURIComponent(id)}`
}

// Loosely typed: the OGD JSON is generated from XML and not contractual.
/* eslint-disable @typescript-eslint/no-explicit-any */
export function flattenRisRecord(doc: any): RisBegutFlat | null {
  const meta = doc?.Data?.Metadaten
  const id = str(meta?.Technisch?.ID)
  if (!id) return null
  const b = meta?.Bundesrecht ?? {}
  const bg = b?.Begut ?? {}
  const references = asArray<any>(doc?.Data?.Dokumentliste?.ContentReference)
  const main = references.find((c) => c?.ContentType === 'MainDocument')
  const urls = asArray<any>(main?.Urls?.ContentUrl)
  const urlOf = (type: string) => str(urls.find((u) => u?.DataType === type)?.Url)
  const annex = references.find((c) => TEXT_COMPARISON_NAME.test(String(c?.Name ?? '').trim()))
  const annexUrls = asArray<any>(annex?.Urls?.ContentUrl)
  const annexUrlOf = (type: string) => str(annexUrls.find((u) => u?.DataType === type)?.Url)
  return {
    id,
    kurztitel: str(b?.Kurztitel),
    titel: str(b?.Titel),
    abk: str(bg?.Abkuerzung),
    stelle: str(bg?.EinbringendeStelle) ?? str(meta?.Technisch?.Organ),
    beginn: isoDate(bg?.BeginnBegutachtungsfrist),
    ende: isoDate(bg?.EndeBegutachtungsfrist),
    geaendert: isoDate(meta?.Allgemein?.Geaendert),
    mainDocument: { html: urlOf('Html'), xml: urlOf('Xml'), pdf: urlOf('Pdf') },
    textComparison: annex ? { html: annexUrlOf('Html'), xml: annexUrlOf('Xml'), pdf: annexUrlOf('Pdf') } : null,
  }
}

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
    const [consultations, corpus] = await Promise.all([getConsultationsForGp(gp), getRisBegutCorpus()])
    const mes = dedupeMeRows(toMeListRows(consultations.items))
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
