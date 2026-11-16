<script setup lang="ts">
/**
 * „Jetzt offen: Rückmeldung an die Kommission" on `/eu-recht` (step 3 of
 * the EU cycle, 15.11.2026): every window in which the Commission takes
 * feedback on its portal today, by closing day (`euFensterView`, which
 * holds every word and the rule: dates, no count of contributions, no
 * ranking).
 *
 * The list box of `EuUmsetzungList`, so the page's lists read alike: where
 * in the process as its tabs, with their counts; the search in its tool
 * row; the rows whole links to the initiative's page here — the way to the
 * portal is that page's one action, not the row's; the pager at its foot;
 * the credit line with „Methode" under it. Below `md` a row is a card and
 * says stage and act in words.
 *
 * The order in the column header (`ColumnLabel`, `useReversibleSort`, as
 * every list): „Rückmeldung" by closing day, „Vorhaben" by title, each
 * turned round by a second click; on a phone a select beside the count.
 * „Stadium" and „Vorgesehen" do not order — the tabs divide by them. A new
 * order is a new first page, as a new tab is.
 *
 * Three states besides the list, each its own sentence in the rows' place:
 * the portal could not be read (a gap sentence with the link to the portal
 * — never an empty list), the portal lists nothing open today (the portal's
 * statement, only after a successful reading), and the page cap cut the
 * list (in the tool row).
 *
 * THE FRAME WHILE LOADING (16.11.2026, `ListBoxState`): heading, lede, the
 * box with its tabs (labels without counts, inert), the search (disabled),
 * the column header (plain) and the credit line stand at once; the loading
 * line, or the request's failure with „Erneut versuchen", stands where the
 * rows will be. The counts and the count line come with the answer.
 */
import type { EuFensterResponse } from '#shared/types'
import { MAX_LIST_QUERY_CHARS } from '#shared/utils/queryParams'
import { matchesQuery } from '#shared/utils/textMatch'
import { EU_FENSTER_DE as DE, EU_FENSTER_TABS, euFensterView, sortFensterRows, type EuFensterSort, type EuFensterTab } from '~/utils/euFenster'
import { reversedOption } from '~/composables/useReversibleSort'
import { GAP_LEAD_DE } from '#shared/utils/gaps'
import { listBoxStatusOf } from '~/utils/listState'

const { data, status, error, refresh } = useFetch<EuFensterResponse>('/api/eu-recht/fenster', { lazy: true })

const view = computed(() => (data.value ? euFensterView(data.value) : null))

/* The frame stands at once (a list shows its frame while loading): loading and failure in the rows' place (`ListBoxState`). */
const listState = computed(() => listBoxStatusOf({ status: status.value, error: error.value, hasData: !!view.value }, DE.loading))
const loadingNow = computed(() => !!listState.value && 'loading' in listState.value)
/* Read: the windows are in. Until then the tabs stand without counts and inert, the search too — a count is data. */
const ready = computed(() => !!view.value?.tabs)

const tab = ref<EuFensterTab>('alle')
const tabs = computed(() => EU_FENSTER_TABS.map((value) => ({
  value,
  label: DE.tab[value],
  ...(ready.value
    ? { count: view.value?.counts[value] ?? 0 }
    : { disabled: true, reason: loadingNow.value ? DE.loading : GAP_LEAD_DE.unavailable }),
  selectLabel: DE.tabSelect[value],
})))
const q = ref('')
const query = computed(() => q.value.trim())

const sort = ref<EuFensterSort>('ende')
const reversed = ref(false)
const { choose, selectValue: sortSelect } = useReversibleSort(sort, reversed)
const sortOptions = [
  { value: 'ende', label: DE.sortOptions.end },
  { value: reversedOption('ende'), label: DE.sortOptions.endReversed },
  { value: 'titel', label: DE.sortOptions.title },
  { value: reversedOption('titel'), label: DE.sortOptions.titleReversed },
]
const sortId = useId()

const rows = computed(() => sortFensterRows(
  (view.value?.tabs?.[tab.value] ?? []).filter((r) => !query.value || matchesQuery(r.haystack, query.value)),
  sort.value,
  reversed.value,
))

const STEP = 20
const visible = ref(STEP)
watch([tab, sort, reversed], () => { visible.value = STEP })
const shown = computed(() => (query.value ? rows.value : rows.value.slice(0, visible.value)))
</script>

