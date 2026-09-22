/**
 * One pass over the RIS Begut corpus, for measurement scripts.
 *
 * `server/utils/ris/begutCorpus.ts` is not importable here — it carries the Nitro cache
 * and `#shared/*` aliases — but `flattenRisRecord` is, and it is the shipped
 * mapper: what a script counts is then what the site sees, not what a second
 * implementation of the mapper would see.
 */
import { flattenRisRecord, type RisBegutFlat } from '../../server/utils/ris/risRecord'
import type { BgblRecord } from '../../server/utils/ris/bgblJoin'
import { RIS_API, getJson } from './http'
import { sleep } from './async'

const PAGE_SIZE = 100
const MAX_PAGES = 80
/**
 * Retries and pause, the way `server/utils/ris/begutCorpus.ts` has them.
 *
 * A run fetches up to 68 pages. Without a retry a single ETIMEDOUT costs the
 * whole run — it happened twice on 19.09.2026, each time after minutes and
 * without a single number. A measurement that dies on a slow minute of RIS
 * is none.
 */
const MAX_RETRIES = 3
const RETRY_BACKOFF_MS = 1_500
const PAGE_PAUSE_MS = 400
const TIMEOUT_MS = 45_000

/** Fetch one page, patiently. Throws only once every attempt has failed. */
function fetchPage(url: string, script: string, what: string): Promise<unknown> {
  return getJson(url, {
    script,
    attempts: MAX_RETRIES + 1,
    backoffMs: (retry) => RETRY_BACKOFF_MS * retry,
    timeoutMs: TIMEOUT_MS,
    retryOnHttpError: true,
    onExhausted: (_url, last) => new Error(`RIS nicht erreichbar bei ${what}: ${String(last)}`),
  })
}

export interface RisCorpus {
  /** What the API says the result set holds, independent of what we kept. */
  hits: number
  records: RisBegutFlat[]
}

/**
 * The whole Begut corpus. `script` names the caller in the User-Agent.
 *
 * `direction` is the sort on EndeBegutachtungsfrist, and it is a parameter
 * rather than a constant because the reports read off it: the Verordnungen
 * corpus lists what was open on a given day oldest deadline first, everything
 * else wants the newest first.
 */
export async function fetchRisBegutCorpus(script: string, direction: 'Ascending' | 'Descending' = 'Descending'): Promise<RisCorpus> {
  const seen = new Set<string>()
  const records: RisBegutFlat[] = []
  let hits = 0
  for (let page = 1; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({
      Applikation: 'Begut',
      DokumenteProSeite: 'OneHundred',
      Seitennummer: String(page),
      'Sortierung.SortedByColumn': 'EndeBegutachtungsfrist',
      'Sortierung.SortDirection': direction,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (await fetchPage(`${RIS_API}?${params}`, script, `Begut-Seite ${page}`) as any)?.OgdSearchResult
    if (!result || result.Error) throw new Error(`RIS error on page ${page}`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const docs: any[] = [result.OgdDocumentResults?.OgdDocumentReference ?? []].flat()
    hits = Number(result.OgdDocumentResults?.Hits?.['#text'] ?? 0)
    for (const doc of docs) {
      const flat = flattenRisRecord(doc)
      if (flat && !seen.has(flat.id)) {
        seen.add(flat.id)
        records.push(flat)
      }
    }
    process.stderr.write(`\rcorpus: page ${page} · ${records.length}/${hits} records`)
    if (docs.length < PAGE_SIZE || page * PAGE_SIZE >= hits) break
    await sleep(PAGE_PAUSE_MS)
  }
  process.stderr.write('\n')
  return { hits, records }
}

/**
 * The Bundesgesetzblatt of a time window, for measuring the join draft →
 * Kundmachung (`server/utils/ris/bgblJoin.ts`).
 *
 * `Applikation=BgblAuth` knows neither a Teil nor a Jahrgang filter —
 * `Teil=Teil2`, `Jahrgang=2025` and `Typ=Verordnung` all return the full
 * 18.925 records, so they are ignored (checked 18.09.2026). What does work
 * are `VonKundmachungsdatum`/`BisKundmachungsdatum`; Teil II is filtered
 * here.
 */
export async function fetchBgblRecords(script: string, from: string, to: string): Promise<BgblRecord[]> {
  const seen = new Set<string>()
  const out: BgblRecord[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({
      Applikation: 'BgblAuth',
      DokumenteProSeite: 'OneHundred',
      Seitennummer: String(page),
      VonKundmachungsdatum: from,
      BisKundmachungsdatum: to,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (await fetchPage(`${RIS_API}?${params}`, script, `BGBl-Seite ${page}`) as any)?.OgdSearchResult
    if (!result || result.Error) throw new Error(`RIS error on BGBl page ${page}`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const docs: any[] = [result.OgdDocumentResults?.OgdDocumentReference ?? []].flat()
    const hits = Number(result.OgdDocumentResults?.Hits?.['#text'] ?? 0)
    for (const doc of docs) {
      const m = doc?.Data?.Metadaten
      const b = m?.Bundesrecht?.BgblAuth
      const id = String(m?.Technisch?.ID ?? '')
      if (!id || seen.has(id)) continue
      seen.add(id)
      out.push({
        id,
        teil: String(b?.Teil ?? ''),
        nummer: String(b?.Bgblnummer ?? ''),
        datum: String(b?.Ausgabedatum ?? '').slice(0, 10),
        kurztitel: m?.Bundesrecht?.Kurztitel ?? null,
        titel: m?.Bundesrecht?.Titel ?? null,
        stelle: m?.Technisch?.Einbringer ?? m?.Technisch?.Organ ?? null,
      })
    }
    process.stderr.write(`\rbgbl: page ${page} · ${out.length}/${hits} records`)
    if (docs.length < PAGE_SIZE || page * PAGE_SIZE >= hits) break
    await sleep(PAGE_PAUSE_MS)
  }
  process.stderr.write('\n')
  return out
}
