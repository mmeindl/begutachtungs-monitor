<script setup lang="ts">
import type {
  StatementMeta,
  StatementsResponse,
} from '#shared/types'
import {
  type StatementFilter,
  type StatementSort,
  availableStatementFilters,
  compareStatementRows,
  orgRowsOf,
  submitterLabel,
  submitterName,
} from '~/utils/statementRows'
import ListBox from '~/components/ui/ListBox.vue'

/**
 * Both rounds of Stellungnahmen render through this panel — the
 * Begutachtung's and, since 02.10.2026, the Regierungsvorlage's
 * (RvStatements wraps it). One filter grammar for one kind of list: the
 * Vorlage's used to be a single unfiltered list on the argument that it
 * draws a handful, which holds for the median and not for the Vorlagen
 * people look up (1289 d.B.: 41.376), and once the counts rode on the
 * filter buttons, two cards on one page stated them in two different ways.
 *
 * The two differ only in where the item list comes from, hence the two
 * props, exactly one of them set.
 */
const props = withDefaults(
  defineProps<{
    summary: StatementsSummary
    /** The Begutachtung: fetched lazily, on the first segment that needs it. */
    listUrl?: string
    /** The Vorlage: already in the page's own response, so never fetched. */
    items?: StatementMeta[] | null
    /** The summary counts only part of the Stellungnahmen (above the cap). */
    partial?: boolean
    /** Of the list's sr-only heading — one below the section it sits in. */
    headingLevel?: 3 | 4
  }>(),
  { listUrl: undefined, items: null, partial: false, headingLevel: 3 },
)

/* Ten, not the panel's old twenty-five: this list sits on a detail page with
 * five other sections, and a first page that fills the viewport makes the
 * Stellungnahmen the page instead of a part of it. What ten costs — more
 * presses on the long lists — the search field and "Alle N anzeigen" both
 * answer. */
const PAGE_SIZE = 10

/* Above this many still-hidden rows, offer the jump to the end — roughly
 * four presses, which is where stepping starts to feel like work. 88/ME's
 * 707 Stellungnahmen are 70 presses otherwise.
 *
 * On BOTH segments, not just the long one: the search field finds a name the
 * reader already knows, and answers nothing for "show me all of them". On the
 * organisation list the skipped rows are in the DOM already, so the press
 * only unhides them. */
const ALL_ABOVE = 30

/* Below this the search field is not offered: on twenty rows the eye is
 * faster than the keyboard, and the field would be a fourth control on a
 * panel that already collapsed three lists into one to lose controls. */
const SEARCH_MIN = 20

/**
 * One list with a filter, not three stacked lists. The panel used to show a
 * ranked organisation block, a fold with the rest of the organisations, and a
 * second fold with the anonymous half — three row shapes and two disclosures
 * for what is one set of Stellungnahmen. The segments below are the groups
 * the legend above counts, so the filter needs no explaining, and the old
 * ranked/folded split collapses into a sort: the top of the organisation list
 * IS "die meisten Zustimmungen".
 */
const filterLabels: Record<StatementFilter, string> = {
  organisations: 'Organisationen',
  persons: 'Privatpersonen',
  nonpublic: 'Nicht öffentlich',
  all: 'Alle',
}

/* Only the segments this Verfahren has, in the fixed order of the legend
 * above — the rule, and why an empty one is not offered, is in
 * `app/utils/statementRows.ts`, where it is tested. */
const filterCounts = computed<Record<StatementFilter, number>>(() => ({
  organisations: props.summary.organisations,
  persons: props.summary.privatePersons,
  nonpublic: props.summary.nonPublic,
  all: props.summary.total,
}))
const filterOptions = computed(() =>
  availableStatementFilters(props.summary, { partial: props.partial }).map((value) => ({ value, label: filterLabels[value], count: filterCounts.value[value] })),
)

/* Default first, as on the archive page: the leftmost segment reads as "where
 * am I", so it must be the state the page lands in — and since the empty ones
 * are gone, it is a segment with something in it. Organisationen wherever they
 * filed: they come from the SSR summary, while everything else needs the lazy
 * list-142 fetch, and 700 rows have no business in every page view. */
const filter = ref<StatementFilter>(filterOptions.value[0]?.value ?? 'organisations')

/* One component serves every draft and the router reuses it from one
 * /entwuerfe/… to the next, so the segment carried over can be one this draft
 * does not have — then it lands in its own first one, as on a fresh page. */
