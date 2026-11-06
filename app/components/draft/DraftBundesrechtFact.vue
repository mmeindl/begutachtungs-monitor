<script setup lang="ts">
/**
 * One fact in a Land draft's ProcedureCard, under the EU fact: what of the
 * Bund's the draft carries out — a Grundsatzgesetz („Führt das
 * Anstellungserfordernisse-Grundsatzgesetz aus, BGBl. I Nr. 44/2025") or a
 * Vereinbarung gemäß Art. 15a B-VG („Setzt die Vereinbarung gemäß Art. 15a
 * B-VG über Sozialbetreuungsberufe um") — docs/architecture.md §12.67.
 *
 * THE EU FACT'S REGISTER: bare, a hairline above, the lead in ink, no pill
 * and no colour — a property of the draft, not a status of its procedure.
 * The law's name links to its act page where the map has one; an agreement
 * links nowhere in v1. Renders nothing while the answer is out and nothing
 * where the draft carries out nothing of the Bund's: no „keine
 * Bundesvorgaben" line.
 */
import type { LandBundesrechtResponse } from '#shared/types'
import { bundesrechtLines } from '~/utils/bundesrecht'

const props = defineProps<{ data: LandBundesrechtResponse | null | undefined }>()
const lines = computed(() => bundesrechtLines(props.data))
</script>

<template>
  <div v-if="lines.length" class="mt-4 space-y-1 border-t border-hairline pt-4">
    <p v-for="l in lines" :key="l.key" class="text-sm text-ink-secondary">
      <strong class="font-semibold text-ink">{{ l.before }}<NuxtLink v-if="l.linked && l.path" :to="l.path" class="link-inline">{{ l.linked }}</NuxtLink><template v-else-if="l.linked">{{ l.linked }}</template>{{ l.after }}</strong><template v-if="l.citation && !l.linked && l.path">, <NuxtLink :to="l.path" class="link-inline">{{ l.citation.replace(/^, /, '') }}</NuxtLink></template><template v-else-if="l.citation">{{ l.citation }}</template>.
    </p>
  </div>
</template>
