/**
 * GET /api/laender → LaenderResponse: the Länder's drafts, and per Land
 * whether it could be read (`utils/laender/sources.ts`).
 *
 * Two modes. Without parameters: the RUNNING Begutachtungen, what the
 * homepage's „Jetzt in Begutachtung" adds. With `gp` or `status`: every
 * draft whose Begutachtung began in that Gesetzgebungsperiode, running and
 * closed, filtered by `status` — what `/entwuerfe` lists beside the Bund's
 * halves. The period is a time window there (`readLaenderInWindow`).
 *
 * Always every Land: the reader's choice is applied on the page, so one
 * cached answer serves every choice.
 */
import type { LaenderResponse } from '#shared/types'
import { gpWindow } from '#shared/utils/gp'
import { firstQueryValue } from '#shared/utils/queryParams'
import { readLaender, readLaenderInWindow } from '../../utils/laender/sources'
import { requirePlausibleGp } from '../../utils/http/params'
import { getCurrentGp, listAvailableGps } from '../../utils/parliament/drafts'

const STATUSES = ['open', 'closed', 'all'] as const

export default defineEventHandler(async (event): Promise<LaenderResponse> => {
  const query = getQuery(event)
  const gpParam = firstQueryValue(query.gp)
  const statusParam = firstQueryValue(query.status)
  if (gpParam === undefined && statusParam === undefined) return readLaender()

  const status = (STATUSES as readonly string[]).includes(statusParam ?? 'all') ? (statusParam ?? 'all') as typeof STATUSES[number] : null
  if (!status) throw createError({ statusCode: 400, statusMessage: 'Ungültiger Status' })
  const currentGp = await getCurrentGp()
  const gp = requirePlausibleGp(gpParam || currentGp, currentGp)
  const window = gpWindow(gp)
  // A period the calendar does not reach has no window: no Länder rows, said
  // by an empty list and the period's own answer, not by an error.
  const { items, sources, undated } = window ? await readLaenderInWindow(window, status) : { items: [], sources: (await readLaender()).sources, undated: {} }
  return { items, sources, undated, gp, availableGps: listAvailableGps(currentGp) }
})
