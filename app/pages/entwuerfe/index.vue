<script setup lang="ts">
import type { DraftStation } from '#shared/types'
import { LAND_NAME } from '#shared/utils/laender'
import { earliestSpanDay, landtagParts, landtagValue, orderedRange, weekStartOf } from '#shared/utils/periodCalendar'
import { formatNumberDe, todayIso } from '#shared/utils/format'
import {
  artSelectFor,
  artOptionReasonsFor,
  OHNE_MINISTRY_REASON,
  type FilterChipKey,
  type SortKey,
  activeFilterChips,
  countLabelHasGap,
  spanOptionsFor,
  CUSTOM_SPAN_OPTION,
  CUSTOM_SPAN_VALUE,
  stationTabsFor,
} from '~/utils/draftFilters'
import { cutKeeping } from '~/utils/pagedList'
import { MAX_LIST_QUERY_CHARS } from '#shared/utils/queryParams'
import { gapLabelDe } from '#shared/utils/gaps'
import type { ListBoxStatus } from '~/utils/listState'
import MethodEntwurfsliste from '~/components/method/MethodEntwurfsliste.vue'

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
    'Alle Gesetzes- und Verordnungsentwürfe des Bundes und der Länder, in Begutachtung und abgeschlossen, und die Gesetze, zu denen kein Entwurf in Begutachtung bekannt ist – filterbar nach Station, Zeitraum, Ministerium und EU-Bezug.',
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

/* Where the rows come from (`useSourceChoice`) — read before the filters
 * since 14.11.2026: which time spans the list offers depends on it
 * (`periodViewFor`). The rest of the rule is written further down, where
 * the Länder rows are built. */
const contact = useContact()
const { bund, laender: chosenLaender } = useSourceChoice()

/* Filter state, URL binding and the query for both endpoints:
 * `useDraftFilters`, with the pure half in `app/utils/draftFilters.ts`. */
const filters = useDraftFilters({ bund, laender: chosenLaender })
const { statusFilter, art, gp, landtag, von, bis, customSpan, periodView, span, laenderSpan, ministry, q, qDebounced, sort, reversed, stations, eu, begutachtung, query, urlQueryWith, onNavigate } = filters
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

/* The station tabs, one selected at most (`stationTabsFor` says why two
 * stand unavailable under „Verordnungsentwürfe"). */
const stationTabs = computed(() => stationTabsFor(art.value))

