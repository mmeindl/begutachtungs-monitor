/**
 * GET /api/dashboard/outcomes → DashboardOutcomes ("Zuletzt abgeschlossen –
 * was wurde daraus?").
 *
 * Bounded fan-out: outcomes are resolved for a pool of the most recently
 * closed consultations (≤POOL_SIZE ME-Gegenstand + as many RV fetches, all
 * through the 30-min leaf caches). Months of normal ME→RV latency mean the
 * newest closed items mostly read "bisher keine RV" — so when the pool's
 * first POOL_SIZE items show no progression at all, ONE extension probes
 * deeper for the most recent RV/BGBl item, keeping the full chain
 * demonstrable without curating anything away. Selection stays strict
 * recency; outcomes never affect the order (Nachverfolgung, no scoreboard).
 *
 * Second job since 18.09.2026 (§12.21): the outcomes of the VOLUME RANKING,
 * so the homepage can hold "846 Stellungnahmen" against "bisher keine
 * Regierungsvorlage". Same function, same cached leaves, and resolved in the
 * same round as the pool — sequentially it would add its cold latency to a
 * section that is already server-rendered under a 4 s budget.
 */
import type { ClosedOutcome, DraftSummary, DashboardOutcomes } from '#shared/types'
import { rankByStatements } from '#shared/utils/draftOrder'

const POOL_SIZE = 12
const DISPLAY_COUNT = 4

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
  const gp = await getCurrentGp()
  const { items: rawItems } = await getDraftsForGp(gp)
  const items = rawItems.map(reconcileActive)
  const closed = items
    .filter((item) => !item.active)
    .sort(
      (a, b) =>
        (b.deadline ?? b.arrivedAt).localeCompare(a.deadline ?? a.arrivedAt) ||
        b.inr - a.inr,
    )

  /* The ranking's own rows, minus the ones still running: an open
   * Begutachtung has no outcome to resolve, and asking for one would cost an
   * upstream fetch per row to learn what the `active` flag already says. */
  const rankedClosed = rankByStatements(items).filter((item) => !item.active)

  const [pool, rankedOutcomes] = await Promise.all([
    Promise.all(closed.slice(0, POOL_SIZE).map(resolveOutcome)).then((r) =>
      r.filter((o): o is ClosedOutcome => o !== null),
    ),
    Promise.all(rankedClosed.map(resolveOutcome)).then((r) =>
      r.filter((o): o is ClosedOutcome => o !== null),
    ),
  ])

  const recent = pool.slice(0, DISPLAY_COUNT)

  // Most recent progressed item; BGBl beats RV-only when both exist.
  let progressed =
    pool.find((o) => o.bgblNumber) ?? pool.find((o) => o.rvCitation) ?? null
  if (!progressed && closed.length > POOL_SIZE) {
    const extension = (
      await Promise.all(closed.slice(POOL_SIZE, POOL_SIZE * 2).map(resolveOutcome))
    ).filter((o): o is ClosedOutcome => o !== null)
    progressed =
      extension.find((o) => o.bgblNumber) ??
      extension.find((o) => o.rvCitation) ??
      null
  }

  const alreadyShown =
    progressed !== null &&
    recent.some((r) => r.gp === progressed!.gp && r.inr === progressed!.inr)

  return { recent, lastEnacted: alreadyShown ? null : progressed, rankedOutcomes }
})
