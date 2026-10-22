/**
 * GET /sitemap.xml — static pages plus every detail page of the current GP,
 * from both halves of the Begutachtung: the Ministerialentwürfe and the
 * records that have no Gegenstand at Parliament (docs/architecture.md
 * §12.16). Reuses cached leaves (no extra upstream load); same ETag pattern
 * as /feed.xml. Referenced from public/robots.txt.
 */
import { dedupeDraftList } from '../utils/parliament/draftList'

export default defineEventHandler(async (event) => {
  const siteUrl = useRuntimeConfig(event).public.siteUrl
  const gp = await getCurrentGp()
  const [{ items }, risOnly] = await Promise.all([getDraftsForGp(gp), getRisOnlyForGp(gp)])
  // `active` per request, like everywhere (`risRecord.withRisActiveOn`) —
  // the sitemap does not print it, but no caller may inherit the day the
  // cache was filled on. Folded, so a draft two Ressorts sent is one URL.
  const body = buildSitemap(siteUrl, dedupeDraftList(items), withRisActiveOn(risOnly.items))

  return respondWithEtag(event, body, 'application/xml; charset=utf-8')
})
