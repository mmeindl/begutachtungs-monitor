/**
 * GET /api/dashboard → DashboardPayload (docs/architecture.md §5, §7).
 * Source: list 81 of the current GP (leaf-cached) — plus list 81 of the one
 * before it in two independent places, both only around a Periodenwechsel
 * (§12.35): the still-running Fristen it carries over into `open`, and, while
 * the new period is too young to be ranked, the volume ranking.
 */
import type { DashboardPayload } from '#shared/types'
import { rankByStatements } from '#shared/utils/draftOrder'
import { getCarryOverDrafts } from '../utils/parliament/carryOver'
import { getRankedPeriod } from '../utils/parliament/rankedPeriod'

export default defineEventHandler(async (): Promise<DashboardPayload> => {
  const gp = await getCurrentGp()
  const { items: rawItems } = await getDraftsForGp(gp)
  const items = rawItems.map(reconcileActive)

  /* Open consultations, deadline ascending (no deadline sorts last) — and
   * ACROSS THE PERIOD BOUNDARY. A Frist that outlives the Wechsel is still a
   * Frist, and „Jetzt in Begutachtung" claims a moment, not a period
   * (§12.35). Empty in normal operation, measured over four finished
   * periods, so this adds rows only in the weeks where it is the difference
   * between a list and a wrong list. */
  const open = [...items.filter((item) => item.active), ...(await getCarryOverDrafts(gp))].sort(
    (a, b) => (a.deadline ?? '9999-12-31').localeCompare(b.deadline ?? '9999-12-31'),
  )

  /* The rows of the volume ranking, and the period they belong to — which
   * is the running one except during a Periodenwechsel. Its outcomes come
   * from /api/dashboard/outcomes, which derives the same ranking from the
   * same period through the same two functions (`rankedPeriod.ts`,
   * `shared/utils/draftOrder.ts`). */
  const ranked = await getRankedPeriod(gp)

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
