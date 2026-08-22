/**
 * GET /feed.xml — RSS 2.0 feed of the current GP's consultations,
 * newest arrival first. Reuses the cached list-81 leaf (no extra
 * upstream load); the route itself is uncached (architecture.md §5).
 * Feed readers poll frequently — the deterministic body makes a strong
 * ETag effective, so conditional GETs answer 304 without the payload.
 */
export default defineEventHandler(async (event) => {
  const siteUrl = useRuntimeConfig(event).public.siteUrl
  const gp = await getCurrentGp()
  const { items } = await getConsultationsForGp(gp)
  const body = buildRssFeed(siteUrl, items.map(reconcileActive))

  const etag = bodyEtag(body)
  setHeader(event, 'ETag', etag)
  if (getHeader(event, 'if-none-match') === etag) {
    setResponseStatus(event, 304)
    return ''
  }
  setHeader(event, 'Content-Type', 'application/rss+xml; charset=utf-8')
  return body
})
