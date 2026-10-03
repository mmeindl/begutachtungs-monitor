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
 * drew the eye away from the value. One dot, one focal point. The anatomy
 * is `ScaleBar`'s since 03.10.2026, shared with `ChangeShareBar`.
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
const pct = (n: number) => (n / scale.value) * 100

const marks = computed(() => [
  { key: 'median', days: MEDIAN_FRIST_DAYS, term: 'Median', basis: 'seit 2013', value: '4 Wochen' },
  { key: 'regelfall', days: FULL_FRIST_DAYS, term: 'Regelfall', basis: null, value: '6 Wochen' },
].map((m) => ({
  ...m,
  at: pct(m.days),
  align: m.days === scale.value ? 'end' as const : 'center' as const,
  tick: true,
})))
</script>

<template>
  <ScaleBar
    v-if="days"
    :value="pct(days)"
    :value-label="span"
    :marks="marks"
  >
    <template #mark="{ mark }">{{ mark.term }}<span v-if="mark.basis" class="hidden sm:inline">{{ ` ${mark.basis}` }}</span><br>{{ mark.value }}</template>
  </ScaleBar>
</template>
