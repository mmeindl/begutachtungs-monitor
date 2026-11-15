<script setup lang="ts">
import type { AntraegeResponse, StaatsvertraegeResponse, DashboardSecondRound, DraftStation, LandCode, LandLawsResponse, LawsWithoutBegutachtung, RisConsultationKind } from '#shared/types'
import { LAND_CODES, LAND_NAME, landStationsReason } from '#shared/utils/laender'
import { formatNumberDe } from '#shared/utils/format'
import { landtagParts, landtagValue } from '#shared/utils/periodCalendar'
import {
  antragRow,
  treatyRow,
  compareRowsByFrist,
  compareRowsByStatements,
  type DraftListRow,
  draftRows,
} from '#shared/utils/draftOrder'
import { antragRouteCitation } from '#shared/utils/antragPath'
import { viewOfRow } from '~/utils/entryView'
import {
  type ArtChoice,
  type ArtAnswers,
  type ArtSources,
  antragGapNotes,
  antragRowsOf,
  antragStationOf,
  treatyGapNotes,
  treatyRowsOf,
  treatyStationOf,
  artChoiceOf,
  artChoiceParams,
  artSelectFor,
  artUnavailableBySources,
  artUnavailableFor,
  artOptionReasonsFor,
  artUnavailableNote,
  choiceAdmitsBundLaw,
  choiceAdmitsDraft,
  choiceAdmitsLandLaw,
  choiceAdmitsMinisterialentwurf,
  choiceAdmitsOpenVorlage,
  coherentFilters,
  draftRowsOf,
  isOhneChoice,
  ohneSilentNoteDe,
  ohneUnreadCounts,
  ohneUnreadNoteDe,
  lawsReachNoteDe,
  OHNE_MINISTRY_REASON,
  registerReachNote,
  type FilterChipKey,
  SEVERAL_STATIONS,
  type SortKey,
  activeFilterChips,
  draftCountLabel,
  searchBundHalves,
  spanOptionsFor,
  stationTabsFor,
  withoutDraftRequests,
  withoutDraftRowsOf,
} from '~/utils/draftFilters'
import MethodEntwurfsliste from '~/components/method/MethodEntwurfsliste.vue'
import { cutKeeping } from '~/utils/pagedList'
import { matchesQuery } from '#shared/utils/textMatch'
import { MAX_LIST_QUERY_CHARS } from '#shared/utils/queryParams'

/**
 * Every Begutachtung of a period, in ONE list — Ministerialentwürfe and the
 * Begutachtungen Parliament has no Gegenstand for.
 *
 * Two pages until 17.09.2026. The objection to merging was to POOLING THE
 * NUMBERS, not to sharing a page, and as an argument about the page it lost:
 * the second list had no way in (the navigation is capped at four items),
 * it forced a name that says nothing („Weitere Entwürfe" — further than
 * what?), and it answered one question in two places.
 *
 * So: one list, one filter, three row shapes — and never a single pooled
 * total. The count line states each kind separately (summed over the
 * sources since 24.10.2026), because a headline "336 Entwürfe" would imply
 * the Stellungnahmen figures cover all of them.
 */
usePageSeo({
  title: 'Entwürfe',
  description:
    'Alle Entwürfe – Gesetzes- und Verordnungsentwürfe – und die Gesetze, zu denen kein Entwurf in Begutachtung bekannt ist, filterbar nach Bund und Land, Station, Art – mit oder ohne Entwurf –, Zeitraum und Ministerium, nach „Stellungnahme möglich“ und „Setzt EU-Recht um“.',
})

/**
 * Two axes, not one.
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
 * **Since 02.10.2026 the stations are the list's tabs and the status is ONE
 * chip, „Stellungnahme möglich".** The status was a three-way segment — Alle
 * · Stellungnahme möglich · Nicht möglich — and stood above the stations as
 * tabs for a day. That put the table-stakes axis above the one the product
 * is about, and „Nicht möglich" was only the negation of the second option
 * (`canParticipate`): of its 119 rows on 24.09.2026, 84 kundgemacht and 35
 * waiting for a Vorlage or in the Nationalrat — which the station tabs now
 * say more precisely. Nothing on the site links to it any more; an old
 * `?status=closed` link keeps working and shows as a removable chip
 * (`activeFilterChips`). The value „open" stays what the homepage's sections
 * link through, so the chip stays in view.
 *
 * Under „Bundesgesetzblatt" the chip is unavailable: after the Kundmachung
 * nothing can be filed, so the combination is empty by what the station
 * means. Not under „Parlament" since 03.10.2026. „Parlament" is the
 * Nationalrat done with the Vorlage (its Beschluss, or list-101 status 5, 4
 * or 3; `stationFor`) — but the window does not close with that Beschluss:
 * it runs to the end of the parliamentary procedure, through the Bundesrat
 * (Parliament's own description of it, § 23b Abs. 1 GOG-NR). That day 4 rows of GP XXVIII stood at
 * Parlament with the form open; until then the chip was unavailable there
 * with the reason „Der Nationalrat hat über die Vorlage schon entschieden",
 * and the measurement „Parlament + open is 0" only held because those
 * Vorlagen were wrongly at „Regierungsvorlage".
 */
/** Why the chip is unavailable at a station, where it is. */
const OPEN_UNAVAILABLE: Partial<Record<DraftStation, string>> = {
  bgbl: 'Nach der Kundmachung ist keine Stellungnahme mehr möglich',
}

/* The select „Art" — drafts by kind, and „Ohne Entwurf" as a group of its
 * own since 14.11.2026, in the path graphic's words — and the nouns it
 * shares with the count line live in `app/utils/draftFilters.ts`
 * (`ART_CHOICES`, `KIND_TERM`). Its options are built further down, where
 * the answers that decide which can be offered are read (`artSelect`). */

/**
 * Two orders, and each of them answers a question this page is actually
 * asked.
 *
 * „Frist" is the list's own order and the default everywhere: open first,
 * nearest deadline on top (`compareDrafts`). „Meiste Stellungnahmen" exists
 * because the homepage's ranking („Wo am meisten mitgeredet wurde") had
 * nowhere to send anyone — its five rows are a window onto an order this
 * page could not produce, so the link would have pointed at the pool
 * instead of at the list. It is the same comparator the ranking uses
 * (`rankByStatements`), so the first five rows here ARE those five rows.
 *
 * No third since 02.10.2026. „Zuletzt dazugekommen" (26.09.2026)
 * went when the column headers took over the sorting: no column fits it.
 * A title order under „Entwurf" replaced it for a day and went too — a third
 * of the titles start with „Änderung" or „Verordnung", and the search finds
 * a law by name faster than an alphabet does.
 */
const sortOptions: { value: string; label: string }[] = [
  { value: 'frist', label: 'Nach Frist' },
  { value: reversedOption('frist'), label: 'Nach Frist, umgekehrt' },
  { value: 'stellungnahmen', label: 'Meiste Stellungnahmen' },
  { value: reversedOption('stellungnahmen'), label: 'Wenigste Stellungnahmen' },
]

/**
 * One comparator per option, so adding an order is a line here rather
 * than another branch inside `rows`. The comparators live in
 * `shared/utils/draftOrder.ts`, next to the row kinds they order and where
 * vitest can reach them.
 */
const rowComparators: Record<SortKey, (a: DraftListRow, b: DraftListRow, reversed: boolean) => number> = {
  frist: compareRowsByFrist,
  stellungnahmen: compareRowsByStatements,
}

/* Where the rows come from (`useSourceChoice`) — read before the filters
 * since 14.11.2026: which time spans the list offers depends on it
 * (`periodViewFor`). The rest of the rule is written further down, where
 * the Länder rows are built. */
const { bund, laender: chosenLaender } = useSourceChoice()

/* Filter state, URL binding and the query for both endpoints:
 * `useDraftFilters`, with the pure half in `app/utils/draftFilters.ts`. */
const filters = useDraftFilters({ bund, laender: chosenLaender })
const { statusFilter, art, gp, landtag, periodView, span, laenderSpan, ministry, q, qDebounced, sort, reversed, stations, eu, begutachtung, query, onNavigate } = filters
/* Either column turned round by a second click (`SortHeader`, 06.11.2026). */
const { choose: chooseColumn, selectValue: sortSelect } = useReversibleSort(sort, reversed)

/**
 * „Setzt EU-Recht um": the drafts
 * whose EU fact leads with those words. A chip beside „Stellungnahme
 * möglich", off by default, available under every station and Art — a
 * Verordnung implements directives too. The Bund's halves filter upstream
 * (`eu` in `query`), the Länder's rows here (`landItems`).
 */
function toggleEu(): void {
  eu.value = eu.value ? '' : 'umsetzung'
}

/* „Ohne Entwurf" — chip „Ohne Begutachtung" until 10.11.2026, then „Ohne
 * Ministerialentwurf" with the Bund and „Ohne Begutachtung" for Salzburg alone,
 * one label from 14.11.2026 (`ohneApplied`): the Bund's term was false with
 * Länder selected beside it, and „Ohne Begutachtung" is false for the Bund's
 * Ausschussbegutachtung rows. The same day the chip went into the select
 * „Art" as the group „Ohne Entwurf" (`ART_CHOICES`): one control for what a
 * row is, instead of a chip that swapped the select's vocabulary. The option
 * the select shows is the pair `art` + `begutachtung` (`artChoiceOf`). */
const chosenArt = computed<ArtChoice>({
  get: () => artChoiceOf(art.value, begutachtung.value),
  set: (choice) => {
    const params = artChoiceParams(choice)
    begutachtung.value = params.begutachtung
    art.value = params.art
  },
})

/* The station tabs (`stationTabsFor` says how a link naming several
 * stations keeps its set, and why two tabs stand unavailable under
 * „Verordnungsentwürfe"). Choosing a tab narrows to that one. */
const stationTabs = computed(() => stationTabsFor(art.value, stations.value))

const stationTab = computed<string>({
  get: () => (stations.value.length > 1 ? SEVERAL_STATIONS : (stations.value[0] ?? '')),
  set: (value) => {
    if (value === SEVERAL_STATIONS) return
    stations.value = value ? [value as DraftStation] : []
  },
})

/** Why no row of the chosen station can take a Stellungnahme — null where
 *  some can (and under several stations or none). */
const openUnavailable = computed(() =>
  stations.value.length === 1 ? (OPEN_UNAVAILABLE[stations.value[0]!] ?? null) : null,
)

/**
 * What the reader chose, apart from what is applied (03.10.2026).
 *
 * Under „Parlament" and „Bundesgesetzblatt" the chip stands unavailable but
 * KEEPS its state: a reader who looks at the Bundesgesetzblatt and comes
 * back to „Begutachtung" finds the chip as they left it. Applied there it
 * would empty the list by definition, so only the filter steps back — the
 * URL then carries no `status=open`, because the list it describes has none.
 *
 * Stays in the page rather than in `useDraftFilters`: the reasons it is
 * unavailable (`OPEN_UNAVAILABLE`) are this page's copy, and the composable
 * is the URL contract, which knows only the applied value.
 */
const wantsOpen = ref(statusFilter.value === 'open')

function toggleOpen(): void {
  if (openUnavailable.value) return
  wantsOpen.value = !wantsOpen.value
  statusFilter.value = wantsOpen.value ? 'open' : 'all'
}

/* The wish applied wherever the chip is available. An old `?status=closed`
 * link is its own state (its chip clears it); the stations leave it alone. */
