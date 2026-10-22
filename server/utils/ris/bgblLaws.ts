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
 * one that it repealed entirely has nothing left in force and is not — it
 * is named in `repealed` instead (22.10.2026), because an empty list read
 * as „noch nicht eingearbeitet" forever: the same search, re-run every day,
 * never finds a Fassung of a law that is gone.
 *
 * Free of Nitro globals like `konsLaw.ts`; the cache is `kons/konsCache.ts`.
 */
import type { BgblLaw, RepealedLaw } from '../../../shared/types'
import { todayIso } from '../../../shared/utils/format'
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

/** What a Bundesgesetzblatt did to the laws in force, as `lawsOfBgbl` reads it. */
export interface BgblLawsResult {
  /** The laws it changed or created that still stand, at their geltende Fassung. */
  laws: BgblLaw[]
  /** The laws it repealed whole. */
  repealed: RepealedLaw[]
}

/**
 * What the search can say about the day: today's date, and whether it holds
 * every version that names this BGBl — only then may „none of them is in
 * force" stand for the law (`inKraftBis`).
 */
interface SearchContext {
  today: string
  complete: boolean
}

/** „BGBl. I Nr. 69/2026" and not „BGBl. I Nr. 169/2026" or „…/20261". */
function citationRe(teil: string, nummer: string): RegExp {
  return new RegExp(`BGBl\\.\\s+${teil}\\s+Nr\\.\\s*${nummer.replace('/', '\\/')}(?![\\d/])`)
}

/* eslint-disable @typescript-eslint/no-explicit-any -- RIS search results, read as `bgblJoin.bgblRecordOf` reads them */

interface LawEntry {
  title: string
  stammnorm: string | null
  /** Some version that names this BGBl is not a repeal. */
  standing: boolean
  /** Some version says „aufgehoben durch" THIS BGBl. */
  repealedHere: boolean
  /** The law's Stammnorm is this BGBl — the search then holds all of its versions. */
  createdHere: boolean
  /** Some version is in force today or later, or has no end. */
  open: boolean
  /** The latest end of any version, ISO. */
  lastDay: string | null
}

/** The search results grouped by law — the one reading both lists below take. */
function entriesOf(refs: readonly any[], teil: string, nummer: string, today: string | null): Map<string, LawEntry> {
  const named = citationRe(teil, nummer)
  const repealedBy = new RegExp(`\\baufgehoben durch ${named.source}`)
  const byLaw = new Map<string, LawEntry>()
  for (const r of refs) {
    const br = r?.Data?.Metadaten?.Bundesrecht
    const k = br?.BrKons
    const organ = typeof k?.Kundmachungsorgan === 'string' ? k.Kundmachungsorgan : ''
    const nr = typeof k?.Gesetzesnummer === 'string' ? k.Gesetzesnummer : null
    if (!nr || !named.test(organ)) continue
    const organName = typeof k?.StammnormPublikationsorgan === 'string' ? k.StammnormPublikationsorgan.trim() : ''
    const organNr = typeof k?.StammnormBgblnummer === 'string' ? k.StammnormBgblnummer.trim() : ''
    const stammnorm = organName && organNr ? `${organName} ${organNr}` : null
    const entry = byLaw.get(nr) ?? {
      title: String(br?.Kurztitel ?? '').replace(/\s+/g, ' ').trim(),
      standing: false,
      repealedHere: false,
      createdHere: stammnorm !== null && named.test(stammnorm),
      open: false,
      lastDay: null,
      stammnorm,
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

/**
 * The laws among RIS search results that this BGBl changed, by Kurztitel.
 * Pure, for tests: `refs` are RIS `OgdDocumentReference` entries.
 *
 * NO DATE FILTER, and that has a cost (22.10.2026): a law this BGBl
 * changed and a LATER one repealed whole is still listed here — the
 * versions naming this BGBl are history, but they are not repeals.
 * „COVID-19-Impfpflichtgesetz" stood under BGBl. I Nr. 4/2022 as geltende
 * Fassung, though BGBl. I Nr. 131/2022 repealed it. Where this BGBl CREATED
 * the law, the search holds every version of it (each names its Stammnorm),
 * so „none in force today" is decidable and set as `inKraftBis`; where it
 * merely amended it, the later Fassungen do not name it, and whether the
 * law still stands would take a search of its own.
 */
export function lawsOfRefs(refs: readonly any[], teil: string, nummer: string, context?: SearchContext): BgblLaw[] {
  return [...entriesOf(refs, teil, nummer, context?.today ?? null)]
    .filter(([, e]) => e.standing && e.title)
    .map(([gesetzesnummer, e]) => {
      const law: BgblLaw = { title: e.title, gesetzesnummer, url: geltendeFassungUrl(gesetzesnummer), stammnorm: e.stammnorm }
      if (context?.complete && e.createdHere && !e.open && e.lastDay) law.inKraftBis = e.lastDay
      return law
    })
    .sort(byTitle)
}

/**
 * The laws this BGBl repealed whole: every version naming it is a repeal,
 * and it is the BGBl that repealed. A law it created and a later BGBl
 * repealed is not among them — it did not repeal anything. Pure, for tests.
 */
export function repealedOfRefs(refs: readonly any[], teil: string, nummer: string): RepealedLaw[] {
  return [...entriesOf(refs, teil, nummer, null)]
    .filter(([, e]) => !e.standing && e.repealedHere && e.title)
    .map(([gesetzesnummer, e]) => ({ title: e.title, gesetzesnummer, stammnorm: e.stammnorm }))
    .sort(byTitle)
}

/** Every page of the search, then both readings. Throws when RIS fails or ignores the filter. */
export async function lawsOfBgbl(number: string): Promise<BgblLawsResult> {
  const parts = bgblParts(number)
  if (!parts) return { laws: [], repealed: [] }
  const refs: any[] = []
  let hits = 0
  for (let page = 1; page <= 20; page++) {
    const body = await konsJson(konsQuery({ Kundmachungsorgannummer: parts.nummer, DokumenteProSeite: 'OneHundred', Seitennummer: String(page) }))
    const results = body?.OgdSearchResult?.OgdDocumentResults
    hits = Number(results?.Hits?.['#text'] ?? 0)
    if (hits > IMPLAUSIBLE_HITS) throw new Error(`RIS ignorierte den Filter: ${hits} Treffer für ${parts.nummer}`)
    const pageRefs = asArray<any>(results?.OgdDocumentReference)
    refs.push(...pageRefs)
    if (refs.length >= hits || pageRefs.length === 0) break
  }
  const context = { today: todayIso(), complete: refs.length >= hits }
  return {
    laws: lawsOfRefs(refs, parts.teil, parts.nummer, context),
    repealed: repealedOfRefs(refs, parts.teil, parts.nummer),
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */
