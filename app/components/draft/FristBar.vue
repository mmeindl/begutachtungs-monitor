<script setup lang="ts">
import { spanInDays } from '#shared/utils/format'
import { FULL_FRIST_DAYS, MEDIAN_FRIST_DAYS, fristSpanDe } from '~/utils/deadlines'

/**
 * A closed Frist against the Regelfall, drawn in the rail's station grammar
 * turned on its side (01.10.2026): the same dot (12 px, 2 px border) and
 * the same line (ink where reached, hairline beyond). One station: the
 * Frist's end, reached and so filled, with the length over it. The start
 * had a dot too until the same day; it carried nothing — the start is
 * always zero and always the left edge, where the line begins anyway — and
 * drew the eye away from the value. One dot, one focal point.
 *
 * No yellow. In the rail yellow is where the procedure stands now — a
 * state that will still move. A closed Frist will not, so its end is a
 * reached station like any other.
 *
 * The median and the Regelfall are not stations: the draft does not pass
 * through them, they are yardsticks. So they are ticks across the line,
 * never dots — as dots they read as stations, and once the end dot is
 * filled a 62-day Frist showed four identical black dots.
 *
 * For every Frist, not only at the edges. A label „Kurze Frist" on three
 * quarters of all pages would stop meaning anything — that is why the rail
 * names the class only at the edges. A line is the measurement itself, and
 * it shows both directions: a six-week Frist reaches the Regelfall, a longer
 * one runs past it. That about three quarters fall short of the Regelfall
 * is a finding, not a verdict on this page.
 *
 * Neutral on purpose: no red for short and no green for full. The Regelfall
 * allows exceptions (urgency, an EU deadline), and the line cannot know the
 * reason.
 *
 * The reference values are labelled under their ticks, term above number,
 * centred — the Regelfall's aligned right at the track's end, where
 * centring would leave it. Below `sm` the median's basis („seit 2013")
 * drops: past six weeks the two ticks sit a third of a phone apart, and the
 * long term ran into the Regelfall's (4 px at 390 px for 62 days);
 * /so-funktionierts states it. The median is context, never the yardstick:
 * half of all drafts lie below it by definition.
 *
 * Line, dot and ticks are decoration; the length above and the labels below are
 * text, so a screen reader loses nothing.
 */
const props = defineProps<{
  start: string | null | undefined
  deadline: string | null | undefined
}>()

const days = computed(() => {
  const n = spanInDays(props.start, props.deadline)
  return n !== null && n >= 1 ? n : null
})
const span = computed(() => fristSpanDe(props.start, props.deadline))

/* The track is six weeks, or the Frist where it ran longer — so a long
 * Frist reaches its end and the Regelfall moves inward. */
const scale = computed(() => Math.max(FULL_FRIST_DAYS, days.value ?? 0))
const pct = (n: number) => `${(n / scale.value) * 100}%`

const marks = computed(() => [
  { key: 'median', days: MEDIAN_FRIST_DAYS, term: 'Median', basis: 'seit 2013', value: '4 Wochen' },
  { key: 'regelfall', days: FULL_FRIST_DAYS, term: 'Regelfall', basis: null, value: '6 Wochen' },
].map((m) => ({ ...m, atEnd: m.days === scale.value })))

/* The length sits centred over its dot, except where centring would push
 * it past either end of the track. */
const hereAlign = computed(() => {
  const at = (days.value ?? 0) / scale.value
  return at < 0.1 ? '' : at > 0.9 ? '-translate-x-full' : '-translate-x-1/2'
})

const END_DOT = 'absolute top-0 box-border size-3 -translate-x-1/2 rounded-full border-2 border-ink bg-ink'
</script>

<template>
  <div v-if="days" class="mt-3 w-full pr-1.5">
    <div class="relative h-5 text-sm text-ink">
      <span
        class="absolute whitespace-nowrap"
        :class="hereAlign"
        :style="{ left: pct(days) }"
      >{{ span }}</span>
    </div>
    <div class="relative mt-1 h-3" aria-hidden="true">
      <div class="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-hairline" />
      <div class="absolute left-0 top-1/2 h-0.5 -translate-y-1/2 bg-ink" :style="{ width: pct(days) }" />
      <span
        v-for="mark in marks"
        :key="mark.key"
        class="absolute top-0 h-3 w-0.5 -translate-x-1/2 bg-ink-muted ring-2 ring-page"
        :style="{ left: pct(mark.days) }"
      />
      <span :class="END_DOT" :style="{ left: pct(days) }" />
    </div>
    <div class="relative mt-2 h-8 text-xs leading-4 text-ink-muted">
      <span
        v-for="mark in marks"
        :key="mark.key"
        class="absolute whitespace-nowrap"
        :class="mark.atEnd ? '-translate-x-full text-right' : '-translate-x-1/2 text-center'"
        :style="{ left: pct(mark.days) }"
      >{{ mark.term }}<span v-if="mark.basis" class="hidden sm:inline">{{ ` ${mark.basis}` }}</span><br>{{ mark.value }}</span>
    </div>
  </div>
</template>
