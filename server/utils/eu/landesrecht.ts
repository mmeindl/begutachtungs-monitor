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
    Metadaten?: { Technisch?: { ID?: string }; Landesrecht?: { Kurztitel?: string; LrKons?: { Typ?: string; ArtikelParagraphAnlage?: string } } }
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
 * A law's head document, „§ 0": no provision but the law's record — and in
 * Landesrecht the place where a Land states what the law transposes
 * (04.11.2026, Oberösterreich): an „Umsetzungshinweis" field, and per
 * Novelle in the „Änderung" list its Richtlinien with their CELEX,
 * „LGBl.Nr. 47/2023 (… RL (EU) 2019/1158 … [CELEX-Nr. 32019L1158] …)".
 * The record is not versioned: asked as of a past day, it already lists
 * the Novellen that came later — the draft's own among them (16120 asked
 * as of its first day: the § 0 of four laws named 2023/970 through LGBl.
 * Nr. 57/2026, kundgemacht two months later). So it is read apart
 * (`headDocumentTransposes`), not by the hint reader.
 */
const HEAD_DOCUMENT_RE = /^§\s*0$/

/** One hit of the search: a Paragraph or Anlage — or a law's head document (`head`). */
export interface LandesrechtHit extends BundesrechtHit {
  head: boolean
}

/** „LGBl.Nr. 57/2026", „LGBl. Nr. 57/2026" → „57/2026". */
export function lgblKey(citation: string | null | undefined): string | null {
  return /LGBl\.?\s*Nr\.?\s*(\d+\/\d{4})/.exec(citation ?? '')?.[1] ?? null
}

/**
 * Whether a head document says the law transposed the act by `asOf`: in its
 * Umsetzungshinweis field, or in a Novelle of its „Änderung" list that is
 * neither the draft's own (`ownLgbl`) nor of a later year than `asOf`, by
 * its CELEX or — older entries carry none — by `phrase` (`bundesrechtPhrase`); a
 * Novelle of the same year may be either and is counted, the residual risk.
 * `text` is the document's plain text.
 */
export function headDocumentTransposes(text: string, celex: string, asOf: string, ownLgbl: string | null, phrase: string | null = null): boolean {
  const year = Number(asOf.slice(0, 4))
  // Older entries name the act without its CELEX: „RL 2000/43/EG vom 29. Juni 2000".
  const byPhrase = phrase ? new RegExp(`(?<![\\d/])${phrase.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?!\\d|/\\d)`) : null
  const names = (part: string) => part.includes(celex) || (byPhrase?.test(part) ?? false)
  const langtitel = text.search(/\bLangtitel\b/)
  const field = /Umsetzungshinweis([\s\S]*)/.exec(langtitel >= 0 ? text.slice(0, langtitel) : '')?.[1] ?? ''
  if (names(field)) return true
  const changes = text.slice(Math.max(0, langtitel))
  const marks = [...changes.matchAll(/LGBl\.?\s*Nr\.?\s*(\d+)\/(\d{4})/g)]
  return marks.some((m, i) => {
    const key = `${m[1]}/${m[2]}`
    if (key === ownLgbl || Number(m[2]) > year) return false
    return names(changes.slice(m.index!, marks[i + 1]?.index ?? changes.length))
  })
}

/**
 * The Paragraphs and Anlagen of Landesgesetze and Verordnungen the answer
 * holds (`Typ` „LG", „Gesetz", „V" — an Art.-15a-Vereinbarung lists acts and
 * transposes none), and the laws' head documents marked as such, once
 * each, and how many hits RIS counted in all.
 */
export function landesrechtHits(answer: LrKonsSearchAnswer): { total: number; hits: LandesrechtHit[] } {
  const results = answer?.OgdSearchResult?.OgdDocumentResults
  const total = Number(results?.Hits?.['#text'] ?? 0) || 0
  const hits = new Map<string, LandesrechtHit>()
  for (const h of asList(results?.OgdDocumentReference)) {
    const meta = h?.Data?.Metadaten
    const id = meta?.Technisch?.ID
    if (!id || !typCountsAsBundesrecht(meta?.Landesrecht?.LrKons?.Typ) || hits.has(id)) continue
    const main = asList(h?.Data?.Dokumentliste?.ContentReference).find((c) => c?.ContentType === 'MainDocument')
    const xmlUrl = asList(main?.Urls?.ContentUrl).find((u) => u?.DataType === 'Xml')?.Url ?? null
    hits.set(id, { nor: id, kurztitel: meta?.Landesrecht?.Kurztitel ?? '', xmlUrl, head: HEAD_DOCUMENT_RE.test(meta?.Landesrecht?.LrKons?.ArtikelParagraphAnlage?.trim() ?? '') })
  }
  return { total, hits: [...hits.values()] }
}
