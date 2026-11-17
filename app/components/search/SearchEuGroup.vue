<script setup lang="ts">
/**
 * „EU-Recht in Österreich" on `/suche`: the EU page holds five lists, each
 * with its own search, and they stay five answers here — the windows of the
 * Commission's portal, the European Citizens' Initiatives, the directives
 * to transpose, the acts drafts implement and the acts drafts only restate.
 * Each by its list's view function and `haystack` (`siteSearch.ts`), each
 * link onto its list on `/eu-recht` with the term set (`?q=`, read by every
 * list there on arrival).
 *
 * A list with hits stands as a box; the lists without a hit share one line;
 * a list whose source could not be read, or that is still loading, says so
 * on a line of its own — a gap is never folded into „nothing found".
 */
import type { EuActsResponse, EuBuergerinitiativenResponse, EuFensterResponse, EuUmsetzungResponse } from '#shared/types'
import { todayIso } from '#shared/utils/format'
import { euEciListView } from '~/utils/euEciList'
import { euFensterView } from '~/utils/euFenster'
import { euUmsetzungView } from '~/utils/euUmsetzung'
import { SEARCH_DE, SEARCH_HITS_SHOWN, actSearch, eciSearch, fensterSearch, umsetzungSearch, type EuSearchGroup } from '~/utils/siteSearch'

const props = defineProps<{ query: string }>()

const today = todayIso()
const { chosen } = useSourceChoice()
const fenster = useFetch<EuFensterResponse>('/api/eu-recht/fenster', { lazy: true })
const eci = useFetch<EuBuergerinitiativenResponse>('/api/eu-recht/buergerinitiativen', { lazy: true })
const umsetzung = useFetch<EuUmsetzungResponse>('/api/eu-recht/umsetzung', { lazy: true })
const akte = useFetch<EuActsResponse>('/api/eu-recht', { lazy: true })

type Answer = { group: EuSearchGroup; loading: boolean }
/* Loading while no answer came and no error; a failed request is a list
 * that could not be read (`hits: null`), as an answer that says so. */
const loadingOf = (f: { data: Ref<unknown>; error: Ref<unknown> }) => !f.data.value && !f.error.value
const answers = computed<Answer[]>(() => {
  const q = props.query
  const [acts, restating] = actSearch(akte.data.value ?? null, chosen.value, q, today)
  return [
    { group: fensterSearch(fenster.data.value ? euFensterView(fenster.data.value) : null, q), loading: loadingOf(fenster) },
    { group: eciSearch(eci.data.value ? euEciListView(eci.data.value) : null, q), loading: loadingOf(eci) },
    { group: umsetzungSearch(umsetzung.data.value ? euUmsetzungView(umsetzung.data.value, today) : null, q), loading: loadingOf(umsetzung) },
    { group: acts!, loading: loadingOf(akte) },
    { group: restating!, loading: loadingOf(akte) },
  ]
})
const withHits = computed(() => answers.value.filter((a) => a.group.hits?.length))
const loading = computed(() => answers.value.filter((a) => a.loading))
const unread = computed(() => answers.value.filter((a) => !a.loading && a.group.hits === null))
const none = computed(() => answers.value.filter((a) => a.group.hits?.length === 0))
</script>

<template>
  <section aria-labelledby="suche-eu" class="page-section">
    <h2 id="suche-eu" class="section-heading">{{ SEARCH_DE.eu.heading }}</h2>
    <div v-for="{ group } in withHits" :key="group.id" class="mt-6">
      <h3 class="font-semibold text-ink">{{ group.heading }}</h3>
      <ListBox class="mt-2">
        <template #header>
          <p class="text-sm text-ink-muted">{{ SEARCH_DE.count(group.hits!.length) }}</p>
        </template>
        <SearchHitList :hits="group.hits!.slice(0, SEARCH_HITS_SHOWN)" :query="query" :heading-level="4" />
      </ListBox>
      <p class="mt-3 text-sm">
        <NuxtLink :to="{ path: '/eu-recht', query: { q: query }, hash: `#${group.anchor}` }" class="link-inline font-medium">
          {{ SEARCH_DE.allIn(group.hits!.length, SEARCH_DE.eu.list) }}
        </NuxtLink>
      </p>
    </div>
    <div class="mt-6 flex flex-col gap-2 text-sm text-ink-muted" aria-live="polite">
      <p v-for="{ group } in loading" :key="group.id">{{ group.heading }}: wird geladen …</p>
      <GapNote v-for="{ group } in unread" :key="group.id" kind="unavailable" :text="`${group.heading}.`" />
      <p v-if="none.length">{{ SEARCH_DE.eu.noneIn(none.map((a) => a.group.heading)) }}</p>
    </div>
  </section>
</template>
