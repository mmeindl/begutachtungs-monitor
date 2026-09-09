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
import { sameBgbl, type BgblCitation } from './lawTitles'

export const RIS_KONS_BASE = 'https://data.bka.gv.at/ris/api/v2.6/Bundesrecht'
const USER_AGENT = 'begutachtungs-monitor/0.1 (+https://begutachtungs-monitor.at)'
const TIMEOUT_MS = 20_000
/**
 * More hits than this means the filter was ignored (the whole corpus is
 * ~441.000 documents). It used to be 3.000, "more than any single law has" —
 * the ASVG has 5.115 paragraph versions, and two of its Novellen dropped out
 * of the harness with a phantom "RIS ignorierte den Filter" (2026-09-09).
 * The per-document check below is what actually guards against an ignored
 * filter; the number is only a fast fail for the pathological case.
 */
const IMPLAUSIBLE_HITS = 50_000

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
  /** The law's Stammnorm — the exact join key from a draft's Promulgationsklausel */
  stammnorm: BgblCitation | null
  gesetzesnummer: string | null
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
    stammnorm:
      typeof b.StammnormPublikationsorgan === 'string' && typeof b.StammnormBgblnummer === 'string'
        ? { organ: b.StammnormPublikationsorgan.trim(), nummer: b.StammnormBgblnummer.trim() }
        : null,
    gesetzesnummer: typeof b.Gesetzesnummer === 'string' ? b.Gesetzesnummer : null,
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
      if (p.gesetzesnummer && p.gesetzesnummer !== gesetzesnummer) throw new Error(`RIS ignorierte den Filter: Gesetzesnummer ${p.gesetzesnummer} statt ${gesetzesnummer}`)
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
 *
 * `afters` lists *every* version this BGBl created, oldest first. A Novelle
 * routinely stages its instructions — "19,4%" becomes "23%" from 2027 and
 * "21%" from 2030 in one BGBl (Dienstgeberabgabegesetz § 1, BGBl. I Nr.
 * 73/2026) — and RIS cuts one version per effective date. An engine that
 * applies every instruction produces the end state, so scoring against the
 * first cut alone called it wrong for writing what it was told to write; 5
 * of 33 divergences in the 261-paragraph corpus were this. Scoring against
 * the last cut alone fails the other way: RIS also cuts a version when an
 * Absatz *expires*, and prints an editorial note in its place (LWA-G § 1,
 * "Anm.: Abs. 2 mit Ablauf des 30.12.2029 außer Kraft getreten"). Each of
 * the cuts is law text that exists, so a harness accepts a match with any
 * of them (2026-09-09).
 */
export function versionPairFor(versions: readonly KonsParagraphRef[], bgblNumber: string): { before: KonsParagraphRef | null; after: KonsParagraphRef; afters: KonsParagraphRef[] } | null {
  const first = versions.findIndex((v) => amendedBy(v) === bgblNumber)
  if (first < 0) return null
  let last = first
  while (last + 1 < versions.length && amendedBy(versions[last + 1]!) === bgblNumber) last++
  return { before: versions[first - 1] ?? null, after: versions[first]!, afters: versions.slice(first, last + 1) }
}

export interface KonsLawAtDate {
  gesetzesnummer: string
  kurztitel: string
  /**
   * The paragraphs in force on the requested date, by printed label ("§ 20").
   *
   * A plain record, not a Map: results of this shape are put through
   * `defineCachedFunction`, which serialises to JSON. A Map survives the
   * first call in-process and comes back as `{}` from the cache afterwards —
   * so the lookup worked exactly once and then silently returned nothing.
   */
  paragraphs: Record<string, KonsParagraphRef>
}

/**
 * The law a Promulgationsklausel names, as it stood on `date`.
 *
 * `Kundmachungsorgannummer` narrows to the BGBl number; the Stammnorm pair
 * then decides, because the number alone collides across Teile — 84/2001 is
 * both the Audiovisuelle Mediendienste-Gesetz (BGBl. I) and an Amtssitz law
 * (BGBl. III). It also matches versions whose *amendment* carried that
 * number, which the same check drops.
 *
 * Returns null unless exactly one law survives. An ambiguous or missing
 * match must yield no heading rather than a heading from the wrong law:
 * a wrong name on someone's paragraph is worse than no name.
 */
export async function resolveLawByBgbl(bgbl: BgblCitation, date: string): Promise<KonsLawAtDate | null> {
  const byLaw = new Map<string, { kurztitel: string; paragraphs: Record<string, KonsParagraphRef> }>()
  let seen = 0
  for (let page = 1; page <= 20; page++) {
    const body = await getJson(
      query({ Kundmachungsorgannummer: bgbl.nummer, 'Fassung.FassungVom': date, DokumenteProSeite: 'OneHundred', Seitennummer: String(page) }),
    )
    const results = body?.OgdSearchResult?.OgdDocumentResults
    const hits = Number(results?.Hits?.['#text'] ?? 0)
    if (hits > IMPLAUSIBLE_HITS) throw new Error(`RIS ignorierte den Filter: ${hits} Treffer für ${bgbl.organ} ${bgbl.nummer}`)
    const refs = asArray<any>(results?.OgdDocumentReference)
    for (const r of refs) {
      const p = refOf(r)
      if (!p?.gesetzesnummer || !p.stammnorm || !sameBgbl(p.stammnorm, bgbl)) continue
      const entry = byLaw.get(p.gesetzesnummer) ?? { kurztitel: r?.Data?.Metadaten?.Bundesrecht?.Kurztitel ?? '', paragraphs: {} as Record<string, KonsParagraphRef> }
      // One version per label at a given date; keep the first RIS returns.
      entry.paragraphs[p.label] ??= p
      byLaw.set(p.gesetzesnummer, entry)
    }
    seen += refs.length
    if (seen >= hits || refs.length === 0) break
  }
  if (byLaw.size !== 1) return null
  const [gesetzesnummer, entry] = [...byLaw][0]!
  return { gesetzesnummer, kurztitel: entry.kurztitel, paragraphs: entry.paragraphs }
}

/** The § heading ("Sofortlotterien"), or null when the document has none. */
export async function fetchParagraphHeading(ref: KonsParagraphRef): Promise<string | null> {
  const tree = await fetchParagraphTree(ref)
  return tree?.heading ?? null
}

/** The paragraph document as a tree. */
export async function fetchParagraphTree(ref: KonsParagraphRef): Promise<LawNode | null> {
  if (!ref.xmlUrl) return null
  return parseKonsParagraph(await getText(ref.xmlUrl))
}
