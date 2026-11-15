/**
 * GET /sitemap.xml — static pages plus every detail page of the current GP,
 * from both halves of the Begutachtung: the Ministerialentwürfe and the
 * records that have no Gegenstand at Parliament — and, since 15.11.2026, the
 * pages of the period's Anliegen an das Parlament, and the pages of every
 * Petition an den Bundesrat (42; they carry no period and do not change).
 * Reuses cached leaves (no extra upstream load); same ETag pattern
 * as /feed.xml. Referenced from public/robots.txt.
 */
import { anliegenPath } from '#shared/utils/anliegen'
import { euActPath, euUmsetzungWindow } from '#shared/utils/eu'
import { todayIso } from '#shared/utils/format'
import { gpWindow } from '#shared/utils/gp'
import { directivesToTranspose } from '../utils/eu/cellarService'
import { landLawPath } from '#shared/utils/laender'
import { itemKindOfLawItem, itemPath } from '#shared/utils/procedureRoot'
import { dedupeDraftList } from '../utils/parliament/draftList'

/** The EU and Bund-zu-Land maps are additions to the sitemap, never its precondition: without them in time, only `/eu-recht`. */
const EU_MAP_BUDGET_MS = 2_500

export default defineEventHandler(async (event) => {
  const siteUrl = useRuntimeConfig(event).public.siteUrl
  const gp = await getCurrentGp()
  const umsetzung = euUmsetzungWindow(todayIso())
  const [{ items }, risOnly, euMap, bundLandMap, bundLaws, landLaws, anliegen, bundesrat, directives] = await Promise.all([
    getDraftsForGp(gp),
    getRisOnlyForGp(gp),
    withinBudget(getEuMap(gp), EU_MAP_BUDGET_MS),
    withinBudget(getBundLandMap(gp), EU_MAP_BUDGET_MS),
    // The laws without a draft, under the same budget and on the same terms:
    // what is not built in time is left out, never waited for.
    withinBudget(getLawsWithoutBegutachtung(gp), EU_MAP_BUDGET_MS),
    withinBudget(readLandLaws(gp, gpWindow(gp)), EU_MAP_BUDGET_MS),
    // The Anliegen from list 101's rows alone — no detail read per item. A
    // kind whose read failed, or a read that came late, leaves its pages out;
    // `/anliegen` itself always stands.
    withinBudget(getAnliegenForGp(gp), EU_MAP_BUDGET_MS),
    // The Petitionen an den Bundesrat, from their one list-101 read, on the same terms.
    withinBudget(getBundesratPetitions().catch(() => null), EU_MAP_BUDGET_MS),
    // The directives the Member State has to transpose, also those no draft
    // names: each has a page since 15.11.2026. Only the list's, not every
    // directive the Cellar knows — a page costs Cellar queries.
    withinBudget(directivesToTranspose(umsetzung.from, umsetzung.to), EU_MAP_BUDGET_MS),
  ])
  // Sorted, so the body — and its ETag — does not move with the map's order.
  const euActPaths = [...new Set([
    ...(euMap ? Object.values(euMap.acts).map((a) => a.path) : []),
    ...(directives ?? []).flatMap((d) => euActPath(d.celex) ?? []),
  ])].sort()
  const bundesrechtPaths = bundLandMap ? Object.values(bundLandMap.acts).map((a) => `/bundesrecht/${a.bgbl.year}/${a.bgbl.number}`).sort() : []
  // `active` per request, like everywhere (`risRecord.withRisActiveOn`) —
  // the sitemap does not print it, but no caller may inherit the day the
  // cache was filled on. Folded, so a draft two Ressorts sent is one URL.
  const lawPaths = [
    ...(bundLaws?.available ? bundLaws.items.map((l) => itemPath(l.item.gp, itemKindOfLawItem(l.item.kind), l.item.inr)) : []),
    ...(landLaws?.items ?? []).map((l) => landLawPath(l.land, l)),
  ].sort()
  const anliegenPaths = [...(anliegen?.entries ?? []), ...(bundesrat ?? [])].map((e) => anliegenPath(e.root)).sort()
  const body = buildSitemap(siteUrl, dedupeDraftList(items), withRisActiveOn(risOnly.items), euActPaths, bundesrechtPaths, lawPaths, anliegenPaths)

  return respondWithEtag(event, body, 'application/xml; charset=utf-8')
})
