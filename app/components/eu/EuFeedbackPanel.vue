<script setup lang="ts">
/**
 * Who gave feedback in one window on the Commission's portal, read (step 4
 * of the EU cycle, 15.11.2026): the contributions of the organisations the
 * naming rule allows as a list in the grammar of the Stellungnahmen
 * (`StatementsPanel`), and what is counted without a name as the list's
 * closing rows (16.11.2026).
 *
 * Built from the same parts, not from `StatementsPanel` itself, which is
 * built around Zustimmungen and its „nicht öffentlich" segment: a list box
 * (`ListBox`) with the kinds and the citizens as tabs and their counts
 * (`ListTabs`), the cap as its frame row, the chip „Aus <Land>", the
 * phone's order and the search in its tool row, the set line as its polite
 * live region, the order in the column header (`ColumnLabel`,
 * `useReversibleSort`), ten rows a page with „Alle N" at its foot
 * (`ListMore`, `usePagedList`).
 *
 * WHAT A CONTROL CHANGES STANDS BELOW IT. The tabs' counts are the kinds'
 * whole, whatever the chip and the search do; the chip counts within the
 * tab above it; the set line and the rows answer to all three. The cap
 * stands at the head of the tool row, above the search, because search,
 * filter and order reach only the rows read.
 *
 * COUNTED, NEVER NAMED: a kind's organisations without a name, the
 * citizens, „Sonstige" and rows not published close the list, one muted row
 * per figure, after the last page of named rows — where the Stellungnahmen
 * put their rows without a name: in the list, reached by paging, never
 * ahead of a named row. The pager counts named rows only; the closing rows
 * appear once every named row of the tab is shown, so no press hides one
 * that was there. Under the chip or a search they are not shown: they
 * carry no country and no name to match. The citizens' own tab lists them
 * per country, by count.
 *
 * Every word comes from `euFeedbackView` and `EU_FEEDBACK_DE`
 * (`app/utils/euFeedback.ts`).
 */
import type { EuFeedbackReading } from '#shared/types'
import { STATEMENT_PAGE_SIZE, STATEMENT_SEARCH_MIN } from '~/utils/statementRows'
import { formatNumberDe } from '#shared/utils/format'
import { MAX_LIST_QUERY_CHARS } from '#shared/utils/queryParams'
import { foldForSearch } from '#shared/utils/textMatch'
import {
  EU_FEEDBACK_COUNTRY,
  EU_FEEDBACK_DE as DE,
  citizenRowsOf,
  citizensSetLine,
  closingRowsOf,
  euFeedbackView,
  feedbackRowsOf,
  feedbackSetLine,
  rowsOfKind,
  type EuFeedbackCountry,
  type EuFeedbackKindTab,
  type EuFeedbackSort,
} from '~/utils/euFeedback'
import { reversedOption } from '~/composables/useReversibleSort'

const props = withDefaults(defineProps<{
  reading: EuFeedbackReading
  /** The country the page serves; null on a page that serves none — then no chip. */
  country?: EuFeedbackCountry | null
}>(), { country: () => EU_FEEDBACK_COUNTRY })

const view = computed(() => euFeedbackView(props.reading, props.country))

/* The first tab is where the list lands: „Alle", or the one tab there is. */
const kind = ref<EuFeedbackKindTab>(view.value.tabs[0]?.value ?? 'alle')
watch(() => view.value.tabs, (tabs) => {
  if (!tabs.some((t) => t.value === kind.value)) kind.value = tabs[0]?.value ?? 'alle'
})
const citizensTab = computed(() => kind.value === 'buerger')

const fromCountry = ref(false)
const chipCode = computed(() => (fromCountry.value && view.value.country ? view.value.country.code : null))
const query = ref('')
/* A query that folds to nothing (spaces, a stray hyphen) is not a filter. The citizens' tab has no names to search. */
const searchActive = computed(() => !citizensTab.value && foldForSearch(query.value).length > 0)

const sort = ref<EuFeedbackSort>('date')
const reversed = ref(false)
const { choose, selectValue } = useReversibleSort(sort, reversed)
/* In the citizens' tab, whose rows are countries, the name is the Land and the day's place is the count. */
const citizensSort = computed<EuFeedbackSort>(() => (sort.value === 'name' ? 'country' : sort.value))
const sortOptions = computed(() => citizensTab.value
  ? [
      { value: 'date', label: DE.citizensSortOptions.date },
      { value: reversedOption('date'), label: DE.citizensSortOptions.dateReversed },
      { value: 'country', label: DE.citizensSortOptions.country },
      { value: reversedOption('country'), label: DE.citizensSortOptions.countryReversed },
    ]
  : [
      { value: 'date', label: DE.sortOptions.date },
      { value: reversedOption('date'), label: DE.sortOptions.dateReversed },
      { value: 'name', label: DE.sortOptions.name },
      { value: reversedOption('name'), label: DE.sortOptions.nameReversed },
      { value: 'country', label: DE.sortOptions.country },
      { value: reversedOption('country'), label: DE.sortOptions.countryReversed },
    ])
