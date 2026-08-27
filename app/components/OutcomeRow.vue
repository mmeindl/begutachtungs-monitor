<script setup lang="ts">
import type { ClosedOutcome } from '#shared/types'

/**
 * One recently closed consultation with its outcome chip — the dashboard's
 * accountability rows. One uniform chip style for all three states: muting
 * the no-RV state would de-emphasize exactly what must stay visible, and
 * highlighting it would turn Nachverfolgung into a scoreboard.
 */
const props = defineProps<{
  outcome: ClosedOutcome
}>()

const chipLabel = computed(() => {
  const o = props.outcome
  if (o.bgblNumber) {
    return `Kundgemacht: ${o.bgblNumber.replace(/^Bundesgesetzblatt\b/, 'BGBl.')}`
  }
  if (o.rvCitation) return 'Regierungsvorlage liegt vor'
  return 'Bisher keine Regierungsvorlage'
})
</script>

<template>
  <NuxtLink
    :to="`/begutachtungen/${outcome.gp}/${outcome.inr}`"
    class="group flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-page sm:flex-row sm:items-center sm:gap-4"
  >
    <div class="min-w-0 flex-1">
      <p
        class="truncate font-medium text-ink group-hover:underline"
        :title="outcome.title"
      >
        {{ outcome.title }}
      </p>
      <p class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-ink-secondary">
        <span>{{ outcome.citation }}</span>
        <span aria-hidden="true">·</span>
        <MinistryBadge :code="outcome.ministryCode" :name="outcome.ministryName" />
        <template v-if="outcome.deadline">
          <span aria-hidden="true">·</span>
          <span>Frist endete {{ formatDateDe(outcome.deadline) }}</span>
        </template>
        <span aria-hidden="true">·</span>
        <span>
          <span class="font-semibold tabular-nums text-ink">{{
            formatNumberDe(outcome.statementCount)
          }}</span>
          {{ outcome.statementCount === 1 ? 'Stellungnahme' : 'Stellungnahmen' }}
        </span>
      </p>
    </div>
    <!-- Plain span, not an anchor: the whole row is already the link. -->
    <span
      class="inline-flex shrink-0 items-center self-start whitespace-nowrap rounded-full bg-accent-wash px-2.5 py-0.5 text-xs font-medium text-accent-deep sm:self-center"
    >
      {{ chipLabel }}
    </span>
  </NuxtLink>
</template>
