<script setup lang="ts">
import type {
  DashboardSecondRound,
  DraftStation,
  DraftStatus,
  DraftsResponse,
  RisConsultationsResponse,
} from '#shared/types'
import { DRAFT_STATION_LABEL, DRAFT_STATION_ORDER } from '#shared/utils/draftStations'
import { compareDrafts, compareRowsByStatements, type DraftListRow, rowOrderKey } from '#shared/utils/draftOrder'
import { viewOfDraft, viewOfRis, viewOfVorlage } from '~/utils/entryView'
import type { ArtFilter, SortKey } from '~/utils/draftFilters'
import { romanToInt } from '#shared/utils/gp'
import { matchesQuery } from '#shared/utils/textMatch'
import { SECOND_ROUND_WINDOW } from '~/utils/spine'

/**
 * Every Begutachtung of a period, in ONE list — Ministerialentwürfe and the
 * Begutachtungen Parliament has no Gegenstand for (docs/architecture.md
 * §12.19).
 *
 * Two pages until 17.09.2026. The objection to merging was to POOLING THE
 * NUMBERS, not to sharing a page, and as an argument about the page it lost:
 * the second list had no way in (the navigation is capped at four items),
 * it forced a name that says nothing („Weitere Entwürfe" — further than
 * what?), and it answered one question in two places.
 *
 * So: one list, one filter, three row shapes — and never a single pooled
 * total. The count line states each kind separately, because a headline
 * "336 Entwürfe" would imply the Stellungnahmen figures cover all of them.
 */
useSeoMeta({
  title: 'Entwürfe',
  description:
    'Alle Begutachtungen: Ministerialentwürfe mit Gegenstand im Parlament und Verordnungsentwürfe, die nur im RIS erscheinen – filterbar nach Art, Status, Gesetzgebungsperiode und Ministerium.',
})

/**
 * Two axes, not one (docs/architecture.md §12.26).
 *
 * **Where it stands** is the station: Begutachtung, Regierungsvorlage,
 * Parlament, Bundesgesetzblatt — the same vocabulary as the detail page's
 * spine. **What I can do** is the status beside it, and it cuts across the
 * stations: „Stellungnahme möglich" means a running Frist OR an open form on
 * the Regierungsvorlage.
 *
 * Rejected: „Zweite Runde" as a chip of its own beside „Regierungsvorlage" —
 * it is not a station but a property of one, and choosing it would bring
 * along every long-decided Vorlage. As the intersection of both axes it is
 * exactly nameable and stays shareable: `?status=open&station=rv`.
 *
 * **„Nicht möglich", not „Abgeschlossen" — 24.09.2026.** The third option is
 * the negation of the second and nothing more: it selects the rows where no
 * window is open, neither a running Frist nor a Vorlage parliament still
 * takes Stellungnahmen on (`canParticipate`). The set has been right since
 * 18.09.2026; the WORD claimed something on top of it that this page cannot
 * know. Measured on the running period on 24.09.2026: of the 119 rows under
 * it, 84 are kundgemacht — and 35 are anything but finished, 34 waiting for
 * a Regierungsvorlage and one lying in the Nationalrat. Where a Verfahren
 * really has ended the row says so itself („Kundgemacht"); what the filter
 * answers is the question above it („Was kann ich tun"), and for this set
 * the answer is „nicht möglich" — today, not forever, because a Vorlage can
 * open the second window months later.
 *
 * Why not the full „Keine Stellungnahme möglich": at a 390 px viewport the
 * segmented group is 338 px against a line of 358, and that label takes it
 * to 432 px, „Nicht mehr möglich" to 366 (measured 24.09.2026, CDP device
 * metrics). „Nicht möglich" is 329 px and reads in the group as the negation
 * it is. The VALUE stays `closed`, so every shared `?status=closed` link
 * keeps working.
 */
const statusOptions: { value: DraftStatus; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'open', label: 'Stellungnahme möglich' },
  { value: 'closed', label: 'Nicht möglich' },
]

const stationOptions: { value: DraftStation; label: string }[] = DRAFT_STATION_ORDER.map((value) => ({
  value,
  label: DRAFT_STATION_LABEL[value],
}))

/**
 * The filter is by WHERE a draft stands in the procedure, not by the type
 * word on its title — that is the distinction the two halves actually differ
 * in, and the only one the data supports without a classifier.
 *
 * `verordnung` therefore selects all 201 records without a Gegenstand, of
 * which 198 are Verordnungen and the rest are drafts that likewise never
 * reached Parliament. The label admits that rather than pretending, and
 * each row carries its own type word. The value is spelled `verordnung`
 * because that is the word a reader would type, and `/weitere-entwuerfe`
 * redirects onto it.
 *
 * ONE noun, used by the option and by the count line under the filters
 * (`countLabel`). They named the same set two ways until 18.09.2026 —
 * „Verordnungsentwürfe u. a." here, „ohne Gegenstand im Parlament" there —
 * and a reader comparing the two had no way to know it was one set. Written
 * out rather than „u. a.", which a screen reader reads as „u a".
 */
const ART_VERORDNUNG_NOUN = 'Verordnungsentwürfe und andere'

const artOptions: { value: ArtFilter; label: string }[] = [
  { value: '', label: 'Alle Arten' },
  { value: 'ministerialentwurf', label: 'Ministerialentwürfe' },
  { value: 'verordnung', label: ART_VERORDNUNG_NOUN },
]

/**
 * Two orders, because the homepage has two questions (§12.24).
 *
 * „Frist" is the list's own order and the default everywhere: open first,
 * nearest deadline on top (`compareDrafts`). „Meiste Stellungnahmen" exists
 * because the homepage's ranking („Wo am meisten mitgeredet wurde") had
 * nowhere to send anyone — its five rows are a window onto an order this
 * page could not produce, so the link would have pointed at the pool
 * instead of at the list. It is the same comparator the ranking uses
 * (`rankByStatements`), so the first five rows here ARE those five rows.
 *
 * The slot for „zuletzt dazugekommen" (TODO, §12.22) is this select.
 */