const stationTab = computed<string>({
  get: () => stations.value[0] ?? '',
  set: (value) => {
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
  () => Number(chosenArt.value !== '') + Number(eu.value !== '') + Number(span.value.gp !== '' || span.value.landtag !== '') + Number(ministry.value !== ''),
)
const filtersOpen = ref(false)

/** The closed panel's values; `clearChip` is the press that removes each. */
const activeFilters = computed(() =>
  activeFilterChips({
    status: statusFilter.value,
    art: art.value,
    begutachtung: begutachtung.value,
    ...span.value,
    von: customSpan.value ? von.value : '',
    bis: customSpan.value ? bis.value : '',
    ministry: ministry.value,
    eu: eu.value,
  }, periodView.value),
)
const clearChip: Record<FilterChipKey, () => void> = {
  status: () => { statusFilter.value = 'all' },
  art: () => { chosenArt.value = '' },
  eu: () => { eu.value = '' },
  gp: () => { gp.value = '' },
  landtag: () => { landtag.value = '' },
  zeitraum: () => { von.value = ''; bis.value = '' },
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

/* The rows for the filters as they stand, and what the list says about
 * them (`useDraftList`, 17.11.2026): shared with the site search, so its
 * counts are this list's. */
const list = useDraftList(filters, { bund, laender: chosenLaender })
const {
  antragNotes,
  appliedArt,
  applyingLaender,
  artAnswers,
  artNote,
  artSources,
  availableGps,
  beyondReachNote,
  carriedOverFrom,
  chainUnlinkedPeriod,
  chosenArt,
  countLabel,
  entries,
  euUnavailable,
  gateData,
  gateStatus,
  laenderData,
  landsApply,
  latePending,
  lawsReachNote,
  lawsUnreadable,
  listPending,
  ministriesFetched,
  ohneApplied,
  ohneSilentNote,
  ohneUnreadNote,
  otherStationPointer,
  othersInView,
  pastSpan,
  refreshing,
  retry,
  rows,
  selectedGp,
  sourceUnavailable,
  stationConflict,
  stationsUnavailable,
  treatyNotes,
  unreadStageCount,
  unreadableLaender,
  unreadableLandLaws,
  visibleLaws,
  visibleTotal,
  withoutDraftGap,
} = list
await list.ready

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
/* „Eigener Zeitraum" first (18.11.2026, maintainer's decision): at the end
 * of some fifteen periods back to 1975 nobody found it. */
const spanOptions = computed(() => [CUSTOM_SPAN_OPTION, ...spanOptionsFor(periodView.value, availableGps.value, selectedGp.value)])
/* The select's one value over both kinds: a Land period's `sbg-17`, else the
 * GP. In a Land's view nothing chosen is that Land's running period — the
 * default, as the running GP is the Bund's (`laenderSpanQuery`). */
/* „Eigener Zeitraum" (18.11.2026) is one more value of the same select: a
 * span by two dates instead of a period's name, so a period and a span of
 * the reader's own can never be chosen at once and intersect into an empty
 * list. Choosing it opens the date fields with the running calendar week;
 * choosing a period again drops the dates. */
const spanSelect = computed<string>({
  get: () => {
    if (customSpan.value) return CUSTOM_SPAN_VALUE
    const view = periodView.value
    if (view.mode !== 'land') return selectedGp.value
    return span.value.landtag || span.value.gp || landtagValue(view.land, view.periods[0]!.id)
  },
  set: (value) => {
    if (value === CUSTOM_SPAN_VALUE) {
      bis.value = ''
      von.value = weekStartOf(todayIso())
      return
    }
    von.value = ''
    bis.value = ''
    if (landtagParts(value)) {
      landtag.value = value
      gp.value = ''
    } else {
      selectedGp.value = value
      landtag.value = ''
    }
  },
})
/* The span the calendar hands back (`DateRangeButton`): both ends at once,
 * `bis` '' for open-ended. Ends the wrong way round are turned round
 * (`orderedRange`), as a link's are; without a start nothing changes, since
 * leaving the span is the select's job. */
const SPAN_MIN_DAY = earliestSpanDay()
function setSpan(span: { von: string; bis: string }): void {
  const next = orderedRange(span.von, span.bis)
  if (!next.von) return
  von.value = next.von
  bis.value = next.bis
}
/* The part of the span before the period it is shown in (`CustomSpan.cut`):
 * named and linked, never dropped in silence (`SpanCutNote`). */
const spanCut = computed(() => {
  const c = customSpan.value
  if (!c?.cut) return null
  return { span: { ...c, cut: c.cut }, to: { query: urlQueryWith({ von: c.cut.from, bis: c.cut.to ?? '' }) } }
})
const artSelect = computed(() => artSelectFor({
  chosen: chosenArt.value,
  others: othersInView.value,
  landSelected: landsApply.value,
  unavailable: artOptionReasonsFor(artSources.value, artAnswers.value),
}))
/* The Ressort select's reason where it cannot be used (`TokenSelect`). */
const ministryUnavailable = computed(() =>
  !bund.value ? 'Nur für Entwürfe des Bundes' : ohneApplied.value ? OHNE_MINISTRY_REASON : null,
)
/** What the list's box says before it has rows (`ListBoxState`). */
const LIST_DE = {
  loading: 'Entwürfe werden geladen …',
  failed: { text: gapLabelDe('Entwürfe', 'unavailable'), description: 'Die Quelle hat nicht geantwortet.' },
} as const
/*
 * The gate's two answers before there are rows, in the sheet's grammar
 * (`ListBoxState`): `status === pending && !data` as in `FetchGate`, so a
 * refresh keeps the rows the reader is looking at. And while the rows that
 * came are none but a half is still on its way (12.11.2026; the laws count
 * as one since 14.11.2026, `listPending`): „Keine Entwürfe gefunden" would
 * be a claim the late half may falsify a second later.
 */
const listState = computed<ListBoxStatus>(() => {
  if (gateData.value && (entries.value.length || !listPending.value)) return null
  if (gateData.value || gateStatus.value === 'pending' || gateStatus.value === 'idle') return { loading: LIST_DE.loading }
  return { failed: LIST_DE.failed }
})

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
} = await useFullTextSearch(
  filters,
  /* The full text knows the running Begutachtungen of any date: under a span
   * of the reader's own its hits would stand beside a list that excludes
   * them, so only the titles are searched there, and the list says so. */
  computed(() => pastSpan.value || !!customSpan.value),
  entries,
  appliedArt,
)

/**
 * The count line on a phone (25.11.2026): past two terms it folds to the
 * drafts and laws the list holds — the search's own two numbers, never one
 * pooled figure — and opens to the breakdown. At five lines it stood
 * between the search and the first row. A line that says part of the list
 * is missing never folds (`countLabelHasGap`); from `md` up it always
 * stands in full.
 */
const countFolds = computed(() =>
  !listPending.value && countLabel.value.split(' · ').length > 2 && !countLabelHasGap(countLabel.value),
)
const countSummary = computed(() => [
  ...(visibleTotal.value || !visibleLaws.value ? [countLabelDe(visibleTotal.value, 'Entwurf', 'Entwürfe')] : []),
  ...(visibleLaws.value ? [countLabelDe(visibleLaws.value, 'Gesetz', 'Gesetze')] : []),
].join(' · '))

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
      :state="listState"
      @update:sort="chooseSort"
      @retry="retry()"
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
          <!-- From `md` up only (25.11.2026): on a phone it stands first in
               the panel below, so „Stellungnahme
               möglich" and „Filter" share one line. The phone's copy is
               the same control, and the closed panel states it as a chip. -->
          <div class="hidden md:contents">
            <ToggleChip :pressed="eu === 'umsetzung'" @toggle="toggleEu">
              Setzt EU-Recht um
            </ToggleChip>
          </div>
          <!-- „Ohne Entwurf" stood here as a third chip until 14.11.2026;
               it is a group of the select „Art" now (`ART_CHOICES`). -->
          <!-- Art, period and Ressort stand in the same line from `md`
               up (03.10.2026), each select stating its own value; on a
               phone four selects cannot share a line, so they open with
               „Filter" and state their values as chips below while
               closed — a shared link never hides an active filter. -->
          <UButton
            color="neutral"
            :variant="moreFilters ? 'subtle' : 'outline'"
            class="shrink-0 md:hidden"
            :class="moreFilters && 'ring-ink'"
            :aria-expanded="filtersOpen"
            aria-controls="filter-more-panel"
            @click="filtersOpen = !filtersOpen"
          >
            <!-- The „Länder" button's grammar (25.11.2026): drawn as a
                 ticked chip while something is chosen (tinted ground and
                 ink ring, 26.11.2026), a chevron that turns when open,
                 no leading icon. Before, open and closed looked alike; and
                 with the chevron the sliders icon pushed the button off the
                 line of „Stellungnahme möglich" at 390 px. -->
            Filter
            <span
              v-if="moreFilters"
              class="rounded-full bg-ink px-2 py-0.5 text-xs font-medium text-surface"
            >{{ moreFilters }}<span class="sr-only"> aktiv</span></span>
            <UIcon
              name="i-lucide-chevron-down"
              class="size-4 shrink-0 text-ink-muted transition-transform"
              :class="filtersOpen && 'rotate-180'"
              aria-hidden="true"
            />
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
            class="w-full gap-2 md:flex md:flex-wrap md:items-center"
            :class="filtersOpen ? 'grid grid-cols-1' : 'hidden'"
          >
            <!-- The phone's „Setzt EU-Recht um", first in the panel, right
                 under „Stellungnahme möglich" (25.11.2026): chips together,
                 then the selects — a chip between full-width selects broke
                 the column. A wrapper so the grid cell does not stretch it. -->
            <div class="md:hidden">
              <ToggleChip :pressed="eu === 'umsetzung'" @toggle="toggleEu">
                Setzt EU-Recht um
              </ToggleChip>
            </div>
            <!-- A time span with a name (14.11.2026): the Bund's GP, one
                 Land's own period, or the dates alone — the sources decide
                 (`spanOptionsFor`). The Länder rows fall into it by the day
                 their Begutachtung began, so every option states the dates
                 the filter uses instead of a note explaining the rule.
                 Values: the GP code (`?gp=`), a Land period's `sbg-17`
                 (`?landtag=`).
                 „Eigener Zeitraum" turns this cell into the range editor in
                 place (18.11.2026, `SpanSelect`, shared with /anliegen).
                 First of the panel since 25.11.2026: it fixes which rows
                 exist (the list is fetched per period, and the sources
                 decide its options), while Art and Ministerium narrow them. -->
            <SpanSelect
              id="filter-gp"
              v-model="spanSelect"
              label="Zeitraum"
              :options="spanOptions"
              :span="customSpan ? { von, bis } : null"
              :min="SPAN_MIN_DAY"
              class="min-w-0 md:w-72 md:shrink-0"
              @span="setSpan"
            />
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
        <!-- A span over a Periodenwechsel shows its part in the later period
             (`customSpanOf`); the part before is named and one press away. -->
        <SpanCutNote v-if="spanCut" :span="spanCut.span" :to="spanCut.to" class="text-sm text-ink-muted" />
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
        <!-- On a phone, where no column header is drawn, the order is a
             select right under the search (25.11.2026): with the controls,
             not after the count line, which could push it five lines down.
             No visible „Sortieren": the column headers' sort arrows say it,
             so the phone and the desktop draw the order alike; the hidden
             label still names the control. -->
        <div class="md:hidden">
          <label for="filter-sort" class="sr-only">Sortieren</label>
          <!-- Full width, like every control above it on a phone. -->
          <TokenSelect id="filter-sort" v-model="sortSelect" icon="i-lucide-arrow-up-down" block>
            <TokenOption v-for="opt in sortOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </TokenOption>
          </TokenSelect>
        </div>
        <!-- The count line, the boundary between the zones: above it what
             fixes the set, here how it is read. Fades with the rows while
             they refresh: it counts the same stale answer. The live region
             announces the new count. On a phone a long line folds
             (`countFolds`). -->
        <div class="stale-fade text-sm text-ink-muted" aria-live="polite" :data-stale="refreshing || undefined">
          <template v-if="gateData">
            <Disclosure v-if="countFolds" tone="muted" class="md:hidden">
              <template #summary>
                {{ countSummary }}<span class="sr-only"> – nach Art aufschlüsseln</span>
              </template>
              <p class="pb-1">
                {{ countLabel }}
              </p>
            </Disclosure>
            <p :class="countFolds && 'hidden md:block'">
              {{ countLabel }}
            </p>
          </template>
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
        <!-- The other Parliament tab's rows under the same filters
             (`otherStationPointer`, 16.11.2026): first among the notes,
             right under the count it continues. A standalone „… →" link,
             so quiet at rest like every other one (main.css); the whole
             line is its name. -->
        <p v-if="otherStationPointer" class="text-sm">
          <NuxtLink :to="otherStationPointer.to" class="tap-target font-medium link-quiet">
            {{ otherStationPointer.text }}<span aria-hidden="true">&nbsp;→</span>
          </NuxtLink>
        </p>
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
        <GapNote v-if="withoutDraftGap" :text="withoutDraftGap" class="text-sm text-ink-muted" />
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
          Kürzel des Ministeriums.
        </p>
      </template>
      <!-- Only the rows hit by the full text TOO carry evidence: the gain
           on a row that is there anyway („das Wort steht in § 6") instead of
           a second row for the same draft. -->
      <template #evidence="{ entry }">
        <SearchEvidence :hit="hitByKey.get(entry.key)" />
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
            ? 'Dieses Feld durchsucht Titel, Zitat, Debattennamen und Kürzel des Ministeriums. Nach dem Ministerium filtert „Filter“ daneben.'
            : 'Andere Filter oder einen anderen Suchbegriff versuchen.'"
        >
          <p v-if="fullTextActive" class="text-base text-ink-secondary">
            Kein Titel, kein Zitat, kein Debattenname und kein Kürzel eines Ministeriums
            trägt „{{ qDebounced }}“.
          </p>
          <!-- The one place the question arises (30.09.2026): it stood under
               every draft page, where nobody who found the draft needs it.
               Here it answers a search that found nothing. -->
          <p v-if="qDebounced" class="mt-3 text-ink-secondary">
            Heißt der Entwurf in der Debatte anders? Hinweise an
            <a :href="contact.mailto" class="link-inline">{{ contact.email }}</a>
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
          {{ fullTextFilteredOut === 1 ? 'führt' : 'führen' }} – Art oder Ministerium
          schließen sie aus.
          <button
            type="button"
            class="tap-target link-inline font-medium"
            @click="chosenArt = ''; ministry = ''"
          >Alle Arten und Ministerien</button>
          zeigen sie.
        </p>
      </template>
    </section>

  </div>
</template>
