/**
 * GET /api/drafts?gp&status&station&ministry&q → DraftsResponse.
 * Without `gp` the answer carries the Fristen that outlive a Periodenwechsel
 * (§12.36); with one it is strictly that period.
 * status: open|closed|all (default all); station: a comma list of
 * begutachtung|rv|parlament|bgbl (default all); q searches title, citation,
 * ministry CODE and aliases server-side — never the ministry name
 * (docs/architecture.md §5, §12.26, §12.31).
 */
import type { DraftsResponse } from '#shared/types'
import { chainCoverageOf, mayClaimOutcome } from '#shared/utils/draftStations'
import { gpHasEnded } from '#shared/utils/gp'
import { ministryFilterOptions, readListQuery } from '../../utils/http/params'
import { dedupeDraftList, filterDraftList, sortDraftList } from '../../utils/parliament/draftList'
import { getCarryOverDrafts } from '../../utils/parliament/carryOver'

/** How long the list waits for the station map before answering without it.
 *  2,5 s: warm the map costs 8 ms, cold 35 s — there is nothing in between
 *  that a value in between would save, so this is an emergency brake and not
 *  a test of patience. */
const STATION_MAP_BUDGET_MS = 2_500

export default defineEventHandler(async (event): Promise<DraftsResponse> => {
  const query = readListQuery(event)

  const currentGp = await getCurrentGp()
  const gp = query.gp ?? currentGp
  /* Folded before anything counts or filters: a draft two ressorts sent
   * jointly stands in list 81 twice, and the list showed it twice and
   * reported 353 of 350 entries for GP XXVII (`dedupeDraftList`). Every
   * list answer this endpoint gives — the rows, `total`, the Ressort
   * options — comes through here, so the fold belongs at this one point. */
  /* CARRY-OVER, und nur wenn der Aufruf KEINE Periode genannt hat
   * (§12.36). `?gp=XXVII` ist eine Frage nach einer Periode und wird
   * periodenrein beantwortet — sonst hieße der sichtbare Periodenwähler auf
   * `/entwuerfe` etwas anderes, als er sagt. Ohne `gp` fragt jemand „was
   * gibt es gerade", und dann ist eine Frist, die den Wechsel überlebt, Teil
   * der Antwort: genau daran hing der eine Weg aus „Jetzt in Begutachtung"
   * heraus, der im Übergangsfenster ins Leere lief. */
  const carried = query.gp === undefined ? await getCarryOverDrafts(currentGp) : []
  const rows = dedupeDraftList([
    ...(await getDraftsForGp(gp)).items.map(reconcileActive),
    ...carried,
  ])

  /* The station map is ENRICHMENT, never a precondition: a cold build costs
   * hundreds of upstream fetches (`parliament/stationMap.ts`), and a list
   * that fails on it would be worse than one without stations. If it fails,
   * the response says so — `stationsAvailable: false` — instead of silently
   * marking every row „Begutachtung" or running an active station filter
   * against an empty list.
   *
   * AND IT GETS A BUDGET, for the same reason: cold, GP XXVII needs 35,6 s
   * (650 fetches, measured 18.09.2026), and nobody may wait that long for a
   * list that is complete without stations. When the budget runs out the
   * page answers without the map — the build carries on in the background
   * and fills the cache, the next request has it
   * (docs/architecture.md §12.26). Same construction as `RIS_JOIN_BUDGET_MS`
   * in `parliament/draftDetail.ts`. */
  const chains = await withinBudget(getStationMapForGp(gp), STATION_MAP_BUDGET_MS)
  /* A READABLE MAP IS NOT THE SAME AS A PERIOD ONE MAY SPEAK ABOUT
   * (docs/architecture.md §12.27). In the old periods every draft's
   * Verfahrensdatensatz ends at the Begutachtung — not because nothing came
   * of it, but because the link to the Regierungsvorlage is missing from the
   * archive: for GP XVI list 101 records 270 Regierungsvorlagen and not one
   * of them is linked. A station on every row would say „alle 297 Entwürfe
   * blieben liegen" there — the claim this product must never invent. So in
   * such a period no row carries a station, and the response says why
   * instead of passing the gap off as a finding. */
  const coverage = chainCoverageOf(
    chains ? Object.values(chains) : null,
    gpHasEnded(gp, currentGp),
  )
  const speakable = chains && mayClaimOutcome(coverage)
  /* DIE KARTE GILT NUR FÜR IHRE PERIODE. `chains` ist nach `inr` allein
   * verschlüsselt, und Geschäftszahlen fangen in jeder Periode wieder bei 1
   * an — eine mitgelesene Zeile bekäme sonst die Station eines fremden
   * Entwurfs mit derselben Nummer aufgesetzt, also eine erfundene Aussage
   * über ihren Weg. Ohne Chain fällt sie auf `begutachtung` zurück
   * (`filterDraftList`), und das ist für eine laufende Frist die richtige
   * und schwächste Behauptung; eine zweite Stationskarte zu bauen wäre für
   * die paar Zeilen ein kalter 35-Sekunden-Lauf (§12.26). */
  const items = speakable
    ? rows.map((item) => (item.gp === gp ? { ...item, chain: chains[item.inr] } : item))
    : rows

  const ministries = ministryFilterOptions(items)

  const filtered = filterDraftList(items, { ...query, stationsUsable: Boolean(speakable) })

  const availableGps = listAvailableGps(currentGp)
  if (!availableGps.includes(gp)) availableGps.push(gp)

  const sorted = sortDraftList(filtered)

  return {
    items: sorted,
    total: sorted.length,
    gp,
    /* Gemeldet wird erst, was nach dem Filtern wirklich dasteht — ein
     * `status=closed` siebt die mitgelesenen Zeilen ohnehin alle aus. */
    carriedOverFrom: sorted.find((item) => item.gp !== gp)?.gp ?? null,
    availableGps,
    ministries,
    stationsAvailable: Boolean(speakable),
    chainCoverage: coverage,
  }
})
