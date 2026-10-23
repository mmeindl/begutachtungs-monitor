/**
 * A Land's law in force on a given day, § by §, from RIS's consolidated
 * Landesrecht (`Applikation=LrKons`) — what a Textgegenüberstellung's text in
 * force is held against before the page shows it (`landTgu.ts`).
 */
import type { LandCode } from '#shared/types'
import { asArray } from '../ris/risRecord'
import { risJson, upstreamText, type UpstreamPolicy } from '../upstream/fetch'

const RIS_LAND: Record<LandCode, string> = { ooe: 'Oberoesterreich', sbg: 'Salzburg', w: 'Wien' }
const LANDESRECHT_API = 'https://data.bka.gv.at/ris/api/v2.6/Landesrecht'
const POLICY: UpstreamPolicy = { timeoutMs: 30_000, retries: 2, accept: 'application/json', retryOnHttpError: true }
const XML_POLICY: UpstreamPolicy = { timeoutMs: 30_000, retries: 2, upstreamHostsOnly: true }
/* The Oö. Gemeindeordnung has 137 §§ — two pages. Twenty is a different law. */
const MAX_PAGES = 20

/**
 * Where each § of a law stands in RIS on `date`: „§ 5" → its XML document.
 *
 * Searched by title and kept by the exact short title, because the title
 * search is a word search — „Bauordnung" also finds the Bauordnungs-Novelle.
 * RIS ends its short titles with a space now and then.
 */
export async function lawInForce(land: LandCode, shortTitle: string, date: string): Promise<Map<string, string>> {
  const found = await lawInForceAs(land, shortTitle, date)
  if (found.size || land !== 'sbg') return found
  // Salzburg titles a law with and without the Land's name — „Jagdgesetz
  // 1993", „Salzburger Raumordnungsgesetz 2009" — and its drafts as they like.
  const other = shortTitle.startsWith('Salzburger ') ? shortTitle.slice('Salzburger '.length) : `Salzburger ${shortTitle}`
  return lawInForceAs(land, other, date)
}

async function lawInForceAs(land: LandCode, shortTitle: string, date: string): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  let pages = 1
  for (let page = 1; page <= pages; page++) {
    const params = new URLSearchParams({
      Applikation: 'LrKons',
      [`Bundesland_SucheIn${RIS_LAND[land]}`]: 'true',
      Titel: shortTitle.replace(/^Oö\.\s*/, ''),
      DokumenteProSeite: 'OneHundred',
      Seitennummer: String(page),
      'Fassung.FassungVom': date,
    })
    /* eslint-disable @typescript-eslint/no-explicit-any -- RIS's envelope */
    const body = await risJson<any>(`${LANDESRECHT_API}?${params}`, POLICY)
    const refs = asArray<any>(body?.OgdDocumentResults?.OgdDocumentReference)
    // Asked past the last page, RIS answers 500 rather than an empty list.
    if (page === 1) pages = Math.min(Math.ceil(Number(body?.OgdDocumentResults?.Hits?.['#text'] ?? 0) / 100), MAX_PAGES)
    for (const ref of refs) {
      const meta = ref?.Data?.Metadaten?.Landesrecht
      if (String(meta?.Kurztitel ?? '').replace(/\s+/g, ' ').trim() !== shortTitle) continue
      const para = /^§\s*(\d+[a-z]*)/.exec(String(meta?.LrKons?.ArtikelParagraphAnlage ?? ''))?.[1]
      if (!para) continue
      const urls = asArray<any>(asArray<any>(ref?.Data?.Dokumentliste?.ContentReference)[0]?.Urls?.ContentUrl)
      const xml = urls.map((u) => String(u?.Url ?? '')).find((u) => u.endsWith('.xml'))
      if (xml) out.set(para, xml)
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }
  return out
}

export function paragraphText(url: string): Promise<string> {
  return upstreamText(url, XML_POLICY).then((xml) => xml.slice(Math.max(0, xml.indexOf('<nutzdaten'))))
}

/**
 * A § found by its own words, where the law's name does not find it: the
 * draft calls a law what it was called then — „Salzburger Behindertengesetz
 * 1981" — and RIS what it is called now, „Salzburger Teilhabegesetz", even
 * for the old version (23.10.2026). A phrase from the § as the document
 * prints it, searched in RIS's consolidated law on the day, finds the § and
 * its law's present name.
 */
export async function paragraphByPhrase(land: LandCode, phrase: string, number: string, date: string): Promise<{ url: string; law: string } | null> {
  const params = new URLSearchParams({
    Applikation: 'LrKons',
    [`Bundesland_SucheIn${RIS_LAND[land]}`]: 'true',
    Suchworte: `"${phrase}"`,
    DokumenteProSeite: 'Twenty',
    'Fassung.FassungVom': date,
  })
  /* eslint-disable @typescript-eslint/no-explicit-any -- RIS's envelope */
  const body = await risJson<any>(`${LANDESRECHT_API}?${params}`, POLICY)
  const hits = asArray<any>(body?.OgdDocumentResults?.OgdDocumentReference).flatMap((ref) => {
    const meta = ref?.Data?.Metadaten?.Landesrecht
    const para = /^§\s*(\d+[a-z]*)/.exec(String(meta?.LrKons?.ArtikelParagraphAnlage ?? ''))?.[1]
    const urls = asArray<any>(asArray<any>(ref?.Data?.Dokumentliste?.ContentReference)[0]?.Urls?.ContentUrl)
    const xml = urls.map((u) => String(u?.Url ?? '')).find((u) => u.endsWith('.xml'))
    return para === number && xml ? [{ url: xml, law: String(meta?.Kurztitel ?? '').replace(/\s+/g, ' ').trim() }] : []
  })
  /* eslint-enable @typescript-eslint/no-explicit-any */
  // Two laws with this § and these words is no find.
  return hits.length === 1 ? hits[0]! : null
}