function applyWish(): void {
  if (statusFilter.value === 'closed') return
  statusFilter.value = wantsOpen.value && !openUnavailable.value ? 'open' : 'all'
}
watch(openUnavailable, applyWish, { immediate: true })

/* A navigation to another list sets the filters from its URL
 * (`useDraftFilters`), and the wish follows as at setup: it is what that URL
 * says. The tick stayed across the header's „Entwürfe" until 22.10.2026. */
onNavigate(() => {
  wantsOpen.value = statusFilter.value === 'open'
  applyWish()
})

/**
 * The rarer filters — Art, period, Ressort — behind one disclosure, at every
 * width since 02.10.2026.
 *
 * Until then the bar folded away on the phone only (measured 18.09.2026: at
 * 390 px it was 432 px tall and the first viewport showed not one row) and
 * took the station chips with it. Now the three selects go behind „Filter"
 * at every width, and the stations stay out from `md` up — they are the axis
 * the product is about. On a phone they still open with the panel:
 * out there they cost two rows before the first card (measured 02.10.2026).
 *
 * A shared link must never hide an active filter: while the panel is closed,
 * every value it holds stands under the tool row as a chip that removes it
 * (`activeFilterChips`), and the button counts them. A button with
 * `aria-expanded`, not the checkbox-and-`peer` construction of 18.09.2026:
 * that one existed so the panel could open by CSS from a breakpoint up, and
 * there is no breakpoint any more. Without JavaScript nothing here filters
 * anyway — every control writes the URL through Vue.
 */
const moreFilters = computed(
  () => Number(chosenArt.value !== '') + Number(span.value.gp !== '' || span.value.landtag !== '') + Number(ministry.value !== ''),
)
const filtersOpen = ref(false)

/** The closed panel's values; `clearChip` is the press that removes each. */
const activeFilters = computed(() =>
  activeFilterChips({ status: statusFilter.value, art: art.value, begutachtung: begutachtung.value, ...span.value, ministry: ministry.value }, periodView.value),
)
const clearChip: Record<FilterChipKey, () => void> = {
  status: () => { statusFilter.value = 'all' },
  art: () => { chosenArt.value = '' },
  gp: () => { gp.value = '' },
  landtag: () => { landtag.value = '' },
  ministry: () => { ministry.value = '' },
}

/* With the panel open its selects state their own values; the status chip
 * has no select, so it stands either way. */
const shownFilterChips = computed(() =>
  filtersOpen.value ? activeFilters.value.filter((f) => f.key === 'status') : activeFilters.value,
)

/**
 * The two orders as the column header carries them (`EntryList`,
 * `SortHeader`): Frist is the Stand column, the ranking the Stellungnahmen
 * column. The Entwurf column orders nothing. Below `md` the page
 * offers the same two as a select.
 */
const SORT_COLUMNS = {
  count: { key: 'stellungnahmen', order: 'meiste zuerst', reverseOrder: 'wenigste zuerst' },
  state: { key: 'frist', order: 'nächste Frist zuerst', reverseOrder: 'späteste Frist zuerst' },
} as const

/* The header hands back one of `SORT_COLUMNS`' keys. */
function chooseSort(key: string) {
  chooseColumn(key as SortKey)
}

/**
 * Where the rows come from (`useSourceChoice`, 22.10.2026): the Bund, and
 * the Länder the reader chose — or one Land alone, with the Bund off.
 *
 * The Länder's drafts come running and closed, for the period used as a
 * TIME WINDOW: a draft belongs to GP XXVIII when its Begutachtung began
 * within that period's dates (`readLaenderInWindow`); the sentence under the
 * chips says so. What the Länder rows cannot answer, the chips say as their
 * reason, and they keep their state for the view that can: a later station
 * (the monitor follows a Land's draft no further than its Begutachtung)
 * and a Ressort while the Bund is on. The Art is no reason since
 * 23.10.2026: a Land's draft is a Gesetz or a Verordnung like the Bund's.
 */
/* The stations each Land is followed to: `LAND_FOLLOWED_STATIONS`. */
function landUnavailableFor(land: LandCode): string | null {
  const byStation = landStationsReason(land, stations.value)
  if (byStation) return byStation
  if (bund.value && ministry.value) return 'Länder-Entwürfe haben kein Ministerium'
  return null
}
const applyingLaender = computed(() => chosenLaender.value.filter((land) => !landUnavailableFor(land)))
/* The reason the count line gives when no chosen source applies at all. */
const landUnavailable = computed(() => (chosenLaender.value.length ? landUnavailableFor(chosenLaender.value[0]!) : null))
const landsApply = computed(() => applyingLaender.value.length > 0)
const sourceUnavailable = computed(() =>
  Object.fromEntries(LAND_CODES.map((land) => [land, landUnavailableFor(land)])))

/* The halves the sources and `art` ask for, the gate over them, the period
 * and Ressort menus: `useDraftHalves`. */
const halves = useDraftHalves({ ...filters, bund, wantsLaender: landsApply })
const {
  wantsMe,
  wantsRis,
  meData,
  risData,
  risError,
  laenderData,
  laenderStatus,
  states: halfStates,
  pendingHalves,
  gateStatus,
  gateData,
  refreshing,
  retry,
  selectedGp,
  availableGps,
  ministries: ministriesFetched,
} = halves

/**
 * The Bund halves under the search term, searched HERE since 12.11.2026
 * (`searchBundHalves`): the endpoints are asked without `q`, so a term costs
 * no request and the rows stand instead of fading while it is typed — the
 * Länder rows, the open Vorlagen and the laws below were already searched on
 * the page, now every row kind is. Same predicates as the endpoints
 * (`shared/utils/searchHaystack.ts`), so a term finds the rows it found.
 *
 * A `?q=` link renders the same rows on the server: its render fetches the
 * unsearched halves and filters in setup, the payload carries them whole and
 * the browser hydrates into the same cut. The price: under a term the
 * payload holds the whole period instead of the matches — exactly what the
 * page ships without a term, so no page grows past its unsearched size.
 */
const searched = computed(() => searchBundHalves(meData.value, risData.value, qDebounced.value))
/* While the RIS half is still on its way, a Ressort only it knows would
 * stand as a blank select (12.11.2026): the chosen one stands as its code
 * meanwhile — the period menu's rule (`gpOptions`). */
const ministries = computed(() =>
  ministry.value && !ministriesFetched.value.some((m) => m.code === ministry.value)
    ? [...ministriesFetched.value, { code: ministry.value, name: '' }]
    : ministriesFetched.value,
)
/* Before the first answer the menu is not there yet: the chosen period
 * stands alone meanwhile, or „Zeitraum …" where none is chosen and the server
 * has not said which is current — never a blank select.
 *
 * Which spans, and how they are named, follows the sources (14.11.2026,
 * `spanOptionsFor`): the Bund's periods, one Land's own (`?landtag=`), or the
 * Bund's spans by their dates alone. */
const spanOptions = computed(() => spanOptionsFor(periodView.value, availableGps.value, selectedGp.value))
/* The select's one value over both kinds: a Land period's `sbg-17`, else the
 * GP. In a Land's view nothing chosen is that Land's running period — the
 * default, as the running GP is the Bund's (`laenderSpanQuery`). */
const spanSelect = computed<string>({
  get: () => {
    const view = periodView.value
    if (view.mode !== 'land') return selectedGp.value
    return span.value.landtag || span.value.gp || landtagValue(view.land, view.periods[0]!.id)
  },
  set: (value) => {
    if (landtagParts(value)) {
      landtag.value = value
      gp.value = ''
    } else {
      selectedGp.value = value
      landtag.value = ''
    }
  },
})
/* Whether the span in view is an earlier one than the running span — the
 * full text knows only what is open today (`useFullTextSearch`). */
const pastSpan = computed(() => {
  const view = periodView.value
  if (view.mode === 'land') return !!span.value.gp || (!!span.value.landtag && span.value.landtag !== landtagValue(view.land, view.periods[0]!.id))
  const current = availableGps.value[0] ?? ''
  return !!span.value.gp && !!current && span.value.gp !== current
})

/**
 * The second open window — and since 18.09.2026 these are rows, not a section.
 *
 * Whoever lands here under „Stellungnahme möglich" is asking where they can
 * say something now, and a Regierungsvorlage in the Nationalrat is such a
 * place. The draft behind it is already a row — station „Regierungsvorlage",
 * chip „Zweite Runde". What this fetch adds are the Vorlagen with NO draft
 * behind them (about a quarter,
 * `docs/research/begutachtung-uebersprungen.md`): they have no row that could carry
 * them, so they become one themselves (`openVorlagen`).
 *
 * Two earlier attempts put them in a section under the list, and both failed
 * on the same thing: the homepage shows six open Vorlagen, the section then
 * showed one — „six there, one here" reads as a defect whatever the heading
 * says. A list answering „wo kann ich etwas sagen" must not split the answer
 * across two places.
 *
 * Client-side and lazy: nothing above this fetch depends on it, an empty
 * result is the normal case, and what may be missing must not hold the first
 * paint. Started before the halves are awaited, so the three overlap.
 */
/* The Länder whose sources carry the statement „ohne Begutachtung" per law: Salzburg. */
const OHNE_LANDS: readonly LandCode[] = ['sbg']
const ohneLandsApply = computed(() => applyingLaender.value.some((land) => OHNE_LANDS.includes(land)))
/* What the sources alone say about the select „Art" — before any answer. */
const artSources = computed<ArtSources>(() => ({ bund: bund.value, landsApply: landsApply.value, ohneLandsApply: ohneLandsApply.value }))
/* The option the sources leave chosen: one they rule out filters as „Alle
 * Arten" (`appliedArt` further down adds the answers' reasons). */
const artBySources = computed<ArtChoice>(() => (artUnavailableBySources(artSources.value)[chosenArt.value] ? '' : chosenArt.value))
/* Which of the three late answers this view asks for (`withoutDraftRequests`):
 * the rows its option shows, and under every option — the four draft options
 * included — the answers that decide whether an option of „Ohne Entwurf" can
 * be offered, so that is known before it is chosen. The open Vorlagen decide
 * nothing and are asked only where they are rows. */
const requests = computed(() => withoutDraftRequests(artBySources.value, artSources.value))
const vorlagenWanted = computed(() => requests.value.vorlagen)
const secondRoundFetch = useFetch<DashboardSecondRound>(
  '/api/dashboard/zweite-runde',
  { lazy: true, server: false, enabled: vorlagenWanted, watch: [vorlagenWanted] },
)

/**
 * The enacted laws of the period without a Ministerialentwurf —
 * rows of the default list since 10.11.2026, next to the drafts,
 * and what the chip „Ohne Entwurf" narrows to. Fetched like the
 * open Vorlagen above: on the client, lazily, so the drafts never wait for
 * them, and for the period in view (the chosen one, else the running one),
 * whenever the Bund is among the sources. An answer that is `pending` or
 * `unread` brings no row and no statement; the drafts stand as they are and
 * the laws join when the answer is complete (`lawsRetries`). Asked under
 * every option while the Bund is a source: the same answer decides whether
 * the options of „Ohne Entwurf" can be offered (`artUnavailable`).
 */