const sortOptions: { value: SortKey; label: string }[] = [
  { value: 'frist', label: 'Nach Frist' },
  { value: 'stellungnahmen', label: 'Meiste Stellungnahmen' },
]

/* Filter state, URL binding and the query for both endpoints:
 * `useDraftFilters`, with the pure half in `app/utils/draftFilters.ts`. */
const filters = useDraftFilters()
const { statusFilter, art, gp, ministry, q, qDebounced, sort, stations, toggleStation, query } = filters

/**
 * The filter bar folds away on the phone — and only there.
 *
 * Measured 18.09.2026: at 390 px the bar was **432 px tall**, the list's
 * first row began at y = 880, so the first viewport of a 390 × 844 device
 * showed **not one row**. At 896 px it is 156 px and six rows. The rebuild
 * is therefore one for the phone.
 *
 * What stays visible is the question people arrive with („was kann ich tun")
 * and the search. The station chips move behind the switch with the three
 * selects: they cost 96 of the 432 px and are reached for least often. That
 * price is real — the stations are the vocabulary the list and the spine
 * share (§12.26), and a first-time reader no longer picks it up in passing.
 *
 * Two safeguards: opened as soon as one of these filters stands in the URL —
 * a shared link must never hide an active filter — and the count on the
 * switch appears only in the closed state, because it would otherwise stand
 * above the controls it counts.
 *
 * Rejected: a `<details>`, against the house pattern (four occurrences, not
 * one scripted toggle), because a closed `<details>` cannot be opened by CSS
 * from a breakpoint up. Checked 18.09.2026 in Chrome 152 —
 * `details:not([open]) > .body { display:block }` under
 * `@media (min-width:768px)` does NOT reveal the content (a
 * `getBoundingClientRect` measurement misleadingly reports a height; the
 * screenshot shows nothing). Without that the same bar would have to stand
 * twice in the markup, with colliding `for`/`id` pairs. A checkbox plus
 * `peer` stays CSS-only, SSR-safe and usable without JS.
 */
const moreFilters = computed(
  () => Number(stations.value.length > 0) + Number(art.value !== '') + Number(gp.value !== '') + Number(ministry.value !== ''),
)
const filtersOpen = ref(moreFilters.value > 0)

/**
 * WHICH HALVES THIS `art` ASKS FOR — the filter decides the REQUEST, not just
 * the rows, since 23.09.2026 (docs/architecture.md §7).
 *
 * `art` is the one control here that does not narrow a list: it names one of
 * the two halves this page merges. `/api/drafts` holds Ministerialentwürfe
 * and nothing else, so under „Verordnungsentwürfe" there is nothing for it to
 * answer; the RIS half is the whole other half. Both were fetched whatever
 * the filter said until then and one of them was dropped in the browser: the
 * server-rendered payload of a filtered list carried both halves in full,
 * 218 KB, against the 152 KB („Verordnungsentwürfe") resp. 67 KB
 * („Ministerialentwürfe") it carries now (measured 23.09.2026).
 *
 * NOT a query parameter of either endpoint. `/api/ris-drafts?art=` exists but
 * means something else — the instrument kind, `verordnung|gesetz|unbestimmt`
 * — and handing this filter's `verordnung` to it would drop the three records
 * of the half that are no Verordnungen (198 of 201, measured 23.09.2026).
 * Those are the „und andere" of the label and they belong on the page.
 */
const wantsMe = computed(() => art.value !== 'verordnung')
const wantsRis = computed(() => art.value !== 'ministerialentwurf')

/* The three fetches are started here and awaited below, so they overlap
 * instead of queueing. Awaited one after the other, the RIS corpus's runtime
 * was added to that of the Ministerialentwürfe although neither needs
 * anything from the other — the homepage's pattern, for the same reason. */
/* `enabled` keeps the request from being made at all, on the server too, so
 * a filtered list ships only the half it renders. Watched is the half's own
 * wanted-ness and not `art`: switching between the halves then fetches the
 * one that is newly wanted and leaves the other untouched. Switching back
 * fetches again — the same as every other filter on this page, which are all
 * URL-driven and keyed into `useFetch`. */
const draftsFetch = useFetch<DraftsResponse>('/api/drafts', {
  query,
  enabled: wantsMe,
  watch: [wantsMe],
})

/**
 * The other half, and it is the OPTIONAL one — as long as both are asked for.
 *
 * Its rows come from the RIS Begut corpus — 46 paged requests with a pause
 * between them when the cache is cold, measured at 46 s right after a
 * restart against 0,22 s warm. The Ministerialentwürfe must never wait for
 * that, so this fetch carries a budget and the page renders without it: the
 * same rule as everywhere else here, enrichment is never a fact the page
 * depends on. A failure is stated, not swallowed — the count line must not
 * report "0 ohne Gegenstand" when the truth is "we could not look".
 *
 * Under „Verordnungsentwürfe" it stops being the optional half: nothing
 * stands beside it there, so it carries the page and the gate follows it
 * (`gateStatus`).
 */
const risFetch = useFetch<RisConsultationsResponse>(
  '/api/ris-drafts',
  { query, timeout: 8000, enabled: wantsRis, watch: [wantsRis] },
)

/**
 * The second open window — and since 18.09.2026 these are rows, not a section
 * (docs/architecture.md §12.26).
 *
 * Whoever lands here under „Stellungnahme möglich" is asking where they can
 * say something now, and a Regierungsvorlage in the Nationalrat is such a
 * place. The draft behind it is already a row — station „Regierungsvorlage",
 * chip „Zweite Runde". What this fetch adds are the Vorlagen with NO draft
 * behind them (about a quarter,
 * `docs/begutachtung-uebersprungen.md`): they have no row that could carry
 * them, so they become one themselves (`vorlageRows`).
 *
 * Two earlier attempts put them in a section under the list, and both failed
 * on the same thing: the homepage shows six open Vorlagen, the section then
 * showed one — „six there, one here" reads as a defect whatever the heading
 * says. A list answering „wo kann ich etwas sagen" must not split the answer
 * across two places.
 *
 * Client-side and lazy: nothing above this fetch depends on it, an empty
 * result is the normal case, and what may be missing must not hold the first
 * paint.
 */
