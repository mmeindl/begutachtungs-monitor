/**
 * GET /api/dashboard → DashboardPayload (docs/architecture.md §5, §7).
 * Source: list 81 of the current GP (leaf-cached).
 */
import type { DashboardPayload } from '#shared/types'
import { rankByStatements } from '#shared/utils/draftOrder'

export default defineEventHandler(async (): Promise<DashboardPayload> => {
  const gp = await getCurrentGp()
  const { items: rawItems, lastSync } = await getDraftsForGp(gp)
  const items = rawItems.map(reconcileActive)

  // Open consultations, deadline ascending (no deadline sorts last).
  const open = items
    .filter((item) => item.active)
    .sort((a, b) => (a.deadline ?? '9999-12-31').localeCompare(b.deadline ?? '9999-12-31'))

  const closingWithin7Days = open.filter((item) => {
    const days = daysUntil(item.deadline)
    return days !== null && days >= 0 && days <= DEADLINE_SERIOUS_DAYS
  }).length

  // The rows of the volume ranking; their outcomes come from
  // /api/dashboard/outcomes, which derives the same ranking from the same
  // cached list through the same function (`shared/utils/draftOrder.ts`).
  const topByStatements = rankByStatements(items)

  return {
    gp,
    open,
    stats: {
      openCount: open.length,
      closingWithin7Days,
      statementsTotalGp: items.reduce((sum, item) => sum + item.statementCount, 0),
      consultationsTotalGp: items.length,
    },
    topByStatements,
    lastSync,
  }
})
