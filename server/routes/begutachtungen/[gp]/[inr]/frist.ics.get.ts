/**
 * GET /begutachtungen/:gp/:inr/frist.ics — the one consultation's Frist as
 * a single-event iCalendar file ("Frist in den Kalender" on the detail
 * page). Reuses the cached list-81 leaf and the shared ICS builder, so the
 * UID stays identical to the event in the full /kalender.ics subscription —
 * importing both never duplicates the event.
 */
import { GP_RE, INR_RE } from '#shared/utils/gp'

export default defineEventHandler(async (event) => {
  const gp = String(getRouterParam(event, 'gp') ?? '').toUpperCase()
  const inrRaw = String(getRouterParam(event, 'inr') ?? '')
  if (!GP_RE.test(gp) || !INR_RE.test(inrRaw)) {
    throw createError({ statusCode: 404, statusMessage: 'Begutachtung nicht gefunden' })
  }
  const inr = Number(inrRaw)

  const siteUrl = useRuntimeConfig(event).public.siteUrl
  const { items } = await getConsultationsForGp(gp)
  const item = items.map(reconcileActive).find((i) => i.inr === inr)
  if (!item) {
    throw createError({ statusCode: 404, statusMessage: 'Begutachtung nicht gefunden' })
  }
  if (!item.deadline) {
    throw createError({ statusCode: 404, statusMessage: 'Diese Begutachtung hat keine Frist' })
  }

  const body = buildIcsCalendar(siteUrl, [item])

  const etag = bodyEtag(body)
  setHeader(event, 'ETag', etag)
  if (getHeader(event, 'if-none-match') === etag) {
    setResponseStatus(event, 304)
    return ''
  }
  setHeader(event, 'Content-Type', 'text/calendar; charset=utf-8')
  return body
})
