/**
 * RIS OGD client for `Applikation=BrKons` — the consolidated standing law
 * (docs/api-exploration.md §2a).
 *
 * Deliberately free of Nitro globals (no `defineCachedFunction`), so the
 * verification harness in `scripts/` can run it under vite-node. Caching is
 * the caller's job; when this reaches a request path it gets the same leaf
 * cache as `ris.ts`.
 *
 * Two gotchas, both learned the hard way (2026-09-08):
 * - Unsupported parameters are **ignored, not rejected**: `Abkuerzung=GSpG`
 *   returned the entire 441.147-document corpus with HTTP 200. Every query
 *   here is sanity-checked against a plausible hit count.
 * - `Gesetzesnummer` and `Fassung.FassungVom` do filter, and together they
 *   are what makes a verification harness possible: they address the law as
 *   it stood on any given day.
 */
import { parseKonsParagraph, type LawNode } from './lawStructure'

export const RIS_KONS_BASE = 'https://data.bka.gv.at/ris/api/v2.6/Bundesrecht'
const USER_AGENT = 'begutachtungs-monitor/0.1 (+https://begutachtungs-monitor.at)'
const TIMEOUT_MS = 20_000
/** A single law never has this many paragraph documents; more means the filter was ignored. */
const IMPLAUSIBLE_HITS = 3_000

export interface KonsParagraphRef {
  nor: string
  /** "§ 5", "Art. 3", "Anlage 2" as RIS prints it */
  label: string
  /** "5", "5a" — the identifier a Novellierungsanordnung addresses */
  id: string
  inkrafttreten: string | null
  ausserkrafttreten: string | null
  /**
   * "BGBl. Nr. 620/1989 zuletzt geändert durch BGBl. I Nr. 187/2022" — the
   * amendment that produced *this* version. The one exact join from a
   * Bundesgesetzblatt to the consolidated text it created, and the reason
   * the harness needs no dates: an amendment may take effect retroactively
   * (GSpG § 20, promulgated 2022-12-06, in force from 2022-01-01), so no
   * date derived from the promulgation can identify the version pair.
   */
  kundmachungsorgan: string | null
  xmlUrl: string | null
}

/** The amending BGBl a version's Kundmachungsorgan names, e.g. "BGBl. I Nr. 187/2022". */
export function amendedBy(ref: KonsParagraphRef): string | null {
  const m = /zuletzt geändert durch\s+(.+?)\s*$/.exec(ref.kundmachungsorgan ?? '')
  return m ? m[1]! : null
}

export interface KonsLaw {
  gesetzesnummer: string
  kurztitel: string
  /** The BGBl entries that amended this law, each with its Regierungsvorlage */
  aenderungen: string[]
  paragraphs: KonsParagraphRef[]
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function asArray<T>(x: T | T[] | null | undefined): T[] {
  return x === null || x === undefined ? [] : Array.isArray(x) ? x : [x]
}

async function getJson(url: string): Promise<any> {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      lastError = err
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)))
    }
  }
  throw new Error(`RIS BrKons nicht abrufbar: ${String(lastError)}`)
}

/**
 * Retried like `getJson`: a consolidated law is hundreds of documents, and a
 * single transient failure used to drop a whole Novelle out of a harness run
 * — which silently changed the sample the percentages were computed over.
 */
export async function getText(url: string): Promise<string> {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (!res.ok) throw new Error(`HTTP ${res.status} für ${url}`)
      return await res.text()
    } catch (err) {
      lastError = err
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)))
    }
  }
  throw new Error(`RIS-Dokument nicht abrufbar (${url}): ${String(lastError)}`)
}

function query(params: Record<string, string>): string {
  const q = new URLSearchParams({ Applikation: 'BrKons', ...params })
  return `${RIS_KONS_BASE}?${q.toString()}`
}

function refOf(ref: any): KonsParagraphRef | null {
  const meta = ref?.Data?.Metadaten
  const nor = meta?.Technisch?.ID
  const b = meta?.Bundesrecht?.BrKons
  if (!nor || !b) return null
  const main = asArray<any>(ref?.Data?.Dokumentliste?.ContentReference).find((c) => c?.ContentType === 'MainDocument')
  const xmlUrl = asArray<any>(main?.Urls?.ContentUrl).find((u) => u?.DataType === 'Xml')?.Url ?? null
  const label = String(b.ArtikelParagraphAnlage ?? '')
  return {
    nor,
    label,
    id: String(b.Paragraphnummer ?? label.replace(/^[^\d]*/, '')),
    inkrafttreten: b.Inkrafttretensdatum ?? null,
    ausserkrafttreten: b.Ausserkrafttretensdatum ?? null,
    kundmachungsorgan: typeof b.Kundmachungsorgan === 'string' ? b.Kundmachungsorgan.trim() : null,
    xmlUrl,
  }
}

