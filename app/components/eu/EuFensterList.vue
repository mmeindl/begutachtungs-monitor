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
 * Three states besides the list, each its own sentence: the portal could
 * not be read (a gap sentence with the link to the portal — never an empty
 * list), the portal lists nothing open today (the portal's statement, only
 * after a successful reading), and the page cap cut the list.
 */
import type { EuFensterResponse } from '#shared/types'
import { MAX_LIST_QUERY_CHARS } from '#shared/utils/queryParams'
import { matchesQuery } from '#shared/utils/textMatch'
import { EU_FENSTER_DE as DE, EU_FENSTER_TABS, euFensterView, type EuFensterTab } from '~/utils/euFenster'

const { data, status, error, refresh } = useFetch<EuFensterResponse>('/api/eu-recht/fenster', { lazy: true })

const view = computed(() => (data.value ? euFensterView(data.value) : null))

const tab = ref<EuFensterTab>('alle')
const tabs = computed(() => EU_FENSTER_TABS.map((value) => ({
  value,
  label: DE.tab[value],
  count: view.value?.counts[value] ?? 0,
  selectLabel: DE.tabSelect[value],
})))
const q = ref('')
const query = computed(() => q.value.trim())

const rows = computed(() => (view.value?.tabs?.[tab.value] ?? []).filter((r) => !query.value || matchesQuery(r.haystack, query.value)))

/* The source of its own in the feed and the calendar (`?quelle=eu`, decision 11 of the EU cycle), offered where the list is. */
const { siteUrl } = useRuntimeConfig().public
const webcalUrl = `${siteUrl}/kalender.ics?quelle=eu`.replace(/^https?:\/\//, 'webcal://')
const feedUrl = '/feed.xml?quelle=eu'

const STEP = 20
const visible = ref(STEP)
watch(tab, () => { visible.value = STEP })
const shown = computed(() => (query.value ? rows.value : rows.value.slice(0, visible.value)))
</script>

<template>
  <section id="eu-fenster" aria-labelledby="eu-fenster-heading" class="page-section scroll-mt-6">
    <h2 id="eu-fenster-heading" class="section-heading">{{ DE.heading }}</h2>
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
        <GapNote v-if="!list.tabs && data" kind="unavailable" class="mt-4 text-ink-secondary" role="status">
          {{ DE.unread }}
          <ExternalLink :href="data.portalUrl" class="link-inline">{{ DE.portalLink }}</ExternalLink>
        </GapNote>
        <p v-else-if="list.tabs && !list.counts.alle" class="mt-4 text-ink-secondary" role="status">
          {{ DE.none }}
        </p>
        <div v-else-if="list.tabs" class="mt-4">
          <ListBox>
            <template #tabs>
              <ListTabs v-model="tab" :options="tabs" :group-label="DE.tabsLabel" collapse />
            </template>
            <template #header>
              <GapNote v-if="list.cut" kind="outOfScope" :text="list.cut" class="text-sm text-ink-muted" />
              <UInput
                v-model="q"
                type="search"
                :maxlength="MAX_LIST_QUERY_CHARS"
                icon="i-lucide-search"
                :placeholder="`${DE.search} …`"
                :aria-label="DE.search"
                class="w-full"
                :ui="{ base: 'min-h-target' }"
              />
              <p class="text-sm text-ink-muted" aria-live="polite">
                {{ DE.count(rows.length) }}
              </p>
            </template>
            <ListBoxNotice v-if="!rows.length && query" :title="DE.noMatch(tab, query)">
              <template #action>
                <button type="button" class="link-inline text-sm" @click="q = ''">
                  {{ DE.clear }}
                </button>
              </template>
            </ListBoxNotice>
            <ListBoxNotice v-else-if="!rows.length" :title="DE.empty(tab)" />
            <template v-else>
              <ColumnHeader class="gap-4 md:flex">
                <ColumnLabel :label="DE.column.title" class="min-w-0 flex-1" />
                <ColumnLabel :label="DE.column.stage" class="w-40 shrink-0" />
                <ColumnLabel :label="DE.column.act" class="w-48 shrink-0" />
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
          <!-- A plain <a> for webcal, as `SubscribeLinks` explains: it opens no page. -->
          <p class="mt-3 text-sm text-ink-secondary">
            {{ DE.subscribe }}
            <a :href="webcalUrl" class="tap-target link-inline">{{ DE.subscribeCalendar }}</a>
            ·
            <ExternalLink :href="feedUrl" class="tap-target link-inline">{{ DE.subscribeFeed }}</ExternalLink>
          </p>
          <SectionCredits :sources="[]" :marked="false">
            <span v-for="item in DE.credits" :key="item">{{ item }}</span>
            <template #method>
              <MethodEuFenster />
            </template>
          </SectionCredits>
        </div>
      </template>
    </FetchGate>
  </section>
</template>
