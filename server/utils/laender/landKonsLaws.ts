/**
 * Which laws in force a Landesgesetzblatt changed, created or repealed — the
 * „Geltende Fassung" of a Landesgesetz's page (10.11.2026), the
 * Bund's `ris/bgblLaws.ts` for RIS's consolidated Landesrecht (`LrKons`).
 *
 * The same key, and the reason it beats reading names: RIS's consolidated
 * records carry the Landesgesetzblatt that last changed them in
 * `Kundmachungsorgan` („LGBl Nr 32/2015 zuletzt geändert durch LGBl Nr
 * 94/2026"), and the API filters on it (`Kundmachungsorgannummer`, checked
 * live on 10.11.2026 for Salzburg's LGBl. Nr. 94/2026: 16 records, one law).
 * So each law the page names is one RIS itself ties to this
 * Landesgesetzblatt — confirmed by construction — and nothing is derived from
 * an Artikel heading or a title, whose genitives („Änderung des NÖ
 * Pflichtschulgesetzes") and Sammelnovellen would need guessing. The search
 * returns past versions too (LGBl. Nr. 7/2017: two records, in force until
 * 29.06.2017), so a law changed again later is still found. What it cannot
 * name: a law whose consolidation RIS has not done yet (days to weeks, „im
 * RIS noch nicht eingearbeitet"). And what the Bund's list pays too
 * (`bgblLaws.ts`, „NO DATE FILTER"): a law a later Landesgesetzblatt
 * repealed is still linked, unless this one created it. Measured per Land.
 *
 * PURE but `landLawsOfLgbl`, which fetches.
 */
import type { BgblLaw, LandCode, RepealedLaw } from '#shared/types'
import { todayIso } from '#shared/utils/format'
import { asArray } from '../ris/risRecord'
import { risJson, type UpstreamPolicy } from '../upstream/fetch'

const RIS_LAND: Record<LandCode, string> = { bgld: 'Burgenland', ktn: 'Kaernten', noe: 'Niederoesterreich', ooe: 'Oberoesterreich', sbg: 'Salzburg', stmk: 'Steiermark', t: 'Tirol', vbg: 'Vorarlberg', w: 'Wien' }
/** RIS's query name of each Land's consolidated law, where a record's own link does not say it. */
const ABFRAGE: Record<LandCode, string> = { bgld: 'LrBgld', ktn: 'LrK', noe: 'LrNO', ooe: 'LrOO', sbg: 'LrSbg', stmk: 'LrStmk', t: 'LrT', vbg: 'LrVbg', w: 'LrW' }
const LANDESRECHT_API = 'https://data.bka.gv.at/ris/api/v2.6/Landesrecht'
const POLICY: UpstreamPolicy = { timeoutMs: 30_000, retries: 2, accept: 'application/json', retryOnHttpError: true }
/** A Novelle is a handful of records, a new law a few hundred; twenty pages is a different source. */
const MAX_PAGES = 20

/** „LGBl. Nr. 94/2026" → „94/2026". */
export function lgblNummer(nr: string): string | null {
  return /(\d{1,4}\/\d{4})\b/.exec(nr)?.[1] ?? null
}

/** „LGBl Nr 94/2026", „LGBl. Nr. 94/2026" — and not „…194/2026" or „…/20261". */
function citationRe(nummer: string): RegExp {
  return new RegExp(`LGBl\\.?\\s*Nr\\.?\\s*${nummer.replace('/', '\\/')}(?![\\d/])`)
}

/** The geltende Fassung's page, in the Land's query of RIS. */
export function landGeltendeFassungUrl(land: LandCode, gesetzesnummer: string, abfrage?: string | null): string {
  return `https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=${abfrage ?? ABFRAGE[land]}&Gesetzesnummer=${gesetzesnummer}`
}

/* eslint-disable @typescript-eslint/no-explicit-any -- RIS search results */

interface Entry {
  title: string
  stammnorm: string | null
  abfrage: string | null
  standing: boolean
  repealedHere: boolean
  createdHere: boolean
  open: boolean
  lastDay: string | null
}

