/**
 * GET /api/dashboard/enacted → DashboardEnacted ("Zuletzt Gesetz geworden",
 * docs/architecture.md §12.23). How the list is found, and why from list 101
 * rather than from our own closed drafts: `utils/parliament/enacted.ts`.
 */
import type { DashboardEnacted } from '#shared/types'
import { getRecentlyEnacted } from '../../utils/parliament/enacted'

export default defineEventHandler(async (): Promise<DashboardEnacted> => {
  // Period and rows come from one call: which period the rows are from is
  // part of the answer, not something the page may infer (§12.35).
  return await getRecentlyEnacted()
})
