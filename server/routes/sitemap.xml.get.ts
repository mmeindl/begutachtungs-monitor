/**
 * GET /sitemap.xml — static pages plus every detail page of the current GP,
 * from both halves of the Begutachtung: the Ministerialentwürfe and the
 * records that have no Gegenstand at Parliament (docs/architecture.md
 * §12.16). Reuses cached leaves (no extra upstream load); same ETag pattern
 * as /feed.xml. Referenced from public/robots.txt.
 */
export default defineEventHandler(async (event) => {
  const siteUrl = useRuntimeConfig(event).public.siteUrl
  const gp = await getCurrentGp()
  const [{ items }, risOnly] = await Promise.all([getDraftsForGp(gp), getRisOnlyForGp(gp)])
  // `active` per request, like everywhere (`risRecord.withRisActiveOn`) —
  // the sitemap does not print it, but no caller may inherit the day the
  // cache was filled on.
  const body = buildSitemap(siteUrl, items, withRisActiveOn(risOnly.items))

  const etag = bodyEtag(body)
  setHeader(event, 'ETag', etag)
  if (getHeader(event, 'if-none-match') === etag) {
    setResponseStatus(event, 304)
    return ''
  }
  setHeader(event, 'Content-Type', 'application/xml; charset=utf-8')
  return body
})
