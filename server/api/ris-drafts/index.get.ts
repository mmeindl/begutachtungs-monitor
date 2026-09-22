/**
 * GET /api/ris-drafts?gp&status&ministry&art&q → RisConsultationsResponse.
 *
 * The Begutachtungen RIS publishes that Parliament has no Gegenstand for —
 * mostly Verordnungsentwürfe (docs/architecture.md §12.16). Same query
 * vocabulary as `/api/drafts`, so the two lists are filtered the same way;
 * `art` is the one addition, because here the kind of instrument varies.
 *
 * Named for its SOURCE, like `/api/ris-map`, since the pages stopped being
 * named for it on 18.09.2026 (§12.19): one link namespace for readers,
 * because a URL is something we hand out — two endpoints underneath,
 * because the data really is two halves and that is not a layout choice.
 * Never `/api/weitere-…`: „weiter als was" was the word's whole problem.
 */
import type {
  BgblOutcome,
  RisConsultationKind,
  RisConsultationsResponse,
} from '#shared/types'
import { sortConsultations } from '#shared/utils/risConsultations'
import { ministryFilterOptions, readListQuery } from '../../utils/http/params'
import { filterRisConsultations, risStationWants } from '../../utils/ris/risList'

/** How long the list waits for the outcome while it only fills a column. */
const OUTCOMES_BUDGET_MS = 3_000

const KIND_VALUES: RisConsultationKind[] = ['verordnung', 'gesetz', 'unbestimmt']

export default defineEventHandler(async (event): Promise<RisConsultationsResponse> => {
  const query = readListQuery(event)

  const artParam = firstQueryValue(getQuery(event).art)
  if (artParam !== undefined && !(KIND_VALUES as readonly string[]).includes(artParam)) {
    throw createError({ statusCode: 400, statusMessage: 'Ungültige Art' })
  }
  const art = artParam as RisConsultationKind | undefined

  const currentGp = await getCurrentGp()
  const gp = query.gp ?? currentGp
  const cached = await getRisOnlyForGp(gp)
  const { withGegenstand, undecided } = cached
  /* `active` and the order that follows from it are decided HERE, per
   * request: the cached set is day-independent on purpose, so that the
   * status filter never answers with the calendar day of whoever filled the
   * cache (`ris/risOnly.ts`, `risRecord.withRisActiveOn`). Same rule and same
   * place as `reconcileActive` for list 81. */
  const items = withRisActiveOn(cached.items).sort(sortConsultations)

  const ministries = ministryFilterOptions(items)
  /* The same vocabulary once more, as a strike list for the search: a
   * Langtitel also names the second house („im Einvernehmen mit dem
   * Bundesminister für Finanzen"), hence every Ressort of the period and not
   * only its own (`search/searchHaystack.ts`). */
  const ministryTokenList = ministryTokens(ministries.map((m) => m.name))
  const wants = risStationWants(query.stations)

  /**
   * The outcome per record — with a budget, but only while it is a garnish.
   *
   * As a column value it may be missing: the row then says „Begutachtung
   * abgeschlossen" instead of „Kundgemacht", which is incomplete and not
   * wrong. As a FILTER it may not be missing — an exhausted budget would
   * produce an empty list, and „keine kundgemachten Verordnungen" would be
   * an answer we never checked (§12.13). There it waits.
   */
  const outcomes: Record<string, BgblOutcome> = wants.bgbl
    ? await getBgblOutcomesForGp(gp).catch(() => ({}) as Record<string, BgblOutcome>)
    : (await withinBudget(getBgblOutcomesForGp(gp), OUTCOMES_BUDGET_MS)) ?? {}

  const filtered = filterRisConsultations(items, { ...query, art, wants, ministryTokens: ministryTokenList, outcomes })

  const availableGps = listAvailableGps(currentGp)
  if (!availableGps.includes(gp)) availableGps.push(gp)

  return {
    items: filtered.map((item) => ({ ...item, outcome: outcomes[item.id] ?? null })),
    total: filtered.length,
    gpTotal: items.length,
    gp,
    availableGps,
    ministries,
    withGegenstand,
    undecided,
  }
})
