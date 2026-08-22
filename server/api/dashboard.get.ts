/**
 * GET /api/dashboard → DashboardPayload (docs/architecture.md §5, §7).
 * Source: list 81 of the current GP (leaf-cached).
 */
import type { DashboardPayload } from '#shared/types'

export default defineEventHandler(async (): Promise<DashboardPayload> => {
  const gp = await getCurrentGp()
  const { items: rawItems, lastSync } = await getConsultationsForGp(gp)
  const items = rawItems.map(reconcileActive)

  // Open consultations, deadline ascending (no deadline sorts last).
  const open = items
    .filter((item) => item.active)
    .sort((a, b) => (a.deadline ?? '9999-12-31').localeCompare(b.deadline ?? '9999-12-31'))

  const closingWithin7Days = open.filter((item) => {
    const days = daysUntil(item.deadline)
    return days !== null && days >= 0 && days <= DEADLINE_SERIOUS_DAYS
  }).length

  const topByStatements = [...items]
    .sort((a, b) => b.statementCount - a.statementCount)
    .slice(0, 5)

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
