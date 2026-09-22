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
  // The Begutachtungen without a parliamentary Gegenstand ride along: a
  // subscriber asked what is in Begutachtung, and Parliament's half alone
  // was the wrong answer to that (docs/architecture.md §12.16). They obey
  // the ?ressort= scope like every other item — the RIS ministry code is
  // the same vocabulary.
  const [{ items }, risOnly] = await Promise.all([getDraftsForGp(gp), getRisOnlyForGp(gp)])
  const all = items.map(reconcileActive)
  const scoped = code ? all.filter((item) => item.ministryCode === code) : all
  // `active` per request (`risRecord.withRisActiveOn`), the same rule
  // `reconcileActive` applies to the Parliament half one line above: the
  // feed prints it as the filing note.
  const risItems = withRisActiveOn(risOnly.items)
  const risScoped = code ? risItems.filter((item) => item.ministryCode === code) : risItems
  const body = buildRssFeed(
    siteUrl,
    scoped,
    code ? { code, name: scoped[0]?.ministryName ?? risScoped[0]?.ministryName ?? null } : undefined,
    risScoped,
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
