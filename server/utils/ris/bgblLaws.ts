/**
 * Which laws in force a Bundesgesetzblatt changed or created — the „Geltende
 * Fassung" links of the BGBl station (21.10.2026).
 *
 * Read from the BGBl itself, not from the draft: between Ministerialentwurf
 * and law, Artikel come and go, so the draft's list of laws
 * (`lawtext/amendedLawsService.ts`) would make claims about the enacted law
 * that only the draft made.
 *
 * `Kundmachungsorgannummer` is the filter `resolveLawByBgbl` already uses: it
 * returns every consolidated version whose Kundmachung carries the number —
 * „BGBl. I Nr. 242/2021 zuletzt geändert durch BGBl. I Nr. 69/2026" for an
 * amended law, „BGBl. I Nr. 69/2026" for a new one. The number alone
 * collides across Teile (69/2026 is also a BGBl. II, measured 21.10.2026),
 * so the Kundmachungsorgan has to name the Teil too. A law of which this
 * BGBl only repealed parts („aufgehoben durch") still stands and is linked;
 * one that it repealed entirely has nothing left in force and is not.
 *
 * Free of Nitro globals like `konsLaw.ts`; the cache is `kons/konsCache.ts`.
 */
import type { BgblLaw } from '../../../shared/types'
import { IMPLAUSIBLE_HITS, konsJson, konsQuery } from './konsLaw'
import { asArray } from './risRecord'

const BGBL = /\b(I{1,3})\s+Nr\.\s*(\d+\/\d{4})\b/

/** „Bundesgesetzblatt I Nr. 69/2026" → { teil: 'I', nummer: '69/2026' }. */
export function bgblParts(number: string): { teil: string; nummer: string } | null {
  const m = BGBL.exec(number)
  return m ? { teil: m[1]!, nummer: m[2]! } : null
}

/** The law's consolidated text as it stands today. */
export function geltendeFassungUrl(gesetzesnummer: string): string {
  return `https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=${gesetzesnummer}`
}

/**
 * The laws among RIS search results that this BGBl changed, by Kurztitel.
 * Pure, for tests: `refs` are RIS `OgdDocumentReference` entries.
 */
export function lawsOfRefs(refs: readonly any[], teil: string, nummer: string): BgblLaw[] {
  // „BGBl. I Nr. 69/2026" and not „BGBl. I Nr. 169/2026" or „…/20261".
  const named = new RegExp(`BGBl\\.\\s+${teil}\\s+Nr\\.\\s*${nummer.replace('/', '\\/')}(?![\\d/])`)
  const byLaw = new Map<string, { title: string; standing: boolean; stammnorm: string | null }>()
  for (const r of refs) {
    const br = r?.Data?.Metadaten?.Bundesrecht
    const k = br?.BrKons
    const organ = typeof k?.Kundmachungsorgan === 'string' ? k.Kundmachungsorgan : ''
    const nr = typeof k?.Gesetzesnummer === 'string' ? k.Gesetzesnummer : null
    if (!nr || !named.test(organ)) continue
    const organName = typeof k?.StammnormPublikationsorgan === 'string' ? k.StammnormPublikationsorgan.trim() : ''
    const organNr = typeof k?.StammnormBgblnummer === 'string' ? k.StammnormBgblnummer.trim() : ''
    const entry = byLaw.get(nr) ?? {
      title: String(br?.Kurztitel ?? '').replace(/\s+/g, ' ').trim(),
      standing: false,
      stammnorm: organName && organNr ? `${organName} ${organNr}` : null,
    }
    if (!/\baufgehoben durch\b/.test(organ)) entry.standing = true
    byLaw.set(nr, entry)
  }
  return [...byLaw]
    .filter(([, e]) => e.standing && e.title)
    .map(([gesetzesnummer, e]) => ({ title: e.title, gesetzesnummer, url: geltendeFassungUrl(gesetzesnummer), stammnorm: e.stammnorm }))
    .sort((a, b) => a.title.localeCompare(b.title, 'de'))
}

/** Every page of the search, then `lawsOfRefs`. Throws when RIS fails or ignores the filter. */
export async function lawsOfBgbl(number: string): Promise<BgblLaw[]> {
  const parts = bgblParts(number)
  if (!parts) return []
  const refs: any[] = []
  for (let page = 1; page <= 20; page++) {
    const body = await konsJson(konsQuery({ Kundmachungsorgannummer: parts.nummer, DokumenteProSeite: 'OneHundred', Seitennummer: String(page) }))
    const results = body?.OgdSearchResult?.OgdDocumentResults
    const hits = Number(results?.Hits?.['#text'] ?? 0)
    if (hits > IMPLAUSIBLE_HITS) throw new Error(`RIS ignorierte den Filter: ${hits} Treffer für ${parts.nummer}`)
    const pageRefs = asArray<any>(results?.OgdDocumentReference)
    refs.push(...pageRefs)
    if (refs.length >= hits || pageRefs.length === 0) break
  }
  return lawsOfRefs(refs, parts.teil, parts.nummer)
}
