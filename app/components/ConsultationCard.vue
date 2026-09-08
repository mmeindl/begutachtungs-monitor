<script setup lang="ts">
import type { ConsultationSummary } from '#shared/types'

withDefaults(
  defineProps<{
    consultation: ConsultationSummary
    /**
     * What the right-hand slot leads with. 'deadline' (default) is the Frist
     * countdown; 'volume' promotes the Stellungnahmen count into that slot —
     * for the section that ranks by it — and drops it from the meta line, so
     * the figure appears exactly once per card.
     */
    emphasis?: 'deadline' | 'volume'
  }>(),
  { emphasis: 'deadline' },
)
</script>

<template>
  <NuxtLink
    :to="`/begutachtungen/${consultation.gp}/${consultation.inr}`"
    class="group flex h-full flex-col gap-3 rounded-xl border border-hairline bg-surface p-5 transition-colors hover:border-baseline sm:flex-row sm:items-start sm:gap-4"
  >
    <div class="flex min-w-0 flex-1 flex-col gap-2">
      <h3
        class="line-clamp-2 font-medium text-ink group-hover:underline"
        :title="consultation.title"
      >
        {{ consultation.title }}
      </h3>
      <p
        class="mt-auto flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-ink-secondary"
      >
        <span>{{ consultation.citation }}</span>
        <span aria-hidden="true">·</span>
        <MinistryBadge
          :code="consultation.ministryCode"
          :name="consultation.ministryName"
        />
        <span aria-hidden="true">·</span>
        <span>in Begutachtung seit {{ formatDateDe(consultation.arrivedAt) }}</span>
        <!-- Weight-based emphasis: 786 Stellungnahmen must look different
             from 3 — the count is the news signal on a card. Omitted under
             emphasis="volume", where the aside carries it as the figure. -->
        <template v-if="emphasis !== 'volume'">
          <span aria-hidden="true">·</span>
          <span>
            <span class="font-semibold tabular-nums text-ink">{{
              formatNumberDe(consultation.statementCount)
            }}</span>
            {{ consultation.statementCount === 1 ? 'Stellungnahme' : 'Stellungnahmen' }}
          </span>
        </template>
        <!-- Closed cards seed the product's question — honest at zero data
             cost, the detail page always answers it (showOutcome on !active).
             Suppressed when an aside slot is provided: the outcome chip
             there already IS the answer. -->
        <template v-if="!consultation.active && !$slots.aside">
          <span aria-hidden="true">·</span>
          <span class="font-medium text-accent-deep">Was wurde daraus?&nbsp;→</span>
        </template>
      </p>
    </div>
    <!-- Right-hand slot, one card anatomy for every list: the Frist by
         default, the ranked count under emphasis="volume", and the outcome
         chip when the dashboard's closed section fills the slot itself. -->
    <slot name="aside">
      <StatementCountBlock
        v-if="emphasis === 'volume'"
        :count="consultation.statementCount"
        :deadline="consultation.deadline"
        :active="consultation.active"
        class="shrink-0"
      />
      <DeadlineBlock
        v-else
        :deadline="consultation.deadline"
        :active="consultation.active"
        class="shrink-0"
      />
    </slot>
  </NuxtLink>
</template>
