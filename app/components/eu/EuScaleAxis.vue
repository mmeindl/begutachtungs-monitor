<script setup lang="ts">
/**
 * The label of the act page's shared track, once, over the chart's first
 * lane (`EuActChart`; docs/architecture.md §12.66): the deadline as on a
 * draft's EU timeline — „Umsetzungsfrist" over its date (`euActPageView`).
 * Under the last row of a long list it stood screens away from the ticks it
 * named (05.11.2026).
 *
 * `ScaleBar`'s label row on its own: the same geometry (its right inset,
 * its height, its alignments), so a label stands exactly under the tick it
 * names on every row above. Not a `ScaleBar` without a value — that would
 * draw a line and a dot that mean nothing.
 */
import type { EuTimelineMark } from '~/utils/euRecht'

defineProps<{ marks: EuTimelineMark[] }>()

const ALIGN: Record<EuTimelineMark['align'], string> = {
  start: '',
  center: '-translate-x-1/2 text-center',
  end: '-translate-x-full text-right',
}
const pct = (n: number) => `${Math.min(100, Math.max(0, n))}%`
</script>

<template>
  <div class="w-full pr-1.5">
    <div class="relative h-8 text-xs leading-4 text-ink-muted">
      <span
        v-for="mark in marks"
        :key="mark.key"
        class="absolute whitespace-nowrap"
        :class="ALIGN[mark.align]"
        :style="{ left: pct(mark.at) }"
      ><template v-if="mark.lines[0]">{{ mark.lines[0] }}</template><template v-else>&nbsp;</template><br>{{ mark.lines[1] }}</span>
    </div>
  </div>
</template>