/* The phone's select shows the order the rows are in: „name" is offered nowhere in the citizens' tab, so it reads as the Land there. */
const sortSelect = computed({
  get: () => (citizensTab.value && sort.value === 'name' ? (reversed.value ? reversedOption('country') : 'country') : selectValue.value),
  set: (v: string) => { selectValue.value = v },
})

/* The chip counts within the tab above it, never the other way round. */
const countryCount = computed(() => {
  const c = view.value.country
  if (!c) return 0
  if (citizensTab.value) return view.value.citizens.find((r) => r.code === c.code)?.count ?? 0
  return rowsOfKind(view.value.rows, kind.value).filter((r) => r.country === c.code).length
})

const rows = computed(() => feedbackRowsOf(view.value.rows, {
  kind: kind.value,
  country: chipCode.value,
  query: searchActive.value ? query.value : '',
  sort: sort.value,
  reversed: reversed.value,
}))
const citizenRows = computed(() => (citizensTab.value
  ? citizenRowsOf(view.value.citizens, { country: chipCode.value, sort: citizensSort.value, reversed: reversed.value })
  : []))
const closingRows = computed(() => closingRowsOf(view.value.closing, { kind: kind.value, country: chipCode.value, query: query.value }, searchActive.value))

const resetOn = [kind, fromCountry, query, sort, reversed]
const { visible, shown, more, all } = usePagedList(rows, STATEMENT_PAGE_SIZE, resetOn)
const { visible: visibleCitizens, shown: shownCitizens, more: moreCitizens, all: allCitizens } = usePagedList(citizenRows, STATEMENT_PAGE_SIZE, resetOn)
/* After the last named row of the tab, never between pages. */
const shownClosing = computed(() => (visible.value >= rows.value.length ? closingRows.value : []))

const total = computed(() => view.value.rows.length)
const citizensTotal = computed(() => props.reading.citizens.count)
const setLine = computed(() => {
  if (citizensTab.value) return citizensSetLine(citizenRows.value.reduce((n, r) => n + r.count, 0), citizensTotal.value, chipCode.value !== null)
  return feedbackSetLine(rows.value.length, total.value, rows.value.length !== total.value || searchActive.value)
})

/* Offered on the size of the whole list, not of the result: a field that
 * vanished once it narrowed the list would take away the way back. */
const showSearch = computed(() => !citizensTab.value && total.value > STATEMENT_SEARCH_MIN)
const showSort = computed(() => (citizensTab.value ? view.value.citizens.length > 1 : total.value > 1))
/* The tool row holds the phone's order alone: from row-cols up it would be an empty band. */
const headerClass = computed(() => (!view.value.cap && !view.value.country && !showSearch.value ? 'row-cols:hidden' : false))
const showHeader = computed(() => Boolean(view.value.cap || view.value.country || showSearch.value || showSort.value))

const searchId = useId()
const sortId = useId()
</script>

