/**
 * GET /api/drafts?gp&status&station&ministry&q → DraftsResponse.
 * status: open|closed|all (default all); station: a comma list of
 * begutachtung|rv|parlament|bgbl (default all); q searches title, citation,
 * ministry CODE and aliases server-side — never the ministry name
 * (docs/architecture.md §5, §12.26, §12.31).
 */
import type { DraftsResponse } from '#shared/types'
import { chainCoverageOf, mayClaimOutcome } from '#shared/utils/draftStations'
import { gpHasEnded } from '#shared/utils/gp'
import { ministryFilterOptions, readListQuery } from '../../utils/http/params'
import { filterDraftList, sortDraftList } from '../../utils/parliament/draftList'

/** Wie lange die Liste auf die Stationskarte wartet, bevor sie ohne sie
 *  antwortet. 2,5 s: warm kostet die Karte 8 ms, kalt 35 s — dazwischen
 *  liegt nichts, was ein Wert dazwischen retten würde, also ist das hier
 *  eine Notbremse und keine Geduldsprobe. */
const STATION_MAP_BUDGET_MS = 2_500

export default defineEventHandler(async (event): Promise<DraftsResponse> => {
  const query = readListQuery(event)

  const currentGp = await getCurrentGp()
  const gp = query.gp ?? currentGp
  const rows = (await getDraftsForGp(gp)).items.map(reconcileActive)

  /* Die Stationskarte ist ANREICHERUNG, nie eine Vorbedingung: sie kostet
   * beim kalten Bau hunderte Upstream-Abrufe (`parliament/stationMap.ts`), und eine
   * Liste, die daran scheitert, wäre schlechter als eine ohne Stationen.
   * Fällt sie aus, sagt die Antwort das — `stationsAvailable: false` —, statt
   * jede Zeile stumm als „Begutachtung" auszuweisen oder einen aktiven
   * Stationsfilter auf eine leere Liste laufen zu lassen.
   *
   * UND SIE BEKOMMT EIN BUDGET, aus demselben Grund. Kalt braucht die GP
   * XXVII 35,6 s (650 Abrufe, gemessen 18.09.2026); so lange darf niemand
   * auf eine Liste warten, die ohne Stationen vollständig ist. Läuft das
   * Budget ab, antwortet die Seite ohne sie — der Bau läuft im Hintergrund
   * weiter und füllt den Cache, die nächste Anfrage hat ihn. Dieselbe Bauart
   * wie `RIS_JOIN_BUDGET_MS` in `parliament.ts`. */
  const chains = await withinBudget(getStationMapForGp(gp), STATION_MAP_BUDGET_MS)
  /* EINE GELESENE KARTE IST NICHT DASSELBE WIE EINE AUSSAGEFÄHIGE PERIODE
   * (§12.27). In den alten Perioden endet der Verfahrensdatensatz JEDES
   * Entwurfs bei der Begutachtung — nicht weil nichts daraus wurde, sondern
   * weil die Verknüpfung zur Regierungsvorlage im Archiv fehlt: zu GP XVI
   * verzeichnet Liste 101 270 Regierungsvorlagen, verknüpft ist keine
   * einzige. Eine Station auf jeder Zeile hieße dort „alle 297 Entwürfe
   * blieben liegen" — die Behauptung, die dieses Produkt nie erfinden darf.
   * Also trägt in einer solchen Periode keine Zeile eine Station, und die
   * Antwort sagt warum, statt die Lücke als Befund auszugeben. */
  const coverage = chainCoverageOf(
    chains ? Object.values(chains) : null,
    gpHasEnded(gp, currentGp),
  )
  const speakable = chains && mayClaimOutcome(coverage)
  const items = speakable ? rows.map((item) => ({ ...item, chain: chains[item.inr] })) : rows

  const ministries = ministryFilterOptions(items)

  const filtered = filterDraftList(items, { ...query, stationsUsable: Boolean(speakable) })

  const availableGps = listAvailableGps(currentGp)
  if (!availableGps.includes(gp)) availableGps.push(gp)

  const sorted = sortDraftList(filtered)

  return {
    items: sorted,
    total: sorted.length,
    gp,
    availableGps,
    ministries,
    stationsAvailable: Boolean(speakable),
    chainCoverage: coverage,
  }
})
