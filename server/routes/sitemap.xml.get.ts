/**
 * GET /sitemap.xml — static pages plus every consultation detail page of
 * the current GP. Reuses the cached list-81 leaf (no extra upstream load);
 * same ETag pattern as /feed.xml. Referenced from public/robots.txt.
 */
export default defineEventHandler(async (event) => {
  const siteUrl = useRuntimeConfig(event).public.siteUrl
  const gp = await getCurrentGp()
  const { items } = await getConsultationsForGp(gp)
  const body = buildSitemap(siteUrl, items)

  const etag = bodyEtag(body)
  setHeader(event, 'ETag', etag)
  if (getHeader(event, 'if-none-match') === etag) {
    setResponseStatus(event, 304)
    return ''
  }
  setHeader(event, 'Content-Type', 'application/xml; charset=utf-8')
  return body
})
