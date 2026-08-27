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
 */
import type { ClosedOutcome, ConsultationSummary, DashboardOutcomes } from '#shared/types'

const POOL_SIZE = 12
const DISPLAY_COUNT = 4

async function resolveOutcome(item: ConsultationSummary): Promise<ClosedOutcome | null> {
  try {
    const outcome = await getConsultationOutcome(item.gp, item.inr)
    return {
      gp: item.gp,
      inr: item.inr,
      citation: item.citation,
      title: item.title,
      ministryCode: item.ministryCode,
      ministryName: item.ministryName,
      deadline: item.deadline,
      statementCount: item.statementCount,
      rvCitation: outcome.rvCitation,
      bgblNumber: outcome.bgblNumber,
    }
  } catch {
    // Per-item tolerance: one failing Gegenstand must not kill the section.
    return null
  }
}

export default defineEventHandler(async (): Promise<DashboardOutcomes> => {
  const gp = await getCurrentGp()
  const { items } = await getConsultationsForGp(gp)
  const closed = items
    .map(reconcileActive)
    .filter((item) => !item.active)
    .sort(
      (a, b) =>
        (b.deadline ?? b.arrivedAt).localeCompare(a.deadline ?? a.arrivedAt) ||
        b.inr - a.inr,
    )

  const pool = (
    await Promise.all(closed.slice(0, POOL_SIZE).map(resolveOutcome))
  ).filter((o): o is ClosedOutcome => o !== null)

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

  return { recent, lastEnacted: alreadyShown ? null : progressed }
})
