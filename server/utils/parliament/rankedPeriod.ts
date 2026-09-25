/**
 * Which Gesetzgebungsperiode „Wo am meisten mitgeredet wurde" speaks about
 * (docs/architecture.md §12.35).
 *
 * Normally the running one. On the day a new period constitutes itself it
 * has no Ministerialentwürfe at all, and for weeks after that too few to
 * rank — so the section falls back to the period before it, NAMED. The
 * naming is the whole design: §12.21 argues at length why this ranking may
 * not span periods (across GP XXVII the top five are 106.184, 35.296,
 * 19.026, 16.534 and 14.334 Stellungnahmen, four of them
 * Epidemiegesetz-Novellen — a COVID monument that can never change again),
 * and a fallback that merged the two would be that ranking by accident.
 * What falls back is the WINDOW, one period at a time, and the page says
 * which window it is.
 *
 * ONE function for both endpoints, and that is not tidiness. `/api/dashboard`
 * ships the rows and `/api/dashboard/outcomes` derives the same ranking
 * again to hang the outcome chips on it (`HOME_LIST_LENGTH` says why). If
 * only one of them fell back, the page would render five rows of one period
 * with the chips of another — the exact drift both of them are written to
 * avoid, except silent and only ever during a Periodenwechsel.
 */
import type { DraftSummary } from '#shared/types'
import { canRankPeriod } from '#shared/utils/draftOrder'
import { previousGp } from '#shared/utils/gp'
import { getDraftsForGp, reconcileActive } from './drafts'

export interface RankedPeriod {
  /** The period the ranking speaks about — the running one, or the one before. */
  gp: string
  /** Its whole list 81, reconciled; the caller cuts it to the ranking. */
  items: DraftSummary[]
}

async function periodOf(gp: string): Promise<RankedPeriod> {
  return { gp, items: (await getDraftsForGp(gp)).items.map(reconcileActive) }
}

/**
 * The period to rank, given the one that is running.
 *
 * Costs nothing in the normal case: `getDraftsForGp` is the same cached leaf
 * the rest of the dashboard reads, so the first call is already paid for and
 * the second one only happens while the fallback is active.
 *
 * THREE WAYS BACK TO THE CURRENT PERIOD, all of them deliberate. No previous
 * period (GP I, or a code Parliament's configuration made unreadable); a
 * previous period that cannot be ranked either, so the fallback would buy
 * nothing and only move the label; and an upstream failure, because a
 * section that exists to survive the Wechsel must not be the thing that
 * takes the homepage down on it. In all three the page shows the running
 * period and its own emptiness, which is the honest answer.
 */
export async function getRankedPeriod(currentGp: string): Promise<RankedPeriod> {
  const current = await periodOf(currentGp)
  if (canRankPeriod(current.items)) return current

  const prev = previousGp(currentGp)
  if (!prev) return current
  try {
    const fallback = await periodOf(prev)
    return canRankPeriod(fallback.items) ? fallback : current
  } catch {
    return current
  }
}
