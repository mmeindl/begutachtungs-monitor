<script setup lang="ts">
import type { ClosedOutcome } from '#shared/types'

/**
 * Outcome chip + Frist line for ConsultationCard's aside slot: mirrors
 * DeadlineBlock's two-line anatomy so open and closed cards share one
 * silhouette. One uniform wash for all three states — muting the no-RV
 * state would hide what must stay visible, highlighting it would make a
 * scoreboard. Plain spans: the card around it is already the link.
 */
const props = defineProps<{
  outcome: ClosedOutcome
}>()

const label = computed(() => {
  const o = props.outcome
  if (o.bgblNumber) {
    return `Kundgemacht: ${o.bgblNumber.replace(/^Bundesgesetzblatt\b/, 'BGBl.')}`
  }
  if (o.rvCitation) return 'Regierungsvorlage liegt vor'
  return 'Bisher keine Regierungsvorlage'
})
</script>

<template>
  <div class="shrink-0 sm:text-right">
    <span
      class="inline-flex items-center whitespace-nowrap rounded-full bg-mark-wash px-2.5 py-0.5 text-xs font-medium text-accent-deep"
    >
      {{ label }}
    </span>
    <p v-if="outcome.deadline" class="mt-1 text-xs text-ink-secondary">
      Frist endete {{ formatDateDe(outcome.deadline) }}
    </p>
  </div>
</template>
