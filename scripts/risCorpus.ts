/**
 * One pass over the RIS Begut corpus, for measurement scripts.
 *
 * `server/utils/ris.ts` is not importable here — it carries the Nitro cache
 * and `#shared/*` aliases — but `flattenRisRecord` is, and it is the shipped
 * mapper: what a script counts is then what the site sees, not what a second
 * implementation of the mapper would see.
 *
 * `verordnungen-corpus.ts` predates this module and carries its own copy of
 * the paging; both talk to the same endpoint with the same parameters.
 */
import { flattenRisRecord, type RisBegutFlat } from '../server/utils/risRecord'
import type { BgblRecord } from '../server/utils/bgblJoin'

const PAGE_SIZE = 100
const MAX_PAGES = 80
/**
 * Wiederholungen und Pause, wie `server/utils/ris.ts` sie hat.
 *
 * Ein Lauf holt bis zu 68 Seiten. Ohne Wiederholung kostet ein einzelnes
 * ETIMEDOUT den ganzen Lauf — am 19.09.2026 zweimal passiert, jedes Mal nach
 * Minuten und ohne eine einzige Zahl. Eine Messung, die an einer langsamen
 * Minute des RIS stirbt, ist keine.
 */
const MAX_RETRIES = 3
const RETRY_BACKOFF_MS = 1_500
const PAGE_PAUSE_MS = 400
const TIMEOUT_MS = 45_000

/** Eine Seite holen, mit Geduld. Wirft erst, wenn alle Versuche scheitern. */
async function fetchJson(url: string, headers: Record<string, string>, what: string): Promise<unknown> {
  let last: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS * attempt))
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (!res.ok) {
        last = new Error(`RIS ${res.status}`)
        continue
      }
      return await res.json()
    } catch (err) {
      last = err
      process.stderr.write(`\n  ${what}: Versuch ${attempt + 1} gescheitert (${String(last).slice(0, 60)})\n`)
    }
  }
  throw new Error(`RIS nicht erreichbar bei ${what}: ${String(last)}`)
}

export interface RisCorpus {
  /** What the API says the result set holds, independent of what we kept. */
  hits: number
  records: RisBegutFlat[]
}

/** The whole Begut corpus, oldest deadline last. `script` names the caller in the User-Agent. */
export async function fetchRisBegutCorpus(script: string): Promise<RisCorpus> {
  const headers = {
    'User-Agent': `begutachtungs-monitor/0.1 (+https://begutachtungs-monitor.at; scripts/${script})`,
    Accept: 'application/json',
  }
  const seen = new Set<string>()
  const records: RisBegutFlat[] = []
  let hits = 0
  for (let page = 1; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({
      Applikation: 'Begut',
      DokumenteProSeite: 'OneHundred',
      Seitennummer: String(page),
      'Sortierung.SortedByColumn': 'EndeBegutachtungsfrist',
      'Sortierung.SortDirection': 'Descending',
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (await fetchJson(`https://data.bka.gv.at/ris/api/v2.6/Bundesrecht?${params}`, headers, `Begut-Seite ${page}`) as any)
      ?.OgdSearchResult
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
    await new Promise((r) => setTimeout(r, PAGE_PAUSE_MS))
  }
  process.stderr.write('\n')
  return { hits, records }
}

/**
 * Das Bundesgesetzblatt eines Zeitfensters, für die Messung des Joins
 * Entwurf → Kundmachung (`server/utils/bgblJoin.ts`).
 *
 * `Applikation=BgblAuth` kennt weder einen Teil- noch einen Jahrgangsfilter —
 * `Teil=Teil2`, `Jahrgang=2025` und `Typ=Verordnung` liefern alle 18.925
 * Sätze, also werden sie ignoriert (geprüft 18.09.2026). Was wirkt, sind
 * `VonKundmachungsdatum`/`BisKundmachungsdatum`; Teil II wird hier gefiltert.
 */
export async function fetchBgblRecords(script: string, from: string, to: string): Promise<BgblRecord[]> {
  const headers = {
    'User-Agent': `begutachtungs-monitor/0.1 (+https://begutachtungs-monitor.at; scripts/${script})`,
    Accept: 'application/json',
  }
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
    const result = (await fetchJson(`https://data.bka.gv.at/ris/api/v2.6/Bundesrecht?${params}`, headers, `BGBl-Seite ${page}`) as any)
      ?.OgdSearchResult
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
    await new Promise((r) => setTimeout(r, PAGE_PAUSE_MS))
  }
  process.stderr.write('\n')
  return out
}
