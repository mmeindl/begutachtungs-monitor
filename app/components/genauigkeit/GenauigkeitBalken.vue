<script setup lang="ts">
/**
 * What becomes of every § the drafts change: shown as a Lesefassung, or
 * not, grouped by whose step it failed (`funnelRows`). A meter list — a
 * name, a figure and a bar per row, each bar against the same whole — and
 * not a stacked bar or a donut: the reader compares the parts with each
 * other and reads their figures, and bars on one baseline do that better
 * than segments laid end to end.
 *
 * ONE SERIES, IN INK, as `StatistikChart`: blue is for what a reader can
 * do, yellow is the highlighter, and a state is never a colour. The bars are
 * hidden from screen readers; the figure and the share beside each name are
 * text. No hover: every value is printed.
 *
 * Under each group its causes, each with the sentence that stands at the §
 * itself (`lesefassungCauseText`), so a reader who met one on a draft's page
 * recognises it here.
 */
import type { FunnelRow } from '#shared/utils/genauigkeit'
import { shareDe } from '#shared/utils/genauigkeit'
import { formatNumberDe } from '#shared/utils/format'
import { lesefassungCauseText } from '~/utils/lesefassung'

const props = defineProps<{
  rows: FunnelRow[]
  /** The whole the bars are measured against. */
  total: number
}>()

const width = (count: number) => `${Math.max(0.5, (100 * count) / props.total)}%`
</script>

<template>
  <ul class="mt-5 list-none space-y-5 pl-0">
    <li v-for="row in rows" :key="row.key">
      <div class="flex items-baseline justify-between gap-4">
        <span class="font-medium text-ink">{{ row.label }}</span>
        <span class="shrink-0 tabular-nums text-ink">
          {{ formatNumberDe(row.count) }}
          <span class="text-ink-secondary">· {{ shareDe(row.count, total) }}&nbsp;%</span>
        </span>
      </div>
      <div class="mt-1.5 h-2 rounded-full bg-hairline" aria-hidden="true">
        <div class="h-2 rounded-full bg-ink" :style="{ width: width(row.count) }" />
      </div>
      <ul v-if="row.causes.length" class="mt-2 list-none space-y-1 pl-0 text-sm text-ink-secondary">
        <li v-for="c in row.causes" :key="c.cause" class="grid grid-cols-[3.5rem_1fr] gap-x-2">
          <span class="text-right tabular-nums text-ink">{{ formatNumberDe(c.count) }}</span>
          <span>{{ lesefassungCauseText(c.cause) }}</span>
        </li>
      </ul>
    </li>
  </ul>
</template>
