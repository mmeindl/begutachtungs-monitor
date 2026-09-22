/**
 * GET /api/drafts?gp&status&station&ministry&q → DraftsResponse.
 * status: open|closed|all (default all); station: a comma list of
 * begutachtung|rv|parlament|bgbl (default all); q searches title, citation,
 * ministry CODE and aliases server-side — never the ministry name
 * (docs/architecture.md §5, §12.26, §12.31).
 */
import type { DraftChain, DraftStation, DraftsResponse } from '#shared/types'
import { aliasHaystack } from '#shared/utils/draftAliases'
import { matchesQuery } from '#shared/utils/textMatch'
import { chainCoverageOf, mayClaimOutcome } from '#shared/utils/draftStations'
import { gpHasEnded } from '#shared/utils/gp'
import { ministryFilterOptions, readListQuery } from '../../utils/http/params'

/** Wie lange die Liste auf die Stationskarte wartet, bevor sie ohne sie
 *  antwortet. 2,5 s: warm kostet die Karte 8 ms, kalt 35 s — dazwischen
 *  liegt nichts, was ein Wert dazwischen retten würde, also ist das hier
 *  eine Notbremse und keine Geduldsprobe. */
const STATION_MAP_BUDGET_MS = 2_500

/**
 * „Offen" heißt jetzt: hier kann jemand etwas sagen.
 *
 * Bis zum 18.09.2026 war das allein die laufende Begutachtungsfrist. Zu
 * einer Regierungsvorlage kann im Nationalrat aber genauso Stellung genommen
 * werden (`statementsstate`), und das ist dieselbe Frage des Lesers — nur
 * eine Station weiter. Beides unter einem Schalter ist der einzige Ort, an
 * dem die zwei Fenster nicht zwei Seiten brauchen; die Station daneben sagt,
 * welches der beiden es ist.
 */
function canParticipate(item: { active: boolean; chain?: DraftChain }): boolean {
  return item.active || item.chain?.filingOpen === true
}

export default defineEventHandler(async (event): Promise<DraftsResponse> => {
  const { gp: gpParam, status, stations, ministry, q } = readListQuery(event)
  const stationFilter = stations.length ? new Set<DraftStation>(stations) : null

  const currentGp = await getCurrentGp()
  const gp = gpParam ?? currentGp
  const rows = (await getDraftsForGp(gp)).items.map(reconcileActive)

  /* Die Stationskarte ist ANREICHERUNG, nie eine Vorbedingung: sie kostet
   * beim kalten Bau hunderte Upstream-Abrufe (`stationMap.ts`), und eine
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

  const filtered = items.filter((item) => {
    if (status === 'open' && !canParticipate(item)) return false
    if (status === 'closed' && canParticipate(item)) return false
    // Ohne Karte kein Stationsfilter — die Antwort sagt es, statt hier
    // stillschweigend alles wegzufiltern, was wir nicht nachsehen konnten.
    if (stationFilter && speakable && !stationFilter.has(item.chain?.station ?? 'begutachtung')) {
      return false
    }
    if (ministry && item.ministryCode.toUpperCase() !== ministry) return false
    if (q) {
      // Aliases are part of the haystack, not of the title: someone who only
      // knows "Bundestrojaner" has to find 8/ME (`shared/utils/draftAliases.ts`).
      //
      // DER RESSORTNAME IST SEIT 21.09.2026 NICHT MEHR DABEI (§12.31), und
      // die Regel dahinter ist: **gesucht wird, was die Zeile zeigt.** Der
      // Name trägt das ganze Portfolio („… Klima- und Umweltschutz …"),
      // steht aber nirgends auf der Seite — er traf unsichtbar und zog
      // unter „klima" 36 Zeilen, von denen 2 das Wort im Titel führten. Das
      // Kürzel bleibt, denn das steht in der Zeile, und für das Ressort
      // gibt es den eigenen Filter. Der Titel bleibt aus demselben Grund
      // unangetastet: Nennt er ein Ressort, sieht der Leser es.
      //
      // MEHRERE WÖRTER WERDEN MIT UND VERKNÜPFT, seit 22.09.2026: „klima
      // gesetz" suchte vorher diese elf Zeichen am Stück und fand nichts,
      // während der Volltextblock unter demselben Feld zwei Entwürfe zeigte
      // (`shared/utils/textMatch.ts`).
      //
      // UND GEFALTET GELESEN, seit demselben Tag: „oekostrom" findet die
      // Ökostromförderung, wie es die Stellungnahmenliste immer schon tat.
      // Gefaltet ODER roh — gefaltet allein hätte Wortinneres gekostet.
      const haystack = `${item.title} ${item.citation} ${item.ministryCode} ${aliasHaystack(item.gp, item.inr)}`
      if (!matchesQuery(haystack, q)) return false
    }
    return true
  })

  const availableGps = listAvailableGps(currentGp)
  if (!availableGps.includes(gp)) availableGps.push(gp)

  // Open first, nearest Frist leading (the acting audience's order: "which
  // deadline ends next?"); closed after, most recently ended first. A dead
  // item must never lead the page while consultations end this week.
  const sorted = [...filtered].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    if (a.active) {
      if (a.deadline && b.deadline) {
        return a.deadline.localeCompare(b.deadline) || b.inr - a.inr
      }
      // Open without Frist has no urgency — after the dated ones.
      if (a.deadline !== b.deadline) return a.deadline ? -1 : 1
      return b.arrivedAt.localeCompare(a.arrivedAt) || b.inr - a.inr
    }
    const aEnd = a.deadline ?? a.arrivedAt
    const bEnd = b.deadline ?? b.arrivedAt
    return bEnd.localeCompare(aEnd) || b.inr - a.inr
  })

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