/**
 * Resolves a law to its RIS Gesetzesnummer by Kurztitel. `Titel` matches
 * loosely — the same trap as the Begut join (docs/ris-join.md §4) — so the
 * result is accepted only on an exact Kurztitel match.
 */
export async function resolveGesetzesnummer(kurztitel: string): Promise<string | null> {
  const body = await getJson(query({ Titel: kurztitel, DokumenteProSeite: 'OneHundred' }))
  const results = body?.OgdSearchResult?.OgdDocumentResults
  const counts = new Map<string, number>()
  for (const ref of asArray<any>(results?.OgdDocumentReference)) {
    const b = ref?.Data?.Metadaten?.Bundesrecht
    if (b?.Kurztitel?.trim().toLowerCase() !== kurztitel.trim().toLowerCase()) continue
    const nr = b?.BrKons?.Gesetzesnummer
    if (nr) counts.set(nr, (counts.get(nr) ?? 0) + 1)
  }
  if (counts.size === 0) return null
  return [...counts].sort((a, b) => b[1] - a[1])[0]![0]
}

/** Every paragraph of one law as it stood on `date` (ISO yyyy-mm-dd). */
export async function fetchLawAsOf(gesetzesnummer: string, date: string): Promise<KonsLaw> {
  const paragraphs: KonsParagraphRef[] = []
  let kurztitel = ''
  const aenderungen = new Set<string>()
  for (let page = 1; page <= 20; page++) {
    const body = await getJson(query({ Gesetzesnummer: gesetzesnummer, 'Fassung.FassungVom': date, DokumenteProSeite: 'OneHundred', Seitennummer: String(page) }))
    const results = body?.OgdSearchResult?.OgdDocumentResults
    const hits = Number(results?.Hits?.['#text'] ?? 0)
    if (hits > IMPLAUSIBLE_HITS) throw new Error(`RIS ignorierte den Filter: ${hits} Treffer für Gesetzesnummer ${gesetzesnummer}`)
    const refs = asArray<any>(results?.OgdDocumentReference)
    for (const ref of refs) {
      const b = ref?.Data?.Metadaten?.Bundesrecht
      kurztitel ||= b?.Kurztitel ?? ''
      for (const line of String(b?.BrKons?.Aenderung ?? '').split(/\r?\n/)) if (line.trim()) aenderungen.add(line.trim())
      const p = refOf(ref)
      if (p) paragraphs.push(p)
    }
    if (paragraphs.length >= hits || refs.length === 0) break
  }
  return { gesetzesnummer, kurztitel, aenderungen: [...aenderungen], paragraphs }
}

/**
 * Every version of every paragraph of one law, oldest first per paragraph.
 * Keyed by the printed label ("§ 20"), because that is what an instruction
 * addresses.
 */
export async function fetchAllVersions(gesetzesnummer: string): Promise<Map<string, KonsParagraphRef[]>> {
  const out = new Map<string, KonsParagraphRef[]>()
  let seen = 0
  for (let page = 1; page <= 40; page++) {
    const body = await getJson(query({ Gesetzesnummer: gesetzesnummer, DokumenteProSeite: 'OneHundred', Seitennummer: String(page) }))
    const results = body?.OgdSearchResult?.OgdDocumentResults
    const hits = Number(results?.Hits?.['#text'] ?? 0)
    if (hits > IMPLAUSIBLE_HITS) throw new Error(`RIS ignorierte den Filter: ${hits} Treffer für Gesetzesnummer ${gesetzesnummer}`)
    const refs = asArray<any>(results?.OgdDocumentReference)
    for (const r of refs) {
      const p = refOf(r)
      if (!p) continue
      const list = out.get(p.label) ?? []
      list.push(p)
      out.set(p.label, list)
    }
    seen += refs.length
    if (seen >= hits || refs.length === 0) break
  }
  for (const list of out.values()) list.sort((a, b) => String(a.inkrafttreten).localeCompare(String(b.inkrafttreten)))
  return out
}

/**
 * The version a given amendment produced, and the version it replaced —
 * the exact pair a verification run needs. Returns null when this BGBl did
 * not touch the paragraph.
 */
export function versionPairFor(versions: readonly KonsParagraphRef[], bgblNumber: string): { before: KonsParagraphRef | null; after: KonsParagraphRef } | null {
  const index = versions.findIndex((v) => amendedBy(v) === bgblNumber)
  if (index < 0) return null
  return { before: versions[index - 1] ?? null, after: versions[index]! }
}

/** The paragraph document as a tree. */
export async function fetchParagraphTree(ref: KonsParagraphRef): Promise<LawNode | null> {
  if (!ref.xmlUrl) return null
  return parseKonsParagraph(await getText(ref.xmlUrl))
}
