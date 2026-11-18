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
 * (`ListTabs`), how much was read and „Weitere … lesen" as its first row
 * above the tabs, the chip „Aus <Land>", the phone's order and the search
 * in its tool row, the set line as its polite live region, the order in the column header (`ColumnLabel`,
 * `useReversibleSort`), ten rows a page with „Alle N" at its foot
 * (`ListMore`, `usePagedList`).
 *
 * WHAT A CONTROL CHANGES STANDS BELOW IT. The tabs' counts are the kinds'
 * whole, whatever the chip and the search do; the chip counts within the
 * tab above it; the set line and the rows answer to all three. The row
 * „Gelesen sind die neuesten 1.000 von 1.099 Rückmeldungen." with „Weitere 99
 * lesen" stands first, above the tabs (16.11.2026, the box's `frame`
 * slot): a further step changes the tabs' counts as well as the rows and
 * the closing rows, and search, filter and order reach only the rows read.
 * While the step is read a progress line stands in the button's place and
 * takes the focus where the button had it; when the step is in, the focus
 * goes to what stands there then (the next button, „Erneut versuchen", the
 * ceiling's sentence, or — where everything is read and the row is gone —
 * the list's heading). The reading is swapped in under the reader's tab,
 * chip, search, order and paged rows: they are this component's state, and
 * a new reading resets none of them.
 *
 * THE SET LINE ONLY WHILE NARROWED (16.11.2026, `feedbackSetLineVisible`):
 * visible while a search or the chip narrows the list, and where no
 * organisation is named at all; otherwise for a screen reader alone. It
 * mounts anew with each reading (`:key`), so a step's arrival is said once,
 * by the block's live region, not again by the changed count.
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
 * PARTIAL WHILE THE AUTOMATIC READING RUNS (16.11.2026, `partial`): with
 * page one, or the first step of 500, the list shows the named rows read
 * so far newest first and the pager over them, nothing else — no tabs, no
 * chip, no search, no order (the column labels are plain), no set line, no
 * closing rows: a count, an order or a search over part of the reading
 * would be wrong and would change under the reader's eyes. In the tool
 * row's place, one line says the rest is being read, or where an automatic
 * step failed a gap sentence with „Erneut versuchen" (`retry`). A step
 * that arrives in between swaps its rows in, and when the automatic
 * reading is complete the controls appear; either way the rows already
 * paged to stay: the first rows are the same rows in the same order, and
 * the pager is not reset — the tab the list lands on is a computed default
 * (`kind`), not a choice, so it starts no new page.
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
  feedbackSetLineVisible,
  rowsOfKind,
  type EuFeedbackCountry,
  type EuFeedbackKindTab,
  type EuFeedbackMore,
  type EuFeedbackSort,
} from '~/utils/euFeedback'
import { reversedOption } from '~/composables/useReversibleSort'

const props = withDefaults(defineProps<{
  reading: EuFeedbackReading
  /** The country the page serves; null on a page that serves none — then no chip. */
  country?: EuFeedbackCountry | null
  /** The automatic reading not complete yet: the rest still read (`restFailed` false) or an automatic step failed (true); null once it is complete. */
  partial?: { restFailed: boolean } | null
  /** The first row where the portal counts more than was read (`feedbackMoreOf`); null where everything was read, and while partial. */
  moreRow?: EuFeedbackMore | null
}>(), { country: () => EU_FEEDBACK_COUNTRY, partial: null, moreRow: null })

const emit = defineEmits<{ retry: []; more: [pages: number] }>()

const isPartial = computed(() => props.partial !== null)

const view = computed(() => euFeedbackView(props.reading, props.country))

/*
 * The first tab is where the list lands: „Alle", or the one tab there is.
 * The reader's choice is kept apart from that default, so a reading that
 * changes the tabs (a further step) changes the default without
 * counting as a choice — no new first page. While partial: every named row.
 */
const chosenKind = ref<EuFeedbackKindTab | null>(null)
const kind = computed<EuFeedbackKindTab>({
  get: () => {
    if (isPartial.value) return 'alle'
    const tabs = view.value.tabs
    return chosenKind.value !== null && tabs.some((t) => t.value === chosenKind.value) ? chosenKind.value : (tabs[0]?.value ?? 'alle')
  },
  set: (v) => { chosenKind.value = v },
})
const citizensTab = computed(() => kind.value === 'buerger')