function entriesOf(refs: readonly any[], nummer: string, today: string | null): Map<string, Entry> {
  const named = citationRe(nummer)
  const repealedBy = new RegExp(`\\baufgehoben durch ${named.source}`)
  const byLaw = new Map<string, Entry>()
  for (const r of refs) {
    const lr = r?.Data?.Metadaten?.Landesrecht
    const k = lr?.LrKons
    const organ = typeof k?.Kundmachungsorgan === 'string' ? k.Kundmachungsorgan : ''
    const nr = typeof k?.Gesetzesnummer === 'string' ? k.Gesetzesnummer : null
    if (!nr || !named.test(organ)) continue
    const organName = typeof k?.StammnormPublikationsorgan === 'string' ? k.StammnormPublikationsorgan.trim() : ''
    const organNr = typeof k?.StammnormBgblnummer === 'string' ? k.StammnormBgblnummer.trim() : ''
    const stammnorm = organName && organNr ? `${organName.replace(/^LGBl\s+Nr$/, 'LGBl. Nr.')} ${organNr}` : null
    const abfrage = /[?&]Abfrage=(Lr\w+)/.exec(String(k?.GesamteRechtsvorschriftUrl ?? ''))?.[1] ?? null
    const entry = byLaw.get(nr) ?? {
      title: String(lr?.Kurztitel ?? '').replace(/\s+/g, ' ').trim(),
      stammnorm,
      abfrage,
      standing: false,
      repealedHere: false,
      createdHere: organNr === nummer,
      open: false,
      lastDay: null,
    }
    if (!/\baufgehoben durch\b/.test(organ)) entry.standing = true
    if (repealedBy.test(organ)) entry.repealedHere = true
    const end = typeof k?.Ausserkrafttretensdatum === 'string' ? k.Ausserkrafttretensdatum.slice(0, 10) : ''
    if (!end || (today !== null && end >= today)) entry.open = true
    if (end && (entry.lastDay === null || end > entry.lastDay)) entry.lastDay = end
    byLaw.set(nr, entry)
  }
  return byLaw
}

const byTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title, 'de')

/** The laws this Landesgesetzblatt changed or created that still stand, at their geltende Fassung. Pure. */
export function landLawsOfRefs(land: LandCode, refs: readonly any[], nummer: string, context?: { today: string; complete: boolean }): BgblLaw[] {
  return [...entriesOf(refs, nummer, context?.today ?? null)]
    .filter(([, e]) => e.standing && e.title)
    .map(([gesetzesnummer, e]) => {
      const law: BgblLaw = { title: e.title, gesetzesnummer, url: landGeltendeFassungUrl(land, gesetzesnummer, e.abfrage), stammnorm: e.stammnorm }
      if (context?.complete && e.createdHere && !e.open && e.lastDay) law.inKraftBis = e.lastDay
      return law
    })
    .sort(byTitle)
}

/** The laws it repealed whole. Pure. */
export function landRepealedOfRefs(refs: readonly any[], nummer: string): RepealedLaw[] {
  return [...entriesOf(refs, nummer, null)]
    .filter(([, e]) => !e.standing && e.repealedHere && e.title)
    .map(([gesetzesnummer, e]) => ({ title: e.title, gesetzesnummer, stammnorm: e.stammnorm }))
    .sort(byTitle)
}

/** Every page of the search, then both readings. Throws when RIS fails. */
export async function landLawsOfLgbl(land: LandCode, nr: string): Promise<{ laws: BgblLaw[]; repealed: RepealedLaw[] }> {
  const nummer = lgblNummer(nr)
  if (!nummer) return { laws: [], repealed: [] }
  const refs: any[] = []
  let hits = 0
  for (let page = 1; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({
      Applikation: 'LrKons',
      [`Bundesland_SucheIn${RIS_LAND[land]}`]: 'true',
      Kundmachungsorgannummer: nummer,
      DokumenteProSeite: 'OneHundred',
      Seitennummer: String(page),
    })
    const body = await risJson<any>(`${LANDESRECHT_API}?${params}`, POLICY)
    const results = body?.OgdDocumentResults
    hits = Number(results?.Hits?.['#text'] ?? 0)
    const pageRefs = asArray<any>(results?.OgdDocumentReference)
    refs.push(...pageRefs)
    if (refs.length >= hits || pageRefs.length === 0) break
  }
  const context = { today: todayIso(), complete: refs.length >= hits }
  return { laws: landLawsOfRefs(land, refs, nummer, context), repealed: landRepealedOfRefs(refs, nummer) }
}

/* eslint-enable @typescript-eslint/no-explicit-any */