<template>
  <div>
    <p v-if="view.empty" class="text-sm text-ink-secondary">{{ view.empty }}</p>
    <template v-else>
      <h4 class="sr-only">{{ DE.listHeading }}</h4>
      <ListBox class="@container/list" :header-class="headerClass">
        <template v-if="view.tabs.length" #tabs>
          <ListTabs v-model="kind" :options="view.tabs" :group-label="DE.kindsLabel" collapse />
        </template>
        <template v-if="showHeader" #header>
          <!-- The frame row: what the list does not hold, before anything is searched in it. -->
          <GapNote v-if="view.cap" :text="view.cap" class="text-sm text-ink-muted" />
          <div v-if="view.country || showSort || showSearch" class="flex flex-wrap items-center gap-3">
            <ToggleChip
              v-if="view.country"
              :pressed="fromCountry"
              :unavailable="!fromCountry && countryCount === 0 ? view.country.unavailable : null"
              @toggle="fromCountry = !fromCountry"
            >
              {{ view.country.label }}
              <span class="tabular-nums text-ink-muted">{{ formatNumberDe(countryCount) }}</span>
            </ToggleChip>
            <!-- The order where the column header that carries it is not drawn: on a phone. -->
            <div v-if="showSort" class="flex min-w-0 items-center gap-2 row-cols:hidden">
              <label :for="sortId" class="shrink-0 text-sm text-ink-secondary">{{ DE.sortLabel }}</label>
              <TokenSelect :id="sortId" v-model="sortSelect">
                <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </TokenSelect>
            </div>
            <div v-if="showSearch" class="min-w-0 flex-1 basis-60">
              <label class="sr-only" :for="searchId">{{ DE.search }}</label>
              <UInput
                :id="searchId"
                v-model="query"
                type="search"
                icon="i-lucide-search"
                :placeholder="DE.search"
                :maxlength="MAX_LIST_QUERY_CHARS"
                autocomplete="off"
                class="w-full"
                :ui="{ base: 'min-h-target' }"
              />
            </div>
          </div>
        </template>
        <!-- What the list is, and under a filter or a search how much of
             it is shown: the tabs say „Alle 12", not of what. Polite, so a
             change of tab, chip or query that swaps the rows without
             moving the focus is still heard. -->
        <p class="px-4 pt-3 text-sm text-ink-muted" aria-live="polite">{{ setLine }}</p>

        <!-- The citizens: one row per country, counted. -->
        <template v-if="citizensTab">
          <template v-if="shownCitizens.length">
            <ColumnHeader :sortable="showSort" class="gap-x-3 row-cols:grid row-cols:feedback-citizen-tracks">
              <ColumnLabel
                :label="DE.column.country"
                :sort="showSort ? { order: DE.order.country[0], reverseOrder: DE.order.country[1], active: citizensSort === 'country', reversed } : null"
                @choose="choose('country')"
              />
              <ColumnLabel
                :label="DE.column.count"
                align="end"
                class="flex justify-end"
                :sort="showSort ? { order: DE.order.count[0], reverseOrder: DE.order.count[1], active: citizensSort === 'date', reversed } : null"
                @choose="choose('date')"
              />
            </ColumnHeader>
            <ul role="list" class="divide-y divide-hairline">
              <li
                v-for="row in shownCitizens"
                :key="row.key"
                class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 px-4 py-2.5 text-sm row-cols:feedback-citizen-tracks"
              >
                <span class="min-w-0 text-ink">{{ row.name }}</span>
                <span class="text-right tabular-nums text-ink-secondary"><span class="sr-only">{{ DE.countSaid }}: </span>{{ formatNumberDe(row.count) }}</span>
              </li>
            </ul>
          </template>
          <ListBoxNotice v-else :title="DE.noneInSelection" />
          <ListMore :visible="visibleCitizens" :total="citizenRows.length" :step="STATEMENT_PAGE_SIZE" @more="moreCitizens()" @all="allCitizens(citizenRows.length)" />
        </template>

        <!-- The organisations: named rows, then what is counted without a name. -->
        <template v-else>
          <ColumnHeader v-if="shown.length" :sortable="showSort" class="gap-x-3 row-cols:grid row-cols:feedback-tracks">
            <ColumnLabel
              :label="DE.column.date"
              :sort="showSort ? { order: DE.order.date[0], reverseOrder: DE.order.date[1], active: sort === 'date', reversed } : null"
              @choose="choose('date')"
            />
            <ColumnLabel
              :label="DE.column.name"
              :sort="showSort ? { order: DE.order.name[0], reverseOrder: DE.order.name[1], active: sort === 'name', reversed } : null"
              @choose="choose('name')"
            />
            <ColumnLabel :label="DE.column.kind" />
            <ColumnLabel
              :label="DE.column.country"
              :sort="showSort ? { order: DE.order.country[0], reverseOrder: DE.order.country[1], active: sort === 'country', reversed } : null"
              @choose="choose('country')"
            />
          </ColumnHeader>
          <ul v-if="shown.length || shownClosing.length" role="list" class="divide-y divide-hairline">
            <EuFeedbackRow v-for="row in shown" :key="row.key" :row="row" />
            <!-- Counted, never named: no link, no day, no country — muted, after every named row. -->
            <li v-for="row in shownClosing" :key="row.key" class="px-4 py-2.5 text-sm text-ink-muted">{{ row.label }}</li>
          </ul>
          <ListBoxNotice v-else-if="searchActive" :title="DE.noMatch" :description="DE.noMatchNote" />
          <ListBoxNotice v-else :title="DE.noneInSelection" />
          <ListMore :visible="visible" :total="rows.length" :step="STATEMENT_PAGE_SIZE" @more="more()" @all="all(rows.length)" />
        </template>
      </ListBox>
      <!-- The one line under the list; „Methode" opens who is counted without a name. -->
      <SectionCredits :sources="[]" :marked="false">
        <span>{{ view.note }}</span>
        <template #method>
          <MethodEuRueckmeldungen />
        </template>
      </SectionCredits>
    </template>
  </div>
</template>
