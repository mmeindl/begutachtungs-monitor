/**
 * GET /api/dashboard/beschlossen → DashboardDecided: the drafts of the
 * running period whose Vorlage the Nationalrat has decided and the
 * Bundesgesetzblatt has not yet carried — „Im Nationalrat beschlossen"
 * (docs/architecture.md §12.21, Nachtrag 03.10.2026). Which rows, in which
 * order: `utils/parliament/decidedOrder.ts`.
 *
 * NO UPSTREAM REQUEST OF ITS OWN. The rows are list 81, the dates are the
 * station map's (`DraftChain.decidedAt`, read from the Vorlage's `phase`
 * record) — both the same cached leaves `/api/drafts` reads.
 *
 * The map gets the list's budget and the list's reason (`api/drafts`): warm
 * it is milliseconds, cold it is a background build of hundreds of
 * requests, and a homepage section may not wait for that. Past the budget
 * the answer is empty and the section hides; the build carries on and the
 * next request finds the map warm. Empty is the honest answer here — the
 * section claims something about every row it shows, and without the map it
 * can claim nothing.
 *
 * No fallback to the period before (`DashboardDecided.gp`).
 */
import type { DashboardDecided } from '#shared/types'
import { todayIso } from '#shared/utils/format'
import { dedupeDraftList } from '../../utils/parliament/draftList'
import { pickDecided } from '../../utils/parliament/decidedOrder'
import { promulgationState } from '#shared/utils/promulgation'

/** The list's budget for the station map (`api/drafts/index.get.ts`). */
const STATION_MAP_BUDGET_MS = 2_500

export default defineEventHandler(async (): Promise<DashboardDecided> => {
  const gp = await getCurrentGp()
  const [{ items }, chains] = await Promise.all([
    getDraftsForGp(gp),
    withinBudget(getStationMapForGp(gp), STATION_MAP_BUDGET_MS),
  ])
  if (!chains) return { gp, items: [], total: 0 }
  // Folded like the list it links to, so a jointly issued draft is one row
  // here and one in the number behind the link (`dedupeDraftList`).
  const drafts = dedupeDraftList(items.map(reconcileActive))
  const today = todayIso()
  return {
    gp,
    items: pickDecided(drafts, chains, today),
    /* The section's own set, uncapped — for `ListHeader`, whose number
     * appears only while rows are hidden. At Parlament with no open window,
     * as behind the link (`?station=parlament&status=closed`), and like the
     * rows without what will not be promulgated: the list behind the link
     * shows those too, under their own Stand („Beschlossen, nicht
     * kundgemacht"), which this section is not about. */
    total: drafts.filter((d) => {
      const chain = chains[d.inr]
      return chain?.station === 'parlament' && !chain.filingOpen && !promulgationState(chain, today)
    }).length,
  }
})
