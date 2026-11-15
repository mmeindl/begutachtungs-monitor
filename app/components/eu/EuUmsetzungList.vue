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
 * „Methode" under it. The Commission's delegated and implementing
 * directives stay behind a chip that is off: they are a quarter of the
 * list and mostly change technical annexes; the chip says how many there
 * are, so leaving them out is said, not silent.
 */
import type { EuUmsetzungResponse } from '#shared/types'
import { MAX_LIST_QUERY_CHARS } from '#shared/utils/queryParams'
import { matchesQuery } from '#shared/utils/textMatch'
import { todayIso } from '#shared/utils/format'
import { EU_UMSETZUNG_DE as DE, euUmsetzungView, type EuUmsetzungTab } from '~/utils/euUmsetzung'

const { data, status, error, refresh } = useFetch<EuUmsetzungResponse>('/api/eu-recht/umsetzung', { lazy: true })

const view = computed(() => (data.value ? euUmsetzungView(data.value, todayIso()) : null))

const tab = ref<EuUmsetzungTab>('laufend')
const TABS = (['laufend', 'abgelaufen'] as const).map((value) => ({ value, label: DE.tab[value] }))
const withCommission = ref(false)
const q = ref('')
const query = computed(() => q.value.trim())

const rows = computed(() => (view.value?.tabs?.[tab.value] ?? [])
  .filter((r) => withCommission.value || !r.commission)
  .filter((r) => !query.value || matchesQuery(r.haystack, query.value)))

const STEP = 20
const visible = ref(STEP)
watch([tab, withCommission], () => { visible.value = STEP })
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
              <p class="text-sm text-ink-muted" aria-live="polite">
                {{ DE.count(rows.length) }}
              </p>
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
              <ColumnHeader class="gap-4 md:flex">
                <ColumnLabel label="Richtlinie" class="min-w-0 flex-1" />
                <ColumnLabel label="Umsetzungsfrist" align="end" class="entry-col-state flex justify-end" />
              </ColumnHeader>
              <ul role="list" class="divide-y divide-hairline">
                <li v-for="row in shown" :key="row.key">
                  <NuxtLink :to="row.path" class="group flex flex-col gap-3 px-4 py-3 hover:bg-hover sm:flex-row sm:items-center sm:gap-4">
                    <div class="min-w-0 flex-1">
                      <h3 class="font-medium text-ink group-hover:underline group-hover:decoration-2">{{ row.label }}</h3>
                      <p v-if="row.subject" class="mt-0.5 text-sm text-ink-secondary">
                        {{ row.subject }}
                      </p>
                      <p v-for="o in row.observations" :key="o" class="mt-0.5 text-sm text-ink-muted">
                        {{ o }}
                      </p>
                    </div>
                    <div class="flex sm:entry-col-state sm:justify-end">
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
