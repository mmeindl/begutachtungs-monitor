<script setup lang="ts">
import type { DashboardSecondRound, DraftStation } from '#shared/types'
import {
  compareRowsByFrist,
  compareRowsByStatements,
  type DraftListRow,
  draftRows,
} from '#shared/utils/draftOrder'
import { viewOfRow } from '~/utils/entryView'
import {
  ART_OPTIONS,
  type FilterChipKey,
  SEVERAL_STATIONS,
  type SortKey,
  activeFilterChips,
  draftCountLabel,
  stationTabsFor,
} from '~/utils/draftFilters'
import { matchesQuery } from '#shared/utils/textMatch'

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
usePageSeo({
  title: 'Entwürfe',
  description:
    'Alle Begutachtungen: Gesetzes- und Verordnungsentwürfe, filterbar nach Art, Status, Gesetzgebungsperiode und Ministerium.',
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
 * (Parliament's own description of it, § 23b Abs. 1 GOG-NR;
 * docs/architecture.md §12.26). That day 4 rows of GP XXVIII stood at
 * Parlament with the form open; until then the chip was unavailable there
 * with the reason „Der Nationalrat hat über die Vorlage schon entschieden",
 * and the measurement „Parlament + open is 0" only held because those
 * Vorlagen were wrongly at „Regierungsvorlage".
 */
/** Why the chip is unavailable at a station, where it is. */
const OPEN_UNAVAILABLE: Partial<Record<DraftStation, string>> = {
  bgbl: 'Nach der Kundmachung ist keine Stellungnahme mehr möglich',
}

/* The Art filter's options and the noun it shares with the count line live
 * in `app/utils/draftFilters.ts` (`ART_OPTIONS`, `ART_VERORDNUNG_NOUN`). */
const artOptions = ART_OPTIONS

/**
 * Two orders, and each of them answers a question this page is actually
 * asked (§12.24, §12.22).
 *
 * „Frist" is the list's own order and the default everywhere: open first,
 * nearest deadline on top (`compareDrafts`). „Meiste Stellungnahmen" exists
 * because the homepage's ranking („Wo am meisten mitgeredet wurde") had
 * nowhere to send anyone — its five rows are a window onto an order this
 * page could not produce, so the link would have pointed at the pool
 * instead of at the list. It is the same comparator the ranking uses
 * (`rankByStatements`), so the first five rows here ARE those five rows.
 *
 * No third since 02.10.2026. „Zuletzt dazugekommen" (26.09.2026, §12.22)
 * went when the column headers took over the sorting: no column fits it.
 * A title order under „Entwurf" replaced it for a day and went too — a third
 * of the titles start with „Änderung" or „Verordnung", and the search finds
 * a law by name faster than an alphabet does.
 */
const sortOptions: { value: SortKey; label: string }[] = [
  { value: 'frist', label: 'Nach Frist' },
  { value: 'stellungnahmen', label: 'Meiste Stellungnahmen' },
]

/**
 * One comparator per option, so adding an order is a line here rather
 * than another branch inside `rows`. The comparators live in
 * `shared/utils/draftOrder.ts`, next to the row kinds they order and where
 * vitest can reach them.
 */
const rowComparators: Record<SortKey, (a: DraftListRow, b: DraftListRow) => number> = {
  frist: compareRowsByFrist,
  stellungnahmen: compareRowsByStatements,
}

/* Filter state, URL binding and the query for both endpoints:
 * `useDraftFilters`, with the pure half in `app/utils/draftFilters.ts`. */
const filters = useDraftFilters()
const { statusFilter, art, gp, ministry, q, qDebounced, sort, stations, query } = filters

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

/* An old `?status=closed` link is its own state (its chip clears it); the
 * stations leave it alone. */
watch(openUnavailable, (reason) => {
  if (statusFilter.value === 'closed') return
  statusFilter.value = wantsOpen.value && !reason ? 'open' : 'all'
}, { immediate: true })

/**
 * The rarer filters — Art, period, Ressort — behind one disclosure, at every
 * width since 02.10.2026.
 *
 * Until then the bar folded away on the phone only (measured 18.09.2026: at
 * 390 px it was 432 px tall and the first viewport showed not one row) and
 * took the station chips with it. Now the three selects go behind „Filter"
 * at every width, and the stations stay out from `md` up — they are the axis
 * the product is about (§12.26). On a phone they still open with the panel:
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
  () => Number(art.value !== '') + Number(gp.value !== '') + Number(ministry.value !== ''),
)
const filtersOpen = ref(false)

/** The closed panel's values; `clearChip` is the press that removes each. */
const activeFilters = computed(() =>
  activeFilterChips({ status: statusFilter.value, art: art.value, gp: gp.value, ministry: ministry.value }),
)
const clearChip: Record<FilterChipKey, () => void> = {
  status: () => { statusFilter.value = 'all' },
  art: () => { art.value = '' },
  gp: () => { gp.value = '' },
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
 * column. The Entwurf column orders nothing (§12.22). Below `md` the page
 * offers the same two as a select.
 */
const SORT_COLUMNS = {
  count: { key: 'stellungnahmen', order: 'meiste zuerst' },
  state: { key: 'frist', order: 'nächste Frist zuerst' },
} as const

/* The header hands back one of `SORT_COLUMNS`' keys. */
function chooseSort(key: string) {
  sort.value = key as SortKey
}

/* The two halves this `art` asks for, the gate over them, the period and
 * Ressort menus: `useDraftHalves`. */
const halves = useDraftHalves(filters)
const {
  wantsMe,
  wantsRis,
  meData,
  risData,
  risError,
  gateStatus,
  gateError,
  gateData,
  retry,
  selectedGp,
  availableGps,
  ministries,
} = halves

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
const secondRoundFetch = useFetch<DashboardSecondRound>(
  '/api/dashboard/zweite-runde',
  { lazy: true, server: false },
)

await halves.ready
const { data: secondRound } = await secondRoundFetch

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
const openVorlagen = computed(() => {
  const list = secondRound.value
  if (!list || statusFilter.value === 'closed' || art.value === 'verordnung' || ministry.value) return []
  if (stations.value.length && !stations.value.includes('rv')) return []
  if (selectedGp.value && selectedGp.value !== list.gp) return []
  return list.items
    .filter((v) => v.consultation.kind !== 'draft')
    .filter((v) => matchesQuery(`${v.title} ${v.citation}`, qDebounced.value))
})

/* No Art test of its own any more: a half that this `art` excludes was never
 * fetched, and `meData`/`risData` are null for it. */
const rows = computed<DraftListRow[]>(() =>
  draftRows(meData.value?.items ?? [], risData.value?.items ?? [], openVorlagen.value)
    .sort(rowComparators[sort.value]),
)

/**
 * The ordered rows, put through one anatomy (docs/architecture.md §12.28).
 *
 * The split is deliberate and it is the lesson of the six components this
 * replaced: `rows` decides WHAT stands in which order — with three row kinds
 * that keep their own types (§12.19) — and the adapter decides HOW each kind
 * falls onto the four zones. Both used to live in two components per kind,
 * which is why the same number could stand in six places in one list.
 */
const entries = computed(() => rows.value.map(viewOfRow))

/**
 * How much of the list stands on the page (§12.24: `ListMore` belongs where
 * a list is worked through).
 *
 * All rows stood in the SSR HTML until 30.09.2026, and each of them twice —
 * `EntryList` renders both densities and lets CSS pick. Over a whole period
 * that was 1,24 MB of HTML and 12.142 DOM nodes, 0,6 s of server render per
 * request and 0,95 s of main thread on a 4× throttled phone (homepage: 0,28
 * s). The rows are cut in the render only: counts, the Ressort menu and the
 * full-text hits keep reading `entries` whole.
 *
 * Uncut under a search query, the rule of the Stellungnahmen lists
 * (§12.15): whoever searches gets the whole result, and the full-text block
 * below may only say „stehen schon in der Liste oben" of rows that are on
 * the page. Not in the URL, like the panel's count: a link shares the
 * filter, not how far somebody scrolled.
 */
const LIST_PAGE_SIZE = 50
const listPaged = computed(() => !qDebounced.value)
const {
  visible: visibleCount,
  shown: shownEntries,
  more: showMore,
  all: showAll,
} = usePagedList(entries, LIST_PAGE_SIZE, [query, art, sort], listPaged)

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
  fullTextExtraEntries,
  fullTextInList,
  fullTextFilteredOut,
  fullTextCorpus,
} = await useFullTextSearch(filters, availableGps, entries)

/* Both are 0 for a half that was not fetched, so the sum is what stands in
 * the list — the search placeholder may name it (never the count line,
 * `draftCountLabel`). */
const meTotal = computed(() => meData.value?.total ?? 0)
const risTotal = computed(() => risData.value?.total ?? 0)
const visibleTotal = computed(() => meTotal.value + risTotal.value)

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
/* Stations and „Verordnungsentwürfe" exclude one another: the one half has no
 * Gegenstand at Parliament, the other half is the question about it. Instead
 * of „Keine Entwürfe gefunden" — which sounds like too narrow a search term —
 * the page says in that case that the combination itself is empty, and offers
 * the way out. */
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
  () => stationsMissing.value && (stations.value.length > 0 || statusFilter.value === 'closed'),
)

/* Each kind counted on its own, never summed (`draftCountLabel`). */
const countLabel = computed(() =>
  draftCountLabel({
    me: wantsMe.value ? meTotal.value : null,
    vorlagen: openVorlagen.value,
    ris: !wantsRis.value ? null : risError.value ? 'failed' : risTotal.value,
    laterStationsOnly: laterStationsOnly.value,
  }),
)

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
        Alle Begutachtungen einer Gesetzgebungsperiode – in Begutachtung und
        abgeschlossen, Gesetzes- wie Verordnungsentwürfe.
      </p>
      <!-- Subscribing belongs to the page, not to the list's controls
           (02.10.2026): between the count line and the rows it split the
           list from its head. It still follows the Ressort filter — choosing
           one is the moment somebody decides „dieses Ressort verfolge ich" —
           and stays outside every live region, so a screen reader does not
           read it out on each keystroke. -->
      <p class="mt-2 text-sm leading-7 text-ink-muted">
        <SubscribeLinks :ministry="ministry" />
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
        :query="qDebounced"
        @update:sort="chooseSort"
      >
        <!-- WHERE IT STANDS as the tabs (02.10.2026): the stations are the
               axis this product is about — what became of a draft — and the
               most prominent control in the box belongs to it. Single-select,
               a reversal of §12.26's multi-select chips: tabs that hold
               several values are no tabs. A shared link naming several
               stations still works and says so as a tab of its own. No counts,
               unlike the Stellungnahmen: each would be one pooled total over
               Ministerialentwürfe and Verordnungsentwürfe (§12.19). Five tabs
               do not fit a phone, so below `sm` they are a select. Gone where
               the period cannot answer the question (§12.27): the slot
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
          <div class="flex flex-wrap items-center gap-2">
            <!-- „Was kann ich tun", reduced to its one value that matters:
                 the question people arrive with (§12.26), and the filter
                 the homepage's sections link through
                 (`?status=open&station=begutachtung`, `…&station=rv`).
                 „Nicht möglich" was only the rest; it survives as a chip
                 for old links (`activeFilterChips`). Unavailable, not hidden,
                 under „Bundesgesetzblatt", where the combination is empty
                 by what the station means (`OPEN_UNAVAILABLE`; under
                 „Parlament" no longer since 03.10.2026, the window runs
                 through the Bundesrat) — drawn as unavailable, not as a faded
                 „on": no tint, the page's grey, muted text and a dashed
                 outline, the tick kept (`wantsOpen`). Fading the tinted
                 chip read as „on, a bit lighter" (03.10.2026). The dashes
                 are an outline, not a border: like the variants' ring it
                 takes no space, so the chip keeps its width either way.
                 `aria-disabled` keeps it focusable with its reason.
                 Ticked, it is ink and not blue (03.10.2026): selection is
                 ink (main.css), so „on" is the subtle variant's
                 ink-tinted ground with an ink ring in place of its grey
                 one. The ring is the selection and the tick says what is
                 selected — the ground alone is also what an unticked chip
                 shows under the pointer. -->
            <UButton
              color="neutral"
              :variant="wantsOpen && !openUnavailable ? 'subtle' : 'outline'"
              :aria-pressed="wantsOpen"
              :aria-disabled="openUnavailable ? true : undefined"
              :title="openUnavailable ?? undefined"
              class="shrink-0"
              :class="openUnavailable ? 'cursor-not-allowed outline-1 outline-dashed -outline-offset-1 outline-baseline bg-page text-ink-muted ring-0 hover:bg-page' : wantsOpen && 'ring-ink'"
              @click="toggleOpen"
            >
              <!-- A box, ticked when on: says „toggle" in both states,
                   and both icons are one width, so pressing moves nothing. -->
              <UIcon :name="wantsOpen ? 'i-lucide-square-check' : 'i-lucide-square'" class="size-4 shrink-0" aria-hidden="true" />
              Stellungnahme möglich
              <span v-if="openUnavailable" class="sr-only">({{ openUnavailable }})</span>
            </UButton>
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
                 itself by its LONGEST option, so the widths are set here
                 and the line holds — 190 + 240 + 112 px plus gaps, and
                 the Ressort fills the rest of the 864 px of the box. -->
            <div
              id="filter-more-panel"
              class="w-full gap-2 md:flex md:w-auto md:min-w-0 md:flex-1 md:items-center"
              :class="filtersOpen ? 'grid grid-cols-1' : 'hidden'"
            >
              <div class="min-w-0 md:w-60">
                <label for="filter-art" class="sr-only">Art des Entwurfs</label>
                <TokenSelect id="filter-art" v-model="art" block>
                  <option v-for="opt in artOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </TokenSelect>
              </div>
              <div class="min-w-0 md:w-28">
                <label for="filter-gp" class="sr-only">Gesetzgebungsperiode</label>
                <TokenSelect id="filter-gp" v-model="selectedGp" block>
                  <option v-for="g in availableGps" :key="g" :value="g">
                    GP {{ g }}
                  </option>
                </TokenSelect>
              </div>
              <!-- The Ressort takes the rest of the line, so the filters end
                   where the search below ends; its names are the longest. -->
              <div class="min-w-0 md:flex-1">
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
            icon="i-lucide-search"
            :placeholder="`In ${countLabelDe(visibleTotal, 'Entwurf', 'Entwürfen')} suchen …`"
            aria-label="Entwürfe durchsuchen"
            class="w-full"
            :ui="{ base: 'min-h-target' }"
          />
          <!-- The count line, the boundary between the zones: above it what
               fixes the set, here how it is read. On a phone, where no
               column header is drawn, the order is a select beside it. -->
          <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p class="text-sm text-ink-muted" aria-live="polite">
              {{ countLabel }}
            </p>
            <div class="flex min-w-0 items-center gap-2 md:hidden">
              <label for="filter-sort" class="shrink-0 text-sm text-ink-secondary">Sortieren</label>
              <TokenSelect id="filter-sort" v-model="sort">
                <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </TokenSelect>
            </div>
          </div>
          <!-- Above the rows, like every other statement about what the list is
                 doing: read afterwards it is worthless. -->
          <p v-if="carriedOverFrom" class="text-sm text-ink-muted">
            Darunter Entwürfe der {{ carriedOverFrom }}. Gesetzgebungsperiode, deren
            Begutachtungsfrist noch läuft – eine Frist endet nicht damit, dass eine
            neue Gesetzgebungsperiode beginnt. Über die Auswahl oben lässt sich
            jede Periode für sich ansehen.
          </p>
          <!-- Like the sort caveat below it: a statement about what the list is
                 NOT doing stands above the rows — read afterwards it is
                 worthless. -->
          <p v-if="stationsUnavailable" class="text-sm text-ink-muted">
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
          <p v-if="chainUnlinkedPeriod" class="text-sm text-ink-muted">
            Was aus diesen Entwürfen wurde, ist für diese Gesetzgebungsperiode
            nicht erfasst – der Bezug zwischen Ministerialentwurf und
            Regierungsvorlage fehlt im Datenbestand. Die Zeilen zeigen deshalb
            keine Station; dass es keine Regierungsvorlagen gab, folgt daraus
            <span class="font-medium text-ink">nicht</span>.<template v-if="stations.length">
              Nach Station ist hier deshalb auch
              <span class="font-medium text-ink">nicht</span> gefiltert.</template>
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
          </p>
          <!-- No „Darunter N in zweiter Runde" line since 03.10.2026: each of
               those rows carries its „Zweite Runde" chip, „Regierungsvorlage"
               with „Stellungnahme möglich" IS that list, and why there is no
               Frist for it is the detail page's to say. -->
          <!-- What the sort order does with the half it cannot sort — above the
                 list, not below it: a caveat on what the order claims has to be read
                 before the rows are. -->
          <p
            v-if="sort === 'stellungnahmen' && art !== 'ministerialentwurf'"
            class="text-sm text-ink-muted"
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
            class="text-sm text-ink-muted"
          >
            Gesucht ist hier nur in Titel, Zitat, Debattennamen und Ressortkürzel. In
            den Dokumenten selbst wird nur gesucht, solange eine Begutachtung
            <span class="font-medium text-ink">läuft</span> – unter diesen Filtern
            also nicht.
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
            v-if="listPaged && entries.length"
            :visible="visibleCount"
            :total="entries.length"
            :step="LIST_PAGE_SIZE"
            :all-above="LIST_PAGE_SIZE"
            @more="showMore()"
            @all="showAll()"
          />
        </template>
      </EntryList>
      <!-- THE SAME FIELD'S SECOND ANSWER (docs/architecture.md §12.31). Its
           own section with its own heading, never mixed into the list: the
           list searches a whole Gesetzgebungsperiode by title, this block the
           documents of what is open today. -->
      <section v-if="fullTextActive" class="mt-8">
        <!-- An h2 in the outline, the sub-heading's face on the page
             (02.10.2026): it heads a block under the results, as the h3 of a
             draft page's section does. In the serif it was a third heading
             style. -->
        <h2 class="font-sans text-base font-semibold text-ink">
          Außerdem im Volltext der laufenden Begutachtungen
        </h2>
        <!-- The asterisk is explained here and not at the field: it applies
             to THIS half — RIS searches whole words, the list above searches
             substrings. A usage note belongs with what it changes. -->
        <p class="mt-1 text-sm text-ink-muted">
          Alle Dokumente eines Entwurfs – Text, Erläuterungen,
          Gegenüberstellung, Anhänge. Gesucht werden ganze Wörter,
          <code>Klima*</code> findet auch zusammengesetzte.
        </p>

        <LoadingState v-if="fullTextPending" label="Im Volltext wird gesucht …" />
        <!-- AN ERROR IS NOT AN ANSWER (docs/architecture.md §12.13): „kommt
             nicht vor" would be this product's most expensive lie. -->
        <p v-else-if="fullTextError" class="mt-3 text-sm text-ink-secondary">
          Im Volltext konnte gerade nicht gesucht werden – das RIS hat nicht
          geantwortet. Die Liste oben ist davon nicht betroffen.
        </p>
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
              @click="art = ''; ministry = ''"
            >Alle Arten und Ressorts</button>
            zeigen sie.
          </p>
        </template>
      </section>

      <!-- NO credit line of its own, for the homepage's reason (03.10.2026):
           rows are facts, not documents, nothing is marked or classified by
           us here, and the footer's „Datenquellen und Lizenzen im Impressum"
           link is the page's attribution. -->
    </FetchGate>
  </div>
</template>