const secondRoundFetch = useFetch<DashboardSecondRound>(
  '/api/dashboard/zweite-runde',
  { lazy: true, server: false },
)

const { data: meFetched, error, refresh, status } = await draftsFetch
const { data: risFetched, error: risError, status: risStatus, refresh: risRefresh } = await risFetch
const { data: secondRound } = await secondRoundFetch

/* What this `art` asks for, and nothing else. A `useFetch` handle keeps the
 * answer it last gave when it is switched off, so without this cut the count
 * line, the Ressort menu and „in zweiter Runde" would go on counting a half
 * that is not on the page any more after a toggle. */
const meData = computed(() => (wantsMe.value ? meFetched.value : null))
const risData = computed(() => (wantsRis.value ? risFetched.value : null))

/**
 * The gate follows the half that carries the page.
 *
 * That is the Ministerialentwürfe wherever they are asked for; the RIS half
 * beside them stays enrichment, and its absence is stated in the count line
 * rather than by an error card. Under „Verordnungsentwürfe" nothing stands
 * beside it: it is the page's own data then, and it decides loading, failure
 * and retry the way the other half does otherwise.
 */
const gateStatus = computed(() => (wantsMe.value ? status.value : risStatus.value))
const gateError = computed(() => (wantsMe.value ? error.value : risError.value))
const gateData = computed(() => (wantsMe.value ? meData.value : risData.value))

/* Retries whichever halves this `art` asks for — a switched-off handle
 * refuses by itself (`enabled`). */
function retry(): void {
  void refresh()
  void risRefresh()
}

const selectedGp = computed({
  get: () => gp.value || meData.value?.gp || risData.value?.gp || '',
  set: (value: string) => {
    gp.value = value
  },
})

/**
 * Both halves know the periods and the ressorts; the union is the menu — the
 * union of the halves that are ASKED FOR. Under an Art filter the menu
 * therefore names the Ressorts of the half on the page: a Ressort that could
 * only empty the list is not a choice.
 *
 * Newest period first, by the NUMBER the Roman code stands for — comparing
 * the strings would put XXVIII before XXX, and the table reaches far enough
 * that this stops being hypothetical.
 */
const availableGps = computed(() => {
  const all = new Set([...(meData.value?.availableGps ?? []), ...(risData.value?.availableGps ?? [])])
  return [...all].sort((a, b) => (romanToInt(b) ?? 0) - (romanToInt(a) ?? 0))
})
const ministries = computed(() => {
  const byCode = new Map<string, string>()
  for (const m of [...(meData.value?.ministries ?? []), ...(risData.value?.ministries ?? [])]) {
    if (!byCode.has(m.code) || (!byCode.get(m.code) && m.name)) byCode.set(m.code, m.name)
  }
  return [...byCode].map(([code, name]) => ({ code, name })).sort((a, b) => a.code.localeCompare(b.code, 'de-AT'))
})

/**
 * The third row kind, since 18.09.2026: a Regierungsvorlage that never had a
 * Begutachtung. It stood in a section under the list until then, and the
 * homepage's six open Vorlagen against the section's one read as a defect
 * whatever the heading said.
 *
 * So it belongs in the same list. That does not soften §12.19 („two row
 * shapes, never a pooled total"), it applies the same rule a third time: its
 * own row shape, its own count term, a shared order. The row shape and both
 * orders are in `shared/utils/draftOrder.ts`, next to the comparator they
 * call.
 *
 * Under the same controls as everything else, as far as they reach. Status:
 * only where „Stellungnahme möglich" is asked or nothing is filtered — an
 * open window has no business under „Nicht möglich". Station: they stand at
 * the Regierungsvorlage. Art: they are no Verordnungsentwürfe. Ressort:
 * `OpenVorlage` carries none, so the row steps back as soon as one is
 * filtered for. Search: the same word rule as above (`matchesQuery`).
 */
const vorlageRows = computed<DraftListRow[]>(() => {
  const list = secondRound.value
  if (!list || statusFilter.value === 'closed' || art.value === 'verordnung' || ministry.value) return []
  if (stations.value.length && !stations.value.includes('rv')) return []
  if (selectedGp.value && selectedGp.value !== list.gp) return []
  return list.items
    .filter((v) => v.consultation.kind !== 'draft')
    .filter((v) => matchesQuery(`${v.title} ${v.citation}`, qDebounced.value))
    .map((v) => ({ kind: 'vorlage' as const, key: `rv-${v.citation}`, vorlage: v }))
})

/* No Art test of its own any more: a half that this `art` excludes was never
 * fetched, and `meData`/`risData` are null for it. */
const rows = computed<DraftListRow[]>(() => {
  const out: DraftListRow[] = []
  for (const d of meData.value?.items ?? []) out.push({ kind: 'me', key: `me-${d.gp}-${d.inr}`, draft: d })
  for (const c of risData.value?.items ?? []) out.push({ kind: 'ris', key: `ris-${c.id}`, item: c })
  out.push(...vorlageRows.value)
  return out.sort((a, b) =>
    sort.value === 'stellungnahmen' ? compareRowsByStatements(a, b) : compareDrafts(rowOrderKey(a), rowOrderKey(b)),
  )
})

/**
 * The ordered rows, put through one anatomy (docs/architecture.md §12.28).
 *
 * The split is deliberate and it is the lesson of the six components this
 * replaced: `rows` decides WHAT stands in which order — with three row kinds
 * that keep their own types (§12.19) — and the adapter decides HOW each kind
 * falls onto the four zones. Both used to live in two components per kind,
 * which is why the same number could stand in six places in one list.
 */
const entries = computed(() =>
  rows.value.map((row) =>
    row.kind === 'me'
      ? viewOfDraft(row.draft)
      : row.kind === 'ris'
        ? viewOfRis(row.item)
        : viewOfVorlage(row.vorlage),
  ),
)

