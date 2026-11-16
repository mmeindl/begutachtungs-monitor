<script setup lang="ts">
/**
 * „Jetzt unterstützbar: Europäische Bürgerinitiativen" on `/eu-recht`
 * (step 5 of the EU cycle, 15.11.2026): every initiative the register lists
 * in collection today, by the last day of its collection (`euEciListView`,
 * which holds every word and the rule: dates first, no threshold).
 *
 * The order in the column header (`ColumnLabel`, `useReversibleSort`, as
 * every list, 16.11.2026): „Sammlung" by the last day (the opening order),
 * „Initiative" by title, „Unterstützungen" by the register's count — as
 * the draft list's Stellungnahmen column orders it — each turned round by
 * a second click; on a phone a select beside the count. A new order is a
 * new first page.
 *
 * The row grammar of `EuFensterList`: the list box, the rows whole links
 * to the initiative's page here — the way to the collection system is that
 * page's one action, not the row's —, the day in the draft list's state box
 * (`EntryState`), the credit line with „Methode" under it. The count of
 * supporters stands in its own column „Unterstützungen" between the title
 * and the day (`EuCountCell`, 16.11.2026), where the draft list keeps its
 * Stellungnahmen; „laut Register" in the frame row above the column header.
 *
 * Three states besides the list, each its own sentence: the register could
 * not be read (a gap sentence with the link to the register — never an
 * empty list), the register lists nothing in collection today (its
 * statement, only after a successful reading), and a row whose day is still
 * being read or could not be read (a gap sentence in the row, never
 * dropped). Each stands in the rows' place.
 *
 * THE FRAME WHILE LOADING (16.11.2026, `ListBoxState`): heading, lede, the
 * box, the column header (plain) and the credit line stand at once; the
 * loading line, or the request's failure with „Erneut versuchen", stands
 * where the rows will be. The count line comes with the answer.
 */
import type { EuBuergerinitiativenResponse } from '#shared/types'
import { EU_ECI_LIST_DE as DE, euEciListView, sortEciRows, type EuEciSort } from '~/utils/euEciList'
import { reversedOption } from '~/composables/useReversibleSort'
import { listBoxStatusOf } from '~/utils/listState'
import { EU_OVERVIEW_LIST_INITIAL as INITIAL, EU_OVERVIEW_LIST_STEP as STEP } from '~/utils/euKarte'

const { data, status, error, refresh } = useFetch<EuBuergerinitiativenResponse>('/api/eu-recht/buergerinitiativen', { lazy: true })

const view = computed(() => (data.value ? euEciListView(data.value) : null))
/* The frame stands at once (a list shows its frame while loading): loading and failure in the rows' place (`ListBoxState`). */
const listState = computed(() => listBoxStatusOf({ status: status.value, error: error.value, hasData: !!view.value }, DE.loading))
const loadingNow = computed(() => !!listState.value && 'loading' in listState.value)
/* Read: the register's rows are in. The count line waits for them — a count is data. */
const ready = computed(() => !!view.value?.rows)

const sort = ref<EuEciSort>('ende')
const reversed = ref(false)
const { choose, selectValue: sortSelect } = useReversibleSort(sort, reversed)
const sortOptions = [
  { value: 'ende', label: DE.sortOptions.end },
  { value: reversedOption('ende'), label: DE.sortOptions.endReversed },
  { value: 'titel', label: DE.sortOptions.title },
  { value: reversedOption('titel'), label: DE.sortOptions.titleReversed },
  { value: 'unterstuetzungen', label: DE.sortOptions.supporters },
  { value: reversedOption('unterstuetzungen'), label: DE.sortOptions.supportersReversed },
]
const sortId = useId()
const rows = computed(() => sortEciRows(view.value?.rows ?? [], sort.value, reversed.value))

/* Five stand, ten a press (`EU_OVERVIEW_LIST_INITIAL`). */
const visible = ref(INITIAL)
watch([sort, reversed], () => { visible.value = INITIAL })
const shown = computed(() => rows.value.slice(0, visible.value))
</script>

<template>
  <section id="eu-buergerinitiativen" aria-labelledby="eu-buergerinitiativen-heading" class="page-section scroll-mt-6">
    <h2 id="eu-buergerinitiativen-heading" class="section-heading">{{ DE.heading }}</h2>
    <p class="mt-2 text-ink-secondary">
      {{ DE.lede }}
    </p>
    <div class="mt-4">
      <ListBox>
        <template v-if="ready" #header>
          <!-- The count line, and on a phone the order beside it: from `md` the column header orders. -->
          <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p class="text-sm text-ink-muted">
              {{ DE.count(rows.length) }} · {{ DE.countSource }}
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
          <ColumnLabel
            :label="DE.column.supporters"
            :sort="rows.length > 1 ? { order: DE.order.supporters[0], reverseOrder: DE.order.supporters[1], active: sort === 'unterstuetzungen', reversed } : null"
            align="end"
            class="entry-col-count flex justify-end whitespace-nowrap"
            @choose="choose('unterstuetzungen')"
          />
          <ColumnLabel
            :label="DE.column.end"
            :sort="rows.length > 1 ? { order: DE.order.end[0], reverseOrder: DE.order.end[1], active: sort === 'ende', reversed } : null"
            align="end"
            class="entry-col-state flex justify-end"
            @choose="choose('ende')"
          />
        </ColumnHeader>
        <ListBoxState :state="listState" @retry="refresh()">
          <!-- The register could not be read: said in the rows' place, with the way to the register — never an empty list. -->
          <ListBoxNotice v-if="!ready && data" role="status">
            <GapNote kind="unavailable" class="text-ink-secondary">
              {{ DE.unread }}
              <ExternalLink :href="data.registerUrl" class="link-inline">{{ DE.registerLink }}</ExternalLink>
            </GapNote>
          </ListBoxNotice>
          <ListBoxNotice v-else-if="!rows.length" role="status" :title="DE.none" />
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
                  <!-- The card says the count in words; from `md` the column carries it. -->
                  <p class="mt-0.5 text-sm text-ink-muted md:hidden">
                    {{ row.supporters.said }}
                  </p>
                  <GapNote v-if="row.gap" :text="row.gap" class="mt-0.5 text-sm text-ink-secondary" />
                </div>
                <EuCountCell :cell="row.supporters" />
                <div class="flex md:entry-col-state md:justify-end">
                  <EntryState :state="row.state" />
                </div>
              </NuxtLink>
            </li>
          </ul>
        </ListBoxState>
        <ListMore
          v-if="rows.length"
          :visible="visible"
          :total="rows.length"
          :initial="INITIAL"
          :step="STEP"
          @more="visible += STEP"
          @all="visible = rows.length"
        />
      </ListBox>
      <SectionCredits :sources="[]" :marked="false">
        <span v-for="item in DE.credits" :key="item">{{ item }}</span>
        <template #method>
          <MethodEuEci />
        </template>
      </SectionCredits>
    </div>
  </section>
</template>
