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
 * „Offen" means: someone can say something here.
 *
 * Until 18.09.2026 that was the running Begutachtungsfrist alone. But a
 * Regierungsvorlage can be commented on in the Nationalrat just as well
 * (`statementsstate`), and for the reader that is the same question — one
 * station further on. Both under one switch is the only arrangement in which
 * the two windows do not need two pages; the station next to it says which
 * of the two this is.
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
    // No station map, no station filter — the response says so, rather than
    // silently filtering away everything we could not look up.
    if (stationFilter && stationsUsable && !stationFilter.has(item.chain?.station ?? 'begutachtung')) {
      return false
    }
    if (ministry && item.ministryCode.toUpperCase() !== ministry) return false
    if (q) {
      // Aliases are part of the haystack, not of the title: someone who only
      // knows "Bundestrojaner" has to find 8/ME (`shared/utils/draftAliases.ts`).
      //
      // THE RESSORT NAME IS NO LONGER IN IT, since 21.09.2026
      // (docs/architecture.md §12.31), and the rule behind that is: **what
      // is searched is what the row shows.** The name carries the whole
      // portfolio („… Klima- und Umweltschutz …") but appears nowhere on
      // the page — it matched invisibly and pulled 36 rows for „klima", 2
      // of which carried the word in the title. The code stays, because that
      // does stand in the row, and the Ressort has a filter of its own. The
      // title is untouched for the same reason: if it names a Ressort, the
      // reader sees it.
      //
      // SEVERAL WORDS ARE JOINED BY AND, since 22.09.2026: „klima gesetz"
      // used to search for those eleven characters in one piece and found
      // nothing, while the full-text block under the same field showed two
      // drafts (`shared/utils/textMatch.ts`).
      //
      // AND READ FOLDED, since the same day: „oekostrom" finds the
      // Ökostromförderung, as the Stellungnahmen list always did. Folded OR
      // raw — folded alone would have cost matches inside a word.
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
