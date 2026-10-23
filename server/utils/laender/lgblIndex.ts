/**
 * Every Landesgesetzblatt of a Land, from the RIS OGD API — the index
 * `matchLgbl` searches (docs/architecture.md §12.43). Apart from the
 * matcher because it is cached, and the matcher is tested without Nitro.
 */
import type { LandCode } from '#shared/types'
import { safeExternalUrl } from '#shared/utils/safeExternalUrl'
import { DERIVED_CACHE } from '../cache/base'
import { asArray } from '../ris/risRecord'
import { risJson, type UpstreamPolicy } from '../upstream/fetch'
import type { LgblEntry } from './lgblSearch'

/** RIS's name for each Land in `Bundesland_SucheIn…`. */
const RIS_LAND: Record<LandCode, string> = { ooe: 'Oberoesterreich', sbg: 'Salzburg', w: 'Wien' }
const LANDESRECHT_API = 'https://data.bka.gv.at/ris/api/v2.6/Landesrecht'
const INDEX_POLICY: UpstreamPolicy = { timeoutMs: 30_000, retries: 2, accept: 'application/json', retryOnHttpError: true }
/* Measured 22.10.2026: OÖ 1.565, Salzburg 1.451, Wien 796 entries — 8 to
   16 pages. A hundred pages would be a different source, not a bigger one. */
const MAX_PAGES = 100

function indexUrl(land: LandCode, page: number): string {
  const params = new URLSearchParams({
    Applikation: 'LgblAuth',
    [`Bundesland_SucheIn${RIS_LAND[land]}`]: 'true',
    DokumenteProSeite: 'OneHundred',
    Seitennummer: String(page),
  })
  return `${LANDESRECHT_API}?${params}`
}

/* eslint-disable @typescript-eslint/no-explicit-any -- RIS's envelope */
function entriesOf(result: any): LgblEntry[] {
  return asArray<any>(result?.OgdDocumentResults?.OgdDocumentReference).flatMap((ref) => {
    const m = ref?.Data?.Metadaten?.Landesrecht
    const nr = m?.LgblAuth?.Lgblnummer
    const datum = m?.Kundmachungsdatum
    const titel = m?.Titel ?? m?.Kurztitel
    if (typeof nr !== 'string' || typeof datum !== 'string' || typeof titel !== 'string') return []
    const eli = m?.LgblAuth?.EuropeanLegislationIdentifier
    return [{
      nr,
      typ: String(m?.LgblAuth?.Typ ?? ''),
      titel,
      datum,
      url: typeof eli === 'string' ? safeExternalUrl(eli) : null,
    }]
  })
}

async function readIndex(land: LandCode): Promise<LgblEntry[]> {
  const first = await risJson<any>(indexUrl(land, 1), INDEX_POLICY)
  const total = Number(first?.OgdDocumentResults?.Hits?.['#text'] ?? 0)
  const pages = Math.min(Math.ceil(total / 100), MAX_PAGES)
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pages - 1) }, (_, i) => risJson<any>(indexUrl(land, i + 2), INDEX_POLICY)),
  )
  const entries = [first, ...rest].flatMap(entriesOf)
  // A short read must not pass for the Land's whole gazette: a miss would
  // then read „keine Kundmachung gefunden" for what was never searched.
  if (entries.length < total * 0.98) throw new Error(`LGBl ${land}: ${entries.length} von ${total} gelesen`)
  return entries
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * The Land's whole Landesgesetzblatt, held like the Salzburg register: six
 * hours, served stale while it refreshes — a gazette hours old is right for
 * every draft but one kundgemacht this afternoon. In the derived layer:
 * what is held is the parsed index of fifteen pages, not a document.
 */
export const fetchLgblIndex = defineCachedFunction(
  (land: LandCode): Promise<LgblEntry[]> => readIndex(land),
  { name: 'land-lgbl-index', base: DERIVED_CACHE, getKey: (land: LandCode) => land, maxAge: 60 * 60 * 6, swr: true },
)

