/**
 * GET /api/genannt/:gp → the period's „genannt" index in numbers: which
 * drafts the Erläuterungen of another draft's Regierungsvorlage name
 * (`parliament/namedInRvIndex.ts`).
 *
 * Prewarm-only, like `/api/stations/:gp`: no page calls this;
 * deploy/systemd/begutachtungs-monitor-prewarm.service does, so the cold
 * build — the Erläuterungen of every Vorlage inside a candidate's window,
 * off the document disk after the first deploy — is paid where nobody
 * waits. The draft page and the list read the index under a 2-s brake and
 * show what they showed before until it is there.
 *
 * `complete: false`: a read failed, and nothing is claimed from the index
 * until a rebuild succeeds (ten minutes on). Still a 200, so the prewarm
 * unit's later lines and its OnSuccess= run.
 */
import { gpFromParam, readGpParam, requirePlausibleGp } from '../../utils/http/params'

export default defineEventHandler(async (event) => {
  const currentGp = await getCurrentGp()
  const gp = requirePlausibleGp(gpFromParam(readGpParam(event, { defaultsToCurrent: true }), currentGp), currentGp)
  const named = await getNamedInRvIndex(gp)
  return {
    gp,
    complete: named !== null,
    named: named ? Object.entries(named).map(([inr, n]) => ({ inr: Number(inr), rv: n.rv.citation, daysAfterFrist: n.daysAfterFrist })) : [],
  }
})
