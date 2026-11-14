<script setup lang="ts">
/**
 * Page views over time, as bars: the one series a reader asks a trend of.
 * Since 14.11.2026, when `/statistik` began to show every day since
 * counting began — a table that grows by a row a day answers „how is it
 * going" no more, the exact figures stay in it, under the chart.
 *
 * ONE SERIES, IN INK. Subscriptions are polled on a timer and programs are
 * not readers; stacked with the page views they would read as one quantity.
 * Blue is for what can be operated, yellow is the highlighter, so the bars
 * take neither. A bar not fully counted is an outline (`saeulenAus`).
 *
 * The SVG draws only shapes, stretched to the frame
 * (`preserveAspectRatio="none"`, strokes kept at their width by
 * `non-scaling-stroke`); every label is HTML beside it, so no text is
 * squashed. The bars are hidden from screen readers: the caption says what
 * is drawn, and the table below carries every value.
 */
import type { StatistikTag } from '#shared/types'
import { formatDateDe, formatDateWeekdayDe, formatNumberDe } from '#shared/utils/format'
import { saeulenAus, skala } from '~/utils/statistikChart'

const props = defineProps<{
  /** Newest first, as `StatistikPayload.tage`. */
  tage: StatistikTag[]
}>()

const bild = computed(() => saeulenAus(props.tage))
/** The first counted day — in weeks, the first bar's Monday may lie before it. */
const seit = computed(() => props.tage.at(-1)?.tag)
const linien = computed(() => skala(Math.max(0, ...bild.value.saeulen.map((s) => s.seiten))))
const oben = computed(() => linien.value.at(-1)!)
const zahl = computed(() => bild.value.saeulen.length)
/** The share of a slot left empty between bars, less where they are many. */
const luecke = computed(() => (zahl.value > 60 ? 0.12 : 0.2))

function hoehe(n: number): number {
  return (n / oben.value) * 100
}

function titel(s: { von: string; bis: string; seiten: number; offen: boolean }): string {
  const wann = bild.value.je === 'tag'
    ? formatDateWeekdayDe(s.von)
    : `${formatDateDe(s.von)} bis ${formatDateDe(s.bis)}`
  return `${wann}: ${formatNumberDe(s.seiten)} Seitenaufrufe${s.offen ? ' (noch nicht vollständig gezählt)' : ''}`
}
</script>

<template>
  <figure class="rounded-xl border border-hairline p-4">
    <div class="flex gap-2">
      <!-- Values of the gridlines, each centred on its line. -->
      <div class="relative h-40 w-10 shrink-0 text-xs tabular-nums text-ink-muted" aria-hidden="true">
        <span
          v-for="v in linien"
          :key="v"
          class="absolute right-0 translate-y-1/2 leading-none"
          :style="{ bottom: `${hoehe(v)}%` }"
        >{{ formatNumberDe(v) }}</span>
      </div>
      <div class="min-w-0 flex-1">
        <svg
          class="block h-40 w-full overflow-visible"
          :viewBox="`0 0 ${zahl} 100`"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <line
            v-for="v in linien"
            :key="v"
            x1="0"
            :x2="zahl"
            :y1="100 - hoehe(v)"
            :y2="100 - hoehe(v)"
            class="stroke-hairline"
            :class="v === 0 && 'stroke-baseline'"
            stroke-width="1"
            vector-effect="non-scaling-stroke"
          />
          <rect
            v-for="(s, i) in bild.saeulen"
            :key="s.von"
            :x="i + luecke / 2"
            :y="100 - hoehe(s.seiten)"
            :width="1 - luecke"
            :height="hoehe(s.seiten)"
            :class="s.offen ? 'fill-none stroke-ink-secondary' : 'fill-ink-secondary'"
            :stroke-width="s.offen ? 1.5 : 0"
            vector-effect="non-scaling-stroke"
          >
            <title>{{ titel(s) }}</title>
          </rect>
        </svg>
        <div class="mt-2 flex justify-between gap-4 text-xs tabular-nums text-ink-muted" aria-hidden="true">
          <span>{{ formatDateDe(seit) }}</span>
          <span>{{ bild.je === 'tag' ? 'Tage' : 'Wochen' }}</span>
          <span>{{ formatDateDe(bild.saeulen.at(-1)?.bis) }}</span>
        </div>
      </div>
    </div>
    <!-- No visible caption (14.11.2026): the axis says what a bar is
         („Tage"/„Wochen" between the dates), and a bar's own tooltip says
         when it is not fully counted. The bars and labels are hidden from
         screen readers, so they still get one sentence. -->
    <figcaption class="sr-only">
      Säulendiagramm der Seitenaufrufe je {{ bild.je === 'tag' ? 'Tag' : 'Woche' }}
      seit {{ formatDateDe(seit) }}. Die genauen Zahlen je Tag stehen in der
      Tabelle darunter.
    </figcaption>
  </figure>
</template>
