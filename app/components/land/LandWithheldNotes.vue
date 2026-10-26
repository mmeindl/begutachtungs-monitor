<script setup lang="ts">
import type { LandLawDiffResponse } from '#shared/types'
import { displayId } from '#shared/utils/unitName'
import { withheldNotes } from '~/utils/landWithheld'

/**
 * The §§ of one law that the comparison does not show, one line per cause
 * (`withheldNotes`, 25.10.2026) — each with the sentence that is true of
 * it, and the way to the Land's document, which shows them.
 */
const props = defineProps<{
  items: LandLawDiffResponse['withheld']
  /** The Land's Textgegenüberstellung, where it has an address of its own */
  documentUrl: string | null
  /** No § of the comparison is shown: nothing is „ebenfalls" changed. */
  alone?: boolean
}>()

const notes = computed(() => withheldNotes(props.items, { alone: props.alone }))

/* „§ 3, § 7 und § 12" */
const listDe = (ids: readonly string[]) => {
  const shown = ids.map(displayId)
  return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} und ${shown.at(-1)}` : shown[0] ?? ''
}
</script>

<template>
  <p v-for="n in notes" :key="n.cause" class="border-b border-hairline px-4 py-2.5 text-sm text-ink-secondary">
    {{ n.lead }} {{ listDe(n.ids) }}. <template v-if="n.text">{{ n.text }}. </template>
    <template v-if="documentUrl">Die <ExternalLink :href="documentUrl" class="link-inline">Textgegenüberstellung des Landes</ExternalLink> zeigt {{ n.ids.length === 1 ? 'ihn' : 'sie' }}.</template>
    <template v-else>Die Textgegenüberstellung des Landes zeigt {{ n.ids.length === 1 ? 'ihn' : 'sie' }}.</template>
  </p>
</template>
