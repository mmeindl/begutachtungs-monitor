/**
 * The filter and the order of `/api/drafts` — the two decisions about a
 * list of Ministerialentwürfe that are not about fetching one.
 *
 * Pure, so both are under test: what a query shows and what leads a page
 * are product decisions, and a handler is the wrong place to keep them
 * where nothing can read them back.
 */
// Pure module, relative imports only (`ris/risRecord.ts`): what a query shows is
// a rule vitest has to be able to execute without Nuxt's aliases.
import type { DraftStation, DraftStatus, DraftSummary } from '../../../shared/types'
import { aliasHaystack } from '../../../shared/utils/draftAliases'
import { matchesQuery } from '../../../shared/utils/textMatch'

export interface DraftListFilter {
  status: DraftStatus
  /** Empty means "every station". */
  stations: readonly DraftStation[]
  ministry: string | undefined
  /** Already lowercased. */
  q: string | undefined
  /**
   * Whether the station map was readable AND the period may be spoken
   * about (`chainCoverageOf`/`mayClaimOutcome`). False turns the station
   * filter off rather than applying it to rows that carry no station.
   */
  stationsUsable: boolean
}

/**
 * „Offen" heißt: hier kann jemand etwas sagen.
 *
 * Bis zum 18.09.2026 war das allein die laufende Begutachtungsfrist. Zu
 * einer Regierungsvorlage kann im Nationalrat aber genauso Stellung genommen
 * werden (`statementsstate`), und das ist dieselbe Frage des Lesers — nur
 * eine Station weiter. Beides unter einem Schalter ist der einzige Ort, an
 * dem die zwei Fenster nicht zwei Seiten brauchen; die Station daneben sagt,
 * welches der beiden es ist.
 */
export function canParticipate(item: Pick<DraftSummary, 'active' | 'chain'>): boolean {
  return item.active || item.chain?.filingOpen === true
}

export function filterDraftList<T extends DraftSummary>(
  items: readonly T[],
  filter: DraftListFilter,
): T[] {
  const { status, ministry, q, stationsUsable } = filter
  const stationFilter = filter.stations.length ? new Set<DraftStation>(filter.stations) : null

  return items.filter((item) => {
    if (status === 'open' && !canParticipate(item)) return false
    if (status === 'closed' && canParticipate(item)) return false
    // Ohne Karte kein Stationsfilter — die Antwort sagt es, statt hier
    // stillschweigend alles wegzufiltern, was wir nicht nachsehen konnten.
    if (stationFilter && stationsUsable && !stationFilter.has(item.chain?.station ?? 'begutachtung')) {
      return false
    }
    if (ministry && item.ministryCode.toUpperCase() !== ministry) return false
    if (q) {
      // Aliases are part of the haystack, not of the title: someone who only
      // knows "Bundestrojaner" has to find 8/ME (`shared/utils/draftAliases.ts`).
      //
      // DER RESSORTNAME IST SEIT 21.09.2026 NICHT MEHR DABEI (§12.31), und
      // die Regel dahinter ist: **gesucht wird, was die Zeile zeigt.** Der
      // Name trägt das ganze Portfolio („… Klima- und Umweltschutz …"),
      // steht aber nirgends auf der Seite — er traf unsichtbar und zog
      // unter „klima" 36 Zeilen, von denen 2 das Wort im Titel führten. Das
      // Kürzel bleibt, denn das steht in der Zeile, und für das Ressort
      // gibt es den eigenen Filter. Der Titel bleibt aus demselben Grund
      // unangetastet: Nennt er ein Ressort, sieht der Leser es.
      //
      // MEHRERE WÖRTER WERDEN MIT UND VERKNÜPFT, seit 22.09.2026: „klima
      // gesetz" suchte vorher diese elf Zeichen am Stück und fand nichts,
      // während der Volltextblock unter demselben Feld zwei Entwürfe zeigte
      // (`shared/utils/textMatch.ts`).
      //
      // UND GEFALTET GELESEN, seit demselben Tag: „oekostrom" findet die
      // Ökostromförderung, wie es die Stellungnahmenliste immer schon tat.
      // Gefaltet ODER roh — gefaltet allein hätte Wortinneres gekostet.
      const haystack = `${item.title} ${item.citation} ${item.ministryCode} ${aliasHaystack(item.gp, item.inr)}`
      if (!matchesQuery(haystack, q)) return false
    }
    return true
  })
}

/**
 * Open first, nearest Frist leading (the acting audience's order: "which
 * deadline ends next?"); closed after, most recently ended first. A dead
 * item must never lead the page while consultations end this week.
 */
export function sortDraftList<T extends DraftSummary>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    if (a.active) {
      if (a.deadline && b.deadline) {
        return a.deadline.localeCompare(b.deadline) || b.inr - a.inr
      }
      // Open without Frist has no urgency — after the dated ones.
      if (a.deadline !== b.deadline) return a.deadline ? -1 : 1
      return b.arrivedAt.localeCompare(a.arrivedAt) || b.inr - a.inr
    }
    const aEnd = a.deadline ?? a.arrivedAt
    const bEnd = b.deadline ?? b.arrivedAt
    return bEnd.localeCompare(aEnd) || b.inr - a.inr
  })
}