const lawsWanted = computed(() => requests.value.bundLaws)
const lawsFetch = useFetch<LawsWithoutBegutachtung>('/api/ohne-begutachtung', {
  query: computed(() => ({ gp: span.value.gp || undefined })),
  lazy: true,
  server: false,
  enabled: lawsWanted,
  watch: [lawsWanted],
})

/**
 * The Länder's laws without a draft in their register: rows by
 * default, next to the Länder's drafts, for the period in view — fetched
 * like the Bund's laws, on the client and lazily, so the drafts never wait
 * for them; only while a Land applies. The window is the Länder half's
 * (`laenderSpan`): a GP, or the one chosen Land's own period — Salzburg's
 * laws under „Ohne Entwurf" answer for the span its drafts are listed in.
 * Under the draft options only where Salzburg alone decides whether „Ohne
 * Entwurf" can be offered (`withoutDraftRequests`).
 */
const landLawsWanted = computed(() => requests.value.landLaws)
const landLawsFetch = useFetch<LandLawsResponse>('/api/laender/gesetze', {
  query: laenderSpan,
  lazy: true,
  server: false,
  enabled: landLawsWanted,
  watch: [landLawsWanted],
})

/**
 * Every Initiativantrag of the period in view, with its state — rows only
 * under „Alle Initiativanträge" (decision 1 of 14.11.2026), asked for only
 * there and only with the Bund among the sources. On the client and lazily,
 * as the laws: up to a hundred records are read for the running period.
 */
const antraegeWanted = computed(() => bund.value && antragRowsOf(artBySources.value))
const antraegeFetch = useFetch<AntraegeResponse>('/api/antraege', {
  query: computed(() => ({ gp: span.value.gp || undefined })),
  lazy: true,
  server: false,
  enabled: antraegeWanted,
  watch: [antraegeWanted],
})

/**
 * Every treaty's Vorlage of the period in view — rows only under
 * „Staatsverträge" (decision 3 of 14.11.2026), asked for only there and only
 * with the Bund among the sources. List rows and cached Jahrgänge, no
 * detail records (`/api/staatsvertraege`).
 */
const treatiesWanted = computed(() => bund.value && treatyRowsOf(artBySources.value))
const treatiesFetch = useFetch<StaatsvertraegeResponse>('/api/staatsvertraege', {
  query: computed(() => ({ gp: span.value.gp || undefined })),
  lazy: true,
  server: false,
  enabled: treatiesWanted,
  watch: [treatiesWanted],
})

await halves.ready
const { data: secondRound, error: secondRoundError } = await secondRoundFetch
const { data: lawsData, error: lawsError, refresh: refreshLaws } = await lawsFetch
const { data: landLawsData, error: landLawsError, refresh: refreshLandLaws } = await landLawsFetch
const { data: antraegeData, error: antraegeError } = await antraegeFetch
const { data: treatiesData, error: treatiesError } = await treatiesFetch

/**
 * `gap: 'pending'`: after a cold start the station maps are still being
 * built, and the answer changes within a minute. Ask again, a
 * bounded number of times with a pause, so the chip does not stay
 * unavailable until a reload — no loop without an end, stopped on unmount.
 */
const LAWS_RETRY_MS = 20_000
const LAWS_RETRIES = 6
let lawsRetries = 0
let lawsTimer: ReturnType<typeof setTimeout> | undefined
/* `unread` too (12.11.2026), with a longer pause and fewer tries: a read
   that failed after a restart was often only the start-up's load, and the
   chip stood unavailable until a reload. */
const LAWS_UNREAD_RETRY_MS = 60_000
const LAWS_UNREAD_RETRIES = 3
let lawsUnreadRetries = 0
/* A `pending` answer the page will ask again: the laws are on their way, not
 * absent (`lawsPending`). */
const lawsRetrying = ref(false)
watch(lawsData, (laws) => {
  clearTimeout(lawsTimer)
  const retryPending = laws?.gap === 'pending' && lawsRetries < LAWS_RETRIES
  const retryUnread = laws?.gap === 'unread' && lawsUnreadRetries < LAWS_UNREAD_RETRIES
  /* Both count as on their way (15.11.2026): the options of „Ohne Entwurf"
     stay enabled (`bundLawsRetrying`) and the list says „noch geladen" —
     only the answer after the last retry says „nicht abrufbar". */
  lawsRetrying.value = retryPending || retryUnread
  if (retryPending) {
    lawsRetries++
    lawsTimer = setTimeout(() => void refreshLaws(), LAWS_RETRY_MS)
  } else if (retryUnread) {
    lawsUnreadRetries++
    lawsTimer = setTimeout(() => void refreshLaws(), LAWS_UNREAD_RETRY_MS)
  }
}, { immediate: true })
watch(span, () => { lawsRetries = 0; lawsUnreadRetries = 0 })
onUnmounted(() => clearTimeout(lawsTimer))

/* Salzburg's statements wait for the Landtag documents after a cold start
   (`LandLawSource.statements: 'pending'`): asked again as the Bund's laws
   are, a bounded number of times. While a retry is due the statements count
   as on their way (15.11.2026, `landLawsRetrying`): the options of „Ohne
   Entwurf" stay enabled and the Land's laws are said „noch geladen" under
   them (`landLawsPending`), as the Bund's are. */
let landLawsRetries = 0
let landLawsTimer: ReturnType<typeof setTimeout> | undefined
const landLawsRetrying = ref(false)
watch(landLawsData, (laws) => {
  clearTimeout(landLawsTimer)
  landLawsRetrying.value = !!laws?.sources.some((s) => s.statements === 'pending') && landLawsRetries < LAWS_RETRIES
  if (!landLawsRetrying.value) return
  landLawsRetries++
  landLawsTimer = setTimeout(() => void refreshLandLaws(), LAWS_RETRY_MS)
})
watch(laenderSpan, () => { landLawsRetries = 0 })
onUnmounted(() => clearTimeout(landLawsTimer))

/**
 * Where the EU map could not be read, per side, while „Setzt EU-Recht um" is
 * on: the side's rows then stand UNFILTERED and the note above the list says
 * so — the stations' rule (`stationsUnavailable`), for the same reason: a
 * list standing unfiltered under an active filter is the one variant nobody
 * notices. A Bund half answers `euAvailable: false`; the Länder answer
 * counts only as `true` (`LaenderResponse.euAvailable` is optional).
 */
const bundEuMissing = computed(() =>
  meData.value?.euAvailable === false || risData.value?.euAvailable === false,
)
const laenderEuMissing = computed(() => !!laenderData.value && laenderData.value.euAvailable !== true)
const euUnavailable = computed<'alle' | 'bund' | 'laender' | null>(() => {
  if (!eu.value || ohneApplied.value) return null
  const bundMissing = bund.value && bundEuMissing.value
  const landMissing = landsApply.value && laenderEuMissing.value
  if (bundMissing && (landMissing || !landsApply.value)) return 'alle'
  if (landMissing && !bund.value) return 'alle'
  return bundMissing ? 'bund' : landMissing ? 'laender' : null
})

/* Under the same controls as everything else, as far as they reach: the
 * Land chosen, the Art by the kind the Land names (`LandDraftKind`), the
 * search the same word rule (`matchesQuery`). Period and status went
 * upstream (`useDraftHalves`). */
const landItems = computed(() => {
  if (!landsApply.value) return []
  return (laenderData.value?.items ?? [])
    .filter((item) => applyingLaender.value.includes(item.land))
    /* The station tabs: a row's station is the one its Land recorded, the
     * Begutachtung where nothing came yet; an unread record matches none. */
    .filter((item) => {
      if (!stations.value.length) return true
      if (item.stage === 'unknown') return false
      return stations.value.includes(item.stage?.station ?? 'begutachtung')
    })
    .filter((item) => choiceAdmitsDraft(appliedArt.value, item.kind))
    /* „Setzt EU-Recht um": the two markers the fact leads with those words.
     * Without the map (`laenderEuMissing`) the rows stand unfiltered and the
     * note above them says so — a filter that silently drops every Land
     * row would read as „no Land implements anything". */
    .filter((item) => !eu.value || laenderEuMissing.value || item.eu === 'umsetzung' || item.eu === 'ueber-umsetzung')
    .filter((item) => matchesQuery(item.title, qDebounced.value))
})
/* The station tabs: a row whose further way could not be read matches no
 * station. A correction of what the list shows now, so it stays at the list. */
const unreadStageCount = computed(() => {
  if (!landsApply.value || laenderStatus.value !== 'success' || !stations.value.length) return 0
  return (laenderData.value?.items ?? []).filter((i) => applyingLaender.value.includes(i.land) && i.stage === 'unknown').length
})

/* A chosen Land that could not be read — a failed fetch counts as every
 * chosen Land unreadable, never as none open. A half the server's render
 * did not wait for (12.11.2026) is `success` with no answer: on its way,
 * not unreadable. */
const unreadableLaender = computed(() => {
  if (!landsApply.value || laenderStatus.value === 'pending' || laenderStatus.value === 'idle') return []
  if (halfStates.value.laender === 'loading') return []
  const sources = laenderData.value?.sources
  return chosenLaender.value
    .map((land) => sources?.find((s) => s.land === land) ?? { land, state: 'unavailable' as const, listUrl: null })
    .filter((s) => s.state === 'unavailable')
})

/**
 * The third row kind, since 18.09.2026: a Regierungsvorlage that never had a
 * Begutachtung. It stood in a section under the list until then, and the
 * homepage's six open Vorlagen against the section's one read as a defect
 * whatever the heading said.
 *
 * So it belongs in the same list. That does not soften „two row
 * shapes, never a pooled total", it applies the same rule a third time: its
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
/* Whether the view would show them at all — asked before the answer is
 * there, so the count line can say they are on their way (`vorlagenPending`). */
const vorlagenInView = computed(() => {
  if (!bund.value || statusFilter.value === 'closed' || ministry.value) return false
  /* Only under the Arts that can hold one (`withoutDraftRowsOf`):
   * „Alle Arten", „Alle ohne Entwurf", „Regierungsvorlagen ohne Entwurf" —
   * no longer under „Gesetzesentwürfe" since 14.11.2026, a Vorlage without a
   * draft being no draft. Under the draft options an answer asked for
   * availability is never shown or announced. */
  if (!withoutDraftRowsOf(appliedArt.value).vorlagen) return false
  /* „Setzt EU-Recht um": a Vorlage carries no EU fact in the list, so it
   * steps back — unless the Bund's map is missing and the list stands
   * unfiltered anyway (`euUnavailable`). */
  if (eu.value && !bundEuMissing.value) return false
  if (stations.value.length && !stations.value.includes('rv')) return false
  /* They are the running period's: an earlier one chosen holds none. */
  return !pastSpan.value
})
const openVorlagen = computed(() => {
  const list = secondRound.value
  if (!list || !vorlagenInView.value) return []
  if (selectedGp.value && selectedGp.value !== list.gp) return []
  return list.items
    // Under „Ohne Entwurf" only the rows that carry one of its two
    // notes (`none`, `committee`).
    .filter((v) => choiceAdmitsOpenVorlage(appliedArt.value, v.consultation.kind, v.kind))
    .filter((v) => matchesQuery(`${v.title} ${v.citation}`, qDebounced.value))
})

