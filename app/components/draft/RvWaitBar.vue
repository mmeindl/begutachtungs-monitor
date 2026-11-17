<script setup lang="ts">
import type { RvBaseRate } from '~/utils/outcomes'
import { daysUntil } from '#shared/utils/format'
import { daysSinceFristDe, rvWaitScale } from '~/utils/outcomes'

/**
 * How long the draft has waited for its Regierungsvorlage, against how long
 * the last closed period's drafts waited (05.10.2026) — under the waiting
 * rows of the Vorlage's station frame. Until then a sentence under the
 * frame said it („… 9 von 10 davon binnen 6 Monaten nach Fristende"); the
 * win side drew its change share against a range as a bar from 02.10.2026
 * to 17.11.2026, and the framing rule asked for the same form on both sides.
 * That bar went because the comparison's legend already counts the changes;
 * this one stays, since nothing else on the page says how long drafts waited.
 *
 * `FristBar`'s grammar: the median and the window are yardsticks the draft
 * does not pass through, so ticks, never dots. Neutral as both siblings: no
 * colour once the dot passes the window — a late Vorlage is rare, not
 * impossible, and the verdict row says so in words (`noRvVerdictDe`).
 *
 * Line, dot and ticks are decoration; the value and the labels are text.
 */
const props = defineProps<{
  deadline: string | null | undefined
  rate: RvBaseRate
}>()

const days = computed(() => {
  const n = daysUntil(props.deadline)
  return n === null ? null : Math.max(0, -n)
})
const scale = computed(() => (days.value === null ? null : rvWaitScale(days.value, props.rate)))
</script>

<template>
  <ScaleBar
    v-if="days !== null && scale"
    :value="scale.value"
    :value-label="daysSinceFristDe(days)"
    :marks="scale.marks"
  >
    <template #mark="{ mark }">{{ mark.lines[0] }}<br>{{ mark.lines[1] }}</template>
  </ScaleBar>
</template>
