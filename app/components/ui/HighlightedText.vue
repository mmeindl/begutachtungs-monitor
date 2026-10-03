<script setup lang="ts">
import { matchRanges } from '#shared/utils/textMatch'

/**
 * A text with the search's words marked — the same `<mark>` as the
 * full-text evidence (`SearchEvidence`), so a word found in a title and one
 * found in a document look the same.
 *
 * Where it marks is `matchRanges`, the twin of the filter's `matchesQuery`:
 * one rule for what keeps a row and what it marks. Without a query it is the
 * plain text.
 */
const props = defineProps<{
  text: string
  query?: string | null
}>()

const segments = computed(() => {
  const ranges = props.query ? matchRanges(props.text, props.query) : []
  const out: Array<{ text: string; mark: boolean }> = []
  let at = 0
  for (const [start, end] of ranges) {
    if (start > at) out.push({ text: props.text.slice(at, start), mark: false })
    out.push({ text: props.text.slice(start, end), mark: true })
    at = end
  }
  if (at < props.text.length) out.push({ text: props.text.slice(at), mark: false })
  return out
})
</script>

<template>
  <template v-for="(s, i) in segments" :key="i"><mark v-if="s.mark" class="bg-mark text-ink">{{ s.text }}</mark><template v-else>{{ s.text }}</template></template>
</template>