watch(filterOptions, (options) => {
  if (!options.some((o) => o.value === filter.value)) {
    filter.value = options[0]?.value ?? 'organisations'
  }
})

/* Even a single segment is shown: where only private persons — or only
 * non-public submissions — filed, the one button is not a choice but the
 * label and the count of the list beneath it, which nothing else on the
 * panel states (the count line is sr-only outside a search). */
const showFilterGroup = computed(() => filterOptions.value.length > 0)

/* An order needs two things to order. On the total, not on the current
 * segment: a control that comes and goes as the reader switches segments is
 * worse than one that is simply absent on the drafts where nothing can be
 * sorted, and below two Stellungnahmen no segment can hold two rows. */
const showSort = computed(() => props.summary.total > 1)

/**
 * Sort is its own axis, independent of the filter: the two orders answer
 * different questions — "who mobilized" and "what came in last" — and neither
 * is the right default for every reader. Zustimmungen leads because it is the
 * only key that ranks an anonymous row, and because it is the order the
 * segments had before this control existed.
 *
 * ISO dates sort lexicographically, and a missing date ends up last, where it
 * belongs: it carries no position in a chronology. The two keys themselves
 * are in `app/utils/statementRows.ts`, with the rows they order.
 */
const sortOptions: { value: StatementSort; label: string }[] = [
  { value: 'endorsements', label: 'Meiste Zustimmungen' },
  { value: 'date', label: 'Neueste' },
]

const sort = ref<StatementSort>('endorsements')

/* Lazy: nothing is requested until a segment needs the item list
 * (immediate: false leaves status at 'idle' until execute()) — unless the
 * panel LANDS in such a segment because no organisation filed. Then the list
 * is not an extra, it is the section's only content, and it is fetched
 * server-side so it stands in the SSR HTML the way the organisation rows do,
 * for a reader without JavaScript too. It costs no upstream call: the route
 * reads the same cached list-142 aggregation this page's summary was built
 * from. */
const fetchesList = props.items === null
const { data, status: fetchStatus, execute } = useFetch<StatementsResponse>(
  () => props.listUrl ?? '',
  { immediate: fetchesList && filter.value !== 'organisations' },
)
const status = computed(() => (fetchesList ? fetchStatus.value : 'success'))

const needsList = computed(() => filter.value !== 'organisations')

/**
 * The organisation search. Only this segment has one: the other three are
 * lists of "Privatperson" and "Nicht-öffentliche Stellungnahme", where there
 * is no name to search for — which is the GDPR line, not an omission, and
 * the empty state says so when someone searches for a person anyway.
 */
const orgQuery = ref('')

/* A query that folds to nothing (spaces, a stray hyphen) is not a filter. */
const searchActive = computed(() => foldForSearch(orgQuery.value).length > 0)

watch(filter, async (value) => {
  /* The field is unmounted with the segment; a query left behind would
   * filter a list the reader can no longer see the field for. */
  orgQuery.value = ''
  if (value !== 'organisations' && fetchesList && fetchStatus.value === 'idle') {
    await execute()
  }
})

/* The item list is one row per Stellungnahme — no grouping. An organisation
 * that filed twice therefore appears twice under "Alle", which is what a raw
 * list should show; the grouped view is the Organisationen segment. */
const items = computed<StatementMeta[]>(() => {
  const all = [...(props.items ?? data.value?.items ?? [])].sort((a, b) => compareStatementRows(a, b, sort.value))
  if (filter.value === 'persons') {
    return all.filter((s) => s.submitterKind === 'person')
  }
  if (filter.value === 'nonpublic') {
    return all.filter((s) => s.submitterKind === 'nonpublic')
  }
  return all
})

/* Another segment, a narrower set and a new order are each a new first
 * page — otherwise three matches arrive on page four of the unfiltered list,
 * i.e. as an empty list, and 75 rows kept open across a re-sort show the top
 * of one order and the middle of the other (`usePagedList`). `visible` also
 * cuts the organisation rows below, which are not `items`. */
const {
  visible: visibleCount,
  shown: visibleItems,
  more: showMore,
  all: showAll,
} = usePagedList(items, PAGE_SIZE, [filter, orgQuery, sort])

/* One staleness sentence per page. When the summary above is already a
 * last-good fallback, the detail page states it under this panel and the
 * list would only repeat it. This note is for the other case: the summary
 * rendered live, and by the time the user switched segments the cache
 * window had passed and the list-142 fetch failed. */