/* ------------------------------------------------------------------ *
 * The search's second half: the full text (docs/architecture.md §12.31)
 *
 * Its own debounce, its own fetch, its own counts — all in
 * `useFullTextSearch`, because it is a second, differently cut answer to the
 * same field and not one more filter.
 * ------------------------------------------------------------------ */
const {
  FULLTEXT_MIN_LEN,
  fullText,
  fullTextApplies,
  fullTextActive,
  fullTextPending,
  fullTextError,
  hitByKey,
  fullTextExtra,
  fullTextExtraEntries,
  fullTextInList,
  fullTextFilteredOut,
  fullTextCorpus,
} = await useFullTextSearch(filters, availableGps, entries)

/**
 * Each kind counted on its own, never summed.
 *
 * A single "336 Entwürfe" would put the Stellungnahmen figures of a third of
 * the rows over all of them. The search placeholder does name the total,
 * because there it is a statement about the search scope rather than about
 * the corpus.
 */
const meTotal = computed(() => meData.value?.total ?? 0)
const risTotal = computed(() => risData.value?.total ?? 0)
/* Both are 0 for a half that was not fetched, so the sum is what stands in
 * the list — the search placeholder may name it. */
const visibleTotal = computed(() => meTotal.value + risTotal.value)
/* The station map costs hundreds of fetches on a cold build and can fail
 * (`server/utils/parliament/stationMap.ts`). The page then says that nothing
 * was filtered — a list standing unfiltered under an active filter is the
 * one variant nobody notices. */
/* Stations and „Verordnungsentwürfe" exclude one another: the one half has no
 * Gegenstand at Parliament, the other half is the question about it. Instead
 * of „Keine Entwürfe gefunden" — which sounds like too narrow a search term —
 * the page says in that case that the combination itself is empty, and offers
 * the way out. */
/* How many rows of the list are currently the second round — the drafts with
 * an open Vorlagen form plus the Vorlagen without a Begutachtung. Counted so
 * it can be said above the list: whoever comes from the homepage saw „Zweite
 * Runde" there as a section and looks for it here. It is not gone, it is
 * sorted in. */
/* Gone under „Verordnungsentwürfe", and that is right: without the
 * Ministerialentwurf half no row of the list is in a second round. */
const secondRoundRowCount = computed(
  () =>
    (meData.value?.items ?? []).filter((d) => d.chain?.filingOpen).length + vorlageRows.value.length,
)

/* A station AFTER the Begutachtung excludes the Verordnungsentwürfe: without
 * a Gegenstand at Parliament there is no Regierungsvorlage. Under
 * „Begutachtung" the combination makes sense — that is where they stand. */
/**
 * Only stations selected that a record WITHOUT a Gegenstand at Parliament
 * cannot reach — and since 19.09.2026 there are only two of them.
 *
 * „Everything but Begutachtung" was the rule while the Verordnung half
 * appeared nowhere after the Frist. But it is kundgemacht, in part II of the
 * Bundesgesetzblatt (docs/architecture.md §12.32), and „Bundesgesetzblatt"
 * now carries 159 rows of the running period. The note „Diese Auswahl passt
 * nicht zu Verordnungsentwürfen" stood above exactly those rows for one
 * version.
 *
 * `rv` and `parlament` stay unreachable, and that is not a gap in the data
 * but the procedure.
 */
const laterStationsOnly = computed(
  () =>
    stations.value.length > 0 &&
    !stations.value.includes('begutachtung') &&
    !stations.value.includes('bgbl'),
)
const stationConflict = computed(() => laterStationsOnly.value && art.value === 'verordnung')

/* Two reasons why the rows carry no station, and they say fundamentally
 * different things: the map was not reachable just now (temporary, our
 * fault) — or the period does not link its drafts to Vorlagen at all
 * (permanent, the archive's, §12.27). Only the second case needs the
 * explanation without an active station filter too, because a whole column
 * would otherwise vanish wordlessly. */
const chainUnlinkedPeriod = computed(() => meData.value?.chainCoverage === 'unlinked')

/* Zeilen der Vorperiode, deren Frist noch läuft (§12.36) — beide Hälften
 * melden das für sich, und gemeldet wird nur, was das Filtern überlebt hat.
 *
 * Die Liste MUSS das sagen. Sie trägt einen sichtbaren Periodenwähler, der
 * in diesen Wochen die laufende Periode zeigt, während ein paar Zeilen aus
 * der davor stammen; zwei Perioden stillschweigend unter einem Etikett ist
 * genau das, was §12.21 ablehnt. Die Endpunkte lesen nur mit, wenn der
 * Aufruf gar keine Periode genannt hat — sobald jemand oben eine auswählt,
 * ist die Antwort wieder periodenrein und dieser Satz verschwindet von
 * selbst. */
const carriedOverFrom = computed(
  () => meData.value?.carriedOverFrom ?? risData.value?.carriedOverFrom ?? null,
)

const stationsMissing = computed(
  () => meData.value?.stationsAvailable === false && !chainUnlinkedPeriod.value,
)

/* A THIRD case since 24.09.2026, and the only one where the missing map does
 * not cost a column but cuts the SET wrong: „Nicht möglich" excludes a draft
 * whose Regierungsvorlage parliament still takes Stellungnahmen on, and that
 * is known from the station map alone. Without it those rows fall in here
 * and say „Begutachtung abgeschlossen" over an open window — 13 of the
 * running period's 132 expired drafts on 24.09.2026. Rare (the deploy waits
 * for the prewarm since the same day, `deploy/deploy.sh`) and therefore
 * worth one sentence rather than a second data path. */
const stationsUnavailable = computed(
  () => stationsMissing.value && (stations.value.length > 0 || statusFilter.value === 'closed'),
)

