<script setup lang="ts">
/**
 * One part of a whole as a row: a name, its figure, and a bar against the
 * whole — the §§ that end at a step of the way, or the share of injected
 * faults a check caught (19.11.2026). A meter and not a stacked bar or a
 * donut: the reader compares the rows with each other and reads their
 * figures, and bars on one baseline do that better than segments laid end
 * to end.
 *
 * ONE SERIES, IN INK, as `StatistikChart`: blue is for what a reader can
 * do, yellow is the highlighter, and a state is never a colour. A blind
 * spot is a short bar, not a red one. The bar is hidden from screen
 * readers; the figure beside the name is text. No hover: every value is
 * printed.
 *
 * A part of 0 has no bar at all — the half-percent sliver that keeps a
 * small part visible would read as „a few" where the measurement says
 * none.
 */
const props = defineProps<{
  label: string
  /** The figure as printed: „1.085 · 23,0 %", „99,8 %". */
  figure: string
  part: number
  whole: number
  /** A quiet line under the bar: what the figure is of. */
  note?: string
}>()

const width = computed(() => (props.part > 0 ? `${Math.max(0.5, (100 * props.part) / props.whole)}%` : '0'))
</script>

<template>
  <div>
    <div class="flex items-baseline justify-between gap-4 text-sm">
      <span class="text-ink">{{ label }}</span>
      <span class="shrink-0 font-medium tabular-nums text-ink">{{ figure }}</span>
    </div>
    <div class="mt-1 h-2 rounded-full bg-hairline" aria-hidden="true">
      <div class="h-2 rounded-full bg-ink" :style="{ width }" />
    </div>
    <p v-if="note" class="mt-1 text-xs text-ink-secondary">{{ note }}</p>
  </div>
</template>
