<script setup lang="ts">
/**
 * „Richtlinien, die Österreich umzusetzen hat" on `/eu-recht` (step 7 of
 * the EU cycle, 15.11.2026): every directive with a transposition date
 * within two years of today, by deadline, each with what the monitor found
 * and what the country notified (`euUmsetzungView`, which holds every
 * word and the rule: two observations, never a verdict).
 *
 * The list box of every list (`ListBox`): the deadline as its tabs, the
 * chip and the search in its tool row, the rows whole links
 * (`EuActRow`'s anatomy), the pager at its foot, the credit line with
 * „Methode" under it. The two observations stand in columns of their own,
 * where the draft list keeps its Stellungnahmen (`entry-col-count`): a
 * number, or a word for none and for unknown. These two columns do not
 * sort (rule D6): the list is never ordered by what is missing. The
 * deadline and the directive's name do (`EU_UMSETZUNG_SORT_COLUMNS`,
 * `useReversibleSort`, 16.11.2026): the deadline in the tab's own
 * direction — running nearest first, passed most recent first — the name
 * A–Z, each turned round by a second click; on a phone a select beside the
 * count. A new order is a new first page, as a new tab is.
 * Below `md` a row is a card and says each observation in words. The Commission's delegated and implementing
 * directives stay behind a chip that is off: they are a quarter of the
 * list and mostly change technical annexes; the chip says how many there
 * are, so leaving them out is said, not silent.
 */
import type { EuUmsetzungResponse } from '#shared/types'
import { MAX_LIST_QUERY_CHARS } from '#shared/utils/queryParams'
import { matchesQuery } from '#shared/utils/textMatch'
import { todayIso } from '#shared/utils/format'
import { EU_UMSETZUNG_DE as DE, EU_UMSETZUNG_SORT_COLUMNS as SORTS, euUmsetzungView, sortUmsetzungRows, type EuUmsetzungSort, type EuUmsetzungTab } from '~/utils/euUmsetzung'
import { reversedOption } from '~/composables/useReversibleSort'

const { data, status, error, refresh } = useFetch<EuUmsetzungResponse>('/api/eu-recht/umsetzung', { lazy: true })

const view = computed(() => (data.value ? euUmsetzungView(data.value, todayIso()) : null))

const tab = ref<EuUmsetzungTab>('laufend')
const TABS = (['laufend', 'abgelaufen'] as const).map((value) => ({ value, label: DE.tab[value] }))
const withCommission = ref(false)
const q = ref('')
const query = computed(() => q.value.trim())

const sort = ref<EuUmsetzungSort>('frist')
const reversed = ref(false)
const { choose, selectValue: sortSelect } = useReversibleSort(sort, reversed)
const sortOptions = computed(() => [
  { value: 'frist', label: DE.sortOptions.deadline[tab.value][0] },
  { value: reversedOption('frist'), label: DE.sortOptions.deadline[tab.value][1] },
  { value: 'name', label: DE.sortOptions.name },
  { value: reversedOption('name'), label: DE.sortOptions.nameReversed },
])
const sortId = useId()

const rows = computed(() => sortUmsetzungRows(
  (view.value?.tabs?.[tab.value] ?? [])
    .filter((r) => withCommission.value || !r.commission)
    .filter((r) => !query.value || matchesQuery(r.haystack, query.value)),
  sort.value,
  tab.value,
  reversed.value,
))

const STEP = 20
const visible = ref(STEP)
watch([tab, withCommission, sort, reversed], () => { visible.value = STEP })
const shown = computed(() => (query.value ? rows.value : rows.value.slice(0, visible.value)))
</script>

