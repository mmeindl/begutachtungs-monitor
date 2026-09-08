<script setup lang="ts">
/**
 * Stellungnahmen count for ConsultationCard's aside slot — DeadlineBlock's
 * two-line anatomy (leading figure, Frist line underneath), so the volume
 * ranking shares one silhouette with the deadline and outcome sections.
 *
 * Right-aligned behind an identical suffix, the figures line up down the
 * list: this is the comparison the old rank bar drew, made of type — and
 * unlike the bar it carries its own number instead of a width relative to
 * an unlabelled #1.
 */
const props = defineProps<{
  count: number
  deadline: string | null
  active: boolean
}>()

const label = computed(() => fristLabel(props.deadline, props.active))
</script>

<template>
  <div class="sm:text-right">
    <!-- Same weight and size as DeadlineBlock's countdown: heavier than the
         title, not bigger. The word stays a step lighter so the digits lead. -->
    <p
      class="whitespace-nowrap text-base font-semibold leading-tight tabular-nums text-ink"
    >
      {{ formatNumberDe(count) }}
      <span class="font-medium">{{
        count === 1 ? 'Stellungnahme' : 'Stellungnahmen'
      }}</span>
    </p>
    <p class="mt-0.5 text-xs text-ink-secondary">
      {{ label }}
    </p>
  </div>
</template>
