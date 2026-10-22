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
