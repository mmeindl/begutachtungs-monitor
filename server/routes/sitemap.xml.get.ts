/**
 * GET /sitemap.xml — static pages plus every detail page of the current GP,
 * from both halves of the Begutachtung: the Ministerialentwürfe and the
 * records that have no Gegenstand at Parliament (docs/architecture.md
 * §12.16). Reuses cached leaves (no extra upstream load); same ETag pattern
 * as /feed.xml. Referenced from public/robots.txt.
 */
import { dedupeDraftList } from '../utils/parliament/draftList'

/** The EU and Bund-zu-Land maps are additions to the sitemap, never its precondition: without them in time, only `/eu-recht`. */
const EU_MAP_BUDGET_MS = 2_500

export default defineEventHandler(async (event) => {
  const siteUrl = useRuntimeConfig(event).public.siteUrl
  const gp = await getCurrentGp()
  const [{ items }, risOnly, euMap, bundLandMap] = await Promise.all([
    getDraftsForGp(gp),
    getRisOnlyForGp(gp),
    withinBudget(getEuMap(gp), EU_MAP_BUDGET_MS),
    withinBudget(getBundLandMap(gp), EU_MAP_BUDGET_MS),
  ])
  // Sorted, so the body — and its ETag — does not move with the map's order.
  const euActPaths = euMap ? Object.values(euMap.acts).map((a) => a.path).sort() : []
  const bundesrechtPaths = bundLandMap ? Object.values(bundLandMap.acts).map((a) => `/bundesrecht/${a.bgbl.year}/${a.bgbl.number}`).sort() : []
  // `active` per request, like everywhere (`risRecord.withRisActiveOn`) —
  // the sitemap does not print it, but no caller may inherit the day the
  // cache was filled on. Folded, so a draft two Ressorts sent is one URL.
  const body = buildSitemap(siteUrl, dedupeDraftList(items), withRisActiveOn(risOnly.items), euActPaths, bundesrechtPaths)

  return respondWithEtag(event, body, 'application/xml; charset=utf-8')
})
