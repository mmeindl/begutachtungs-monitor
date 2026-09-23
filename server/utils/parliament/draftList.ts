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
 * One row per Entwurf, however many ressorts sent it — and it names them all.
 *
 * List 81 carries a draft with two responsible ministries TWICE, identical in
 * everything but the Ressort column: GP XXVII 302/ME (BMFFIM ∥ BMJ), 266/ME
 * (BMF ∥ BMFFIM) and 114/ME (BMJ ∥ BMDW) — three of 350 drafts, and GP XXVIII
 * has none today. The archive list rendered each of them twice and counted
 * 353, which reads as a bug in our own aggregation on the page whose job is
 * to be counted on. The chain builders already fold the same way
 * (`stationMap.ts`, `enacted.ts`, `related.ts`); this is the list's copy of
 * that rule, and it sits here rather than in `getDraftsForGp` because the
 * leaf holds the rows as upstream sent them and the corpus scripts count
 * those.
 *
 * TWO THINGS THE FOLD OWES THE READER, both added on 23.09.2026:
 *
 *  - **The lead is ours, not upstream's.** Keeping the first row made the
 *    Ressort on the card a function of the order Parliament happened to
 *    return — and the detail page picked its own first row, so list and page
 *    could name different ministries for the same draft. Sorted by code, the
 *    same Ressort leads everywhere, today and after the next relaunch.
 *  - **The other ressorts are not dropped.** They stand in `coMinistries`,
 *    because „BMJ" alone on a draft the BMJ and the BMFFIM sent together is
 *    an incomplete answer to „von wem", not a shorter one.
 */
export function foldJointDraft<T extends DraftSummary>(rows: readonly T[]): T {
  // Plain code-point order, not `localeCompare`: the lead must not depend on
  // the ICU data of whichever machine renders the page. Ressort codes are
  // upper-case ASCII, where the two orders agree anyway.
  const sorted = [...rows].sort((a, b) =>
    a.ministryCode < b.ministryCode ? -1 : a.ministryCode > b.ministryCode ? 1 : 0,
  )
  const lead = sorted[0]!
  return {
    ...lead,
    coMinistries: sorted
      .slice(1)
      .map((row) => ({ code: row.ministryCode, name: row.ministryName })),
  }
}

export function dedupeDraftList<T extends DraftSummary>(items: readonly T[]): T[] {
  // Insertion order of the FIRST row of each draft, so the fold changes which
  // Ressort a row names and never where the row stands: the sort below is the
  // one place the list's order is decided.
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = `${item.gp}-${item.inr}`
    const group = groups.get(key)
    if (group) group.push(item)
    else groups.set(key, [item])
  }
  return [...groups.values()].map((group) => foldJointDraft(group))
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

/** Every Ressort code of a draft, upper-cased — the lead first, then the fold's. */
function ministryCodes(item: DraftSummary): string[] {
  return [item.ministryCode, ...item.coMinistries.map((m) => m.code)].map((c) => c.toUpperCase())
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
    // Lead OR co-ressort: on a jointly issued draft both ministries sent it,
    // so „Alle Entwürfe des Ministeriums BMJ" has to contain 302/ME whichever
    // of the two the fold put first.
    if (ministry && !ministryCodes(item).includes(ministry)) return false
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
      //
      // AND THE CO-RESSORT IS IN IT, since 23.09.2026, by the same rule: the
      // row now prints „BMFFIM · BMJ", so „bmj" has to find that row.
      const haystack = `${item.title} ${item.citation} ${ministryCodes(item).join(' ')} ${aliasHaystack(item.gp, item.inr)}`
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
