<script setup lang="ts">
import type { ConsultationSummary } from '#shared/types'

defineProps<{
  consultation: ConsultationSummary
}>()
</script>

<template>
  <NuxtLink
    :to="`/begutachtungen/${consultation.gp}/${consultation.inr}`"
    class="group flex h-full flex-col gap-3 rounded-xl border border-hairline bg-surface p-5 transition-colors hover:border-baseline"
  >
    <div class="flex flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
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
          <span aria-hidden="true">·</span>
          <!-- Weight-based emphasis: 786 Stellungnahmen must look different
               from 3 — the count is the news signal on a card. -->
          <span>
            <span class="font-semibold tabular-nums text-ink">{{
              formatNumberDe(consultation.statementCount)
            }}</span>
            {{ consultation.statementCount === 1 ? 'Stellungnahme' : 'Stellungnahmen' }}
          </span>
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
      <!-- Right-hand slot: DeadlineBlock by default, outcome chip on the
           dashboard's closed section — one card anatomy for both states. -->
      <slot name="aside">
        <DeadlineBlock
          :deadline="consultation.deadline"
          :active="consultation.active"
          class="shrink-0"
        />
      </slot>
    </div>
    <!-- Full-width strip under the row — the top-5 section's rank bar
         lives here, inside the same card anatomy as every other list. -->
    <slot name="footer" />
  </NuxtLink>
</template>