/**
 * „Ohne Entwurf": the list shows ONLY the procedures no draft preceded.
 * For the Bund, those without a Ministerialentwurf: the period's enacted
 * laws from `/api/ohne-begutachtung` (station Bundesgesetzblatt) and the
 * open Vorlagen that say „ohne Begutachtung" or „Ausschussbegutachtung"
 * (station Regierungsvorlage). For the Länder, the laws that say „ohne
 * Begutachtung" — Salzburg's only (`OHNE_LANDS`); the other chosen Länder
 * are named above the rows (`ohneSilentNote`). Every draft — the
 * Ministerialentwürfe, the RIS records, the Länder's — steps back. A
 * procedural fact per row, never a ranking.
 *
 * Unavailable — with its reason, keeping its state, like „Stellungnahme
 * möglich" under „Bundesgesetzblatt" — without the Bund, and where the
 * period cannot carry the claim (`LawsWithoutBegutachtung.gap`): then the
 * filter steps back and the list is what it is without it.
 */
/**
 * The options of the select „Art" that cannot be offered here, each with its
 * reason (14.11.2026, `artUnavailableFor`). What the sources alone rule out
 * stands disabled on the first render, on the server too: „Andere Entwürfe"
 * without the Bund, the three Bund-and-Salzburg options of „Ohne Entwurf"
 * with neither, „Landesgesetze ohne zugeordneten Entwurf" without a Land.
 * The rest waits for the answers, asked under every option
 * (`withoutDraftRequests`) — the Bund's laws, else Salzburg's: a period that
 * cannot carry the claim, an answer not read or a failed fetch. Until an
 * answer is there the option stays enabled: unknown is not unavailable —
 * nor is an answer the page will ask again for (`lawsRetrying`, 15.11.2026).
 * Such an option stands disabled, its reason after its label
 * (`artOptionReasonsFor`); a link that asks for it keeps it chosen, the list
 * steps back to „Alle Arten" (`appliedArt`) and one line says why
 * (`artNote`) — never a silent fallback.
 */
const artAnswers = computed<ArtAnswers>(() => ({
  bundLaws: lawsData.value,
  bundLawsFailed: !!lawsError.value,
  bundLawsRetrying: lawsRetrying.value,
  sbgLaws: landLawsData.value?.sources.find((src) => src.land === 'sbg'),
  sbgLawsRetrying: landLawsRetrying.value,
  landLawsFailed: !!landLawsError.value,
  /* „als Initiativantrag": the Bund's period in view, and whether its rows
   * carry the chains that name the route — both in the server's render. */
  gp: span.value.gp || meData.value?.gp || '',
  chainsMissing: meData.value?.stationsAvailable === false,
}))
const artUnavailable = computed(() => artUnavailableFor(artSources.value, artAnswers.value))
/* The option that filters: the chosen one, or „Alle Arten" where it cannot. */
const appliedArt = computed<ArtChoice>(() => (artUnavailable.value[chosenArt.value] ? '' : chosenArt.value))
/* Which draft halves the applied option shows rows of (`draftRowsOf`): under
 * „als Initiativantrag" the Ministerialentwürfe alone, those whose row names
 * the Antrag (`choiceAdmitsMinisterialentwurf`). The other options take every
 * row their halves bring, as before. */
const halvesShown = computed(() => draftRowsOf(appliedArt.value))
const meOfView = computed(() => (searched.value.me ?? []).filter((d) => choiceAdmitsMinisterialentwurf(appliedArt.value, d)))
const risOfView = computed(() => (halvesShown.value.ris ? (searched.value.ris ?? []) : []))
const artNote = computed(() => {
  const reason = artUnavailable.value[chosenArt.value]
  return reason ? artUnavailableNote(chosenArt.value, reason) : null
})
/* „Andere Entwürfe" is offered while the view holds one (`artSelectFor`):
 * known only where the RIS half came unnarrowed or narrowed to them. */
const othersInView = computed(() => (searched.value.ris ?? []).some((c) => c.kind === 'unbestimmt'))
const artSelect = computed(() => artSelectFor({
  chosen: chosenArt.value,
  others: othersInView.value,
  landSelected: landsApply.value,
  unavailable: artOptionReasonsFor(artSources.value, artAnswers.value),
}))
/* Any option of the group „Ohne Entwurf" applies: every draft steps back. */
const ohneApplied = computed(() => isOhneChoice(appliedArt.value))
/* The chosen Länder whose sources cannot answer the question of „Alle ohne
 * Entwurf" and its two items: their laws step back (`landLawRows`) as every
 * draft does, so the page names them instead of letting their rows vanish in
 * silence. Not under „Landesgesetze ohne zugeordneten Entwurf", which every
 * Land answers as far as its register reaches (`landLawsBeyondReach`). */
const ohneSilentLaender = computed(() =>
  ohneApplied.value && appliedArt.value !== 'ohne-landesgesetz'
    ? applyingLaender.value.filter((land) => !OHNE_LANDS.includes(land))
    : [])
const ohneSilentNote = computed(() => ohneSilentNoteDe(ohneSilentLaender.value))

/* While the chip applies, no Ressort (`coherentFilters`): one chosen before,
 * or carried by a link, is dropped — from the state, and so from the URL. */
watch([ohneApplied, ministry], ([applies]) => {
  ministry.value = coherentFilters({ art: art.value, ministry: ministry.value }, begutachtung.value, applies).ministry
}, { immediate: true })
/* The Ressort select's reason where it cannot be used (`TokenSelect`). */
const ministryUnavailable = computed(() =>
  !bund.value ? 'Nur für Entwürfe des Bundes' : ohneApplied.value ? OHNE_MINISTRY_REASON : null,
)

/* The chip's count: the rows it would show for the period in view, once
 * the laws are there. */

/**
 * The laws under the other controls, as far as they reach — the rules
 * written above `openVorlagen`. Status: nothing can be filed any more, so
 * they stand under no filter and under „Nicht möglich". Station: the
 * Bundesgesetzblatt. Art: they are laws — under „Gesetzesentwürfe" too, not
 * under „Verordnungsentwürfe"; under the chip by the item they came as.
 * Ressort: they carry none, so a chosen Ressort leaves them out of the mixed
 * list (and under the chip no Ressort can be chosen). „Setzt EU-Recht um":
 * they carry no EU fact. Search: the same word rule. In the default list
 * and under the chip alike; without the Bund, or while the answer
 * is incomplete, none.
 */
const lawsInView = computed(() => {
  if (!bund.value) return false
  if (statusFilter.value === 'open' || ministry.value || eu.value) return false
  /* Only under the Arts that can hold one (`withoutDraftRowsOf`) — no
   * longer under „Gesetzesentwürfe" since 14.11.2026: a law is no draft. */
  if (!withoutDraftRowsOf(appliedArt.value).bundLaws) return false
  return !stations.value.length || stations.value.includes('bgbl')
})
const lawRows = computed(() => {
  const laws = lawsData.value
  if (!lawsInView.value || !laws?.available) return []
  if (selectedGp.value && selectedGp.value !== laws.gp) return []
  return laws.items
    .filter((l) => choiceAdmitsBundLaw(appliedArt.value, l.item.kind))
    .filter((l) => matchesQuery(`${l.title} ${l.item.citation} ${l.bgblNumber}`, qDebounced.value))
})

/**
 * The Länder's laws under the other controls, as far as they reach — the
 * rules of `lawRows`: nothing can be filed (no „Stellungnahme möglich"),
 * station Bundesgesetzblatt (the Landesgesetzblatt is that station for a
 * Land), they are laws (not under „Verordnungsentwürfe"), no EU fact, the
 * Land chosen, the same word rule. Under the chip only those that say „ohne
 * Begutachtung", by the item they came as where the Art asks for one.
 */
const landLawsInView = computed(() => {
  if (!landsApply.value) return false
  /* „Alle Arten" and the group „Ohne Entwurf" only — no draft kind
   * (14.11.2026, `withoutDraftRowsOf`). */
  if (statusFilter.value === 'open' || !withoutDraftRowsOf(appliedArt.value).landLaws) return false
  if (eu.value && !laenderEuMissing.value) return false
  return !stations.value.length || stations.value.includes('bgbl')
})
/* Every law of the applying Länder for the span in view, before the Art. */
const landLawsOfView = computed(() => {
  const data = landLawsData.value
  if (!landLawsInView.value || !data) return []
  /* The answer for the span in view only: a Land period's by its `landtag`,
   * a GP's by its code. */
  const asked = laenderSpan.value.landtag
  if (asked ? data.landtag !== asked : data.landtag || (selectedGp.value && selectedGp.value !== data.gp)) return []
  return data.items
    .filter((l) => applyingLaender.value.includes(l.land))
    .filter((l) => matchesQuery(`${l.title} ${l.shortTitle ?? ''} ${l.nr}`, qDebounced.value))
})
const landLawRows = computed(() => landLawsOfView.value.filter((l) => choiceAdmitsLandLaw(appliedArt.value, l)))
/* Under „Landesgesetze ohne zugeordneten Entwurf": the laws left out because
 * their Land's register does not reach back far enough to rule a draft out —
 * the plain „Landesgesetz" of the count line. Counted per Land and said
 * (`registerReachNote`): a gap never reads as an empty result. */
const landLawsBeyondReach = computed(() => {
  if (appliedArt.value !== 'ohne-landesgesetz') return {}
  const counts: Partial<Record<LandCode, number>> = {}
  for (const l of landLawsOfView.value) if (!choiceAdmitsLandLaw('ohne-landesgesetz', l)) counts[l.land] = (counts[l.land] ?? 0) + 1
  return counts
})
const beyondReachNote = computed(() => registerReachNote(landLawsBeyondReach.value))
/* Under „Ohne Entwurf": the laws whose „ohne Begutachtung" could not be read
 * (`ohneUnreadCounts`), said instead of dropped — not for a Land still „noch
 * geladen" (`landLawsPending`), whose wait already says the rows are short. */
const ohneUnreadNote = computed(() => ohneUnreadNoteDe(ohneUnreadCounts(
  appliedArt.value,
  landLawsOfView.value.filter((l) => !landLawsPending.value.includes(l.land)),
)))
/* A chosen Land whose drafts came but whose laws could not be read: said, as an unreadable Land is —
 * only while the view would show its laws, as `lawsUnreadable` (a kept answer outlives its fetch). */
const unreadableLandLaws = computed(() =>
  landLawsInView.value && landLawsData.value
    ? landLawsData.value.sources.filter((src) => src.state === 'unavailable' && applyingLaender.value.includes(src.land) && !unreadableLaender.value.some((u) => u.land === src.land))
    : [])

/**
 * The laws on their way (14.11.2026): asked for by the view, but the answer
 * not there yet — never on the server (`server: false`), so the SSR HTML is
 * this state — or a `pending` answer the page will ask again
 * (`lawsRetrying`). Until 14.11.2026 they counted as none, and under „Ohne
 * Entwurf" the line said „0 Entwürfe" over a list that was only loading. A
 * failed fetch is no pending: it ends the wait.
 */
const lawsPending = computed(() =>
  lawsInView.value && !lawsError.value && (!lawsData.value || lawsRetrying.value))
/**
 * The Bund's laws that did not come (14.11.2026): asked for by the view, but
 * the fetch failed or the answer says it could not read them — `unread`, or
 * `pending` once the retries ran out. In the default list they stood out
 * without a word; now said where an unreadable Land's laws are
 * (`unreadableLandLaws`). Under „Ohne Entwurf" the chip steps back with the
 * same reason (`artUnavailable`), and this sentence then stands in the list
 * it steps back to.
 */
