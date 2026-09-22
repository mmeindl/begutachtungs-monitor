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

/** Was die Liste auf den Ausgang wartet, solange er nur eine Spalte füllt. */
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
  /* Dasselbe Vokabular noch einmal, als Streichliste für die Suche: Ein
   * Langtitel nennt auch das zweite Haus („im Einvernehmen mit dem
   * Bundesminister für Finanzen"), deshalb alle Ressorts der Periode und
   * nicht nur das eigene (`search/searchHaystack.ts`). */
  const ministryTokenList = ministryTokens(ministries.map((m) => m.name))
  const wants = risStationWants(query.stations)

  /**
   * Der Ausgang je Satz — mit Budget, aber nur, solange er Beiwerk ist.
   *
   * Als Spaltenwert darf er fehlen: Die Zeile sagt dann „Begutachtung
   * abgeschlossen" statt „Kundgemacht", das ist unvollständig und nicht
   * falsch. Als FILTER darf er nicht fehlen — ein leeres Budget ergäbe eine
   * leere Liste, und „keine kundgemachten Verordnungen" wäre eine Antwort,
   * die wir nicht geprüft haben (§12.13). Dort wird gewartet.
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
