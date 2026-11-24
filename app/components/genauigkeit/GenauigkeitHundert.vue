<script setup lang="ts">
/**
 * What a § of one kind can be on a draft's page, out of 100 (24.11.2026): a
 * square of 100, five rows of twenty, filled column by column so each part
 * stands as one block from left to right, and under it the parts with their
 * count of 100 and what each means. „73 von 100" is read at a glance where
 * „4.654 von 6.353" is not, and the legend explains the marks on the way —
 * the page's first telling put them in a sentence of five figures.
 *
 * Squares and not a stacked bar: four parts of a hundred, and the smallest
 * (4) is a sliver on a bar but four squares a reader can count.
 *
 * NO HUE. A state is never a colour (`GenauigkeitMeter`); each square
 * mirrors the § on the page instead: solid ink where nothing stands at it,
 * ink at half where a check did not go through (3.4:1 on the paper, 4.9:1
 * against the ink), the dotted outline of the „nicht geprüft" pill, the
 * dashed outline of „nicht gezeigt" (`DiffGroup`). The squares are hidden
 * from screen readers; the legend says every part in words.
 */
import type { HundertArt, HundertTeil } from '#shared/utils/genauigkeit'

const props = defineProps<{
  caption: string
  parts: HundertTeil[]
}>()

const SQUARE: Record<HundertArt, string> = {
  ohne: 'bg-ink',
  nichtBestaetigt: 'bg-ink/50',
  nichtGeprueft: 'border-[1.5px] border-dotted border-ink-muted',
  nichtGezeigt: 'border-[1.5px] border-dashed border-ink-muted',
}

const squares = computed(() => props.parts.flatMap((p) => Array.from({ length: p.of100 }, () => p.art)))
</script>

<template>
  <figure class="mt-6">
    <figcaption class="text-sm font-medium text-ink">{{ caption }}</figcaption>
    <div class="mt-3 grid grid-flow-col grid-rows-5 auto-cols-fr gap-[3px]" aria-hidden="true">
      <span v-for="(art, i) in squares" :key="i" class="box-border aspect-square rounded-[3px]" :class="SQUARE[art]" />
    </div>
    <ul class="mt-4 grid list-none gap-x-6 gap-y-3 pl-0 sm:grid-cols-2">
      <li v-for="p in parts" :key="p.art" class="flex gap-2.5">
        <span class="mt-1 box-border size-3.5 shrink-0 rounded-[3px]" :class="SQUARE[p.art]" aria-hidden="true" />
        <span class="min-w-0 text-sm leading-snug">
          <span class="font-semibold text-ink">{{ p.of100 === 0 && p.count > 0 ? 'unter 1' : p.of100 }} {{ p.label }}</span>
          <span class="block text-ink-secondary">{{ p.meaning }}</span>
        </span>
      </li>
    </ul>
  </figure>
</template>