const lawsUnreadable = computed(() => {
  if (!lawsInView.value) return false
  if (lawsError.value) return true
  const laws = lawsData.value
  return laws?.available === false && (laws.gap === 'unread' || laws.gap === 'pending') && !lawsRetrying.value
})

/**
 * How far the source of the Bund's laws reaches (15.11.2026,
 * `lawsReachNoteDe`): a period wholly before the Bundesgesetzblatt in RIS
 * says so, a period that began before it says which laws its list lacks.
 * Only while the view would show the laws, and not twice: where a chosen
 * option of „Ohne Entwurf" stepped back, `artNote` already carries the
 * reason.
 */
const lawsReachNote = computed(() => {
  const laws = lawsData.value
  if (!lawsInView.value || !laws) return null
  if (selectedGp.value && selectedGp.value !== laws.gp) return null
  if (artNote.value && isOhneChoice(chosenArt.value)) return null
  return lawsReachNoteDe(laws)
})

/**
 * The open Regierungsvorlagen without a draft on their way (14.11.2026), as
 * the laws are (`lawsPending`): never on the server (`server: false`), so
 * the SSR HTML is this state. Until then the count line could stand without
 * them for a moment, and under „Ohne Entwurf" print a total they were
 * missing from. A failed fetch ends the wait and is said as failed.
 */
const vorlagenPending = computed(() => vorlagenInView.value && !secondRoundError.value && !secondRound.value)
const vorlagenFailed = computed(() => vorlagenInView.value && !!secondRoundError.value)
/* What the count line is given for them (`draftCountLabel`). */
const vorlagenForCount = computed(() =>
  vorlagenPending.value ? 'pending' as const : vorlagenFailed.value ? 'failed' as const : openVorlagen.value)

/* The Länder whose laws are on their way: those the view counts them for —
 * under the chip only the Länder that can answer it (`OHNE_LANDS`). Once the
 * answer is there, under the group „Ohne Entwurf" also a Land whose
 * statements are still being read and asked again (`landLawsRetrying`,
 * 15.11.2026): its options pick laws by „ohne Begutachtung", which a row
 * without its statement cannot say yet — until then the list showed the
 * laws decided so far as if they were all. Under „Alle Arten" every law is
 * a row either way, so nothing waits there. */
const landLawsPending = computed<LandCode[]>(() => {
  if (!landLawsInView.value || landLawsError.value) return []
  const data = landLawsData.value
  if (data) {
    if (!ohneApplied.value || !landLawsRetrying.value) return []
    return data.sources.filter((s) => s.statements === 'pending' && applyingLaender.value.includes(s.land)).map((s) => s.land)
  }
  return ohneApplied.value && appliedArt.value !== 'ohne-landesgesetz'
    ? applyingLaender.value.filter((land) => OHNE_LANDS.includes(land))
    : applyingLaender.value
})
/* Rows still to come, from any half or the laws: the list body then shows
 * its loading state rather than „Keine Entwürfe gefunden", and the search
 * field names no count. */
const listPending = computed(() => latePending.value.length > 0)
/* Every part that joins the list late, by name, while it is on its way: the
 * halves (`pendingHalves`), the Bund's laws, the Länder's laws and the open
 * Vorlagen — what `listPending` waits for and the scroll anchor below holds
 * the reader's place against. */
/**
 * The Initiativanträge under „Alle Initiativanträge", under the other
 * controls as far as they reach: „Stellungnahme möglich" holds the rows
 * whose own flag said open, „Nicht möglich" the rest; the station tabs by
 * where each stands (`antragStationOf`); a Ressort or „Setzt EU-Recht um"
 * leaves them out — they carry neither; the same word rule as every row.
 * An Antrag whose draft's row already names it (the stated successor of a
 * Beschluss not promulgated, 2/ME → 416/A) is not listed twice.
 */
const antraegeInView = computed(() => antraegeWanted.value && antragRowsOf(appliedArt.value) && !ministry.value && !eu.value)
const antragItems = computed(() => {
  const data = antraegeData.value
  if (!antraegeInView.value || !data) return []
  if (selectedGp.value && selectedGp.value !== data.gp) return []
  const named = new Set(meOfView.value.map((d) => antragRouteCitation(d)).filter((c): c is string => c !== null))
  return data.items
    .filter((a) => !named.has(a.citation))
    .filter((a) => statusFilter.value === 'all' || (statusFilter.value === 'open') === (a.state === 'open'))
    .filter((a) => !stations.value.length || stations.value.includes(antragStationOf(a.state)))
    .filter((a) => matchesQuery(`${a.title} ${a.citation}`, qDebounced.value))
})
const antraegePending = computed(() => antraegeInView.value && !antraegeError.value && !antraegeData.value)
/* What the count line is given for them (`draftCountLabel`). */
const antraegeForCount = computed(() =>
  !antraegeInView.value ? undefined : antraegeError.value ? 'failed' as const : antraegePending.value ? 'pending' as const : antragItems.value.length)
/* Where they did not come whole: one sentence per gap (`antragGapNotes`). */
const antragNotes = computed(() => (antraegeInView.value ? antragGapNotes(antraegeData.value) : []))

/* The treaties under „Staatsverträge", under the other controls as far as
 * they reach: none under „Stellungnahme möglich" — Parliament takes none on
 * a treaty —, the station tabs by where each stands (`treatyStationOf`), a
 * Ressort or „Setzt EU-Recht um" leaves them out. */
const treatiesInView = computed(() => treatiesWanted.value && treatyRowsOf(appliedArt.value) && !ministry.value && !eu.value)
const treatyItems = computed(() => {
  const data = treatiesData.value
  if (!treatiesInView.value || !data) return []
  if (selectedGp.value && selectedGp.value !== data.gp) return []
  if (statusFilter.value === 'open') return []
  return data.items
    .filter((t) => !stations.value.length || stations.value.includes(treatyStationOf(t.state)))
    .filter((t) => matchesQuery(`${t.title} ${t.citation}`, qDebounced.value))
})
const treatiesPending = computed(() => treatiesInView.value && !treatiesError.value && !treatiesData.value)
const treatiesForCount = computed(() =>
  !treatiesInView.value ? undefined : treatiesError.value ? 'failed' as const : treatiesPending.value ? 'pending' as const : treatyItems.value.length)
const treatyNotes = computed(() => (treatiesInView.value ? treatyGapNotes(treatiesData.value) : []))

const latePending = computed<string[]>(() => [
  /* Under „als Initiativantrag" the RIS and Länder halves bring no row
   * (`halvesShown`): not waited for. */
  ...pendingHalves.value.filter((half) => ohneApplied.value || halvesShown.value[half]),
  ...(lawsPending.value ? ['laws'] : []),
  ...(landLawsPending.value.length ? ['landLaws'] : []),
  ...(vorlagenPending.value ? ['vorlagen'] : []),
  ...(antraegePending.value ? ['antraege'] : []),
  ...(treatiesPending.value ? ['treaties'] : []),
])

/* A half that this `art` excludes was never fetched, and `meData`/`risData`
 * are null for it; „als Initiativantrag" cuts the halves it asks for
 * (`meOfView`, `risOfView`; `landItems` by `choiceAdmitsDraft`). */
const rows = computed<DraftListRow[]>(() =>
  (ohneApplied.value
    ? draftRows([], [], openVorlagen.value, [], [...lawRows.value, ...landLawRows.value])
    : [...draftRows(meOfView.value, risOfView.value, openVorlagen.value, landItems.value, [...lawRows.value, ...landLawRows.value]), ...antragItems.value.map(antragRow), ...treatyItems.value.map(treatyRow)])
    .sort((a, b) => rowComparators[sort.value](a, b, reversed.value)),
)

/**
 * The ordered rows, put through one anatomy.
 *
 * The split is deliberate and it is the lesson of the six components this
 * replaced: `rows` decides WHAT stands in which order — with three row kinds
 * that keep their own types — and the adapter decides HOW each kind
 * falls onto the four zones. Both used to live in two components per kind,
 * which is why the same number could stand in six places in one list.
 */
const entries = computed(() => rows.value.map(viewOfRow))

/**
 * How much of the list stands on the page (`ListMore` belongs where
 * a list is worked through).
 *
 * All rows stood in the SSR HTML until 30.09.2026, and each of them twice —
 * `EntryList` renders both densities and lets CSS pick. Over a whole period
 * that was 1,24 MB of HTML and 12.142 DOM nodes, 0,6 s of server render per
 * request and 0,95 s of main thread on a 4× throttled phone (homepage: 0,28
 * s). The rows are cut in the render only: counts, the Ressort menu and the
 * full-text hits keep reading `entries` whole.
 *
 * Cut under a search query too, since 12.11.2026. It stood uncut there,
 * the rule of the Stellungnahmen lists — whoever searches gets the whole
 * result — and so typing „S", „St", „Str" put hundreds of rows on the page
 * per settled step. A query is a new first page like any other filter
 * (`qDebounced`, beside `query`, which no longer carries it); the full-text block's „stehen schon in der Liste
 * oben" is checked against every matching row, not the cut, so it holds for
 * a row behind „Weitere" as well (`splitByListed`). Not in the URL, like the
 * panel's count: a link shares the filter, not how far somebody scrolled.
 */
const LIST_PAGE_SIZE = 50
const {
  visible: visibleCount,
  shown: shownEntries,
  more: showMore,
  all: showAll,
} = usePagedList(entries, LIST_PAGE_SIZE, [query, laenderSpan, qDebounced, art, sort, reversed])

/**
 * A late half's rows sort in (12.11.2026) — once per page load, between
 * the rows the reader may be looking at. Two things keep that from costing
 * the reader their place, and nothing is animated:
 *
 *  - the cut keeps every row it showed (`cutKeeping`), so none of them
 *    drops behind the pager; an opened „Alle" stays open;
 *  - the row at the top of the viewport stays where it stood. Browsers with
 *    scroll anchoring (`overflow-anchor: auto`, nowhere switched off here)
 *    do this themselves, and then the measured shift below is 0; the
 *    others are moved by it. Only once the reader is inside the list —
 *    above it, rows coming in below move nothing they are reading.
 *
 * Only on an arrival: a filter that changes the rows starts a new first
 * page (`usePagedList`) and is not held.
 */
function viewportAnchor(): { key: string; top: number } | null {
  if (!import.meta.client) return null
  const rows = document.querySelectorAll<HTMLElement>('[data-entry-key]')
  if (!rows.length || rows[0]!.getBoundingClientRect().top >= 0) return null
  for (const row of rows) {
    const rect = row.getBoundingClientRect()
    if (rect.bottom > 0) return { key: row.dataset.entryKey!, top: rect.top }
  }
  return null
}

/* Every late part, not only the halves (14.11.2026, `latePending`): the
 * laws and the open Vorlagen sort in between the drafts by Frist too. */
watch(
  [entries, () => latePending.value.join()],
  async ([next, nowPending], [before, wasPending]) => {
    const arrived = wasPending.split(',').some((half) => half && !nowPending.split(',').includes(half))
    if (!arrived || next === before) return
    visibleCount.value = cutKeeping(before.map((e) => e.key), next.map((e) => e.key), visibleCount.value)
    const anchor = viewportAnchor()
    if (!anchor) return
    await nextTick()
    const row = document.querySelector<HTMLElement>(`[data-entry-key="${CSS.escape(anchor.key)}"]`)
    const shift = row ? row.getBoundingClientRect().top - anchor.top : 0
    if (Math.abs(shift) >= 1) window.scrollBy({ top: shift, behavior: 'instant' })
  },
)

