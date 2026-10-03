<script setup lang="ts">
import type { ChangeShareRate } from '~/utils/outcomes'

/**
 * How much of the draft the Regierungsvorlage changed, against the middle
 * half of a whole period (docs/architecture.md §12.38) — under the row
 * „Umgeschrieben oder gestrichen" of the Vorlage's station frame
 * (02.10.2026). Until then the comparison said it in a sentence („Üblich in
 * der XXVII. GP: 46–75 %"), which the reader had to turn into a picture.
 *
 * `FristBar`'s grammar, so the page has one way to draw a value against a
 * yardstick (`ScaleBar` since 03.10.2026): a hairline track from 0 to 100 %,
 * the ink line up to the value, one filled dot on it. The yardstick differs —
 * a range, not a point — so it is a band behind the line, never ticks: two
 * ticks read as two thresholds, and nothing happens at 46 % or at 75 %.
 *
 * Neutral on purpose, as the Frist's bar: no colour for a share above or
 * below the band. A large change is not a failure of the draft and a small
 * one no win (framing rule, §4); the band says what is usual, not what is
 * right.
 *
 * Line, dot and band are decoration; the count above it and the band's label
 * below are text, so a screen reader loses nothing.
 */
const props = defineProps<{
  /** 0…1 */
  share: number
  rate: ChangeShareRate
}>()

const bandMid = computed(() => (props.rate.p25 + props.rate.p75) / 2)
/* The label centred under the band, except where centring would push it
 * past either end of the track. */
const marks = computed(() => [{
  key: 'band',
  at: bandMid.value,
  align: bandMid.value < 20 ? 'start' as const : bandMid.value > 80 ? 'end' as const : 'center' as const,
}])
</script>

<template>
  <ScaleBar :value="share * 100" :band="[rate.p25, rate.p75]" :marks="marks">
    <template #mark>
      Üblich in der {{ rate.gp }}.&nbsp;GP<br>{{ rate.p25 }}–{{ rate.p75 }}&nbsp;%
    </template>
  </ScaleBar>
</template>
