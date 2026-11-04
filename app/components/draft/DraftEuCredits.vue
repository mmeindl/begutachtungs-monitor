<script setup lang="ts">
/**
 * The credit line under the ProcedureCard for the EU fact in it
 * (docs/architecture.md §12.66): what the fact read and from whom, in the
 * site's one credit grammar (`SectionCredits`), under the card and not in
 * it — a source statement is looked up while or after reading, never
 * before, and every other card on the page carries its line below.
 * Rendered only where the card shows the fact.
 */
import type { EuRechtResponse } from '#shared/types'
import { sourceItemsDe } from '#shared/utils/provenance'
import { euFactView } from '~/utils/euRecht'

const props = defineProps<{ data: EuRechtResponse | null | undefined }>()

const view = computed(() => euFactView(props.data))
const items = computed(() => (view.value ? sourceItemsDe(view.value.sources) : []))
</script>

<template>
  <SectionCredits
    v-if="view"
    :sources="view.sources"
    :marked="false"
    method="/so-funktionierts#eu-recht"
  >
    <span v-for="item in items" :key="item">{{ item }}</span>
  </SectionCredits>
</template>
