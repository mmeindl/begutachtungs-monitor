/**
 * The order every list of Begutachtungen uses, for both kinds of row
 * (docs/architecture.md §12.19).
 *
 * Extracted when `/entwuerfe` became one list holding Ministerialentwürfe
 * and the Begutachtungen without a Gegenstand at Parliament. Interleaving
 * them needs ONE comparator: a second implementation would sort the merged
 * list differently from the two endpoints that feed it, and the difference
 * would show up as rows apparently jumping when a filter narrows the list to
 * one kind.
 *
 * Pure module: no Nuxt auto-imports, so the server list, the client merge
 * and vitest all run the same function.
 */

/**
 * What ordering needs from a row, and nothing else.
 *
 * `startedAt` is the day the Begutachtung began — the Einlangen for a
 * Ministerialentwurf, the Beginn der Begutachtungsfrist for a RIS record.
 * Both answer "since when has this been open", which is the only thing the
 * order asks of it.
 */
export interface OrderedDraft {
  active: boolean
  deadline: string | null
  startedAt: string | null
  title: string
}

/**
 * A Ministerialentwurf's ordering key: `arrivedAt` is its `startedAt`.
 *
 * The one asymmetry between the two kinds — a RIS record already carries
 * `startedAt` and satisfies `OrderedDraft` as it stands, list 81 calls the
 * same day `arrivedAt`. Lives here because two pages now interleave the
 * kinds (`/` and `/entwuerfe`), and a mapping written twice is the same
 * drift risk as a comparator written twice.
 */
export function draftOrderKey(draft: {
  active: boolean
  deadline: string | null
  arrivedAt: string | null
  title: string
}): OrderedDraft {
  return {
    active: draft.active,
    deadline: draft.deadline,
    startedAt: draft.arrivedAt,
    title: draft.title,
  }
}

/**
 * How many rows a list on the homepage shows — all four of them
 * (docs/architecture.md §12.24).
 *
 * It was four numbers until 18.09.2026: 6 open rows, 3 Vorlagen, 5 ranked,
 * 4 Kundmachungen, each with its own argument and two of them living in an
 * endpoint while the others lived in the page. Four windows onto four
 * corpora that are cut to four depths read as four kinds of section, and
 * the reader learns a length per section instead of learning it once.
 *
 * Five, because the ranking cannot sensibly be shorter (a top 3 is an
 * anecdote) and the cap of the open list may not be longer: §12.20 measured
 * what pushes the accountability sections below the third viewport.
 *
 * Also one constant because two endpoints read the ranking — `/api/dashboard`
 * ships the rows, `/api/dashboard/outcomes` the outcomes belonging to them —
 * and a different length on either side would leave chips without rows or
 * rows without chips.
 */
export const HOME_LIST_LENGTH = 5

/**
 * The volume ranking: most Stellungnahmen first.
 *
 * NOT the list order above. That one answers "was kann ich noch
 * beeinflussen"; this one answers "wo wurde am meisten mitgeredet", and the
 * homepage holds the answer against what became of those drafts.
 *
 * Tie-break by `inr` descending: equal counts are the normal case early in a
 * GP (a shelf of drafts at 0), and without it their order would depend on
 * the order the corpus happened to arrive in — different between two
 * endpoints reading the same list.
 */
export function rankByStatements<T extends { inr: number; statementCount: number }>(
  items: readonly T[],
  count: number = HOME_LIST_LENGTH,
): T[] {
  return [...items]
    .sort((a, b) => b.statementCount - a.statementCount || b.inr - a.inr)
    .slice(0, count)
}

/**
 * Open first, then by nearest Frist; closed ones most recently ended first.
 *
 * The reasoning, in the order the comparisons run:
 *  - **Open before closed, whatever the dates say.** A running Frist is the
 *    only thing a reader can still act on, and this product exists for that
 *    moment.
 *  - **Nearest Frist first** among the open ones — urgency, not recency.
 *  - **An open record without a Frist sorts after the dated ones.** It
 *    carries no urgency to rank by; upstream leaves the field empty often
 *    enough that dropping it would hide the record entirely.
 *  - **Closed: most recently ended first**, because the interesting question
 *    about a finished Begutachtung is what happened to it, and that is
 *    freshest for the ones that just ended.
 *  - **Tie-break by title.** Four Verordnungen shared one Frist on
 *    2026-10-16; without this their order depended on the corpus fetch and
 *    moved between visits.
 */
export function compareDrafts(a: OrderedDraft, b: OrderedDraft): number {
  if (a.active !== b.active) return a.active ? -1 : 1
  if (a.active) {
    if (a.deadline && b.deadline) {
      return a.deadline.localeCompare(b.deadline) || a.title.localeCompare(b.title, 'de-AT')
    }
    if (a.deadline !== b.deadline) return a.deadline ? -1 : 1
    return (b.startedAt ?? '').localeCompare(a.startedAt ?? '')
  }
  const aEnd = a.deadline ?? a.startedAt ?? ''
  const bEnd = b.deadline ?? b.startedAt ?? ''
  return bEnd.localeCompare(aEnd) || a.title.localeCompare(b.title, 'de-AT')
}
