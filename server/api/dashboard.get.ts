/**
 * GET /api/dashboard → DashboardPayload.
 * Source: list 81 of the current GP (leaf-cached) — plus list 81 of the one
 * before it in two independent places, both only around a Periodenwechsel:
 * the still-running Fristen it carries over into `open`, and, while
 * the new period is too young to be ranked, the volume ranking.
 */
import type { DashboardPayload } from '#shared/types'
import { rankByStatements } from '#shared/utils/draftOrder'
import { getCarryOverDrafts } from '../utils/parliament/carryOver'
import { dedupeDraftList } from '../utils/parliament/draftList'
import { getRankedPeriod } from '../utils/parliament/rankedPeriod'

export default defineEventHandler(async (): Promise<DashboardPayload> => {
  const gp = await getCurrentGp()
  /* THREE READS AT ONCE: list 81 of the period, the carry-over and the
   * ranked period. The last reads the same list 81 again — Nitro answers
   * the concurrent identical call from the one in flight — and the period
   * before it, as the carry-over does, so around a Periodenwechsel the
   * second list is read once for both instead of after the first one.
   * Only list 81 of the running period can throw: the carry-over and the
   * ranking's fallback swallow their own failures, and the ranking's read
   * of the running period is the same call that fails first. */
  const [{ items: rawItems }, carried, ranked] = await Promise.all([
    getDraftsForGp(gp),
    getCarryOverDrafts(gp),
    /* The rows of the volume ranking, and the period they belong to — which
     * is the running one except during a Periodenwechsel. Its outcomes come
     * from /api/dashboard/outcomes, which derives the same ranking from the
     * same period through the same two functions (`rankedPeriod.ts`,
     * `shared/utils/draftOrder.ts`). */
    getRankedPeriod(gp),
  ])
  const items = rawItems.map(reconcileActive)

  /* Open consultations, deadline ascending (no deadline sorts last) — and
   * ACROSS THE PERIOD BOUNDARY. A Frist that outlives the Wechsel is still a
   * Frist, and „Jetzt in Begutachtung" claims a moment, not a period.
   * Empty in normal operation, measured over four finished
   * periods, so this adds rows only in the weeks where it is the difference
   * between a list and a wrong list.
   *
   * Folded after the merge, as `/api/drafts` does: a draft two Ressorts sent
   * stands in list 81 once per Ressort and would be listed twice. */
  const open = dedupeDraftList([...items.filter((item) => item.active), ...carried]).sort(
    (a, b) => (a.deadline ?? '9999-12-31').localeCompare(b.deadline ?? '9999-12-31'),
  )

  return {
    gp,
    open,
    ranked: {
      gp: ranked.gp,
      items: rankByStatements(ranked.items),
      /* The count belongs to the RANKED period, not the running one: it is
       * the size of the set behind the section's one link, and a header
       * reading „Alle 3 Ministerialentwürfe →" over five rows of the period
       * before would be a number about a different list. */
      total: ranked.items.length,
    },
  }
})