const fromCountry = ref(false)
const chipCode = computed(() => (fromCountry.value && view.value.country ? view.value.country.code : null))
const query = ref('')
/* A query that folds to nothing (spaces, a stray hyphen) is not a filter. The citizens' tab has no names to search. */
const searchActive = computed(() => !isPartial.value && !citizensTab.value && foldForSearch(query.value).length > 0)

const chosenSort = ref<EuFeedbackSort>('date')
const chosenReversed = ref(false)
const { choose, selectValue } = useReversibleSort(chosenSort, chosenReversed)
/* While partial, the portal's own order, whatever was chosen. */
const sort = computed<EuFeedbackSort>(() => (isPartial.value ? 'date' : chosenSort.value))
const reversed = computed(() => !isPartial.value && chosenReversed.value)
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
  country: isPartial.value ? null : chipCode.value,
  query: searchActive.value ? query.value : '',
  sort: sort.value,
  reversed: reversed.value,
}))
const citizenRows = computed(() => (citizensTab.value
  ? citizenRowsOf(view.value.citizens, { country: chipCode.value, sort: citizensSort.value, reversed: reversed.value })
  : []))
const closingRows = computed(() => (isPartial.value ? [] : closingRowsOf(view.value.closing, { kind: kind.value, country: chipCode.value, query: query.value }, searchActive.value)))

/* The reader's choices start a new first page; the arrival of a reading does not. */
const resetOn = [chosenKind, fromCountry, query, chosenSort, chosenReversed]
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
const setLineVisible = computed(() => feedbackSetLineVisible({ searchActive: searchActive.value, chip: chipCode.value !== null, noneNamed: !citizensTab.value && total.value === 0 }))

/* Offered on the size of the whole list, not of the result: a field that
 * vanished once it narrowed the list would take away the way back. */
const showSearch = computed(() => !isPartial.value && !citizensTab.value && total.value > STATEMENT_SEARCH_MIN)
const showSort = computed(() => !isPartial.value && (citizensTab.value ? view.value.citizens.length > 1 : total.value > 1))
const showChip = computed(() => !isPartial.value && view.value.country !== null)
/* The complete reading's first row; while partial, „how many of how many" is the progress line's to say. */
/* `moreRow`, not `more`: the pager's `more()` holds that name. */
const showMore = computed(() => !isPartial.value && props.moreRow !== null)
/* The tool row holds the phone's order alone: from row-cols up it would be an empty band. */
const headerClass = computed(() => (!isPartial.value && !showChip.value && !showSearch.value ? 'row-cols:hidden' : false))
const showHeader = computed(() => Boolean(isPartial.value || showChip.value || showSearch.value || showSort.value))

const searchId = useId()
const sortId = useId()
const moreSentenceId = useId()

/*
 * The focus around „Weitere … lesen". The press replaces the button with
 * the progress line, which would drop the focus to <body>, where a screen
 * reader starts over at the top: it goes to the progress line instead. When
 * the step is in, it goes on to what stands in the row then, or to the
 * list's heading where the row is gone. Only where the row had the focus:
 * a click in a browser that does not focus buttons moves nothing.
 */
const frameRow = useTemplateRef<HTMLElement>('frameRow')
const progressLine = useTemplateRef<HTMLElement>('progressLine')
const listHeading = useTemplateRef<HTMLElement>('listHeading')

async function pressMore(pages: number) {
  const hadFocus = frameRow.value?.contains(document.activeElement) ?? false
  emit('more', pages)
  if (!hadFocus) return
  await nextTick()
  progressLine.value?.focus()
}

watch(() => props.moreRow?.kind ?? null, async (kind, before) => {
  // Before the DOM changes (`pre`): whether the progress line, about to go, holds the focus.
  if (before !== 'reading' || kind === 'reading' || !progressLine.value || document.activeElement !== progressLine.value) return
  await nextTick()
  const target = frameRow.value?.querySelector<HTMLElement>('button, [data-more-focus]') ?? listHeading.value
  target?.focus()
})
</script>

