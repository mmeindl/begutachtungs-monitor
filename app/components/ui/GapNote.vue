<script setup lang="ts">
/**
 * A gap sentence (`shared/utils/gaps.ts`, 15.11.2026): the lead word in
 * semibold, in the text's own ink — weight carries it, never a colour or a
 * symbol. Three ways in:
 * - `text` alone: a finished string, as a server reason arrives. A string
 *   without a lead word renders as it is, so a reason that is a state of the
 *   procedure stays plain.
 * - `kind` and `text`: the lead word is set in front of the text.
 * - `kind` and the default slot: for a sentence that carries a link.
 *
 * Only the element: spacing, size and tone come from the caller, as for any
 * paragraph in its place.
 */
import { GAP_LEAD_DE, gapDe, splitGap, type GapKind } from '#shared/utils/gaps'

const props = defineProps<{
  text?: string | null
  kind?: GapKind
  /** `span` inside a sentence or a list row; `p` on its own line. */
  as?: 'p' | 'span'
}>()

const slots = useSlots()

const parts = computed(() => {
  if (slots.default && props.kind) return { lead: GAP_LEAD_DE[props.kind], rest: null, full: '' }
  const full = props.kind && props.text ? gapDe(props.kind, props.text) : props.text ?? ''
  const split = splitGap(full)
  return { lead: split?.lead ?? null, rest: split?.rest ?? null, full }
})
</script>

<template>
  <component :is="as ?? 'p'">
    <template v-if="parts.lead">
      <span class="font-semibold">{{ parts.lead }}:</span>
      {{ ' ' }}<slot>{{ parts.rest }}</slot>
    </template>
    <template v-else>{{ parts.full }}</template>
  </component>
</template>
