<script setup lang="ts">
/**
 * „Anliegen an das Parlament" on `/suche`: the rows the Anliegen list shows
 * for `/anliegen?q=…&alle=1` (`anliegenSearchRows`) — the running period,
 * every kind, open and closed. Whoever searches by subject wants what
 * became of an Anliegen as well as where one can still sign, so „Nur
 * offene", the list's default, does not apply here, and the link carries
 * `alle=1` so the list shows the same rows.
 *
 * A kind whose list could not be read is said (`anliegenUnreadDe`), never
 * counted as no hit.
 */
import type { AnliegenListResponse } from '#shared/types'
import { ANLIEGEN_PATH } from '#shared/utils/anliegen'
import { listBoxStatusOf } from '~/utils/listState'
import { ANLIEGEN_LIST_DE, anliegenSearchRows, anliegenUnreadDe, anliegenUnreadKinds } from '~/utils/anliegenView'
import { SEARCH_DE, SEARCH_HITS_SHOWN, hitOfEntry } from '~/utils/siteSearch'

const props = defineProps<{ query: string }>()

const { data, status, error, refresh } = useFetch<AnliegenListResponse>('/api/anliegen', { lazy: true })

const DE = SEARCH_DE.anliegen
const listState = computed(() => listBoxStatusOf({ status: status.value, error: error.value, hasData: !!data.value }, ANLIEGEN_LIST_DE.loading, ANLIEGEN_LIST_DE.failed))
const rows = computed(() => (data.value ? anliegenSearchRows(data.value, props.query) : []))
const hits = computed(() => rows.value.slice(0, SEARCH_HITS_SHOWN).map(hitOfEntry))
const unread = computed(() => (data.value ? anliegenUnreadDe(anliegenUnreadKinds(data.value), 'alle') : []))
</script>

<template>
  <section aria-labelledby="suche-anliegen" class="page-section">
    <h2 id="suche-anliegen" class="section-heading">{{ DE.heading }}</h2>
    <ListBox class="mt-4">
      <template #header>
        <p class="text-sm text-ink-muted" aria-live="polite">
          <template v-if="data">{{ SEARCH_DE.count(rows.length) }} · </template>{{ DE.scope }}
        </p>
        <GapNote v-for="line in unread" :key="line" :text="line" class="text-sm text-ink-muted" />
      </template>
      <ListBoxState :state="listState" @retry="refresh()">
        <ListBoxNotice v-if="!hits.length" role="status" :title="SEARCH_DE.noMatch(query)" />
        <SearchHitList v-else :hits="hits" :query="query" />
      </ListBoxState>
    </ListBox>
    <p v-if="rows.length" class="mt-3 text-sm">
      <NuxtLink :to="{ path: ANLIEGEN_PATH, query: { q: query, alle: '1' } }" class="link-inline font-medium">{{ SEARCH_DE.allIn(rows.length, DE.list) }}</NuxtLink>
    </p>
  </section>
</template>