<template>
  <section aria-labelledby="eu-umsetzung-liste-heading" class="page-section">
    <h2 id="eu-umsetzung-liste-heading" class="section-heading">{{ DE.heading }}</h2>
    <FetchGate
      :status="status"
      :error="error"
      :data="view"
      loading-label="Richtlinien werden geladen …"
      state-class="mt-6"
      @retry="refresh()"
    >
      <template #default="{ data: list }">
        <p class="mt-2 text-ink-secondary">
          {{ list.lede }}
        </p>
        <p v-if="!list.tabs" class="mt-4 text-ink-secondary" role="status">
          {{ DE.unread }}
        </p>
        <div v-else class="mt-4">
          <ListBox>
            <template #tabs>
              <ListTabs v-model="tab" :options="TABS" :group-label="DE.tabsLabel" />
            </template>
            <template #header>
              <div v-if="list.commissionCount" class="flex flex-wrap gap-2">
                <ToggleChip :pressed="withCommission" :title="DE.commissionChipHint" @toggle="withCommission = !withCommission">
                  {{ DE.commissionChip(list.commissionCount) }}
                </ToggleChip>
              </div>
              <UInput
                v-model="q"
                type="search"
                :maxlength="MAX_LIST_QUERY_CHARS"
                icon="i-lucide-search"
                placeholder="Richtlinien durchsuchen …"
                aria-label="Richtlinien durchsuchen"
                class="w-full"
                :ui="{ base: 'min-h-target' }"
              />
              <!-- The count line, and on a phone the order beside it: from `md` the column header orders. -->
              <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <p class="text-sm text-ink-muted" aria-live="polite">
                  {{ DE.count(rows.length) }}
                </p>
                <div v-if="rows.length > 1" class="flex min-w-0 items-center gap-2 md:hidden">
                  <label :for="sortId" class="shrink-0 text-sm text-ink-secondary">{{ DE.sortLabel }}</label>
                  <TokenSelect :id="sortId" v-model="sortSelect">
                    <TokenOption v-for="opt in sortOptions" :key="opt.value" :value="opt.value">
                      {{ opt.label }}
                    </TokenOption>
                  </TokenSelect>
                </div>
              </div>
            </template>
            <ListBoxNotice
              v-if="!rows.length && query"
              :title="`Unter „${DE.tab[tab]}“ passt keine Richtlinie zu „${query}“.`"
            >
              <template #action>
                <button type="button" class="link-inline text-sm" @click="q = ''">
                  Suche löschen
                </button>
              </template>
            </ListBoxNotice>
            <ListBoxNotice v-else-if="!rows.length" :title="DE.empty(tab)" />
            <template v-else>
              <!-- „Entwürfe" and „Gemeldet" are plain labels: they order nothing (rule D6). -->
              <ColumnHeader :sortable="rows.length > 1" class="gap-4 md:flex">
                <ColumnLabel
                  :label="DE.column.directive"
                  :sort="rows.length > 1 ? { order: DE.order.name[0], reverseOrder: DE.order.name[1], active: sort === SORTS.directive, reversed } : null"
                  class="min-w-0 flex-1"
                  @choose="choose(SORTS.directive!)"
                />
                <ColumnLabel :label="DE.column.drafts" align="end" class="entry-col-count flex justify-end whitespace-nowrap" />
                <ColumnLabel :label="DE.column.measures" align="end" class="entry-col-count flex justify-end whitespace-nowrap" />
                <ColumnLabel
                  :label="DE.column.deadline"
                  :sort="rows.length > 1 ? { order: DE.order.deadline[tab][0], reverseOrder: DE.order.deadline[tab][1], active: sort === SORTS.deadline, reversed } : null"
                  align="end"
                  class="entry-col-state flex justify-end"
                  @choose="choose(SORTS.deadline!)"
                />
              </ColumnHeader>
              <ul role="list" class="divide-y divide-hairline">
                <li v-for="row in shown" :key="row.key">
                  <NuxtLink :to="row.path" class="group flex flex-col gap-3 px-4 py-3 hover:bg-hover md:flex-row md:items-center md:gap-4">
                    <div class="min-w-0 flex-1">
                      <h3 class="font-medium text-ink group-hover:underline group-hover:decoration-2">{{ row.label }}</h3>
                      <p v-if="row.subject" class="mt-0.5 text-sm text-ink-secondary">
                        {{ row.subject }}
                      </p>
                      <!-- The card says the observations in words; from `md` the columns carry them. -->
                      <p v-for="cell in [row.drafts, row.measures]" :key="cell.said" class="mt-0.5 text-sm text-ink-muted md:hidden">
                        {{ cell.said }}
                      </p>
                    </div>
                    <EuCountCell v-for="cell in [row.drafts, row.measures]" :key="cell.said" :cell="cell" />
                    <div class="flex md:entry-col-state md:justify-end">
                      <EntryState :state="row.state" />
                    </div>
                  </NuxtLink>
                </li>
              </ul>
            </template>
            <ListMore
              v-if="!query"
              :visible="visible"
              :total="rows.length"
              :step="STEP"
              @more="visible += STEP"
              @all="visible = rows.length"
            />
          </ListBox>
          <SectionCredits :sources="[]" :marked="false">
            <span v-for="item in DE.credits" :key="item">{{ item }}</span>
            <template #method>
              <MethodEuUmsetzung />
            </template>
          </SectionCredits>
        </div>
      </template>
    </FetchGate>
  </section>
</template>
