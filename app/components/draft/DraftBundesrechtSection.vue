<script setup lang="ts">
/**
 * „Welches Bundesgesetz der Entwurf ausführt" / „Welche Vereinbarung der
 * Entwurf umsetzt" — an h3 section in a Land draft's „Der Entwurf", after
 * the comparison (docs/architecture.md §12.67): the acts by name —
 * „Anstellungserfordernisse-Grundsatzgesetz, BGBl. I Nr. 44/2025" (linked to
 * `/bundesrecht/<Jahr>/<Nummer>` where the map has it, „, teilweise" kept)
 * and „Vereinbarung gemäß Art. 15a B-VG über …" — and its own credit line.
 * The verb stands once, as the Entwurf station's fact that jumps here
 * (`utils/origin.ts`).
 *
 * Rendered only with a named act: „Grundsatzbestimmungen des Bundes"
 * names nothing to look up, and is said at the station alone.
 */
import type { LandBundesrechtResponse } from '#shared/types'
import { bundesrechtRows, bundesrechtSectionHeading } from '~/utils/bundesrecht'
import { BUNDESRECHT_FACT_ANCHOR } from '~/utils/origin'

const props = defineProps<{
  data: LandBundesrechtResponse | null | undefined
  /** „Land Oberösterreich", for the credit line. */
  publisher: string
}>()

const rows = computed(() => bundesrechtRows(props.data))
const heading = computed(() => bundesrechtSectionHeading(rows.value))
const id = BUNDESRECHT_FACT_ANCHOR.slice(1)
</script>

<template>
  <PageSubsection v-if="heading" :id="id" :heading="heading">
    <ul class="space-y-1 text-sm text-ink-secondary">
      <li v-for="r in rows" :key="r.key">
        <NuxtLink v-if="r.path" :to="r.path" class="link-inline">{{ r.label }}</NuxtLink><template v-else>{{ r.label }}</template>{{ r.citation }}<template v-if="r.partial">, teilweise</template>
      </li>
    </ul>
    <DraftBundesrechtCredits :data="data" :publisher="publisher" />
  </PageSubsection>
</template>
