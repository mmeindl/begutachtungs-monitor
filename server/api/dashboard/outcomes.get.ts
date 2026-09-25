/**
 * GET /api/dashboard/outcomes → DashboardOutcomes: what became of the drafts
 * the homepage ranks by participation ("Wo am meisten mitgeredet wurde",
 * §12.21).
 *
 * Bounded by construction — the ranking is five rows and only the closed
 * ones are resolved, so this costs at most five Gegenstand fetches plus
 * their RV leg, all through the 30-min leaf caches.
 *
 * WHAT IT NO LONGER DOES (18.09.2026): resolve a pool of the most recently
 * CLOSED consultations for a "Zuletzt abgeschlossen" section — median ME→RV
 * latency is 40 days and the pool's rows were two weeks old, so it said
 * "bisher keine Regierungsvorlage" four times over and called it an outcome
 * (docs/architecture.md §12.23). The end of the chain is now read where it
 * actually stands, on the Vorlage: `/api/dashboard/enacted`. With the pool
 * went its extension probe, which existed only to keep one progressed row on
 * screen.
 */
import type { ClosedOutcome, DraftSummary, DashboardOutcomes } from '#shared/types'
import { rankByStatements } from '#shared/utils/draftOrder'
import { getRankedPeriod } from '../../utils/parliament/rankedPeriod'

async function resolveOutcome(item: DraftSummary): Promise<ClosedOutcome | null> {
  try {
    const outcome = await getDraftOutcome(item.gp, item.inr)
    return { ...item, rvCitation: outcome.rvCitation, bgblNumber: outcome.bgblNumber }
  } catch {
    // Per-item tolerance: one failing Gegenstand must not kill the section.
    return null
  }
}

export default defineEventHandler(async (): Promise<DashboardOutcomes> => {
  /* THE SAME PERIOD /api/dashboard RANKED, through the same function — not
   * `getCurrentGp()` on its own. During a Periodenwechsel the ranking speaks
   * about the period before (§12.35), and resolving the outcomes of the
   * running period instead would leave five rows without chips: every key
   * carries its GP (`${o.gp}-${o.inr}`), so nothing would match and the
   * section would quietly lose the half it exists for. */
  const ranked = await getRankedPeriod(await getCurrentGp())

  /* The ranking's own rows, minus the ones still running: an open
   * Begutachtung has no outcome to resolve, and asking for one would cost an
   * upstream fetch per row to learn what the `active` flag already says. */
  const rankedClosed = rankByStatements(ranked.items).filter((item) => !item.active)

  const rankedOutcomes = (await Promise.all(rankedClosed.map(resolveOutcome))).filter(
    (o): o is ClosedOutcome => o !== null,
  )

  return { rankedOutcomes }
})