<template>
  <section id="eu-fenster" aria-labelledby="eu-fenster-heading" class="page-section scroll-mt-6">
    <h2 id="eu-fenster-heading" class="section-heading">{{ DE.heading }}</h2>
    <p class="mt-2 text-ink-secondary">
      {{ DE.lede }}
    </p>
    <div class="mt-4">
      <ListBox>
        <template #tabs>
          <ListTabs v-model="tab" :options="tabs" :group-label="DE.tabsLabel" collapse />
        </template>
        <template #header>
          <GapNote v-if="view?.cut" kind="outOfScope" :text="view.cut" class="text-sm text-ink-muted" />
          <UInput
            v-model="q"
            type="search"
            :maxlength="MAX_LIST_QUERY_CHARS"
            icon="i-lucide-search"
            :placeholder="`${DE.search} …`"
            :aria-label="DE.search"
            :disabled="!ready"
            class="w-full"
            :ui="{ base: 'min-h-target' }"
          />
          <!-- The count line, and on a phone the order beside it: from `md` the column header orders. -->
          <div v-if="ready" class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
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
        <!-- Over rows, and over the loading line that holds their place: plain labels until rows exist. -->
        <ColumnHeader v-if="loadingNow || rows.length" :sortable="rows.length > 1" class="gap-4 md:flex">
          <ColumnLabel
            :label="DE.column.title"
            :sort="rows.length > 1 ? { order: DE.order.title[0], reverseOrder: DE.order.title[1], active: sort === 'titel', reversed } : null"
            class="min-w-0 flex-1"
            @choose="choose('titel')"
          />
          <ColumnLabel :label="DE.column.stage" class="w-40 shrink-0" />
          <ColumnLabel :label="DE.column.act" class="w-48 shrink-0" />
          <ColumnLabel
            :label="DE.column.end"
            :sort="rows.length > 1 ? { order: DE.order.end[0], reverseOrder: DE.order.end[1], active: sort === 'ende', reversed } : null"
            align="end"
            class="entry-col-state flex justify-end"
            @choose="choose('ende')"
          />
        </ColumnHeader>
        <ListBoxState :state="listState" @retry="refresh()">
          <!-- The portal could not be read: said in the rows' place, with the way to the portal — never an empty list. -->
          <ListBoxNotice v-if="!ready && data" role="status">
            <GapNote kind="unavailable" class="text-ink-secondary">
              {{ DE.unread }}
              <ExternalLink :href="data.portalUrl" class="link-inline">{{ DE.portalLink }}</ExternalLink>
            </GapNote>
          </ListBoxNotice>
          <ListBoxNotice v-else-if="!view?.counts.alle" role="status" :title="DE.none" />
          <ListBoxNotice v-else-if="!rows.length && query" :title="DE.noMatch(tab, query)">
            <template #action>
              <button type="button" class="link-inline text-sm" @click="q = ''">
                {{ DE.clear }}
              </button>
            </template>
          </ListBoxNotice>
          <ListBoxNotice v-else-if="!rows.length" :title="DE.empty(tab)" />
          <ul v-else role="list" class="divide-y divide-hairline">
            <li v-for="row in shown" :key="row.key">
              <NuxtLink
                :to="row.path"
                class="group flex flex-col gap-3 px-4 py-3 hover:bg-hover md:flex-row md:items-center md:gap-4"
              >
                <div class="min-w-0 flex-1">
                  <h3 class="font-medium text-ink group-hover:underline group-hover:decoration-2">{{ row.title }}</h3>
                  <p v-if="row.titleNote" class="mt-0.5 text-sm text-ink-muted">
                    {{ row.titleNote }}
                  </p>
                  <!-- The card says stage and act in words; from `md` the columns carry them. -->
                  <p class="mt-0.5 text-sm text-ink-muted md:hidden">
                    {{ DE.said.stage }}: {{ row.stage }}<template v-if="row.act"> · {{ DE.said.act }}: {{ row.act }}</template>
                  </p>
                </div>
                <p class="hidden w-40 shrink-0 text-sm text-ink-secondary md:block">
                  <span class="sr-only">{{ DE.said.stage }}: </span>{{ row.stage }}
                </p>
                <p class="hidden w-48 shrink-0 text-sm text-ink-secondary hyphens-auto md:block">
                  <template v-if="row.act">
                    <span class="sr-only">{{ DE.said.act }}: </span>{{ row.act }}
                  </template>
                </p>
                <div class="flex md:entry-col-state md:justify-end">
                  <EntryState :state="row.state" />
                </div>
              </NuxtLink>
            </li>
          </ul>
        </ListBoxState>
        <ListMore
          v-if="!query && rows.length"
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
          <MethodEuFenster />
        </template>
      </SectionCredits>
    </div>
  </section>
</template>
