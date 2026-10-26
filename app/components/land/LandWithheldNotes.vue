<script setup lang="ts">
import type { LandLawDiffResponse } from '#shared/types'
import { displayId } from '#shared/utils/unitName'
import { quotedInstruction, reachesNote, withheldNotes } from '~/utils/landWithheld'

/**
 * The §§ of one law that the comparison does not show, one line per cause
 * (`withheldNotes`, 25.10.2026) — each with the sentence that is true of
 * it, and the way to the Land's document, which shows them. After them the
 * law's instructions that reach §§ they do not name, as the document prints
 * them (`reachesNote`, 26.10.2026).
 */
const props = defineProps<{
  items: LandLawDiffResponse['withheld']
  /** The Land's Textgegenüberstellung, where it has an address of its own */
  documentUrl: string | null
  /** No § of the comparison is shown: nothing is „ebenfalls" changed. */
  alone?: boolean
  /** Instructions of the Novelle that reach §§ they do not name, for this law */
  reaches?: readonly string[]
}>()

const notes = computed(() => withheldNotes(props.items, { alone: props.alone }))
const reaching = reachesNote()

/* „§ 3, § 7 und § 12": the joint before the k-th of n. */
const joint = (k: number, n: number) => (k === 0 ? '' : k === n - 1 ? ' und ' : ', ')
</script>

<template>
  <p v-for="n in notes" :key="n.cause" class="border-b border-hairline px-4 py-2.5 text-sm text-ink-secondary">
    {{ n.lead }} <template v-for="(id, k) in n.ids" :key="k">{{ joint(k, n.ids.length) }}<!-- A renumbered § as the comparison names it, „§ 13 → § 9" (26.10.2026). --><template v-if="n.fromIds[k]">{{ displayId(n.fromIds[k]!) }}<span aria-hidden="true">&nbsp;→ </span><span class="sr-only"> wird zu </span></template>{{ displayId(id) }}</template>. <template v-if="n.text">{{ n.text }}. </template>
    <template v-if="documentUrl">Die <ExternalLink :href="documentUrl" class="link-inline">Textgegenüberstellung des Landes</ExternalLink> zeigt {{ n.pronoun }}.</template>
    <template v-else>Die Textgegenüberstellung des Landes zeigt {{ n.pronoun }}.</template>
  </p>
  <p v-for="instruction in reaches ?? []" :key="instruction" class="border-b border-hairline px-4 py-2.5 text-sm text-ink-secondary">
    {{ reaching.lead }} <span class="italic">{{ quotedInstruction(instruction) }}</span> {{ reaching.after }}
  </p>
</template>