const countLabel = computed(() => {
  const parts: string[] = []
  if (wantsMe.value) {
    parts.push(countLabelDe(meTotal.value, 'Ministerialentwurf', 'Ministerialentwürfe'))
  }
  /* A third term, never added up (§12.19): a Regierungsvorlage without a
   * Begutachtung is neither a Ministerialentwurf nor a Verordnungsentwurf —
   * folding it into either number would claim about it what holds for the
   * other half. Before the station-filter exit, because these rows do come
   * along under „Regierungsvorlage". */
  /* The addition „ohne Begutachtung" only where it is evidenced for EVERY
   * counted row. It is the aggregate form of the statement that stands in the
   * row, so it must not reach further either: as soon as one Vorlage is in
   * whose history is merely unevidenced (`unknown`), the number counts rows
   * and claims nothing about them. */
  if (vorlageRows.value.length) {
    const count = countLabelDe(vorlageRows.value.length, 'Regierungsvorlage', 'Regierungsvorlagen')
    const allChecked = vorlageRows.value.every(
      (row) => row.kind === 'vorlage' && row.vorlage.consultation.kind === 'none',
    )
    parts.push(allChecked ? `${count} ohne Begutachtung` : count)
  }
  /* Under a station filter the Verordnung half does not count — neither as
   * „0" nor as „gerade nicht abrufbar". Both would answer a question nobody
   * asked: it is neither empty nor broken, it does not belong to this axis.
   * The sentence above the list says why. */
  if (laterStationsOnly.value) return parts.join(' · ')
  /* The same noun as in the Art filter, so the two numbers on the page
   * cannot count two different things. „ohne Gegenstand im Parlament" was
   * Parliament's category, not this list's — and it stood beside a box
   * carrying a join statistic under the same word. */
  /* `risError` only reaches this line while both halves are asked for. Where
   * the RIS half carries the page alone, its failure is the page's failure
   * and the gate says so. */
  if (wantsRis.value) {
    parts.push(
      risError.value
        ? 'die Verordnungsentwürfe sind gerade nicht abrufbar'
        : `${formatNumberDe(risTotal.value)} ${ART_VERORDNUNG_NOUN}`,
    )
  }
  return parts.join(' · ')
})

/* Selects are TokenSelect (native <select> in token styling with the
 * page-wide chevron) — see that component for why not USelect. */
</script>

