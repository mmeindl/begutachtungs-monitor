/**
 * Whether a Land's law in force already transposes an EU act — rule D4 of
 * docs/architecture.md §12.66 for the Länder (Nachtrag 2, 04.11.2026).
 *
 * PURE MODULE — a phrase in, query parameters out; a RIS answer in, the
 * hits out. The service (`landEuService.ts`) runs the query and caches it.
 *
 * A SIBLING OF `bundesrecht.ts`, NOT A BRANCH IN IT. The question and the
 * reading of each hit are the Bund's — the phrase (`bundesrechtPhrase`),
 * the Staatsvertrag rule (`typCountsAsBundesrecht`), the transposition test
 * (`transposesAct`) — but the endpoint, the Land's flag and the envelope are
 * Landesrecht's: the metadata sit under `Metadaten.Landesrecht` with its
 * `LrKons`, where `bundesrechtHits` looks for `Metadaten.Bundesrecht.BrKons`
 * and finds nothing. Folded into one function it would carry two
 * envelopes behind a flag; side by side each reads one.
 *
 * THE LAND'S FLAG, verified by one probe per Land on 04.11.2026 („2006/123/EG"
 * as of that day: every hit's `Landesrecht.Bundesland` was the Land asked
 * for — Bgld 13, Ktn 45, NÖ 9, OÖ 9, Sbg 21, Stmk 20, T 14, Vbg 12, W 6):
 * `Bundesland_SucheIn` + the Land's name without umlauts.
 */
import type { LandCode } from '../../../shared/types'
import { typCountsAsBundesrecht, type BundesrechtHit } from './bundesrecht'

export const LANDESRECHT_API = 'https://data.bka.gv.at/ris/api/v2.6/Landesrecht'

/** RIS's name for each Land in `Bundesland_SucheIn…` (`laender/landKons.ts` asks LrKons with the same). */
export const RIS_LAND_FLAG: Record<LandCode, string> = {
  bgld: 'Burgenland',
  ktn: 'Kaernten',
  noe: 'Niederoesterreich',
  ooe: 'Oberoesterreich',
  sbg: 'Salzburg',
  stmk: 'Steiermark',
  t: 'Tirol',
  vbg: 'Vorarlberg',
  w: 'Wien',
}

/** The LrKons query for one phrase in one Land as of one day. */
export function landesrechtSearchParams(phrase: string, asOf: string, land: LandCode): Record<string, string> {
  return {
    Applikation: 'LrKons',
    [`Bundesland_SucheIn${RIS_LAND_FLAG[land]}`]: 'true',
    Suchworte: `"${phrase}"`,
    'Fassung.FassungVom': asOf,
    DokumenteProSeite: 'OneHundred',
  }
}

/** The part of an LrKons search answer this module reads. */
export interface LrKonsSearchAnswer {
  OgdSearchResult?: {
    OgdDocumentResults?: {
      Hits?: { '#text'?: string }
      OgdDocumentReference?: LrKonsHit | LrKonsHit[] | null
    }
  }
}
interface LrKonsHit {
  Data?: {
    Metadaten?: { Technisch?: { ID?: string }; Landesrecht?: { Kurztitel?: string; LrKons?: { Typ?: string } } }
    Dokumentliste?: { ContentReference?: LrKonsContent | LrKonsContent[] | null }
  }
}
interface LrKonsContent {
  ContentType?: string
  Urls?: { ContentUrl?: LrKonsUrl | LrKonsUrl[] | null }
}
interface LrKonsUrl { DataType?: string; Url?: string }

function asList<T>(x: T | T[] | null | undefined): T[] {
  return x === null || x === undefined ? [] : Array.isArray(x) ? x : [x]
}

/**
 * The Paragraphs and Anlagen of Landesgesetze and Verordnungen the answer
 * holds (`Typ` „LG", „Gesetz", „V" — an Art.-15a-Vereinbarung lists acts and
 * transposes none), once each, and how many hits RIS counted in all.
 */
export function landesrechtHits(answer: LrKonsSearchAnswer): { total: number; hits: BundesrechtHit[] } {
  const results = answer?.OgdSearchResult?.OgdDocumentResults
  const total = Number(results?.Hits?.['#text'] ?? 0) || 0
  const hits = new Map<string, BundesrechtHit>()
  for (const h of asList(results?.OgdDocumentReference)) {
    const meta = h?.Data?.Metadaten
    const id = meta?.Technisch?.ID
    if (!id || !typCountsAsBundesrecht(meta?.Landesrecht?.LrKons?.Typ) || hits.has(id)) continue
    const main = asList(h?.Data?.Dokumentliste?.ContentReference).find((c) => c?.ContentType === 'MainDocument')
    const xmlUrl = asList(main?.Urls?.ContentUrl).find((u) => u?.DataType === 'Xml')?.Url ?? null
    hits.set(id, { nor: id, kurztitel: meta?.Landesrecht?.Kurztitel ?? '', xmlUrl })
  }
  return { total, hits: [...hits.values()] }
}