const listStaleAsOf = computed(() =>
  !props.summary.staleAsOf ? (data.value?.staleAsOf ?? null) : null,
)

/* Sorting, grouping and the rows themselves live in
 * `app/utils/statementRows.ts`, where they are tested. */
const orgRows = computed(() => orgRowsOf(props.summary, sort.value))

/* The name and every citation the row carries, so a reader who has the
 * citation and not the name ("21/SN-8/ME") lands on the same row. */
function orgHaystack(entry: (typeof orgRows)['value'][number]): string {
  return [entry.org.name, ...entry.org.statements.map((s) => s.citation)].join(' ')
}

const matchedOrgRows = computed(() =>
  searchActive.value
    ? orgRows.value.filter((entry) => matchesQuery(orgHaystack(entry), orgQuery.value))
    : orgRows.value,
)

/**
 * Two ways of folding a row away, because the two states protect different
 * things.
 *
 * WITHOUT a query every row stays in the DOM and the overflow is hidden with
 * `hidden="until-found"`: the organisation list ships with the page (the
 * point of the feedback layer is that an organisation can find ITSELF here),
 * and the browser — not our JavaScript — reveals a match, so find-in-page
 * still reaches row 90 for a reader whose JS never ran. That reader has no
 * search field either, which is exactly why this half cannot be a slice.
 * Where `until-found` is unsupported the attribute degrades to a plain
 * `hidden`, i.e. to the slice, never to something worse.
 *
 * WITH a query the non-matching rows are gone for real. The reader asked for
 * them to be gone; find-in-page must not resurrect what the filter excluded.
 */
const renderedOrgRows = computed(() =>
  searchActive.value
    ? matchedOrgRows.value.slice(0, visibleCount.value)
    : matchedOrgRows.value,
)

function orgRowHidden(index: number): 'until-found' | undefined {
  return !searchActive.value && index >= visibleCount.value ? 'until-found' : undefined
}

/* Offered on the size of the WHOLE list, not of the current result — a field
 * that disappears once it has narrowed the list to three rows takes away the
 * only way back. */
const searchId = useId()
const sortId = useId()

const showOrgSearch = computed(() => !needsList.value && orgRows.value.length > SEARCH_MIN)

/* ORG_LIST_CAP is set far above every population measured in GP XXVIII, so
 * this is a guard against a future outlier, not a normal state. Counted in
 * statements on both sides: `organisations` counts statements, and a listed
 * entry can stand for several of them. */
const listedOrgStatements = computed(() =>
  props.summary.organisationList.reduce((n, o) => n + o.statements.length, 0),
)
const hiddenOrgCount = computed(() =>
  Math.max(0, props.summary.organisations - listedOrgStatements.value),
)

/* What the segment would hold, known from the summary before the list is
 * fetched — so the count line says something during the first load instead
 * of flashing a zero. */
const expectedCount = computed(() => {
  switch (filter.value) {
    case 'persons':
      return props.summary.privatePersons
    case 'nonpublic':
      return props.summary.nonPublic
    default:
      return props.summary.total
  }
})

/* What the pagination counts against. On the organisation segment that is
 * the SEARCH RESULT, not the whole list: after "3 von 35 Organisationen" a
 * foot line offering to show 25 more would be counting a different set than
 * the one on screen. */
const segmentTotal = computed(() => {
  if (!needsList.value) return matchedOrgRows.value.length
  return status.value === 'success' ? items.value.length : expectedCount.value
})

/* How large the chosen segment is. Two lines, not one: this says what the
 * set IS, and the progress line at the foot says how much of it is on
 * screen — that one belongs beside the button that changes it, not 25 rows
 * above it, where a reader at the button cannot see it. */
const setLine = computed(() => {
  if (!needsList.value) {
    /* Under a query this line IS the result count — the one number the
     * reader is waiting for, and the only place it is stated. */
    if (searchActive.value) {
      return `${formatNumberDe(matchedOrgRows.value.length)} von ${countLabelDe(
        orgRows.value.length,
        'Organisation',
        'Organisationen',
      )}`
    }
    /* `orgRows` maps the same list, so it has the same length. An
     * organisation that filed more than once is one row, and that row states
     * its count — "126 Stellungnahmen von 125 Organisationen" above the list
     * explained a gap no reader was asking about. */
    return countLabelDe(orgRows.value.length, 'Organisation', 'Organisationen')
  }
  return countLabelDe(segmentTotal.value, 'Stellungnahme', 'Stellungnahmen')
})

