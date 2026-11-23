/**
 * GET /api/dashboard/zweite-runde → DashboardSecondRound: the items taking
 * Stellungnahmen right now (`utils/parliament/openVorlagen.ts`, which says
 * what they are and why).
 */
import type { DashboardSecondRound } from '#shared/types'
import { getCurrentGp } from '../../utils/parliament/drafts'
import { getOpenVorlagen } from '../../utils/parliament/openVorlagen'

export default defineEventHandler(async (): Promise<DashboardSecondRound> => getOpenVorlagen(await getCurrentGp()))