/**
 * … but in the history entry, since 22.10.2026: Back returns to the page as
 * it was left. A reader who had opened 150 rows, read a draft and came back
 * found 50, and the position the router restores (`router.options.ts`) lay
 * beyond the end of the list — it waited out its window and dropped
 * the reader at the pager. A new visit has an entry of its own and starts at
 * the first page; so does hydration, because the server rendered that one
 * (and a reload therefore writes it back).
 */
const PAGER_STATE_KEY = 'entwuerfeVisible'
if (import.meta.client) {
  const kept: unknown = useNuxtApp().isHydrating ? null : window.history.state?.[PAGER_STATE_KEY]
  if (typeof kept === 'number' && kept > visibleCount.value) visibleCount.value = kept
  watch(visibleCount, (count) => {
    window.history.replaceState({ ...window.history.state, [PAGER_STATE_KEY]: count }, '')
  }, { immediate: true })
}

/* ------------------------------------------------------------------ *
 * The search's second half: the full text
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
  fullTextExtraEntries,
  fullTextInList,
  fullTextFilteredOut,
  fullTextCorpus,
} = await useFullTextSearch(filters, pastSpan, entries, appliedArt)

/* Both are 0 for a half that was not fetched, so the sum is what stands in
 * the list — the search placeholder may name it (never the count line,
 * `draftCountLabel`). Counted after the search (12.11.2026): the endpoints'
 * `total` no longer knows the term. */
const meTotal = computed(() => meOfView.value.length)
const risTotal = computed(() => risOfView.value.length)
/* Drafts and laws apart, never one pooled number: the
   placeholder names both where both stand in the list (10.11.2026). */
const visibleTotal = computed(() =>
  ohneApplied.value
    ? openVorlagen.value.length
    : meTotal.value + risTotal.value + landItems.value.length,
)
const visibleLaws = computed(() => lawRows.value.length + landLawRows.value.length)
const searchPlaceholder = computed(() => {
  /* No count while a half is on its way (12.11.2026): the number would
   * grow under the reader's cursor. */
  if (!gateData.value || listPending.value) return 'Entwürfe durchsuchen …'
  const parts = [
    ...(visibleTotal.value || !visibleLaws.value ? [countLabelDe(visibleTotal.value, 'Entwurf', 'Entwürfen')] : []),
    ...(visibleLaws.value ? [countLabelDe(visibleLaws.value, 'Gesetz', 'Gesetzen')] : []),
  ]
  return `In ${parts.join(' und ')} suchen …`
})

/**
 * Only stations selected that a record WITHOUT a Gegenstand at Parliament
 * cannot reach — and since 19.09.2026 there are only two of them.
 *
 * „Everything but Begutachtung" was the rule while the Verordnung half
 * appeared nowhere after the Frist. But it is kundgemacht, in part II of the
 * Bundesgesetzblatt, and „Bundesgesetzblatt"
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
/* Stations and „Verordnungsentwürfe" exclude one another: the one half has no
 * Gegenstand at Parliament, the other half is the question about it. Instead
 * of „Keine Entwürfe gefunden" — which sounds like too narrow a search term —
 * the page says in that case that the combination itself is empty, and offers
 * the way out. */
const stationConflict = computed(() => laterStationsOnly.value && art.value === 'verordnung')

/* Two reasons why the rows carry no station, and they say fundamentally
 * different things: the map was not reachable just now (temporary, our
 * fault) — or the period does not link its drafts to Vorlagen at all
 * (permanent, the archive's). Only the second case needs the
 * explanation without an active station filter too, because a whole column
 * would otherwise vanish wordlessly. */
const chainUnlinkedPeriod = computed(() => meData.value?.chainCoverage === 'unlinked')

/* Zeilen der Vorperiode, deren Frist noch läuft — beide Hälften
 * melden das für sich, und gemeldet wird nur, was das Filtern überlebt hat.
 *
 * Die Liste MUSS das sagen. Sie trägt einen sichtbaren Periodenwähler, der
 * in diesen Wochen die laufende Periode zeigt, während ein paar Zeilen aus
 * der davor stammen. Die Endpunkte lesen nur mit, wenn der
 * Aufruf gar keine Periode genannt hat — sobald jemand oben eine auswählt,
 * ist die Antwort wieder periodenrein und dieser Satz verschwindet von
 * selbst. */
/* Nach der Suche festgestellt (12.11.2026, `searchBundHalves`): die
 * Endpunkte kennen den Suchbegriff nicht mehr. */
const carriedOverFrom = computed(() =>
  /* A carried-over row is a running Frist: never under „als Initiativantrag". */
  ohneApplied.value || appliedArt.value === 'als-antrag' ? null : searched.value.carriedOverFrom,
)

/* The station map costs hundreds of fetches on a cold build and can fail
 * (`server/utils/parliament/stationMap.ts`). The page then says that nothing
 * was filtered — a list standing unfiltered under an active filter is the
 * one variant nobody notices. */
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
  () => !ohneApplied.value && stationsMissing.value && (stations.value.length > 0 || statusFilter.value === 'closed'),
)

/* Rows per kind — each set is the filtered one as it stands in the list. */
function countByKind(items: readonly { kind: RisConsultationKind }[]) {
  const counts: Partial<Record<RisConsultationKind, number>> = {}
  for (const item of items) counts[item.kind] = (counts[item.kind] ?? 0) + 1
  return counts
}

/* The rows by kind, summed over the sources (`draftCountLabel`). A half
 * still on its way is said as such (12.11.2026), never counted: a number
 * that grows a moment later was false in the moment it stood. */
/* The Art as the count line's empty term reads it: the applied option's. */
const appliedArtParam = computed(() => artChoiceParams(appliedArt.value).art)
/* The Länder whose laws the option counts: under „Landesgesetze ohne
 * zugeordneten Entwurf" every applying Land, under the rest Salzburg. */
const landLawsCounted = computed(() => (appliedArt.value === 'ohne-landesgesetz' ? landsApply.value : ohneLandsApply.value))
const countLabel = computed(() =>
  ohneApplied.value
    ? draftCountLabel({
        me: null,
        vorlagen: vorlagenForCount.value,
        ris: null,
        laterStationsOnly: false,
        art: appliedArtParam.value,
        laws: !bund.value || appliedArt.value === 'ohne-landesgesetz' ? undefined : lawsPending.value ? 'pending' : lawRows.value,
        landLaws: !landLawsCounted.value ? undefined : landLawsPending.value.length ? { pending: landLawsPending.value } : landLawRows.value,
      })
    : draftCountLabel({
      me: wantsMe.value ? meTotal.value : null,
      vorlagen: vorlagenForCount.value,
      ris: !wantsRis.value || !halvesShown.value.ris
        ? null
        : risError.value ? 'failed' : pendingHalves.value.includes('ris') ? 'pending' : countByKind(risOfView.value),
      laterStationsOnly: laterStationsOnly.value,
      art: appliedArtParam.value,
      laender: !landsApply.value || !halvesShown.value.laender
        ? null
        : pendingHalves.value.includes('laender') ? { pending: applyingLaender.value } : countByKind(landItems.value),
      /* The laws as the Länder half: on their way they are said, never
       * counted (14.11.2026); an answer without rows (`available: false`)
       * stays out of the line, the chip names its reason. */
      laws: lawsPending.value ? 'pending' : lawsInView.value && lawsData.value?.available ? lawRows.value : undefined,
      landLaws: landLawsPending.value.length ? { pending: landLawsPending.value } : landLawsInView.value && landLawsData.value ? landLawRows.value : undefined,
      antraege: antraegeForCount.value,
      treaties: treatiesForCount.value,
    }) || (landUnavailable.value ?? ''),
)

/* What „Meiste Stellungnahmen" does with the rows it cannot rank: only a
 * Ministerialentwurf carries a count in this list (`compareRowsByStatements`).
 * Keyed to the rows, not to the Art since 23.10.2026 — „Gesetzesentwürfe"
 * holds unranked rows too (the RIS half's, the Länder's), and a list of
 * nothing but Ministerialentwürfe needs no caveat. */
const statementsSortNote = computed(() => {
  if (sort.value !== 'stellungnahmen' || rows.value.every((row) => row.kind === 'me')) return null
  return rows.value.some((row) => row.kind === 'me')
    ? 'Gereiht sind nur die Ministerialentwürfe; die übrigen Zeilen folgen nach Frist.'
    : 'Diese Zeilen sind nach Frist geordnet: Stellungnahmen zählt die Liste nur bei Ministerialentwürfen.'
})

/* Selects are TokenSelect (native <select> in token styling with the
 * page-wide chevron) — see that component for why not USelect. */
</script>

