<script setup lang="ts">
/**
 * A row of labels on the EU chart's track (`EuTimelineChart`;
 * docs/architecture.md §12.66): the Umsetzungsfristen over the lanes, and
 * under each lane the Begutachtung and the stand — each term over its
 * dates, one per line, as many lines as the label has (a cluster of
 * deadlines names one day per line).
 *
 * With `tier`, the row is one tier under a lane and shows the labels of
 * that tier only — by `narrowTier` below `sm`, by `tier` from it — and is
 * itself gone where it has none at that width.
 *
 * `ScaleBar`'s label row on its own: the same geometry (its right inset,
 * its alignments), so a label stands exactly at the tick it names. Not a
 * `ScaleBar` without a value — that would draw a line and a dot that mean
 * nothing.
 */
import type { EuTimelineMark } from '~/utils/euRecht'

const props = defineProps<{ marks: EuTimelineMark[]; tier?: 0 | 1 }>()

const ALIGN: Record<EuTimelineMark['align'], string> = {
  start: '',
  center: '-translate-x-1/2 text-center',
  end: '-translate-x-full text-right',
}
const pct = (n: number) => `${Math.min(100, Math.max(0, n))}%`
/** The row is as tall as its tallest label, a line being 1rem (`leading-4`). */
const height = computed(() => `${Math.max(...props.marks.map((m) => m.lines.length))}rem`)

/** Shown below `sm` / from `sm`: without a tier, always. */
const narrowIn = (m: EuTimelineMark) => props.tier === undefined || (m.narrowTier ?? 0) === props.tier
const wideIn = (m: EuTimelineMark) => props.tier === undefined || (m.tier ?? 0) === props.tier
const shown = (narrow: boolean, wide: boolean) => [narrow ? '' : 'hidden', wide ? 'sm:block' : 'sm:hidden']
const rowClass = computed(() => shown(props.marks.some(narrowIn), props.marks.some(wideIn)))
</script>

<template>
  <div class="w-full pr-1.5" :class="rowClass">
    <div class="relative text-xs leading-4 text-ink-muted" :style="{ height }">
      <span
        v-for="mark in marks"
        :key="mark.key"
        class="absolute whitespace-nowrap"
        :class="[ALIGN[mark.align], ...shown(narrowIn(mark), wideIn(mark))]"
        :style="{ left: pct(mark.at) }"
      ><template v-for="(line, i) in mark.lines" :key="i"><br v-if="i > 0">{{ line }}</template></span>
    </div>
  </div>
</template>
