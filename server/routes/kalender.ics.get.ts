/**
 * GET /kalender.ics — Begutachtungsfristen of the current GP as an
 * iCalendar subscription (all-day events, stable UIDs). Reuses the cached
 * list-81 leaf; the route itself is uncached (architecture.md §5).
 * Calendar apps refresh on a schedule — ETag/304 keeps that cheap.
 */
export default defineEventHandler(async (event) => {
  const siteUrl = useRuntimeConfig(event).public.siteUrl
  const gp = await getCurrentGp()
  const { items } = await getConsultationsForGp(gp)
  const body = buildIcsCalendar(siteUrl, items.map(reconcileActive))

  const etag = bodyEtag(body)
  setHeader(event, 'ETag', etag)
  if (getHeader(event, 'if-none-match') === etag) {
    setResponseStatus(event, 304)
    return ''
  }
  setHeader(event, 'Content-Type', 'text/calendar; charset=utf-8')
  return body
})