/* Whether the sheet shows rows — the column header stands over rows only. */
const showColumnHeader = computed(() =>
  needsList.value
    ? status.value !== 'pending' && status.value !== 'error' && visibleItems.value.length > 0
    : renderedOrgRows.value.length > 0,
)
</script>

<template>
  <div>
    <!-- NO ROW OF COUNT TILES since 30.09.2026. „Gesamt · Organisationen ·
         Privatpersonen · Nicht öffentlich" stood here as four figures, and
         the filter group below repeated the same four labels one line
         further down. The counts now ride on the filter buttons; the total
         stands in the bar's Begutachtung row and on „Alle". Where only one
         segment exists it is still shown, as the list's label and count. -->
    <!-- NO MIX BAR since 01.10.2026. The org/private split stood here as a
         stacked bar whose legend was the tile row removed on 30.09.2026;
         after that it was a picture of the two counts the filter buttons
         state exactly one line below, and a second bar a few lines under
         the Frist's, counting something else. -->
    <component :is="`h${headingLevel}`" class="sr-only">Liste der Stellungnahmen</component>
    <!-- Named query container: the rows inside decide their layout on THIS
         box's width (row-cols in main.css), not on the window's — the panel
         never gets wider than the page's max-w-3xl column. The head is part
         of the box and does not change its width.

         The controls stand in the box's head since 02.10.2026, the pager
         and the ways to more in rows at its foot (`ListBox`): before, a list
         here was up to three loose rows of controls, the sheet, a pager and
         a link. Three layers since 02.10.2026, the grammar of every list box
         (`ListBox`): WHO filed as tabs, the search as the tool row, the
         order in the column header. Before, the head was three rows of
         equal-looking button groups, on a phone five. -->
    <ListBox class="@container/list mt-4" :header-class="!showOrgSearch && 'row-cols:hidden'">
      <!-- Each segment with its count; where only one exists it is still
           shown, as the list's label and count. -->
      <template v-if="showFilterGroup" #tabs>
        <ListTabs
          v-model="filter"
          :options="filterOptions"
          group-label="Stellungnahmen nach Einbringer:in filtern"
          collapse
        />
      </template>
      <template v-if="showOrgSearch || showSort" #header>
        <div class="flex flex-wrap items-center gap-3">
          <!-- The order, where the column header that carries it is not
               drawn: below row-cols the rows are stacked cards with no
               header. Before the search, so the field stays last, directly
               above the rows it searches. -->
          <div v-if="showSort" class="flex min-w-0 items-center gap-2 row-cols:hidden">
            <label :for="sortId" class="shrink-0 text-sm text-ink-secondary">Sortieren</label>
            <TokenSelect :id="sortId" v-model="sort">
              <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </TokenSelect>
          </div>
          <div v-if="showOrgSearch" class="min-w-0 flex-1 basis-60">
            <label class="sr-only" :for="searchId">Organisation suchen</label>
            <UInput
              :id="searchId"
              v-model="orgQuery"
              type="search"
              icon="i-lucide-search"
              placeholder="Organisation suchen"
              autocomplete="off"
              class="w-full"
              :ui="{ base: 'min-h-target' }"
            />
          </div>
        </div>
      </template>
      <!-- The panel's live region, in the sheet and not in the head: the
           head's tool row is display:none where it would hold only the
           phone's sort select, and a live region inside it would be silent
           there.
           Visible only under a query, where it is the result count nothing
           else states. Outside one the size of a segment is already the
           number on its tab, and stating it again is the same sentence
           twice — so the line goes visually silent but stays in the DOM:
           switching a segment swaps the list without moving focus, and this
           is a screen-reader user's only feedback that anything happened. -->
      <p
        :class="!searchActive ? 'sr-only' : 'px-4 pt-3 text-sm text-ink-muted'"
        aria-live="polite"
      >{{ setLine }}</p>
      <!-- Same wording as the summary-level note on the detail page: a stale
           list must never read as the current one. -->
      <p v-if="needsList && listStaleAsOf" class="px-4 pt-3 text-xs text-ink-muted">
        Stand der Liste: {{ formatDateTimeDe(listStaleAsOf) }} (die aktuelle ist
        gerade nicht abrufbar).
      </p>
      <!-- Over rows only: above a loading line, an error or „keine
           gefunden" it would name columns nothing stands in. -->
      <StatementColumnHeader v-if="showColumnHeader" v-model:sort="sort" :sortable="showSort" />
      <!-- Organisations: from the SSR summary, so they are in the HTML a
           crawler and a find-in-page see — which is what lets an organisation
           find itself on this page. -->
      <template v-if="!needsList">
        <!-- divide-rows, not divide-y: the rows past the first page are
             `hidden` until find-in-page reveals them, and Tailwind's
             `:last-child` rule would leave a hairline under the last
             visible one (main.css). -->
        <ul v-if="renderedOrgRows.length" class="divide-rows">
          <StatementRow
            v-for="({ org, row, expanded }, i) in renderedOrgRows"
            :key="org.name"
            v-bind="row"
            :endorsements="org.endorsements"
            :hidden="orgRowHidden(i)"
          >
            <!-- Upstream counts Zustimmungen per Stellungnahme; this is the
                 organisation's sum, and it says so on every row that stands
                 for more than one of them — not only where the sub-list puts
                 the parts on screen. A row citing three documents otherwise
                 states a number that belongs to none of them alone, and the
                 reader who clicks one through finds a smaller one. The parts
                 stay upstream, one click away. -->
            <template v-if="org.endorsements > 0 && expanded" #meta>
              <span class="text-xs text-ink-muted row-cols:block">{{ ' gesamt' }}</span>
            </template>
            <!-- The v-if belongs on the slot, not inside it: passing a
                 default slot that renders nothing still costs the row its
                 full-width slot line and the gap above it. -->
            <template v-if="expanded" #default>
              <OrganisationStatementLinks :org="org" />
            </template>
          </StatementRow>
        </ul>
        <!-- The one thing find-in-page can never say. A reader searching for
             a private individual's name gets silence from Cmd+F, and silence
             here reads as "did not file" when the truth is that we do not
             publish that name (GDPR, docs/architecture.md §3). The field is ours, so it
             can say which of the two it is. -->
        <ListBoxNotice
          v-else-if="searchActive"
          title="Keine Organisation gefunden"
          description="Gesucht wird nur in Organisationen; Privatpersonen stehen hier nicht mit Namen."
        />
        <!-- No third branch: this segment is offered only where an
             organisation filed, so without a query the list has rows. The
             draft on which none did lands in Privatpersonen instead of
             opening on the one empty list it has (availableStatementFilters). -->
      </template>

      <!-- Everything else needs the item list, fetched on the first switch -->
      <template v-else>
        <!-- The states inside the sheet are rows of it (`ListBoxNotice`
             says why not `EmptyState` cards). -->
        <LoadingState v-if="status === 'pending'" label="Stellungnahmen werden geladen …" />
        <ListBoxNotice v-else-if="status === 'error'" role="alert" title="Stellungnahmen konnten nicht geladen werden">
          <template #action>
            <UButton color="primary" @click="execute()">Erneut versuchen</UButton>
          </template>
        </ListBoxNotice>
        <ul v-else-if="visibleItems.length" class="divide-y divide-hairline">
          <StatementRow
            v-for="item in visibleItems"
            :key="item.parliamentUrl"
            :date="item.date"
            :label="submitterLabel(item)"
            :links="[{ citation: item.citation, href: item.parliamentUrl }]"
            :submitter="submitterName(item)"
            :endorsements="item.endorsements"
          />
        </ul>
        <ListBoxNotice v-else title="Keine Stellungnahmen in dieser Auswahl" />
      </template>

      <ListMore
        :visible="visibleCount"
        :total="segmentTotal"
        :step="PAGE_SIZE"
        :all-above="ALL_ABOVE"
        @more="showMore()"
        @all="showAll(segmentTotal)"
      />

      <p v-if="!needsList && hiddenOrgCount > 0" class="border-t border-hairline px-4 py-3 text-sm text-ink-muted">
        und {{ formatNumberDe(hiddenOrgCount) }} weitere Organisationen<template
          v-if="filterOptions.some((o) => o.value === 'all')"
        > – sie stehen im Segment „Alle“</template>.
      </p>

      <!-- A way on from the list that the panel's owner knows (the
           Vorlage's „Alle Stellungnahmen … auf parlament.gv.at"): a row
           of the foot, which the caller frames itself. -->
      <slot name="footer" />
    </ListBox>
  </div>
</template>
