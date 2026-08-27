/**
 * GET /feed.xml — RSS 2.0 feed of the current GP's consultations,
 * newest arrival first. Reuses the cached list-81 leaf (no extra
 * upstream load); the route itself is uncached (architecture.md §5).
 * Feed readers poll frequently — the deterministic body makes a strong
 * ETag effective, so conditional GETs answer 304 without the payload.
 *
 * Optional ?ressort=BMJ scopes the feed to one ministry (entity-scoped
 * following) — same cached list, filtered per request. A well-formed
 * code with no items yields a valid empty feed, not an error: a ministry
 * can simply have nothing in the current GP, and a 404 would make
 * readers surface a broken subscription over a quiet one.
 */
const RESSORT_RE = /^[A-Za-z]{2,20}$/

export default defineEventHandler(async (event) => {
  const siteUrl = useRuntimeConfig(event).public.siteUrl
  const ressortParam = firstQueryValue(getQuery(event).ressort)
  if (ressortParam !== undefined && !RESSORT_RE.test(ressortParam)) {
    throw createError({ statusCode: 404, statusMessage: 'Unbekanntes Ressort' })
  }
  const code = ressortParam?.toUpperCase()

  const gp = await getCurrentGp()
  const { items } = await getConsultationsForGp(gp)
  const all = items.map(reconcileActive)
  const scoped = code ? all.filter((item) => item.ministryCode === code) : all
  const body = buildRssFeed(
    siteUrl,
    scoped,
    code ? { code, name: scoped[0]?.ministryName ?? null } : undefined,
  )

  const etag = bodyEtag(body)
  setHeader(event, 'ETag', etag)
  if (getHeader(event, 'if-none-match') === etag) {
    setResponseStatus(event, 304)
    return ''
  }
  setHeader(event, 'Content-Type', 'application/rss+xml; charset=utf-8')
  return body
})