/** One Landesgesetzblatt as the OGD API describes it: where its XML is, and the Landtag's Regierungsvorlage it was built from. */
export interface LgblRecord {
  nr: string
  datum: string | null
  url: string | null
  xmlUrl: string | null
  /** Salzburg's `RegierungsvorlageLink`: the Landtag's PDF, where the law came from one (§12.47). */
  vorlageUrl: string | null
  /** „26": the Vorlage's number among the Landtag's Beilagen. */
  vorlageNr: string | null
  /** The committee's report, `AusschussberichtLink`, and its Beilage number. */
  ausschussUrl: string | null
  ausschussNr: string | null
  /** The Landtag's Beschluss, `BeschlussDatum`. */
  beschluss: string | null
  /** „16." and „6. Session" — the Landtag's period and session, for citing the Beilagen. */
  periode: string | null
  session: string | null
}

/* eslint-disable @typescript-eslint/no-explicit-any -- RIS's envelope */
function recordOf(ref: any): LgblRecord | null {
  const meta = ref?.Data?.Metadaten?.Landesrecht
  const nr = meta?.LgblAuth?.Lgblnummer
  if (typeof nr !== 'string') return null
  let xmlUrl: string | null = null
  for (const content of asArray<any>(ref?.Data?.Dokumentliste?.ContentReference)) {
    for (const u of asArray<any>(content?.Urls?.ContentUrl)) {
      if (!xmlUrl && typeof u?.Url === 'string' && u.Url.endsWith('.xml')) xmlUrl = safeExternalUrl(u.Url)
    }
  }
  const a = meta?.LgblAuth ?? {}
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  return {
    nr,
    datum: str(meta?.Kundmachungsdatum),
    url: str(a.EuropeanLegislationIdentifier) ? safeExternalUrl(a.EuropeanLegislationIdentifier) : null,
    xmlUrl,
    vorlageUrl: str(a.RegierungsvorlageLink) ? safeExternalUrl(a.RegierungsvorlageLink) : null,
    vorlageNr: str(a.Regierungsvorlage),
    ausschussUrl: str(a.AusschussberichtLink) ? safeExternalUrl(a.AusschussberichtLink) : null,
    ausschussNr: str(a.Ausschussbericht),
    beschluss: str(a.BeschlussDatum),
    periode: str(a.Gesetzgebungsperiode),
    session: /(\d+)\.\s*Session/.exec(String(a.Sitzungsnummer ?? ''))?.[1] ?? /\/(\d+)Session\//.exec(String(a.RegierungsvorlageLink ?? ''))?.[1] ?? null,
  }
}

/** One Landesgesetzblatt by its number („LGBl. Nr. 57/2026"); null where RIS does not hold it. */
export async function lgblRecord(land: LandCode, nr: string): Promise<LgblRecord | null> {
  const number = /(\d+\/\d{4})/.exec(nr)?.[1]
  if (!number) return null
  const params = new URLSearchParams({ Applikation: 'LgblAuth', [`Bundesland_SucheIn${RIS_LAND[land]}`]: 'true', Lgblnummer: number })
  const result = await risJson<any>(`${LANDESRECHT_API}?${params}`, INDEX_POLICY)
  for (const ref of asArray<any>(result?.OgdDocumentResults?.OgdDocumentReference)) {
    const rec = recordOf(ref)
    if (rec?.nr === nr.replace(/LGBI/, 'LGBl')) return rec
  }
  return null
}

/** The Landesgesetzblätter whose text contains `phrase` — RIS's full-text search, first hundred hits. */
export async function lgblFullText(land: LandCode, phrase: string): Promise<LgblRecord[]> {
  const params = new URLSearchParams({ Applikation: 'LgblAuth', [`Bundesland_SucheIn${RIS_LAND[land]}`]: 'true', Suchworte: `"${phrase}"`, DokumenteProSeite: 'OneHundred' })
  const result = await risJson<any>(`${LANDESRECHT_API}?${params}`, INDEX_POLICY)
  return asArray<any>(result?.OgdDocumentResults?.OgdDocumentReference).map(recordOf).filter((r): r is LgblRecord => r !== null)
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * The XML of one Landesgesetzblatt, by its number — the document the
 * comparison reads (`landLawDiffService`). Null where RIS does not hold it.
 */
export async function lgblXmlUrl(land: LandCode, nr: string): Promise<string | null> {
  return (await lgblRecord(land, nr))?.xmlUrl ?? null
}
