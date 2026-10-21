<script setup lang="ts">
import { spanInDays } from '#shared/utils/format'
import type { FristKind } from '~/utils/deadlines'
import { FULL_FRIST_DAYS, fristPeriodFor, fristSpanDe } from '~/utils/deadlines'

/**
 * A Frist against the Regelfall, drawn in the rail's station grammar
 * turned on its side (01.10.2026): the same dot (12 px, 2 px border) and
 * the same line (ink where reached, hairline beyond). One station: the
 * Frist's end, reached and so filled, with the length over it. The start
 * had a dot too until the same day; it carried nothing — the start is
 * always zero and always the left edge, where the line begins anyway — and
 * drew the eye away from the value. One dot, one focal point. The anatomy
 * is `ScaleBar`'s since 03.10.2026, shared with `ChangeShareBar`.
 *
 * No yellow. In the rail yellow is where the procedure stands now — a
 * state that will still move. The Frist's length does not: it is fixed the
 * day the Begutachtung opens, so the bar draws it the same while the Frist
 * runs (13.10.2026) as once it has closed — the countdown is the door
 * card's, not the bar's.
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
 * centring would leave it. Below `sm` the median's basis („XXVIII. GP")
 * drops: past six weeks the two ticks sit a third of a phone apart, and the
 * long term ran into the Regelfall's (4 px at 390 px for 62 days);
 * /so-funktionierts states it. The median is context, never the yardstick:
 * half of all drafts lie below it by definition.
 *
 * The median is the one of the period the Frist began in (21.10.2026, „seit
 * 2013" until then): a draft is held against the practice of the government
 * that sent it (`fristPeriodFor`). Before GP XXV there is no measured row,
 * and the bar shows the Regelfall alone.
 *
 * Line, dot and ticks are decoration; the length above and the labels below are
 * text, so a screen reader loses nothing.
 */
const props = withDefaults(defineProps<{
  start: string | null | undefined
  deadline: string | null | undefined
  /** Whose practice the median is: Ministerialentwürfe or Verordnungen. */
  kind?: FristKind
}>(), { kind: 'entwurf' })

const days = computed(() => {
  const n = spanInDays(props.start, props.deadline)
  return n !== null && n >= 1 ? n : null
})
const span = computed(() => fristSpanDe(props.start, props.deadline))

/* The track is six weeks, or the Frist where it ran longer — so a long
 * Frist reaches its end and the Regelfall moves inward. */
const scale = computed(() => Math.max(FULL_FRIST_DAYS, days.value ?? 0))
const pct = (n: number) => (n / scale.value) * 100

const period = computed(() => fristPeriodFor(props.start, props.kind))

/** „4 Wochen", or the days where the median is no whole number of weeks. */
function lengthDe(days: number): string {
  return days % 7 === 0 ? `${days / 7} Wochen` : `${days} Tage`
}

const marks = computed(() => [
  ...(period.value
    ? [{ key: 'median', days: period.value.practice.median, term: 'Median', basis: period.value.basisShort, value: lengthDe(period.value.practice.median) }]
    : []),
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
