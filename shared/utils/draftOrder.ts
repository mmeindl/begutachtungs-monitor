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
import type { DraftSummary, OpenVorlage, RisConsultation } from '../types'

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
 * Whether a Gesetzgebungsperiode can carry „Wo am meisten mitgeredet wurde"
 * at all — the condition behind the Periodenwechsel fallback (§12.35).
 *
 * Two clauses, and both are needed because they fail at different moments
 * of a new period (measured 2026-09-25 over the last two Wechsel):
 *
 *  - **Enough rows to be a list.** The section is cut to
 *    `HOME_LIST_LENGTH`, and a period that cannot fill it is not being
 *    ranked, it is being enumerated. GP XXVIII had its first
 *    Ministerialentwurf 54 days after it convened and its fifth after 83;
 *    GP XXVII took 15 and 20 days. In between, the section renders one to
 *    four rows under a superlative heading — or, at zero rows, silently
 *    disappears from the page, which is what would actually have happened
 *    on 24.10.2024.
 *  - **Something to rank by.** A fresh Begutachtung starts at zero and
 *    fills over its Frist, so five drafts of a week-old period are five
 *    zeroes, and „am meisten mitgeredet" over five zeroes is a ranking of
 *    the item numbers. `some` rather than a look at the leader is the same
 *    test — the leader is the maximum.
 *
 * MONOTONE, on purpose: a period only ever gains drafts and Stellungnahmen,
 * so this flips once and never flips back. Nothing here needs a timer, a
 * date, or a row added to `GP_STARTS` on the day of the Wechsel.
 */
export function canRankPeriod(items: readonly { statementCount: number }[]): boolean {
  return items.length >= HOME_LIST_LENGTH && items.some((i) => i.statementCount > 0)
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

/**
 * One row of the corpus list — three kinds, one order (docs/architecture.md
 * §12.19).
 *
 * NOT a common row shape: a Ministerialentwurf has a Geschäftszahl and a
 * Stellungnahmen count, a record without a Gegenstand has neither and never
 * can. Flattening both into one shape would mean inventing empty fields, and
 * an empty Stellungnahmen count reads as "nobody cared" where the truth is
 * "nobody counts". So each kind keeps its own type, and only the ORDER is
 * shared.
 */
export type DraftListRow =
  | { kind: 'me'; key: string; draft: DraftSummary }
  | { kind: 'ris'; key: string; item: RisConsultation }
  | { kind: 'vorlage'; key: string; vorlage: OpenVorlage }

/**
 * What the list's order asks of a row, whichever kind it is.
 *
 * A Regierungsvorlage without a Begutachtung has no Frist that could be
 * running — its form closes with the vote. So `active: false` with the
 * Einlangen as the date: the row sorts below the running Fristen and among
 * the second round, where it belongs, instead of claiming an urgency it
 * cannot date.
 */
export function rowOrderKey(row: DraftListRow): OrderedDraft {
  if (row.kind === 'me') return draftOrderKey(row.draft)
  if (row.kind === 'ris') return row.item
  return { active: false, deadline: null, startedAt: row.vorlage.date || null, title: row.vorlage.title }
}

/**
 * Most Stellungnahmen first — and the half that cannot be ranked stays a
 * block, it does not get interleaved at zero.
 *
 * A record without a Gegenstand carries no Stellungnahmen count and never
 * will (nobody publishes who filed one, §12.16). Sorting it in at 0 would
 * read as "nobody cared" about two thirds of the corpus, which is the one
 * misreading this list is built to prevent — so those rows follow all the
 * ranked ones, in the list's own Frist order, and the line above the list
 * says so.
 *
 * The ME comparison is `rankByStatements`' one, tie-break included, because
 * the homepage's five rows must be the first five in the list.
 */
export function compareRowsByStatements(a: DraftListRow, b: DraftListRow): number {
  if (a.kind !== b.kind) return a.kind === 'me' ? -1 : 1
  if (a.kind === 'me' && b.kind === 'me') {
    return b.draft.statementCount - a.draft.statementCount || b.draft.inr - a.draft.inr
  }
  return compareDrafts(rowOrderKey(a), rowOrderKey(b))
}
