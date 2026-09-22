/**
 * GET /api/stations/:gp → how many drafts of a period stand at each station,
 * and the map warmed as a side effect (docs/architecture.md §12.26).
 *
 * TWO JOBS, one of them the reason it exists. `/api/drafts` reads the same
 * map under a 2.5 s budget and answers without it when the build is cold, so
 * something has to pay the cold build where nobody is waiting: this route,
 * called by the prewarm unit after every deploy and nightly
 * (`deploy/systemd/…-prewarm.service`). It awaits the map in full — 35.6 s
 * for GP XXVII when nothing is cached.
 *
 * The counts it returns are the second job and not decoration: they are the
 * base rate of a running period ("wie viele Entwürfe sind bisher Gesetz
 * geworden") measured live rather than hand-copied, which is what
 * `shared/utils/outcomes.ts` still does from a script. Whether that becomes
 * a claim on a page is a separate decision — this endpoint only makes the
 * number available and says nothing about a draft that has not moved.
 *
 * `:gp` accepts `aktuell` for the running period, like `/api/ris-map/:gp`,
 * so the prewarm unit needs no knowledge of which one that is.
 */
import type { DraftStation } from '#shared/types'
import { GP_RE } from '#shared/utils/gp'

// Prewarm-only: no page calls this; deploy/systemd/begutachtungs-monitor-prewarm.service does, to pay the cold build where nobody waits.
export default defineEventHandler(async (event) => {
  const param = getRouterParam(event, 'gp') ?? 'aktuell'
  const gp = param.toLowerCase() === 'aktuell' ? await getCurrentGp() : param.toUpperCase()
  if (!GP_RE.test(gp)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Ungültige Gesetzgebungsperiode (römische Ziffern erwartet)',
    })
  }

  const chains = await getStationMapForGp(gp)
  const counts: Record<DraftStation, number> = { begutachtung: 0, rv: 0, parlament: 0, bgbl: 0 }
  let filingOpen = 0
  for (const chain of Object.values(chains)) {
    counts[chain.station]++
    if (chain.filingOpen) filingOpen++
  }

  return { gp, drafts: Object.keys(chains).length, counts, filingOpen }
})