<template>
  <div class="mx-auto w-full max-w-4xl">
    <header>
      <h1 class="page-title">
        Entwürfe
      </h1>
      <p class="mt-2 text-ink-secondary">
        Alle Entwürfe eines Zeitraums – in Begutachtung und
        abgeschlossen, Gesetzes- wie Verordnungsentwürfe – und die Gesetze, zu
        denen kein Entwurf in Begutachtung bekannt ist.
      </p>
      <!-- Subscribing belongs to the page, not to the list's controls
           (02.10.2026): between the count line and the rows it split the
           list from its head. It still follows the Ressort filter — choosing
           one is the moment somebody decides „dieses Ressort verfolge ich" —
           and stays outside every live region, so a screen reader does not
           read it out on each keystroke. -->
      <div class="mt-2">
        <SubscribeLinks :ministry="ministry" />
        <!-- „Wie vollständig die Länder-Entwürfe sind" stood here as a fold
             until 14.11.2026; it is one line among the state notes now
             (`LandCoverageNote`). The door to the EU map (`EuMapLink`) went the
             same day: „EU-Recht" is in the header navigation. -->
      </div>
    </header>

    <!-- NO FetchGate around the list since 23.10.2026: the box, its controls
         and its column header stand while the rows load, and the loading and
         failure states take the rows' place inside the sheet (`#state`
         below). Behind a gate a changed filter took the filters themselves
         away until the answer came. -->

    <!-- THREE LAYERS, the grammar of every list box (`ListBox`,
         02.10.2026), in the list's own sheet: „was kann ich
         tun" as tabs, a tool row that narrows (stations, the rarer filters
         behind „Filter") and searches, and the order in the column header.
         Until then five zones stood above the list — chips, three selects,
         segment and search, count and sort, subscribe links — and on a
         phone not one row was in the first viewport.
         The rule of the two zones still holds inside the head: everything
         that fixes the SET stands above the count line, the search last
         among it, because its placeholder counts what the controls before
         it left over. -->
    <h2 class="sr-only">Ergebnisse</h2>
    <EntryList
      :entries="shownEntries"
      class="mt-6"
      :sortable="SORT_COLUMNS"
      :sort="sort"
      :reversed="reversed"
      :query="qDebounced"
      :stale="refreshing"
      @update:sort="chooseSort"
    >
      <!-- WHERE IT STANDS as the tabs (02.10.2026): the stations are the
             axis this product is about — what became of a draft — and the
             most prominent control in the box belongs to it. Single-select,
             a reversal of the earlier multi-select chips: tabs that hold
             several values are no tabs. A shared link naming several
             stations still works and says so as a tab of its own. No counts,
             unlike the Stellungnahmen: each would be one pooled total over
             Ministerialentwürfe and Verordnungsentwürfe. Five tabs
             do not fit a phone, so below `sm` they are a select. Gone where
             the period cannot answer the question: the slot
             itself goes, so the box draws no empty tab row. -->
      <template v-if="!chainUnlinkedPeriod" #tabs>
        <ListTabs
          v-model="stationTab"
          :options="stationTabs"
          group-label="Wo steht es"
          collapse
        />
      </template>
      <!-- The tool row, `ListBox`'s `header`: it brings the column, the
           gaps and the inset the head drew here itself until 03.10.2026. -->
      <template #header>
        <!-- Where the rows come from (`SourceChips`), on a line of its
             own: ten chips do not fit beside the selects. FIRST in the
             head since 30.10.2026, as in every homepage box: the sources
             decide which rows exist at all, the filters below narrow
             them — and the chips stand in the same place on both pages. -->
        <SourceChips :unavailable="sourceUnavailable" />
        <GapNote v-if="lawsUnreadable" kind="unavailable" text="die Gesetze des Bundes ohne Entwurf." class="text-sm text-ink-muted" />
        <p v-if="lawsReachNote" class="text-sm text-ink-muted">
          {{ lawsReachNote }}
        </p>
        <GapNote
          v-for="s in unreadableLandLaws"
          :key="`gesetze-${s.land}`"
          kind="unavailable"
          :text="'die Gesetze ' + (s.land === 'w' ? 'Wiens' : 'des Landes ' + LAND_NAME[s.land]) + ' ohne zugeordneten Entwurf.'"
          class="text-sm text-ink-muted"
        />
        <GapNote v-for="s in unreadableLaender" :key="s.land" kind="unavailable" class="text-sm text-ink-muted">
          {{ LAND_NAME[s.land] }}<template v-if="s.listUrl"> –
            <ExternalLink :href="s.listUrl" class="link-inline font-medium">beim Land nachsehen</ExternalLink></template>.
        </GapNote>
        <div class="flex flex-wrap items-center gap-2">
          <!-- „Was kann ich tun", reduced to its one value that matters:
               the question people arrive with, and the filter
               the homepage's sections link through
               (`?status=open&station=begutachtung`, `…&station=rv`).
               „Nicht möglich" was only the rest; it survives as a chip
               for old links (`activeFilterChips`). Unavailable, not hidden,
               under „Bundesgesetzblatt", where the combination is empty
               by what the station means (`OPEN_UNAVAILABLE`; under
               „Parlament" no longer since 03.10.2026, the window runs
               through the Bundesrat). How on, off and unavailable are
               drawn: `ToggleChip`, shared with the Länder since
               22.10.2026. -->
          <ToggleChip :pressed="wantsOpen" :unavailable="openUnavailable" @toggle="toggleOpen">
            Stellungnahme möglich
          </ToggleChip>
          <!-- What the draft does with EU law: the same kind of
               control, beside it — a property of the draft that narrows the
               set. Never unavailable: every station and Art can hold a
               draft that implements a directive. -->
          <ToggleChip :pressed="eu === 'umsetzung'" @toggle="toggleEu">
            Setzt EU-Recht um
          </ToggleChip>
          <!-- „Ohne Entwurf" stood here as a third chip until 14.11.2026;
               it is a group of the select „Art" now (`ART_CHOICES`). -->
          <!-- Art, period and Ressort stand in the same line from `md`
               up (03.10.2026), each select stating its own value; on a
               phone four selects cannot share a line, so they open with
               „Filter" and state their values as chips below while
               closed — a shared link never hides an active filter. -->
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-sliders-horizontal"
            class="shrink-0 md:hidden"
            :aria-expanded="filtersOpen"
            aria-controls="filter-more-panel"
            @click="filtersOpen = !filtersOpen"
          >
            Filter
            <span
              v-if="moreFilters"
              class="rounded-full bg-ink px-2 py-0.5 text-xs font-medium text-surface"
            >{{ moreFilters }}<span class="sr-only"> aktiv</span></span>
          </UButton>
          <!-- Set widths and `block` selects: a native <select> sizes
               itself by its LONGEST option, so the widths are set here.
               From `md` up the selects take a line of their own (since
               09.11.2026): with two chips beside them the old shared line
               needed ~740 px before the Ressort got any, and the panel —
               flex-1, basis 0 — overflowed the box instead of wrapping.
               Now 240 + 288 px, and the Ressort fills the rest, so the
               line ends where the search below ends. The 288 px hold the
               longest span label („23.10.2019 – 23.10.2024 (GP XXVII)",
               230 px of text at 14 px plus the select's 50 px of padding
               and border, measured 14.11.2026) — and the same 288 px is
               the whole line of a 320 px phone, where the panel stacks. -->
          <div
            id="filter-more-panel"
            class="w-full gap-2 md:flex md:items-center"
            :class="filtersOpen ? 'grid grid-cols-1' : 'hidden'"
          >
            <div class="min-w-0 md:w-60 md:shrink-0">
              <label for="filter-art" class="sr-only">Art</label>
              <!-- Native <optgroup>s through the slot (14.11.2026): „Mit
                   Entwurf" and „Ohne Entwurf" in the path graphic's words.
                   An option that cannot be offered stands disabled and
                   names its reason after the label (`artSelectFor`); when a
                   link asks for it, the long reason is the note above the
                   rows (`artNote`). -->
              <TokenSelect id="filter-art" v-model="chosenArt" block>
                <template v-for="group in artSelect" :key="group.label ?? 'alle'">
                  <optgroup v-if="group.label" :label="group.label">
                    <TokenOption v-for="opt in group.options" :key="opt.value" :value="opt.value" :disabled="opt.disabled">
                      {{ opt.label }}
                    </TokenOption>
                  </optgroup>
                  <template v-else>
                    <TokenOption v-for="opt in group.options" :key="opt.value" :value="opt.value" :disabled="opt.disabled">
                      {{ opt.label }}
                    </TokenOption>
                  </template>
                </template>
              </TokenSelect>
            </div>
            <!-- A time span with a name (14.11.2026): the Bund's GP, one
                 Land's own period, or the dates alone — the sources decide
                 (`spanOptionsFor`). The Länder rows fall into it by the day
                 their Begutachtung began, so every option states the dates
                 the filter uses instead of a note explaining the rule.
                 Values: the GP code (`?gp=`), a Land period's `sbg-17`
                 (`?landtag=`). -->
            <div class="min-w-0 md:w-72 md:shrink-0">
              <label for="filter-gp" class="sr-only">Zeitraum</label>
              <TokenSelect id="filter-gp" v-model="spanSelect" block>
                <TokenOption v-for="opt in spanOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </TokenOption>
              </TokenSelect>
            </div>
            <!-- The Ressort takes the rest of the line, so the filters end
                 where the search below ends; its names are the longest. -->
            <div class="min-w-0 md:flex-1">
              <label for="filter-ministry" class="sr-only">Ministerium</label>
              <!-- Off with the Bund: a Land's draft has no Ministerium; and
                   under „Ohne Entwurf" its rows carry none. -->
              <TokenSelect
                id="filter-ministry"
                v-model="ministry"
                block
                :unavailable="ministryUnavailable"
              >
                <TokenOption value="">Alle Ministerien</TokenOption>
                <TokenOption v-for="m in ministries" :key="m.code" :value="m.code">
                  {{ m.name || m.code }}
                </TokenOption>
              </TokenSelect>
            </div>
          </div>
        </div>
        <GapNote
          v-if="unreadStageCount"
          kind="unavailable"
          :text="`der weitere Weg bei ${formatNumberDe(unreadStageCount)} Länder-${unreadStageCount === 1 ? 'Entwurf' : 'Entwürfen'}; nach Station sind sie hier nicht eingeordnet.`"
          class="text-sm text-ink-muted"
        />
        <!-- What the closed panel holds, each removable in one press —
             on a phone; from `md` up the selects state it themselves,
             and only the status chip of an old link stands here. -->
        <div
          v-if="shownFilterChips.length"
          class="flex flex-wrap items-center gap-2"
          :class="!shownFilterChips.some((f) => f.key === 'status') && 'md:hidden'"
        >
          <UButton
            v-for="f in shownFilterChips"
            :key="f.key"
            size="sm"
            color="neutral"
            variant="subtle"
            trailing-icon="i-lucide-x"
            class="rounded-full"
            :class="f.key !== 'status' && 'md:hidden'"
            @click="clearChip[f.key]()"
          >
            {{ f.label }}<span class="sr-only"> – Filter entfernen</span>
          </UButton>
        </div>
        <!-- The search on a line of its own, the whole width, last among
             what fixes the set: its placeholder counts what the controls
             above it left over. -->
        <UInput
          v-model="q"
          type="search"
          :maxlength="MAX_LIST_QUERY_CHARS"
          icon="i-lucide-search"
          :placeholder="searchPlaceholder"
          aria-label="Entwürfe durchsuchen"
          class="w-full"
          :ui="{ base: 'min-h-target' }"
        />
        <!-- The count line, the boundary between the zones: above it what
             fixes the set, here how it is read. On a phone, where no
             column header is drawn, the order is a select beside it. -->
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <!-- Fades with the rows while they refresh: it counts the same
               stale answer. The live region announces the new count. -->
          <p class="stale-fade text-sm text-ink-muted" aria-live="polite" :data-stale="refreshing || undefined">
            {{ gateData ? countLabel : '' }}
          </p>
          <div class="flex min-w-0 items-center gap-2 md:hidden">
            <label for="filter-sort" class="shrink-0 text-sm text-ink-secondary">Sortieren</label>
            <TokenSelect id="filter-sort" v-model="sortSelect">
              <TokenOption v-for="opt in sortOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </TokenOption>
            </TokenSelect>
          </div>
        </div>
        <!-- Above the rows, like every other statement about what the list is
               doing: read afterwards it is worthless. -->
        <!-- THE NOTES ABOVE THE ROWS state, they do not explain
             (14.11.2026, docs/decisions.md „The list's notes"): each says,
             in one sentence, what is true of the list now and differs from
             what its controls claim. What a row's label means opens on that
             row's page, at the term; what the list leaves out by design is
             its „Methode" at the foot. The paragraphs on what „ohne
             Begutachtung" rests on (Bund, Salzburg) went that day: to the
             Vorlage's and the Landesgesetz's pages (`TERMS`), the Budgetgesetze
             to the Methode. -->
        <!-- An option of „Art" a link asked for that cannot apply here. -->
        <p v-if="artNote" class="text-sm text-ink-muted">
          {{ artNote }}
        </p>
        <p v-if="carriedOverFrom" class="text-sm text-ink-muted">
          Darunter Entwürfe der {{ carriedOverFrom }}. Gesetzgebungsperiode, deren
          Begutachtungsfrist noch läuft.
        </p>
        <!-- The chosen Länder that cannot answer the question, by name:
             their laws are gone from the rows, and a gap never reads as an
             empty result (`ohneSilentLaender`, `landLawsBeyondReach`). -->
        <GapNote v-if="ohneSilentNote" :text="ohneSilentNote" class="text-sm text-ink-muted" />
        <p v-if="beyondReachNote" class="text-sm text-ink-muted">
          {{ beyondReachNote }}
        </p>
        <GapNote v-if="ohneUnreadNote" kind="unavailable" :text="ohneUnreadNote" class="text-sm text-ink-muted" />
        <GapNote v-for="note in antragNotes" :key="note" :text="note" class="text-sm text-ink-muted" />
        <GapNote v-for="note in treatyNotes" :key="note" :text="note" class="text-sm text-ink-muted" />
        <!-- The applying Länder the list does not hold in full, each linked
             to its block on /datenlage (`LandCoverageNote`, the homepage's
             too), Kärnten's undated drafts by their live count. -->
        <LandCoverageNote :lands="applyingLaender" :undated-ktn="laenderData?.undated?.ktn" />
        <!-- Like the sort caveat below it: a statement about what the list is
               NOT doing stands above the rows — read afterwards it is
               worthless. -->
        <GapNote v-if="stationsUnavailable" kind="unavailable" class="text-sm text-ink-muted">
          <template v-if="stations.length">wo die Entwürfe stehen; die Liste ist <span class="font-medium text-ink">nicht</span>
            nach Station gefiltert.</template><template v-else>wo die Entwürfe
            stehen.</template><template v-if="statusFilter === 'closed'">
            „Nicht möglich“ heißt hier nur: Frist abgelaufen – zu einzelnen
            Regierungsvorlagen ist im Nationalrat noch eine Stellungnahme möglich.</template>
        </GapNote>
        <!-- The EU map's gap, in the stations' register and place: the list
             stands unfiltered and says so (`euUnavailable`). -->
        <GapNote v-if="euUnavailable" kind="unavailable" class="text-sm text-ink-muted">
          welche Entwürfe<template v-if="euUnavailable === 'bund'"> des Bundes</template><template
            v-else-if="euUnavailable === 'laender'"
          > der Länder</template> EU-Recht umsetzen;
          <template v-if="euUnavailable === 'alle'">die Liste ist <span class="font-medium text-ink">nicht</span> danach gefiltert.</template><template
            v-else
          >sie stehen <span class="font-medium text-ink">ungefiltert</span> in der Liste.</template>
        </GapNote>
        <!-- The gap is named rather than passed off as a finding: without this
               sentence a list without stations would read as if nothing had ever
               become of any of these drafts. -->
        <p v-if="chainUnlinkedPeriod" class="text-sm text-ink-muted">
          Für diese Gesetzgebungsperiode ist nicht erfasst, welche
          Regierungsvorlage auf welchen Entwurf folgte, die Zeilen zeigen deshalb
          keine Station – dass es keine Regierungsvorlagen gab, folgt daraus
          <span class="font-medium text-ink">nicht</span>.<template v-if="stations.length">
            Nach Station ist die Liste <span class="font-medium text-ink">nicht</span>
            gefiltert.</template>
        </p>
        <!-- Only for the combination that leaves NO row: „Verordnungsentwürfe"
             with a station they cannot reach. The tabs no longer offer it
             (unavailable, with this reason), so only an old link lands
             here, and an empty list must say why.
             The sentence that stood under the later stations at every Art
             („Verordnungsentwürfe stehen hier nicht …") went on 03.10.2026:
             the unavailable tabs carry it, and the count line names only
             the kinds that are in the list. -->
        <p v-else-if="stationConflict" class="text-sm text-ink-muted">
          <span class="font-medium text-ink">Verordnungsentwürfe erreichen diese
            Station nicht</span> – „Alle Arten" oder
          <button
            type="button"
            class="tap-target link-inline font-medium"
            @click="stations = []"
          >alle Stationen</button>
          zeigen wieder Zeilen.
        </p>
        <!-- What the sort order does with the half it cannot sort — above the
               list, not below it: a caveat on what the order claims has to be read
               before the rows are. -->
        <p v-if="statementsSortNote" class="text-sm text-ink-muted">
          {{ statementsSortNote }}
        </p>
        <!-- THE SEARCH'S LIMIT, at the place where it affects somebody: under
               these filters ONLY the title was searched, because the full text
               knows nothing that is not currently running. Above the list, like
               every other statement about what it is not doing. -->
        <p
          v-if="qDebounced.length >= FULLTEXT_MIN_LEN && !fullTextApplies"
          class="text-sm text-ink-muted"
        >
          Unter diesen Filtern ist <span class="font-medium text-ink">nicht</span>
          in den Dokumenten gesucht, nur in Titel, Zitat, Debattennamen und
          Ressortkürzel.
        </p>
      </template>
      <!-- Only the rows hit by the full text TOO carry evidence: the gain
           on a row that is there anyway („das Wort steht in § 6") instead of
           a second row for the same draft. -->
      <template #evidence="{ entry }">
        <SearchEvidence :hit="hitByKey.get(entry.key)" />
      </template>
      <!-- The gate's two answers before there are rows, in the sheet's
           grammar: `status === pending && !data` as in `FetchGate`, so a
           refresh keeps the rows the reader is looking at. -->
      <!-- And while the rows that came are none but a half is still on its
           way (12.11.2026): „Keine Entwürfe gefunden" would be a claim the
           late half may falsify a second later. -->
      <!-- The laws count as such a half (14.11.2026, `listPending`). -->
      <template v-if="!gateData || (!entries.length && listPending)" #state>
        <LoadingState
          v-if="gateData || gateStatus === 'pending' || gateStatus === 'idle'"
          label="Entwürfe werden geladen …"
        />
        <ListBoxNotice
          v-else
          role="alert"
          title="Entwürfe: gerade nicht abrufbar"
          description="Die Quelle hat nicht geantwortet."
        >
          <template #action>
            <UButton color="primary" @click="retry()">Erneut versuchen</UButton>
          </template>
        </ListBoxNotice>
      </template>
      <!-- Not under a station conflict: the sentence in the head already
           says that the combination itself is empty, and how out. -->
      <!-- EMPTY LIST, BUT NOT AN EMPTY PAGE: while the full text below is
           still answering, the „Keine Entwürfe gefunden" notice would be a
           claim about an answer that does not exist yet. One line then says
           what the title search returned (the notice without a title), and
           the block below says the rest.
           The description names the four fields instead of saying „Titel":
           „Klimaschutz" returns nine rows here, all of them through the
           RESSORT NAME (BMK) and none through a document — whoever believes
           the title is searched takes that for a title hit. -->
      <template v-if="!stationConflict" #empty>
        <ListBoxNotice
          :title="fullTextActive ? undefined : 'Keine Entwürfe gefunden'"
          :description="fullTextActive ? undefined : qDebounced
            ? 'Dieses Feld durchsucht Titel, Zitat, Debattennamen und Ressortkürzel. Nach dem Ressort filtert „Filter“ daneben.'
            : 'Andere Filter oder einen anderen Suchbegriff versuchen.'"
        >
          <p v-if="fullTextActive" class="text-base text-ink-secondary">
            Kein Titel, kein Zitat, kein Debattenname und kein Ressortkürzel
            trägt „{{ qDebounced }}“.
          </p>
          <!-- The one place the question arises (30.09.2026): it stood under
               every draft page, where nobody who found the draft needs it.
               Here it answers a search that found nothing. -->
          <p v-if="qDebounced" class="mt-3 text-ink-secondary">
            Heißt der Entwurf in der Debatte anders? Hinweise an
            <a href="mailto:kontakt@begutachtungs-monitor.at" class="link-inline">kontakt@begutachtungs-monitor.at</a>
            – die Suche findet ihn dann auch unter diesem Namen.
          </p>
        </ListBoxNotice>
      </template>
      <!-- The pager as the sheet's foot row, as in the Stellungnahmen
           panel (03.10.2026). -->
      <template #foot>
        <ListMore
          v-if="entries.length"
          :visible="visibleCount"
          :total="entries.length"
          :step="LIST_PAGE_SIZE"
          @more="showMore()"
          @all="showAll()"
        />
      </template>
    </EntryList>
    <!-- NO source line of its own, for the homepage's reason (03.10.2026):
         rows are facts, not documents, nothing is marked by us here, and the
         footer's „Datenquellen und Lizenzen im Impressum" link is the page's
         attribution. But the list's „Methode" (14.11.2026): what it leaves
         out by design and how a row gets its span — the credit line's last
         item, alone, so it opens in place as on every other section
         (`SectionCredits` with no sources and nothing marked). Right under
         the list it belongs to, above the full-text block. -->
    <SectionCredits :sources="[]" :marked="false">
      <template #method>
        <MethodEntwurfsliste />
      </template>
    </SectionCredits>
    <!-- THE SAME FIELD'S SECOND ANSWER. Its
         own section with its own heading, never mixed into the list: the
         list searches a whole Gesetzgebungsperiode by title, this block the
         documents of what is open today. -->
    <section v-if="gateData && fullTextActive" class="mt-8">
      <!-- An h2 in the outline, the sub-heading's face on the page
           (02.10.2026): it heads a block under the results, as the h3 of a
           draft page's section does. In the serif it was a third heading
           style. -->
      <h2 class="font-sans text-base font-semibold text-ink">
        Außerdem im Volltext der laufenden Begutachtungen des Bundes
      </h2>
      <!-- The asterisk is explained here and not at the field: it applies
           to THIS half — RIS searches whole words, the list above searches
           substrings. A usage note belongs with what it changes. -->
      <p class="mt-1 text-sm text-ink-muted">
        Alle Dokumente eines Entwurfs des Bundes – Text, Erläuterungen,
        Gegenüberstellung, Anhänge. Gesucht werden ganze Wörter,
        <code>Klima*</code> findet auch zusammengesetzte.<template v-if="landsApply"> In den Dokumenten der Länder sucht der Monitor nicht, nur in ihren Titeln.</template>
      </p>

      <LoadingState v-if="fullTextPending" label="Im Volltext wird gesucht …" />
      <!-- AN ERROR IS NOT AN ANSWER: „kommt
           nicht vor" would be this product's most expensive lie. -->
      <GapNote v-else-if="fullTextError" kind="unavailable" text="die Volltextsuche im RIS. Die Liste oben ist davon nicht betroffen." class="mt-3 text-sm text-ink-secondary" />
      <template v-else-if="fullText">
        <EntryList v-if="fullTextExtraEntries.length" :entries="fullTextExtraEntries" :query="qDebounced" class="mt-3">
          <template #evidence="{ entry }">
            <SearchEvidence :hit="hitByKey.get(entry.key)" />
          </template>
        </EntryList>
        <p v-else-if="fullTextInList" class="mt-3 text-sm text-ink-secondary">
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
          class="mt-3 text-sm text-ink-secondary"
        >
          „{{ qDebounced }}“ kommt in den Dokumenten {{ fullTextCorpus }}
          nicht vor. Das Archiv bis 2004 durchsucht das
          <ExternalLink href="https://www.ris.bka.gv.at/Begut/">RIS selbst</ExternalLink>.
        </p>
        <p v-if="fullTextFilteredOut" class="mt-3 text-sm text-ink-secondary">
          <span class="font-medium text-ink">Ausgeblendet:</span>
          {{ countLabelDe(fullTextFilteredOut, 'laufende Begutachtung', 'laufende Begutachtungen') }},
          die „{{ qDebounced }}“ im Volltext
          {{ fullTextFilteredOut === 1 ? 'führt' : 'führen' }} – Art oder Ressort
          schließen sie aus.
          <button
            type="button"
            class="tap-target link-inline font-medium"
            @click="chosenArt = ''; ministry = ''"
          >Alle Arten und Ressorts</button>
          zeigen sie.
        </p>
      </template>
    </section>

  </div>
</template>