<template>
  <div>
    <p v-if="view.empty" class="text-sm text-ink-secondary">{{ view.empty }}</p>
    <template v-else>
      <h4 ref="listHeading" tabindex="-1" class="sr-only">{{ DE.listHeading }}</h4>
      <ListBox class="@container/list" :header-class="headerClass">
        <!-- First, above the tabs: how much was read, and the way to more. A further step changes the tabs' counts too. -->
        <template v-if="showMore && moreRow" #frame>
          <div ref="frameRow" class="flex min-h-target flex-wrap items-center gap-x-4 gap-y-2">
            <template v-if="moreRow.kind === 'offer'">
              <p :id="moreSentenceId" class="text-sm text-ink-muted">{{ moreRow.sentence }}</p>
              <UButton
                color="neutral"
                variant="outline"
                class="min-h-target justify-center tabular-nums"
                :aria-describedby="moreSentenceId"
                @click="pressMore(moreRow.next)"
              >
                {{ moreRow.label }}
              </UButton>
            </template>
            <template v-else-if="moreRow.kind === 'reading'">
              <p class="text-sm text-ink-muted">{{ moreRow.sentence }}</p>
              <!-- In the button's place; focusable only to take the focus from it (`pressMore`). -->
              <p ref="progressLine" tabindex="-1" class="flex items-center gap-2.5 text-sm text-ink-secondary">
                <span class="size-4 shrink-0 animate-spin rounded-full border-2 border-hairline border-t-accent" aria-hidden="true" />
                <span>{{ moreRow.progress }}</span>
              </p>
            </template>
            <template v-else-if="moreRow.kind === 'failed'">
              <GapNote :text="moreRow.gap" class="text-sm text-ink-secondary" />
              <UButton color="primary" @click="pressMore(moreRow.next)">{{ moreRow.retry }}</UButton>
            </template>
            <GapNote v-else :text="moreRow.gap" tabindex="-1" data-more-focus class="text-sm text-ink-muted" />
          </div>
        </template>
        <template v-if="view.tabs.length && !isPartial" #tabs>
          <ListTabs v-model="kind" :options="view.tabs" :group-label="DE.kindsLabel" collapse />
        </template>
        <template v-if="showHeader" #header>
          <!-- While partial, the tool row's place: the rest is being read, or could not be — the rows stay. Its height reserved, so the controls arrive with little shift. -->
          <div v-if="partial" class="flex min-h-target flex-wrap items-center gap-3">
            <template v-if="partial.restFailed">
              <GapNote :text="DE.restUnread(reading.read)" class="text-sm text-ink-secondary" />
              <UButton color="primary" @click="$emit('retry')">{{ DE.retry }}</UButton>
            </template>
            <p v-else class="flex items-center gap-2.5 text-sm text-ink-secondary">
              <span class="size-4 shrink-0 animate-spin rounded-full border-2 border-hairline border-t-accent" aria-hidden="true" />
              <span>{{ DE.partialLoading }}</span>
            </p>
          </div>
          <div v-if="showChip || showSort || showSearch" class="flex flex-wrap items-center gap-3">
            <ToggleChip
              v-if="showChip && view.country"
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
             moving the focus is still heard. Visible only while the search
             or the chip narrows the list, or where none is named; else for
             a screen reader alone. Mounted anew per reading, so a further
             step's new count is not said a second time. -->
        <p v-if="!isPartial" :key="reading.read" :class="setLineVisible ? 'px-4 pt-3 text-sm text-ink-muted' : 'sr-only'" aria-live="polite">{{ setLine }}</p>

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
          <!-- Page one may hold no organisation with a name; the rest may. -->
          <ListBoxNotice v-else-if="isPartial" :title="DE.noneNamed" />
          <ListBoxNotice v-else-if="searchActive" :title="DE.noMatch" :description="DE.noMatchNote" />
          <ListBoxNotice v-else :title="DE.noneInSelection" />
          <ListMore :visible="visible" :total="rows.length" :step="STATEMENT_PAGE_SIZE" @more="more()" @all="all(rows.length)" />
        </template>
      </ListBox>
      <!-- „Methode" alone under the list: it opens who is counted without a
           name. A line „Privatpersonen werden gezählt, nie genannt." stood
           beside it until 18.11.2026; the rows without a name show that
           already, and the method's lead line says it. -->
      <SectionCredits :sources="[]" :marked="false">
        <template #method>
          <MethodEuRueckmeldungen />
        </template>
      </SectionCredits>
    </template>
  </div>
</template>
