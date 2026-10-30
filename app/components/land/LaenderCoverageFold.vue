<script setup lang="ts">
/**
 * „Wie vollständig die Länder-Entwürfe sind" (24./25.10.2026): per Land
 * what the lists hold of it and what not, from the facts the comparison on
 * /so-funktionierts shows (`LAND_COVERAGE`) — every Land, whatever the
 * reader chose. A fold beside „Fristen
 * abonnieren" on the list and the homepage: it is about the sources, not a
 * control of a list, and in the list box it stood as a paragraph between
 * the chips and the search.
 *
 * `undatedKtn`: Kärnten's drafts no period can hold, where a list has read
 * them — then the line counts them.
 */
import type { LandCode } from '#shared/types'
import { LAND_CODES, LAND_NAME } from '#shared/utils/laender'
import { formatNumberDe } from '#shared/utils/format'
import { LAND_COVERAGE } from '#shared/utils/laenderCoverage'
import Disclosure from '~/components/ui/Disclosure.vue'

const props = defineProps<{ undatedKtn?: number }>()

const rows = computed(() => LAND_CODES.map((land: LandCode) => {
  const undated = land === 'ktn' ? props.undatedKtn : undefined
  const text = undated
    ? `datiert abgeschlossene Begutachtungen nicht – ${formatNumberDe(undated)} ${undated === 1 ? 'Entwurf ohne jedes Datum steht' : 'Entwürfe ohne jedes Datum stehen'} deshalb in keinem Zeitraum.`
    : LAND_COVERAGE[land].summary
  return { land, text, complete: LAND_COVERAGE[land].complete }
}))
</script>

<template>
  <Disclosure>
    <template #summary>
      <UIcon name="i-lucide-info" class="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
      Wie vollständig die Länder-Entwürfe sind
    </template>
    <div class="mt-1 space-y-2 pb-2 text-sm text-ink-secondary">
      <p>
        Ein Länder-Entwurf steht hier nach dem Beginn seiner Begutachtung – und nur, solange das Land ihn zeigt.
      </p>
      <ul class="divide-y divide-hairline">
        <li v-for="r in rows" :key="r.land" class="flex flex-col gap-x-4 gap-y-0.5 py-2 sm:flex-row sm:items-baseline">
          <span class="w-40 shrink-0 font-medium text-ink">{{ LAND_NAME[r.land] }}</span>
          <span><span v-if="r.complete" class="font-medium text-ink">Vollständig: </span>{{ r.text }}</span>
        </li>
      </ul>
      <p>
        <NuxtLink to="/so-funktionierts#laender" class="link-inline">Wie weit der Monitor jedem Land folgt</NuxtLink>
      </p>
    </div>
  </Disclosure>
</template>
