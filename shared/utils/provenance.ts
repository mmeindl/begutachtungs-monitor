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
 * Now a section names only who published each document it shows, under the
 * text it belongs to, and the claim itself stands once, in the Impressum
 * (§ „Urheberrecht & Lizenzen"), which the footer of every page links — CC
 * BY 4.0 § 3 a (2) allows exactly that. A „Quellen" block at the foot of
 * every draft page did the same per document for one day (01.10.2026) and
 * went again: the rules below decide every claim from publisher and
 * document, so a reader who knows those two needs no list, and the block
 * repeated the Impressum on every page.
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
 * which is why a section derives its sources from its data rather than from
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

/** A document from either publisher, by where it was read. */
export function documentSource(what: string, station: LawStationId, publisher: Publisher): SourceEntry {
  return publisher === 'ris' ? risSource(what) : parliamentDocumentSource(what, station)
}

export const PUBLISHER_NAME_DE: Record<Publisher, string> = {
  ris: 'RIS',
  parlament: 'Parlament',
}

/** Whether a section's documents come from more than one publisher — then each item has to name its own. */
export function mixedPublishers(sources: readonly SourceEntry[]): boolean {
  return new Set(sources.map((s) => s.publisher)).size > 1
}

/**
 * The opening of a section's line: „Quelle: RIS" where one publisher stands
 * behind everything in it — never a licence. Where several do, only
 * „Quellen:", and the items after it name theirs („Ministerialentwurf
 * (Parlament)"): „Quellen: Parlament, RIS" over two documents left open
 * which came from where, and that is what decides the claim.
 */
export function sourceLineDe(sources: readonly SourceEntry[]): string | null {
  const publishers = [...new Set(sources.map((s) => s.publisher))]
  if (!publishers.length) return null
  return publishers.length === 1 ? `Quelle: ${PUBLISHER_NAME_DE[publishers[0]!]}` : 'Quellen:'
}
