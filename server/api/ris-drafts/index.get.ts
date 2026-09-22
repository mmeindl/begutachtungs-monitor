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
  DraftStation,
  DraftStatus,
  RisConsultationKind,
  RisConsultationsResponse,
} from '#shared/types'
import { GP_RE } from '#shared/utils/gp'
import { matchesQuery } from '#shared/utils/searchQuery'

/** Was die Liste auf den Ausgang wartet, solange er nur eine Spalte füllt. */
const OUTCOMES_BUDGET_MS = 3_000

const STATUS_VALUES: DraftStatus[] = ['open', 'closed', 'all']
const KIND_VALUES: RisConsultationKind[] = ['verordnung', 'gesetz', 'unbestimmt']
const STATION_VALUES: DraftStation[] = ['begutachtung', 'rv', 'parlament', 'bgbl']

export default defineEventHandler(async (event): Promise<RisConsultationsResponse> => {
  const query = getQuery(event)

  const stations = (firstQueryValue(query.station) ?? '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter((v): v is DraftStation => (STATION_VALUES as readonly string[]).includes(v))

  const gpParam = firstQueryValue(query.gp)?.toUpperCase()
  if (gpParam !== undefined && !GP_RE.test(gpParam)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Ungültige Gesetzgebungsperiode (römische Ziffern erwartet)',
    })
  }

  const statusParam = firstQueryValue(query.status) ?? 'all'
  if (!(STATUS_VALUES as readonly string[]).includes(statusParam)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Ungültiger Status (open, closed oder all erwartet)',
    })
  }
  const status = statusParam as DraftStatus

  const artParam = firstQueryValue(query.art)
  if (artParam !== undefined && !(KIND_VALUES as readonly string[]).includes(artParam)) {
    throw createError({ statusCode: 400, statusMessage: 'Ungültige Art' })
  }
  const art = artParam as RisConsultationKind | undefined

  const ministry = firstQueryValue(query.ministry)?.toUpperCase()
  const q = firstQueryValue(query.q)?.toLowerCase()

  const currentGp = await getCurrentGp()
  const gp = gpParam ?? currentGp
  const { items, withGegenstand, undecided } = await getRisOnlyForGp(gp)

  // Filter vocabulary of the whole GP, independent of the active filters —
  // same rule as /api/drafts, so a narrowed list never narrows its own menu.
  const ministryMap = new Map<string, string>()
  for (const item of items) {
    if (item.ministryCode && !ministryMap.has(item.ministryCode)) {
      ministryMap.set(item.ministryCode, item.ministryName)
    }
  }
  const ministries = [...ministryMap.entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.code.localeCompare(b.code, 'de-AT'))
  /* Dasselbe Vokabular noch einmal, als Streichliste für die Suche: Ein
   * Langtitel nennt auch das zweite Haus („im Einvernehmen mit dem
   * Bundesminister für Finanzen"), deshalb alle Ressorts der Periode und
   * nicht nur das eigene (`searchHaystack.ts`). */
  const ministryTokenList = ministryTokens(ministryMap.values())

  /* Diese Hälfte steht bei der Begutachtung und kommt nie weiter: kein
   * Gegenstand im Parlament, also nie eine Regierungsvorlage (§12.16).
   *
   * Sie war einen Nachmittag lang aus der Stationsachse GANZ draußen, weil
   * der Chip „Begutachtung" sonst 245 Zeilen zeigt, davon 198
   * Verordnungsentwürfe. Das war die falsche Abhilfe gegen eine richtige
   * Beobachtung: die Zahl ist der Korpus, kein Fehler — und der Preis war
   * hoch. „Begutachtung + Stellungnahme möglich" zeigte 4 statt 7 Zeilen,
   * drei laufende Verordnungs-Begutachtungen verschwanden, und der Link der
   * Startseite („Alle 7 offenen Entwürfe") führte auf eine Liste mit 4.
   *
   * Also: unter `begutachtung` gehören sie dazu, weil sie dort stehen. Aus
   * `rv` und `parlament` sind sie draußen, weil sie die nicht erreichen
   * können — das ist keine Auswahl, das ist das Verfahren. Wer nur die eine
   * Sorte will, hat den Art-Filter daneben, und die Zählzeile nennt beide
   * Hälften einzeln.
   *
   * SEIT 19.09.2026 GILT DAS FÜR `bgbl` NICHT MEHR. Der Satz „sie können
   * die späteren Stationen nicht erreichen" stimmte, solange niemand das
   * Bundesgesetzblatt las: Eine Verordnung geht nicht durchs Parlament, wird
   * aber sehr wohl kundgemacht — in Teil II (§12.32). Wer nach der Station
   * „Bundesgesetzblatt" filtert, meint beide Hälften, und die Hälfte, die
   * dort still gefehlt hat, ist die größere. */
  const wantsBegutachtung = !stations.length || stations.includes('begutachtung')
  const wantsBgbl = stations.includes('bgbl')

  /**
   * Der Ausgang je Satz — mit Budget, aber nur, solange er Beiwerk ist.
   *
   * Als Spaltenwert darf er fehlen: Die Zeile sagt dann „Begutachtung
   * abgeschlossen" statt „Kundgemacht", das ist unvollständig und nicht
   * falsch. Als FILTER darf er nicht fehlen — ein leeres Budget ergäbe eine
   * leere Liste, und „keine kundgemachten Verordnungen" wäre eine Antwort,
   * die wir nicht geprüft haben (§12.13). Dort wird gewartet.
   */
  const outcomes = wantsBgbl
    ? await getBgblOutcomesForGp(gp).catch(() => ({}) as Record<string, BgblOutcome>)
    : await Promise.race([
        getBgblOutcomesForGp(gp).catch(() => ({}) as Record<string, BgblOutcome>),
        new Promise<Record<string, BgblOutcome>>((resolve) => setTimeout(() => resolve({}), OUTCOMES_BUDGET_MS)),
      ])

  const filtered = items.filter((item) => {
    if (!wantsBegutachtung && !(wantsBgbl && outcomes[item.id]?.state === 'kundgemacht')) return false
    if (status === 'open' && !item.active) return false
    if (status === 'closed' && item.active) return false
    if (art && item.kind !== art) return false
    if (ministry && item.ministryCode.toUpperCase() !== ministry) return false
    if (q) {
      // No aliases here: the alias file is keyed by gp/inr and these records
      // have neither. The long title is in the haystack instead — on a
      // Verordnung it is where the subject matter actually appears.
      //
      // OHNE DIE RESSORTNENNUNG, seit 21.09.2026 (§12.31). Die Regel dahinter
      // ist **gesucht wird, was die Zeile zeigt**: Der Langtitel einer
      // Verordnung beginnt mit „Verordnung des Bundesministers für <ganzes
      // Portfolio>", der Ressortname enthält dasselbe noch einmal, und
      // beides steht nirgends auf der Seite. „klima" traf so 36 Zeilen, 2
      // davon führten das Wort im Kurztitel.
      //
      // Der KURZTITEL wird deshalb NICHT gestrichen, auch wenn er dieselbe
      // Klausel trägt („Verordnung der Bundesministerin für
      // Landesverteidigung über den Krankentransport") — er steht in der
      // Zeile, der Leser sieht das Wort, also muss er danach suchen können.
      // Das Kürzel bleibt aus demselben Grund; für das Ressort als solches
      // gibt es den eigenen Filter.
      // Mehrere Wörter mit UND, dieselbe Regel wie in `/api/drafts`.
      const haystack = `${item.title} ${stripMinistryMentions(item.longTitle ?? '', ministryTokenList)} ${item.ministryCode}`
      if (!matchesQuery(haystack, q)) return false
    }
    return true
  })

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
