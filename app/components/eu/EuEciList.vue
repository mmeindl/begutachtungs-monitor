<script setup lang="ts">
/**
 * „Jetzt unterstützbar: Europäische Bürgerinitiativen" on `/eu-recht`
 * (step 5 of the EU cycle, 15.11.2026): every initiative the register lists
 * in collection today, by the last day of its collection (`euEciListView`,
 * which holds every word and the rule: dates, no order by supporters, no
 * threshold).
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
 * dropped).
 */
import type { EuBuergerinitiativenResponse } from '#shared/types'
import { EU_ECI_LIST_DE as DE, euEciListView } from '~/utils/euEciList'

const { data, status, error, refresh } = useFetch<EuBuergerinitiativenResponse>('/api/eu-recht/buergerinitiativen', { lazy: true })

const view = computed(() => (data.value ? euEciListView(data.value) : null))

const STEP = 20
const visible = ref(STEP)
const shown = computed(() => (view.value?.rows ?? []).slice(0, visible.value))
</script>

<template>
  <section id="eu-buergerinitiativen" aria-labelledby="eu-buergerinitiativen-heading" class="page-section scroll-mt-6">
    <h2 id="eu-buergerinitiativen-heading" class="section-heading">{{ DE.heading }}</h2>
    <FetchGate
      :status="status"
      :error="error"
      :data="view"
      :loading-label="DE.loading"
      state-class="mt-6"
      @retry="refresh()"
    >
      <template #default="{ data: list }">
        <p class="mt-2 text-ink-secondary">
          {{ DE.lede }}
        </p>
        <GapNote v-if="!list.rows && data" kind="unavailable" class="mt-4 text-ink-secondary" role="status">
          {{ DE.unread }}
          <ExternalLink :href="data.registerUrl" class="link-inline">{{ DE.registerLink }}</ExternalLink>
        </GapNote>
        <p v-else-if="list.rows && !list.rows.length" class="mt-4 text-ink-secondary" role="status">
          {{ DE.none }}
        </p>
        <div v-else-if="list.rows" class="mt-4">
          <ListBox>
            <template #header>
              <p class="text-sm text-ink-muted">
                {{ DE.count(list.rows.length) }} · {{ DE.countSource }}
              </p>
            </template>
            <ColumnHeader class="gap-4 md:flex">
              <ColumnLabel :label="DE.column.title" class="min-w-0 flex-1" />
              <ColumnLabel :label="DE.column.supporters" align="end" class="entry-col-count flex justify-end whitespace-nowrap" />
              <ColumnLabel :label="DE.column.end" align="end" class="entry-col-state flex justify-end" />
            </ColumnHeader>
            <ul role="list" class="divide-y divide-hairline">
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
            <ListMore
              :visible="visible"
              :total="list.rows.length"
              :step="STEP"
              @more="visible += STEP"
              @all="visible = list.rows.length"
            />
          </ListBox>
          <SectionCredits :sources="[]" :marked="false">
            <span v-for="item in DE.credits" :key="item">{{ item }}</span>
            <template #method>
              <MethodEuEci />
            </template>
          </SectionCredits>
        </div>
      </template>
    </FetchGate>
  </section>
</template>
