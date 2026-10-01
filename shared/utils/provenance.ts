import type { LawStationId, Publisher } from '../types'

/**
 * Where a text on a page comes from, and what may be claimed about it —
 * the one place the licence rules live (01.10.2026).
 *
 * Until then three places wrote a credit sentence each: the annex service
 * on the server („Quelle (CC BY 4.0, RIS):"), `lawDiffSourceCredit` here in
 * shared („Quellen: RIS (CC BY 4.0) und Parlament (Dokumente: freie
 * Werke)"), and the Erläuterungen section by hand. Four wordings had grown
 * out of them, and the licence stood up to five times on one draft page.
 * Now a section names only its PUBLISHER, under the text it belongs to, and
 * the claim is made once, at the foot of the page, per document — which is
 * also what one line over two documents could not do: „Parlament (Dokumente:
 * freie Werke)" under ME→RV read as covering the draft too.
 *
 * Three rules, and nothing else decides a claim:
 *   - a RIS document is CC BY 4.0 (Bundeskanzleramt) — the RIS OGD grant,
 *     the one licence in this product that is settled;
 *   - a Parliament document of a parliamentary station (rv, ausschuss,
 *     plenum) is a freies Werk: Parliament's dataset pages call the
 *     documents of those items „freie Werke und somit ohne Lizenzierung frei
 *     nutzbar" (read live 23.09.2026) and license only the lists around them;
 *   - everything of the Begutachtungsverfahren read from Parliament — the
 *     draft's own documents, the Kurzinformation, the procedure's data, the
 *     Stellungnahmen — carries NO licence claim. Parliament publishes no
 *     open-data licence for it, and how far its exclusion reaches is the
 *     open question (docs/architecture.md §13.1). It is named, nothing more.
 *
 * The same document can exist under both (the Textgegenüberstellung in RIS
 * and in Parliament's copy): then the claim follows the copy that was READ,
 * which is why a section reports its sources from its data rather than from
 * a constant.
 */

/** What may be said about a source: a licence, a status, or nothing. */
export type SourceTerms = 'cc-by' | 'freies-werk' | 'keine-lizenz'

export interface SourceEntry {
  /** What the page shows from it, in the foot's words: „Textgegenüberstellung", „Regierungsvorlage". */
  what: string
  publisher: Publisher
  terms: SourceTerms
}

/** The stations whose documents Parliament itself calls freie Werke — the Ministerialentwurf is not one. */
const PARLIAMENTARY_STATIONS: ReadonlySet<LawStationId> = new Set<LawStationId>(['rv', 'ausschuss', 'plenum'])

/** A text read from RIS. */
export function risSource(what: string): SourceEntry {
  return { what, publisher: 'ris', terms: 'cc-by' }
}

/** A document read from Parliament's copy, at the station it belongs to. */
export function parliamentDocumentSource(what: string, station: LawStationId): SourceEntry {
  return { what, publisher: 'parlament', terms: PARLIAMENTARY_STATIONS.has(station) ? 'freies-werk' : 'keine-lizenz' }
}

/**
 * Parliament's own data — dates, counts, votes. CC BY 4.0 only for the
 * result lists, API and history pages of the stations after the
 * Begutachtung, and never for anything about Stellungnahmen.
 */
export function parliamentDataSource(what: string, terms: 'cc-by' | 'keine-lizenz'): SourceEntry {
  return { what, publisher: 'parlament', terms }
}

/** A document from either publisher, by where it was read. */
export function documentSource(what: string, station: LawStationId, publisher: Publisher): SourceEntry {
  return publisher === 'ris' ? risSource(what) : parliamentDocumentSource(what, station)
}

export const PUBLISHER_NAME_DE: Record<Publisher, string> = {
  ris: 'RIS',
  parlament: 'Parlament',
}

/** The section's line: „Quelle: RIS", „Quellen: Parlament, RIS" — publishers only, never a licence. */
export function sourceLineDe(sources: readonly SourceEntry[]): string | null {
  const publishers = [...new Set(sources.map((s) => s.publisher))]
  if (!publishers.length) return null
  return `${publishers.length === 1 ? 'Quelle' : 'Quellen'}: ${publishers.map((p) => PUBLISHER_NAME_DE[p]).join(', ')}`
}

/** One block of the page's foot: a publisher, what may be said about it, and what the page shows from it. */
export interface SourceGroup {
  publisher: Publisher
  terms: SourceTerms
  items: string[]
}

/** The foot's order: the settled licence first, the open question last. */
const GROUP_ORDER: readonly (readonly [Publisher, SourceTerms])[] = [
  ['ris', 'cc-by'],
  ['parlament', 'cc-by'],
  ['parlament', 'freies-werk'],
  ['parlament', 'keine-lizenz'],
]

/**
 * The page's sources, grouped by what may be claimed: one group per
 * publisher and terms, in a fixed order, each item once and in the order
 * the page first reported it.
 */
export function groupSources(sources: readonly SourceEntry[]): SourceGroup[] {
  return GROUP_ORDER.flatMap(([publisher, terms]) => {
    const items = [...new Set(sources.filter((s) => s.publisher === publisher && s.terms === terms).map((s) => s.what))]
    return items.length ? [{ publisher, terms, items }] : []
  })
}