<template>
  <div class="mx-auto w-full max-w-4xl">
    <header>
      <h1 class="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        Entwürfe
      </h1>
      <p class="mt-2 max-w-prose text-ink-secondary">
        Alle Begutachtungen einer Gesetzgebungsperiode – in Begutachtung und
        abgeschlossen, Gesetzes- wie Verordnungsentwürfe.
      </p>
      <!-- THE WAY TO THE SEARCH STOOD HERE UNTIL 21.09.2026 — a link to
           `/suche` plus two sentences on what is different there from the
           field below. It is gone because the field below does both since
           then (docs/architecture.md §12.31): a note explaining which of a
           page's two searches you are currently using is the manual for a
           separation that no longer has to exist. -->
    </header>

    <!-- No `v-slot="{ data }"` here, unlike the detail pages: this list
         reads both halves itself (`meData`, `risData`) and the gate only
         decides whether there is an answer to render at all. -->
    <FetchGate
      :status="gateStatus"
      :error="gateError"
      :data="gateData"
      loading-label="Entwürfe werden geladen …"
      state-class="mt-10"
      @retry="retry()"
    >
      <!-- NO EXPLANATORY BOX any more, since 18.09.2026. It stood between the
           heading and the filters — at 390 px eight lines of prose about the
           data's provenance before any row of the list was visible — and it
           explained what the rows now say themselves: each carries its type
           word and, where there are no Stellungnahmen, why („nicht gezählt",
           §12.28). The procedure behind it stands on /so-funktionierts.

           Its numbers had to go regardless. „201 Entwürfe ohne Gegenstand
           gegen 134 mit einem" read as a corpus figure but was a join
           statistic: `withGegenstand` counts RIS records a Ministerialentwurf
           could be matched to, while the line 40 px below counts
           Ministerialentwürfe of list 81 — on 18.09.2026 134 against 135.
           Both are right, and the difference is the documented case of an ME
           without a RIS record (`docs/ris-join.md` §2). Writing that down
           correctly would take a subordinate clause nobody reads. -->

      <!-- Two zones, and the boundary is a rule rather than a look:
           everything that fixes the SET stands above the count line; what
           only decides HOW it is read — the sort order — stands with the
           list. Behind it is the sharper form of „nothing above a control
           changes": every number on the page describes the set that the
           controls ABOVE it define. That is why the search stays the last
           element of this zone — its placeholder names the corpus size, and a
           number depending on controls below it would be wrong the moment
           somebody used them. -->
      <div class="group mt-6">
        <!-- `sr-only`, not `hidden`: the checkbox has to stay an element
             `:checked` can match — `peer-checked` on the panel and
             `group-has-[:checked]` on the count depend on it. From md up
             `md:block` on the panel decides anyway, and the switch disappears
             there with its label. -->
        <input
          id="filter-more"
          v-model="filtersOpen"
          type="checkbox"
          class="peer sr-only md:hidden"
          aria-controls="filter-more-panel"
        >
        <label
          for="filter-more"
          class="tap-target inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-hairline bg-surface px-3 text-sm text-ink hover:border-baseline md:hidden"
        >
          <UIcon
            name="i-lucide-sliders-horizontal"
            class="size-4 text-ink-muted"
            aria-hidden="true"
          />
          Weitere Filter
          <!-- Closed only: when open, the chips and the selects say for
               themselves what is on, and the count would then stand above the
               controls it counts.

               `group-has-*` rather than `peer-checked`, because the count sits
               inside the label and is therefore no sibling of the checkbox —
               `peer-*` reaches siblings, `group-*` reaches descendants (the
               pattern of `group-open` on this page's <details> blocks).

               And `[input:checked]` rather than the shorter
               `group-has-checked`: `:checked` also matches the selected
               `<option>`, and three <select> in the panel always have one.
               With `:has(:checked)` the group therefore counted as open
               ALWAYS and the number was never visible; measured that way on
               18.09.2026, before anyone would have noticed. -->
          <span
            v-if="moreFilters"
            class="rounded-full bg-accent-deep px-2 py-0.5 text-xs font-medium text-white group-has-[input:checked]:hidden"
          >{{ moreFilters }}</span>
        </label>

        <div id="filter-more-panel" class="mt-3 hidden space-y-3 peer-checked:block md:mt-0 md:block">
          <!-- The station bar comes first: „wo steht es" is the coarser
               question, „was kann ich tun" cuts across it (docs/architecture.md
               §12.26). Multi-select, because two stations side by side are a
               sensible question („Vorlage oder schon Gesetz?") and because
               selecting nothing already means „alle" — an „Alle" chip would be
               a fourth state for what the empty state says already. Gone where
               the period cannot answer the question (§12.27): a chip that can
               filter nothing is not a control but a promise, and the sentence
               above the rows says why.

               No visible „Wo steht es:" in front of the chips (18.09.2026).
               The four words are the stations themselves — whoever sees
               „Begutachtung · Regierungsvorlage · Parlament ·
               Bundesgesetzblatt" side by side reads the axis off its values.
               The name stays as the group's `aria-label`: to a screen reader
               the chips would otherwise be four unrelated buttons. -->
          <div
            v-if="!chainUnlinkedPeriod"
            role="group"
            aria-label="Wo steht es"
            class="flex flex-wrap items-center gap-2"
          >
            <UButton
              v-for="opt in stationOptions"
              :key="opt.value"
              size="sm"
              :color="stations.includes(opt.value) ? 'primary' : 'neutral'"
              :variant="stations.includes(opt.value) ? 'subtle' : 'outline'"
              :aria-pressed="stations.includes(opt.value)"
              class="rounded-full"
              @click="toggleStation(opt.value)"
            >
              {{ opt.label }}
            </UButton>
            <UButton
              v-if="stations.length"
              size="sm"
              color="neutral"
              variant="ghost"
              class="rounded-full"
              @click="stations = []"
            >
              Alle Stationen
            </UButton>
          </div>

          <!-- Fixed tracks instead of `flex-wrap`, and `block` on every
               select. A native <select> sizes itself by its LONGEST option:
               „Alle Arten" stood 267 px wide because „Verordnungsentwürfe und
               andere" is in its list, „Nach Frist" 202 px because of „Meiste
               Stellungnahmen". Together the four selects claimed 837 of
               896 px, and where the bar wrapped was decided by the window
               rather than by the design. Now the grid decides:
               272 + 112 + 256 px plus 24 px gaps = 664 of 896. -->
          <div class="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,17rem)_minmax(0,7rem)_minmax(0,16rem)]">
            <div class="min-w-0">
              <label for="filter-art" class="sr-only">Art des Entwurfs</label>
              <TokenSelect id="filter-art" v-model="art" block>
                <option v-for="opt in artOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </TokenSelect>
            </div>

            <div class="min-w-0">
              <label for="filter-gp" class="sr-only">Gesetzgebungsperiode</label>
              <TokenSelect id="filter-gp" v-model="selectedGp" block>
                <option v-for="g in availableGps" :key="g" :value="g">
                  GP {{ g }}
                </option>
              </TokenSelect>
            </div>

            <div class="min-w-0">
              <label for="filter-ministry" class="sr-only">Ministerium</label>
              <TokenSelect id="filter-ministry" v-model="ministry" block>
                <option value="">Alle Ministerien</option>
                <option v-for="m in ministries" :key="m.code" :value="m.code">
                  {{ m.name || m.code }}
                </option>
              </TokenSelect>
            </div>
          </div>
        </div>

        <!-- The second axis, and it stays visible on the phone: „wo kann ich
             jetzt etwas sagen" is the question people arrive with
             (docs/architecture.md §12.26). Its three options explain
             themselves; the axis name is only an `aria-label` now.

             It shares the line with the search, and that is no relapse into
             the old bar: the search stands to its right, i.e. AFTER it in
             reading order, so its placeholder may still count the set the
             controls above and left of it have left over. Below md both wrap
             onto separate lines — the segment measures 338 px, the line 358.

             `mt-5` against the `space-y-3` INSIDE the panel: a group boundary
             runs here — narrowing above, the second axis and the search below
             — and with the same 12 px as between chips and selects the
             segment stuck to the „Weitere Filter" switch. -->
        <div class="mt-5 flex flex-wrap items-center gap-3">
          <UFieldGroup role="group" aria-label="Was kann ich tun" class="shrink-0">
            <UButton
              v-for="opt in statusOptions"
              :key="opt.value"
              :color="statusFilter === opt.value ? 'primary' : 'neutral'"
              :variant="statusFilter === opt.value ? 'subtle' : 'outline'"
              :aria-pressed="statusFilter === opt.value"
              @click="statusFilter = opt.value"
            >
              {{ opt.label }}
            </UButton>
          </UFieldGroup>

          <!-- Last in this zone, and that is the rule rather than taste: the
               placeholder names the corpus size (a trust signal, after
               kleineAnfragen) and therefore counts what the controls ABOVE it
               left over. Placed above them it would carry a number depending
               on controls below it.

               It now gets the whole rest of the line instead of a strip: the
               field used to SHRINK the wider the window became — 720 px at
               768, 366 px at 896 — because it shared a line with Ressort and
               sort order there. Neither stands here any more.

               `min-w-80` and not `min-w-48`: at a 192 px minimum the field
               already fits beside the 338 px segment at 640 px and stood
               there 242 px narrow — narrower than at 430 px, where it has the
               whole line. That is the same disease as before in a new place.
               At 320 px it wraps instead until there really is room (from
               ~700 px) and only grows from there. -->
          <UInput
            v-model="q"
            type="search"
            icon="i-lucide-search"
            :placeholder="`In ${countLabelDe(visibleTotal, 'Entwurf', 'Entwürfen')} suchen …`"
            aria-label="Entwürfe durchsuchen"
            class="min-w-80 flex-1"
            :ui="{ base: 'min-h-11' }"
          />
        </div>
      </div>

      <!-- The count line and the sort control on one level, and that is the
           boundary between the two zones: above stands what FIXES the set,
           here stands how it is READ.

           The sort control stood between Ressort and search until 18.09.2026,
           in the same token styling as the three filters beside it — nothing
           told the control that takes something away from the one that only
           reorders. It belongs to the list: controls that change HOW the
           result is read belong to the list they order
           (docs/architecture.md §12.26). It takes nothing away, so it does
           not change the count line beside it either — the sentence about the
           Verordnungsentwürfe that it triggers stands below it.

           `aria-live` stays on the number alone: with the select inside the
           region a screen reader would re-read a number on every sort that
           has not changed at all. -->
      <div class="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p class="text-sm text-ink-muted" aria-live="polite">
          {{ countLabel }}
        </p>
        <div class="flex min-w-0 items-center gap-2">
          <label for="filter-sort" class="shrink-0 text-sm text-ink-secondary">Sortieren</label>
          <TokenSelect id="filter-sort" v-model="sort">
            <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </TokenSelect>
        </div>
      </div>

      <!-- Subscribing stands here rather than in the footer, and deliberately
           OUTSIDE the live region above: otherwise a screen reader reads the
           invitation out on every keystroke in the search. Two offers,
           following what the filter bar currently says — the Ressort filter is
           the moment somebody decides „dieses Ressort verfolge ich“. -->
      <p class="mt-1 text-sm text-ink-muted">
        <SubscribeLinks :ministry="ministry" />
      </p>

      <h2 class="sr-only">Ergebnisse</h2>
      <!-- Above the rows, like every other statement about what the list is
           doing: read afterwards it is worthless. -->
      <p v-if="carriedOverFrom" class="mt-3 max-w-prose text-sm text-ink-muted">
        Darunter Entwürfe der {{ carriedOverFrom }}. Gesetzgebungsperiode, deren
        Begutachtungsfrist noch läuft – eine Frist endet nicht damit, dass eine
        neue Gesetzgebungsperiode beginnt. Über die Auswahl oben lässt sich
        jede Periode für sich ansehen.
      </p>
      <!-- Like the sort caveat below it: a statement about what the list is
           NOT doing stands above the rows — read afterwards it is
           worthless. -->
      <p v-if="stationsUnavailable" class="mt-3 max-w-prose text-sm text-ink-muted">
        Wo die Entwürfe stehen, lässt sich gerade nicht abrufen<template
          v-if="stations.length"
        > – die Liste ist deshalb <span class="font-medium text-ink">nicht</span>
          nach Station gefiltert</template>.<template v-if="statusFilter === 'closed'">
          Hier zählt nur, ob die Frist abgelaufen ist: Zu einzelnen
          Regierungsvorlagen kann im Nationalrat noch Stellung genommen
          werden.</template>
      </p>
      <!-- The gap is named rather than passed off as a finding: without this
           sentence a list without stations would read as if nothing had ever
           become of any of these drafts (docs/architecture.md §12.27). -->
      <p v-if="chainUnlinkedPeriod" class="mt-3 max-w-prose text-sm text-ink-muted">
        Was aus diesen Entwürfen wurde, ist für diese Gesetzgebungsperiode
        nicht erfasst – der Bezug zwischen Ministerialentwurf und
        Regierungsvorlage fehlt im Datenbestand. Die Zeilen zeigen deshalb
        keine Station; dass es keine Regierungsvorlagen gab, folgt daraus
        <span class="font-medium text-ink">nicht</span>.<template v-if="stations.length">
          Nach Station ist hier deshalb auch
          <span class="font-medium text-ink">nicht</span> gefiltert.</template>
      </p>
      <!-- The caveat holds only for the stations AFTER the Begutachtung:
           nothing without a Gegenstand at Parliament gets there. Under
           „Begutachtung" the Verordnungsentwürfe do come along — leaving them
           out there cost the parity with the homepage (4 instead of 7 under
           „Begutachtung + Stellungnahme möglich") and made three running
           Verordnung-Begutachtungen disappear. -->
      <p
        v-else-if="laterStationsOnly && art !== 'ministerialentwurf'"
        class="mt-3 max-w-prose text-sm text-ink-muted"
      >
        <template v-if="stationConflict">
          <span class="font-medium text-ink">Verordnungsentwürfe haben keine
            Station:</span>
          Sie führen keinen Gegenstand im Parlament, also auch keine
          Regierungsvorlage. „Alle Arten" oder
          <button
            type="button"
            class="tap-target link-inline font-medium"
            @click="stations = []"
          >alle Stationen</button>
          zeigen wieder Zeilen.
        </template>
        <template v-else>
          Verordnungsentwürfe stehen hier nicht: Ohne Gegenstand im Parlament
          gibt es keine Regierungsvorlage – ihr Weg endet mit der Begutachtung.
        </template>
      </p>
      <!-- The answer to „wo ist die zweite Runde?" — the question people
           bring from the homepage, where it is a section of its own. Here it
           is sorted in, by urgency like everything else, and each of these
           rows carries its chip. Only under „Stellungnahme möglich", because
           only there does the statement hold for the whole list. -->
      <p
        v-if="statusFilter === 'open' && secondRoundRowCount"
        class="mt-3 max-w-prose text-sm text-ink-muted"
      >
        Darunter
        <span class="font-medium text-ink">{{ secondRoundRowCount }} in zweiter Runde</span>:
        Die Begutachtung ist vorbei, im Nationalrat kann zur Regierungsvorlage
        weiter Stellung genommen werden. {{ SECOND_ROUND_WINDOW }}
      </p>
      <!-- What the sort order does with the half it cannot sort — above the
           list, not below it: a caveat on what the order claims has to be read
           before the rows are. -->
      <p
        v-if="sort === 'stellungnahmen' && art !== 'ministerialentwurf'"
        class="mt-3 max-w-prose text-sm text-ink-muted"
      >
        Verordnungsentwürfe und andere führen keine Stellungnahmen – sie
        stehen hinter den gereihten Zeilen, weiter nach Frist geordnet.
      </p>
      <!-- THE SEARCH'S LIMIT, at the place where it affects somebody: under
           these filters ONLY the title was searched, because the full text
           knows nothing that is not currently running. Above the list, like
           every other statement about what it is not doing. -->
      <p
        v-if="qDebounced.length >= FULLTEXT_MIN_LEN && !fullTextApplies"
        class="mt-3 max-w-prose text-sm text-ink-muted"
      >
        Gesucht ist hier nur in Titel, Zitat, Debattennamen und Ressortkürzel. In
        den Dokumenten selbst wird nur gesucht, solange eine Begutachtung
        <span class="font-medium text-ink">läuft</span> – unter diesen Filtern
        also nicht.
      </p>
      <!-- Both densities and the column header live in `EntryList` since
           18.09.2026 — the same list renders the homepage now, and the header
           has to align with the cells in `EntryItem` to the pixel
           (docs/architecture.md §12.28). -->
      <EntryList v-if="entries.length" :entries="entries" class="mt-3">
        <!-- Only the rows hit by the full text TOO carry evidence: the gain
             on a row that is there anyway („das Wort steht in § 6") instead of
             a second row for the same draft. -->
        <template #evidence="{ entry }">
          <SearchEvidence :hit="hitByKey.get(entry.key)" />
        </template>
      </EntryList>
      <template v-else-if="!stationConflict">
        <!-- EMPTY LIST, BUT NOT AN EMPTY PAGE: while the full text below is
             still answering, the large „Keine Entwürfe gefunden" card would be
             a claim about an answer that does not exist yet. One line then
             says what the title search returned, and the block below says the
             rest. -->
        <p v-if="fullTextActive" class="mt-3 max-w-prose text-ink-secondary">
          Kein Titel, kein Zitat, kein Debattenname und kein Ressortkürzel
          trägt „{{ qDebounced }}“.
        </p>
        <!-- The description names the four fields instead of saying „Titel":
             „Klimaschutz" returns nine rows here, all of them through the
             RESSORT NAME (BMK) and none through a document — whoever believes
             the title is searched takes that for a title hit. -->
        <div v-else class="mt-3">
          <EmptyState
            title="Keine Entwürfe gefunden"
            :description="
              qDebounced
                ? 'Dieses Feld durchsucht Titel, Zitat, Debattennamen und Ressortkürzel. Nach dem Ressort filtert die Auswahl daneben.'
                : 'Andere Filter oder einen anderen Suchbegriff versuchen.'
            "
          />
        </div>
      </template>

      <!-- THE SAME FIELD'S SECOND ANSWER (docs/architecture.md §12.31). Its
           own section with its own heading, never mixed into the list: the
           list searches a whole Gesetzgebungsperiode by title, this block the
           documents of what is open today. -->
      <section v-if="fullTextActive" class="mt-8">
        <h2 class="text-lg font-semibold text-ink">
          Außerdem im Volltext der laufenden Begutachtungen
        </h2>
        <!-- The asterisk is explained here and not at the field: it applies
             to THIS half — RIS searches whole words, the list above searches
             substrings. A usage note belongs with what it changes. -->
        <p class="mt-1 max-w-prose text-sm text-ink-muted">
          Alle Dokumente eines Entwurfs – Text, Erläuterungen,
          Gegenüberstellung, Anhänge. Gesucht werden ganze Wörter,
          <code>Klima*</code> findet auch zusammengesetzte.
        </p>

        <LoadingState v-if="fullTextPending" label="Im Volltext wird gesucht …" />
        <!-- AN ERROR IS NOT AN ANSWER (docs/architecture.md §12.13): „kommt
             nicht vor" would be this product's most expensive lie. -->
        <p v-else-if="fullTextError" class="mt-3 max-w-prose text-sm text-ink-secondary">
          Im Volltext konnte gerade nicht gesucht werden – das RIS hat nicht
          geantwortet. Die Liste oben ist davon nicht betroffen.
        </p>
        <template v-else-if="fullText">
          <EntryList v-if="fullTextExtra.length" :entries="fullTextExtraEntries" class="mt-3">
            <template #evidence="{ entry }">
              <SearchEvidence :hit="hitByKey.get(entry.key)" />
            </template>
          </EntryList>
          <p v-else-if="fullTextInList" class="mt-3 max-w-prose text-sm text-ink-secondary">
            Alle Volltext-Treffer stehen schon in der Liste oben – jeder mit
            seiner Fundstelle.
          </p>
          <!-- TWO THINGS AT ONCE: the empty answer names the corpus size —
               „nichts gefunden" means something different over 9 running
               Verfahren than over 700 — and „kommt nicht vor" is a statement
               about the corpus, so it stands only where RIS really had
               nothing. What the filters took away is said by the line
               below. -->
          <p
            v-else-if="!fullTextFilteredOut"
            class="mt-3 max-w-prose text-sm text-ink-secondary"
          >
            „{{ qDebounced }}“ kommt in den Dokumenten {{ fullTextCorpus }}
            nicht vor. Das Archiv bis 2004 durchsucht das
            <ExternalLink href="https://www.ris.bka.gv.at/Begut/">RIS selbst</ExternalLink>.
          </p>
          <p v-if="fullTextFilteredOut" class="mt-3 max-w-prose text-sm text-ink-secondary">
            <span class="font-medium text-ink">Ausgeblendet:</span>
            {{ countLabelDe(fullTextFilteredOut, 'laufende Begutachtung', 'laufende Begutachtungen') }},
            die „{{ qDebounced }}“ im Volltext
            {{ fullTextFilteredOut === 1 ? 'führt' : 'führen' }} – Art oder Ressort
            schließen sie aus.
            <button
              type="button"
              class="tap-target link-inline font-medium"
              @click="art = ''; ministry = ''"
            >Alle Arten und Ressorts</button>
            zeigen sie.
          </p>
        </template>
      </section>

    </FetchGate>
  </div>
</template>
