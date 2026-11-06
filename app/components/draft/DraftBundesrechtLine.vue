<script setup lang="ts">
/**
 * One line in a Ministerialentwurf's ProcedureCard once its Grundsatzgesetz
 * is kundgemacht: the Land drafts that carry it out (docs/architecture.md
 * §12.67). Two facts in the idiom of the EU fact's dates row, no verdict
 * (D6): „Ausgeführt in 3 Entwürfen der Länder →" where the map has drafts;
 * else „Ausführungsgesetze der Länder: noch kein Entwurf im Fenster · Frist
 * laut Grundsatzgesetz: „binnen eines Jahres"" — the act's own words, no
 * computed date, never „0 Länder". The Länder follow two to nine months
 * after the Kundmachung, so a draft still in Begutachtung or Parliament has
 * no line at all (the endpoint answers none).
 */
import type { MeBundesrechtLine } from '#shared/types'
import { meLineView } from '~/utils/bundesrecht'

const props = defineProps<{ line: MeBundesrechtLine | null | undefined }>()
const view = computed(() => meLineView(props.line))
</script>

<template>
  <p v-if="view" class="mt-4 border-t border-hairline pt-4 text-sm text-ink-secondary">
    <NuxtLink v-if="view.link" :to="view.path" class="link-inline">{{ view.link }} →</NuxtLink>
    <template v-else>
      {{ view.none }}<template v-if="view.frist"> · Frist laut Grundsatzgesetz: „{{ view.frist }}“</template>
    </template>
  </p>
</template>
