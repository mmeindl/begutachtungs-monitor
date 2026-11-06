<script setup lang="ts">
/**
 * The credit line for the Bund-zu-Land fact on a Land's draft
 * (docs/architecture.md §12.67), under the card like the EU fact's
 * (`DraftEuCredits`): the Land's documents it was read from, named with
 * their publisher and no licence claim, and — where a Kundmachung's day was
 * read — the Bundesgesetzblatt from RIS. Rendered only where the fact is.
 */
import type { LandBundesrechtResponse } from '#shared/types'

const props = defineProps<{
  data: LandBundesrechtResponse | null | undefined
  /** „Land Oberösterreich". */
  publisher: string
}>()

const shown = computed(() => (props.data?.findings.length ?? 0) > 0)
const docs = computed(() => (props.data?.sources ?? []).filter((s, i, all) => all.findIndex((t) => t.label === s.label) === i))
const withRis = computed(() => (props.data?.findings ?? []).some((f) => f.risUrl))
</script>

<template>
  <SectionCredits v-if="shown" :sources="[]" :marked="false" method="/so-funktionierts#bund-land">
    <span>{{ withRis ? 'Quellen:' : `Quelle: ${publisher}` }}</span>
    <span v-if="docs.length"><template v-for="(doc, i) in docs" :key="doc.url"><template v-if="i > 0">{{ i === docs.length - 1 ? ' und ' : ', ' }}</template><ExternalLink :href="doc.url" class="link-muted">{{ doc.label }}</ExternalLink></template><template v-if="withRis"> ({{ publisher }})</template></span>
    <span v-if="withRis">Bundesgesetzblatt (RIS)</span>
  </SectionCredits>
</template>
