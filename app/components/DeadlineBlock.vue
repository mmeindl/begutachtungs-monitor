<script setup lang="ts">
import type { DeadlineTone } from '#shared/utils/deadlines'

/**
 * Countdown plus absolute date in a fixed slot, so a deadline-sorted list
 * reads as a scannable column — without outshouting the titles. Same tone
 * system as DeadlineBadge (wash + dot + words) — the label text alone
 * carries the meaning; an expired Frist renders as one muted line, never
 * as a red element.
 */
const props = defineProps<{
  deadline: string | null
  active: boolean
}>()

const tone = computed(() => deadlineTone(props.deadline, props.active))
const label = computed(() => fristLabel(props.deadline, props.active))

/* Wash only at critical: a column of washed blocks outshouts the titles.
 * Serious keeps its dot + the countdown text — rare-and-meaningful beats
 * everywhere-and-loud. */
const washClass: Record<DeadlineTone, string> = {
  critical: 'bg-status-critical/10',
  serious: '',
  neutral: '',
  inactive: '',
}

const dotClass: Record<DeadlineTone, string> = {
  critical: 'bg-status-critical',
  serious: 'bg-status-serious',
  neutral: 'bg-accent',
  inactive: '',
}
</script>

<template>
  <!-- Expired/closed: one quiet line, no countdown theater. -->
  <p v-if="tone === 'inactive'" class="text-sm text-ink-muted">
    {{ label }}
  </p>
  <div
    v-else
    class="rounded-lg py-1.5 sm:text-right"
    :class="[washClass[tone], washClass[tone] ? 'px-2.5' : '']"
  >
    <!-- Heavier than the title (semibold vs. medium), not bigger — the
         title leads the reading order, the column stays scannable. -->
    <p
      class="flex items-center gap-1.5 text-base font-semibold leading-tight tabular-nums text-ink sm:justify-end"
    >
      <span
        class="size-1.5 shrink-0 rounded-full"
        :class="dotClass[tone]"
        aria-hidden="true"
      />
      {{ label }}
    </p>
    <!-- Inside a wash only ink stays AAA (see DeadlineBadge). -->
    <p
      v-if="deadline"
      class="mt-0.5 text-xs"
      :class="washClass[tone] ? 'text-ink' : 'text-ink-secondary'"
    >
      bis {{ formatDateWeekdayDe(deadline) }}
    </p>
  </div>
</template>
