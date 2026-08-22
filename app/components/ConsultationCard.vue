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
    <h3
      class="line-clamp-2 font-medium text-ink group-hover:underline"
      :title="consultation.title"
    >
      {{ consultation.title }}
    </h3>
    <div class="flex flex-wrap items-center gap-2">
      <MinistryBadge
        :code="consultation.ministryCode"
        :name="consultation.ministryName"
      />
      <DeadlineBadge
        :deadline="consultation.deadline"
        :active="consultation.active"
      />
    </div>
    <p class="mt-auto text-sm text-ink-secondary">
      {{ countLabelDe(consultation.statementCount, 'Stellungnahme', 'Stellungnahmen') }} ·
      Eingelangt am {{ formatDateDe(consultation.arrivedAt) }}
    </p>
  </NuxtLink>
</template>
