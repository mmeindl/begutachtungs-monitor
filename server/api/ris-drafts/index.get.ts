/**
 * GET /api/ris-drafts?gp&status&ministry&art&q&eu → RisConsultationsResponse.
 *
 * The Begutachtungen RIS publishes that Parliament has no Gegenstand for —
 * mostly Verordnungsentwürfe. Same query
 * vocabulary as `/api/drafts`, so the two lists are filtered the same way;
 * `art` is the one addition, because here the kind of instrument varies.
 *
 * Named for its SOURCE, like `/api/ris-map`, since the pages stopped being
 * named for it on 18.09.2026: one link namespace for readers,
 * because a URL is something we hand out — two endpoints underneath,
 * because the data really is two halves and that is not a layout choice.
 * Never `/api/weitere-…`: „weiter als was" was the word's whole problem.
 */
import type {
  BgblOutcome,
  RisConsultation,
  RisConsultationKind,
  RisConsultationsResponse,
} from '#shared/types'
import { sortConsultations } from '#shared/utils/risConsultations'
import { firstQueryValue } from '#shared/utils/queryParams'
import { ministryFilterOptions, readListQuery, requirePlausibleGp } from '../../utils/http/params'
import { withinBudget } from '../../utils/http/budget'
import { getCurrentGp, listAvailableGps } from '../../utils/parliament/drafts'
import { filterRisConsultations, risStationWants } from '../../utils/ris/risList'
import { getBgblOutcomesForGp } from '../../utils/ris/bgblService'
import { getCarryOverRisConsultations, getRisOnlyForGp } from '../../utils/ris/risOnly'
import { withRisActiveOn } from '../../utils/ris/risRecord'
import { ministryTokens } from '#shared/utils/searchHaystack'
import { previousGp } from '#shared/utils/gp'
import { risKey } from '../../utils/eu/euMapStore'
import { euMarkersForList } from '../../utils/eu/euMapService'

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
  // Before the cached functions below: their key is the period.
  const gp = requirePlausibleGp(query.gp ?? currentGp, currentGp)
  const wants = risStationWants(query.stations)

  /* FOUR READS, started together and awaited together, so their times
   * overlap instead of adding up: the carry-over and the EU map (2,5 s
   * brake) no longer queue behind the RIS window and each other. The
   * outcomes are the one real dependency — they join the window, through
   * the same cached call — so their budget still starts once the window is
   * in, as it did when the reads ran in a row; started with the request, a
   * cold window would eat the 3 s and empty a column that today fills.
   * The failure behaviour is unchanged: the window throws, the outcomes
   * throw only as a filter (below), the carry-over and the EU map never do;
   * and when the window fails, the outcomes fail with the same error. */
  const windowRead = getRisOnlyForGp(gp)
  const [cached, carried, markers, outcomes] = await Promise.all([
    windowRead,
    /* CARRY-OVER, und nur wenn der Aufruf KEINE Periode genannt hat.
     * `?gp=XXVII` ist eine Frage nach einer Periode und wird
     * periodenrein beantwortet; ohne `gp` fragt jemand „was läuft gerade", und
     * eine Frist, die den Wechsel überlebt, läuft gerade. Im Normalbetrieb
     * leer — die Vorperiode hat dann keine offenen Records mehr. */
    query.gp === undefined ? getCarryOverRisConsultations(currentGp) : Promise.resolve<RisConsultation[]>([]),
    /* The EU map, as on `/api/drafts`: every record of
     * the period's window carries `eu` where the map is at hand, the carried
     * ones of the period before none. */
    euMarkersForList(gp),
    /**
     * The outcome per record — with a budget, but only while it is a garnish.
     *
     * As a column value it may be missing: the row then says „Begutachtung
     * abgeschlossen" instead of „Kundgemacht", which is incomplete and not
     * wrong. As a FILTER it may not be missing — an exhausted budget would
     * produce an empty list, and „keine kundgemachten Verordnungen" would be
     * an answer we never checked. There it waits, and a failure
     * throws: the page then says the Verordnungsentwürfe are „gerade nicht
     * abrufbar". Until 22.10.2026 a `.catch(() => ({}))` stood here and turned
     * every RIS failure into exactly the empty list this comment rules out —
     * 200, total 0, „0 Verordnungsentwürfe" under „Bundesgesetzblatt".
     */
    wants.bgbl
      ? getBgblOutcomesForGp(gp)
      : windowRead.then(async (): Promise<Record<string, BgblOutcome>> =>
          (await withinBudget(getBgblOutcomesForGp(gp), OUTCOMES_BUDGET_MS)) ?? {},
        ),
  ])
  const { withGegenstand, undecided } = cached
  /* `active` and the order that follows from it are decided HERE, per
   * request: the cached set is day-independent on purpose, so that the
   * status filter never answers with the calendar day of whoever filled the
   * cache (`ris/risOnly.ts`, `risRecord.withRisActiveOn`). Same rule and same
   * place as `reconcileActive` for list 81. */
  const ownItems = withRisActiveOn(cached.items).sort(sortConsultations)

  const ownWithEu = markers
    ? ownItems.map((item) => {
        const eu = markers.get(risKey(item.id))
        return eu === undefined ? item : { ...item, eu }
      })
    : ownItems
  const items = carried.length ? [...ownWithEu, ...carried].sort(sortConsultations) : ownWithEu

  const ministries = ministryFilterOptions(items)
  /* The same vocabulary once more, as a strike list for the search: a
   * Langtitel also names the second house („im Einvernehmen mit dem
   * Bundesminister für Finanzen"), hence every Ressort of the period and not
   * only its own (`shared/utils/searchHaystack.ts`). */
  const ministryTokenList = ministryTokens(ministries.map((m) => m.name))

  const filtered = filterRisConsultations(items, { ...query, art, wants, ministryTokens: ministryTokenList, outcomes, euUsable: markers !== null })

  const availableGps = listAvailableGps(currentGp)
  if (!availableGps.includes(gp)) availableGps.push(gp)

  return {
    items: filtered.map((item) => ({ ...item, outcome: outcomes[item.id] ?? null })),
    total: filtered.length,
    /* Die Periode, nicht die Ansicht: `gpTotal` und `withGegenstand`
     * beschreiben das durchsuchte Fenster, und mitgelesene Zeilen der
     * Vorperiode gehören nicht hinein. */
    gpTotal: ownItems.length,
    gp,
    euAvailable: markers !== null,
    /* Gemeldet wird erst, was nach dem Filtern wirklich dasteht: ein
     * `status=closed` siebt die mitgelesenen Zeilen ohnehin alle aus, und
     * ein Hinweis über Zeilen, die niemand sieht, wäre falsch. */
    carriedOverFrom: filtered.some((item) => carried.includes(item))
      ? (previousGp(currentGp) ?? null)
      : null,
    /* Which of them, for a caller that narrows the rows further itself —
     * `/entwuerfe` filters its search in the browser since 12.11.2026. */
    carriedOverIds: filtered.filter((item) => carried.includes(item)).map((item) => item.id),
    availableGps,
    ministries,
    withGegenstand,
    undecided,
  }
})
