<script setup lang="ts">
/**
 * The one line naming the chosen Länder a list does not hold in full, each
 * linked to its block on /datenlage (`landCoverageNote`), and nothing while
 * every chosen Land is complete. One component for `/entwuerfe` and the
 * homepage (14.11.2026), so wording and links cannot drift; it replaced the
 * fold „Wie vollständig die Länder-Entwürfe sind" on both („A list's notes
 * state, they do not explain", docs/decisions.md).
 *
 * On the homepage one per list box, under its chips, judged per list
 * (`landsIncompleteFor`): a Land can be whole in one list and not in the
 * next. `where`: `list` for `/entwuerfe`, else the homepage list.
 * `undatedKtn`: Kärnten's drafts no period can hold, where the page has the
 * live count (`/entwuerfe` only).
 */
import type { LandCode } from '#shared/types'
import { type CoverageNoteScope, landCoverageNote } from '~/utils/draftFilters'

const props = defineProps<{
  lands: readonly LandCode[]
  undatedKtn?: number
  where?: CoverageNoteScope
}>()

const parts = computed(() => landCoverageNote(props.lands, props.undatedKtn, props.where))
</script>

<template>
  <p v-if="parts" class="text-sm text-ink-muted">
    <template v-for="(part, i) in parts" :key="i">
      <NuxtLink v-if="part.href" :to="part.href" class="link-inline">{{ part.text }}</NuxtLink>
      <template v-else>{{ part.text }}</template>
    </template>
  </p>
</template>
