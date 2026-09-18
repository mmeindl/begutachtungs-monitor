<script setup lang="ts">
import type { RisConsultation } from '#shared/types'

/**
 * Dense sibling of RisConsultationCard for md+ list contexts — one row in a
 * divide-y surface, Frist in a fixed-width right column so the values align
 * into a scannable countdown column. Mirrors DraftRow exactly, because
 * both kinds of row sit in ONE list since 17.09.2026 and are scanned in
 * one pass (docs/architecture.md §12.19).
 *
 * The type word sits where DraftRow puts the Geschäftszahl: first in the
 * meta line, since it is both the identifier-shaped thing and the fact a
 * reader filters by.
 */
defineProps<{ consultation: RisConsultation }>()
</script>

<template>
  <NuxtLink
    :to="`/entwuerfe/${consultation.id}`"
    class="group flex min-h-11 items-center gap-4 px-4 py-3 transition-colors hover:bg-page"
  >
    <div class="min-w-0 flex-1">
      <p
        class="truncate font-medium text-ink group-hover:underline"
        :title="consultation.longTitle ?? consultation.title"
      >
        {{ consultation.title }}
      </p>
      <p class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-ink-secondary">
        <span class="text-ink">{{ RIS_KIND_LABEL[consultation.kind] }}</span>
        <template v-if="consultation.startedAt">
          <span aria-hidden="true">·</span>
          <NewBadge v-if="isNewArrival(consultation.startedAt, consultation.active)" />
          <span>seit {{ formatDateDe(consultation.startedAt) }}</span>
        </template>
      </p>
    </div>
    <MinistryBadge
      v-if="consultation.ministryCode"
      :code="consultation.ministryCode"
      :name="consultation.ministryName"
      class="shrink-0"
    />
    <div class="w-40 shrink-0 text-right">
      <DeadlineBlock
        :deadline="consultation.deadline"
        :active="consultation.active"
        class="inline-block"
      />
    </div>
  </NuxtLink>
</template>
