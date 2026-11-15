<script setup lang="ts">
/**
 * Who gave feedback in one window on the Commission's portal, read (step 4
 * of the EU cycle, 15.11.2026): the contributions of the organisations the
 * naming rule allows as a list in the grammar of the Stellungnahmen
 * (`StatementsPanel`), and what is counted as figures under it.
 *
 * Built from the same parts, not from `StatementsPanel` itself, which is
 * built around Zustimmungen and its „nicht öffentlich" segment: a list box
 * (`ListBox`) with the kinds as tabs and their counts (`ListTabs`), the
 * cap, the chip „Aus <Land>", the phone's order and the search in its tool
 * row, the set line as its polite live region, the order in the column
 * header (`ColumnLabel`, `useReversibleSort`), ten rows a page with „Alle N"
 * at its foot (`ListMore`, `usePagedList`).
 *
 * WHAT A CONTROL CHANGES STANDS BELOW IT. The tabs' counts are the kinds'
 * whole, whatever the chip and the search do; the chip counts within the
 * kind above it; the set line and the rows answer to all three. The cap
 * stands at the head of the tool row, above the search, because search,
 * filter and order reach only the rows read.
 *
 * COUNTED, NEVER LISTED: persons, „Sonstige", organisations without a name
 * and rows not published are figures under the box — the reading carries
 * no row of theirs to list.
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
  /** The country the page serves; null on a page that serves none — then no chip and no „davon aus". */
  country?: EuFeedbackCountry | null
}>(), { country: () => EU_FEEDBACK_COUNTRY })

const view = computed(() => euFeedbackView(props.reading, props.country))

/* The first tab is where the list lands: „Alle", or the one kind there is. */
const kind = ref<EuFeedbackKindTab>(view.value.tabs[0]?.value ?? 'alle')
watch(() => view.value.tabs, (tabs) => {
  if (!tabs.some((t) => t.value === kind.value)) kind.value = tabs[0]?.value ?? 'alle'
})

const fromCountry = ref(false)
const query = ref('')
/* A query that folds to nothing (spaces, a stray hyphen) is not a filter. */
const searchActive = computed(() => foldForSearch(query.value).length > 0)

const sort = ref<EuFeedbackSort>('date')
const reversed = ref(false)
const { choose, selectValue } = useReversibleSort(sort, reversed)
const sortOptions = [
  { value: 'date', label: DE.sortOptions.date },
  { value: reversedOption('date'), label: DE.sortOptions.dateReversed },
  { value: 'name', label: DE.sortOptions.name },
  { value: reversedOption('name'), label: DE.sortOptions.nameReversed },
]

/* The chip counts within the kind above it, never the other way round. */
const countryCount = computed(() => {
  const c = view.value.country
  return c ? rowsOfKind(view.value.rows, kind.value).filter((r) => r.country === c.code).length : 0
})

const rows = computed(() => feedbackRowsOf(view.value.rows, {
  kind: kind.value,
  country: fromCountry.value && view.value.country ? view.value.country.code : null,
  query: searchActive.value ? query.value : '',
  sort: sort.value,
  reversed: reversed.value,
}))

const { visible, shown, more, all } = usePagedList(rows, STATEMENT_PAGE_SIZE, [kind, fromCountry, query, sort, reversed])

const total = computed(() => view.value.rows.length)
const setLine = computed(() => feedbackSetLine(rows.value.length, total.value, rows.value.length !== total.value || searchActive.value))

/* Offered on the size of the whole list, not of the result: a field that
 * vanished once it narrowed the list would take away the way back. */
const showSearch = computed(() => total.value > STATEMENT_SEARCH_MIN)
const showSort = computed(() => total.value > 1)
/* The tool row holds the phone's order alone: from row-cols up it would be an empty band. */
const headerClass = computed(() => (!view.value.cap && !view.value.country && !showSearch.value ? 'row-cols:hidden' : false))
const showHeader = computed(() => Boolean(view.value.cap || view.value.country || showSearch.value || showSort.value))

const searchId = useId()
const sortId = useId()
</script>

<template>
  <div>
    <p v-if="view.empty" class="py-3 text-sm text-ink-secondary">{{ view.empty }}</p>
    <template v-else>
      <template v-if="view.noneNamed">
        <p class="py-3 text-sm text-ink-secondary">{{ view.noneNamed }}</p>
        <GapNote v-if="view.cap" :text="view.cap" class="mb-3 text-sm text-ink-secondary" />
      </template>
      <template v-else>
        <h4 class="sr-only">{{ DE.listHeading }}</h4>
        <ListBox class="@container/list" :header-class="headerClass">
          <template #tabs>
            <ListTabs v-model="kind" :options="view.tabs" :group-label="DE.kindsLabel" collapse />
          </template>
          <template v-if="showHeader" #header>
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
                <TokenSelect :id="sortId" v-model="selectValue">
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
          <template v-if="shown.length">
            <ColumnHeader :sortable="showSort" class="gap-x-3 row-cols:grid row-cols:feedback-tracks">
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
              <ColumnLabel :label="DE.column.country" />
            </ColumnHeader>
            <ul role="list" class="divide-y divide-hairline">
              <EuFeedbackRow v-for="row in shown" :key="row.key" :row="row" />
            </ul>
          </template>
          <ListBoxNotice v-else-if="searchActive" :title="DE.noMatch" :description="DE.noMatchNote" />
          <ListBoxNotice v-else :title="DE.noneInSelection" />
          <ListMore :visible="visible" :total="rows.length" :step="STATEMENT_PAGE_SIZE" @more="more()" @all="all(rows.length)" />
        </ListBox>
      </template>
      <div v-if="view.counted.length" class="mt-3 text-sm text-ink-secondary">
        <p class="font-medium text-ink">{{ DE.countedHeading }}</p>
        <ul role="list" class="mt-1 space-y-0.5">
          <li v-for="line in view.counted" :key="line">{{ line }}</li>
        </ul>
      </div>
      <p v-if="view.unnamedReason" class="mt-3 text-sm text-ink-secondary">{{ view.unnamedReason }}</p>
      <p v-if="view.citizensNote" class="mt-3 text-sm text-ink-secondary">{{ view.citizensNote }}</p>
    </template>
  </div>
</template>
