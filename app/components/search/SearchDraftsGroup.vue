<script setup lang="ts">
/**
 * „Entwürfe und Gesetze" on `/suche`: the draft list's own rows for
 * `/entwuerfe?q=…` — its filters read from this page's address, which they
 * leave alone (`syncUrl: false`), its rows from `useDraftList`. So the count
 * line here is the list's count line, word for word, the gaps are its gaps,
 * and the rows are its first rows in its default order.
 *
 * The count line counts each kind apart, as the list does; the link names
 * no total for the same reason. The full text of the running Begutachtungen
 * is the list's second answer and costs a request to RIS — it stays there,
 * and the line under the link says so.
 */
import { LAND_NAME, SOURCE_PARAM } from '#shared/utils/laender'
import { gapLabelDe } from '#shared/utils/gaps'
import type { ListBoxStatus } from '~/utils/listState'
import { SEARCH_DE, SEARCH_HITS_SHOWN, hitOfEntry } from '~/utils/siteSearch'

const props = defineProps<{ query: string }>()

const route = useRoute()
const { bund, laender } = useSourceChoice()
const filters = useDraftFilters({ bund, laender }, { syncUrl: false })
const list = useDraftList(filters, { bund, laender })
const { countLabel, entries, gateData, gateStatus, listPending, lawsUnreadable, sourceUnavailable, unreadableLaender, unreadableLandLaws, retry } = list
await list.ready

const DE = SEARCH_DE.drafts
/* The list's box states, as `/entwuerfe` has them: loading until the lead
 * half answered, and while a late part may still bring the first row. */
const listState = computed<ListBoxStatus>(() => {
  if (gateData.value && (entries.value.length || !listPending.value)) return null
  if (gateData.value || gateStatus.value === 'pending' || gateStatus.value === 'idle') return { loading: 'Entwürfe werden geladen …' }
  return { failed: { text: gapLabelDe('Entwürfe', 'unavailable'), description: 'Die Quelle hat nicht geantwortet.' } }
})
const hits = computed(() => entries.value.slice(0, SEARCH_HITS_SHOWN).map(hitOfEntry))
const listLink = computed(() => {
  const quellen = route.query[SOURCE_PARAM]
  return { path: '/entwuerfe', query: { q: props.query, ...(quellen !== undefined ? { [SOURCE_PARAM]: quellen } : {}) } }
})
</script>

<template>
  <section aria-labelledby="suche-entwuerfe" class="page-section">
    <h2 id="suche-entwuerfe" class="section-heading">{{ DE.heading }}</h2>
    <ListBox class="mt-4">
      <template #header>
        <!-- The site's choice of sources (`SourceChips`), first in the box's
             head as on `/entwuerfe` and the homepage's boxes (17.11.2026;
             above the whole page until then, where it read as a choice for
             every answer — the Anliegen and the Commission's lists know
             none). A Land the view cannot take stands with its reason. The
             EU's two act lists follow it too and say so. -->
        <SourceChips :unavailable="sourceUnavailable" />
        <p v-if="gateData" class="text-sm text-ink-muted" aria-live="polite">
          {{ countLabel }}
        </p>
        <GapNote v-if="lawsUnreadable" kind="unavailable" text="die Gesetze des Bundes ohne Entwurf." class="text-sm text-ink-muted" />
        <GapNote
          v-for="s in unreadableLandLaws"
          :key="`gesetze-${s.land}`"
          kind="unavailable"
          :text="'die Gesetze ' + (s.land === 'w' ? 'Wiens' : 'des Landes ' + LAND_NAME[s.land]) + ' ohne zugeordneten Entwurf.'"
          class="text-sm text-ink-muted"
        />
        <GapNote v-for="s in unreadableLaender" :key="s.land" kind="unavailable" :text="`${LAND_NAME[s.land]}.`" class="text-sm text-ink-muted" />
      </template>
      <ListBoxState :state="listState" @retry="retry()">
        <ListBoxNotice v-if="!hits.length" role="status" :title="SEARCH_DE.noMatch(query)" />
        <SearchHitList v-else :hits="hits" :query="query" />
      </ListBoxState>
    </ListBox>
    <p class="mt-3 text-sm">
      <NuxtLink :to="listLink" class="link-inline font-medium">{{ SEARCH_DE.allIn(0, DE.list) }}</NuxtLink>
      <span class="text-ink-muted"> – {{ DE.fullText }}</span>
    </p>
  </section>
</template>
