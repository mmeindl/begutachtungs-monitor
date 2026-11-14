/**
 * GET /api/laender → LaenderResponse: the Länder's drafts, and per Land
 * whether it could be read (`utils/laender/sources.ts`).
 *
 * Two modes. Without parameters: the RUNNING Begutachtungen, what the
 * homepage's „Jetzt in Begutachtung" adds. With `gp` or `status`: every
 * draft whose Begutachtung began in that Gesetzgebungsperiode, running and
 * closed, filtered by `status` — what `/entwuerfe` lists beside the Bund's
 * halves. The period is a time window there (`readLaenderInWindow`). Or
 * with `landtag` instead of `gp` (14.11.2026): a Land's own period, its window
 * from the calendar (`shared/utils/periodCalendar.ts`) — the list asks so
 * while that one Land is the selection.
 *
 * Always every Land: the reader's choice is applied on the page, so one
 * cached answer serves every choice.
 */
import type { EuMarker, LandConsultation, LaenderResponse, LandConsultationRow } from '#shared/types'
import { gpWindow } from '#shared/utils/gp'
import { gpsOverlapping, type DateWindow } from '#shared/utils/periodCalendar'
import { landDraftPath } from '#shared/utils/laender'
import { firstQueryValue } from '#shared/utils/queryParams'
import { readLaender, readLaenderInWindow } from '../../utils/laender/sources'
import { readLandtagQuery, requirePlausibleGp } from '../../utils/http/params'
import { getCurrentGp, listAvailableGps } from '../../utils/parliament/drafts'
import { landKey } from '../../utils/eu/euMapStore'
import { landNumberOf } from '../../utils/eu/euMap'

const STATUSES = ['open', 'closed', 'all'] as const

/** Each row with its page (`LandConsultationRow`). */
const withPath = (items: readonly LandConsultation[]): LandConsultationRow[] =>
  items.map((d) => ({ ...d, path: landDraftPath(d.land, d.id) }))

/**
 * The EU map's markers for a Land period's window: the map is built per Bund
 * period, so every Bund period the window touches is asked, and the markers
 * count only where each of them answered — one missing would leave its rows
 * without a marker, and the chip would drop them in silence.
 */
async function euMarkersForWindow(window: DateWindow): Promise<Map<string, EuMarker | null> | null> {
  const gps = gpsOverlapping(window)
  if (!gps.length) return null
  const maps = await Promise.all(gps.map((gp) => euMarkersForList(gp)))
  if (maps.some((m) => m === null)) return null
  return new Map(maps.flatMap((m) => [...m!]))
}

export default defineEventHandler(async (event): Promise<LaenderResponse> => {
  const query = getQuery(event)
  const gpParam = firstQueryValue(query.gp)
  const statusParam = firstQueryValue(query.status)
  if (gpParam === undefined && statusParam === undefined && firstQueryValue(query.landtag) === undefined) {
    const { items, sources } = await readLaender()
    return { items: withPath(items), sources }
  }

  const status = (STATUSES as readonly string[]).includes(statusParam ?? 'all') ? (statusParam ?? 'all') as typeof STATUSES[number] : null
  if (!status) throw createError({ statusCode: 400, statusMessage: 'Ungültiger Status' })
  const currentGp = await getCurrentGp()
  const landtag = readLandtagQuery(event)
  const gp = landtag ? null : requirePlausibleGp(gpParam || currentGp, currentGp)
  const window = landtag ? landtag.window : gpWindow(gp!)
  // A period the calendar does not reach has no window: no Länder rows, said
  // by an empty list and the period's own answer, not by an error.
  const [{ items, sources, undated }, markers] = await Promise.all([
    window ? readLaenderInWindow(window, status) : { items: [], sources: (await readLaender()).sources, undated: {} },
    // The EU map, as on `/api/drafts` — but never a
    // filter here: the page filters the Länder rows itself, as it does the
    // stations, so one cached answer serves every choice.
    !window ? null : landtag ? euMarkersForWindow(window) : euMarkersForList(gp!),
  ])
  const withEu = markers
    ? items.map((d) => {
        const eu = markers.get(landKey(d.land, landNumberOf(d.id)))
        return eu === undefined ? d : { ...d, eu }
      })
    : items
  return {
    items: withPath(withEu),
    sources,
    undated,
    ...(landtag ? { landtag: landtag.value } : { gp: gp! }),
    availableGps: listAvailableGps(currentGp),
    euAvailable: markers !== null,
  }
})
