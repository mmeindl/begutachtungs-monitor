<script setup lang="ts">
import type { ChangeShareRate } from '~/utils/outcomes'

/**
 * How much of the draft the Regierungsvorlage changed, against the middle
 * half of a whole period (docs/architecture.md §12.38) — under the row
 * „Umgeschrieben oder gestrichen" of the Vorlage's station card
 * (02.10.2026). Until then the comparison said it in a sentence („Üblich in
 * der XXVII. GP: 46–75 %"), which the reader had to turn into a picture.
 *
 * `FristBar`'s grammar, so the page has one way to draw a value against a
 * yardstick: a hairline track from 0 to 100 %, the ink line up to the value,
 * one filled dot on it. The yardstick differs — a range, not a point — so it
 * is a band behind the line, never ticks: two ticks read as two
 * thresholds, and nothing happens at 46 % or at 75 %.
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

const pct = (n: number) => `${Math.min(100, Math.max(0, n))}%`
const value = computed(() => props.share * 100)
const bandMid = computed(() => (props.rate.p25 + props.rate.p75) / 2)
/* The label centred under the band, except where centring would push it
 * past either end of the track. */
const labelAlign = computed(() => (bandMid.value < 20 ? '' : bandMid.value > 80 ? '-translate-x-full text-right' : '-translate-x-1/2 text-center'))

const DOT = 'absolute top-0 box-border size-3 -translate-x-1/2 rounded-full border-2 border-ink bg-ink'
</script>

<template>
  <div class="mt-3 w-full pr-1.5">
    <div class="relative h-3" aria-hidden="true">
      <div class="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-hairline" />
      <div
        class="absolute top-0 h-3 rounded-sm bg-ink-muted/25"
        :style="{ left: pct(rate.p25), width: pct(rate.p75 - rate.p25) }"
      />
      <div class="absolute left-0 top-1/2 h-0.5 -translate-y-1/2 bg-ink" :style="{ width: pct(value) }" />
      <span :class="DOT" :style="{ left: pct(value) }" />
    </div>
    <div class="relative mt-2 h-8 text-xs leading-4 text-ink-muted">
      <span class="absolute whitespace-nowrap" :class="labelAlign" :style="{ left: pct(bandMid) }">
        Üblich in der {{ rate.gp }}.&nbsp;GP<br>{{ rate.p25 }}–{{ rate.p75 }}&nbsp;%
      </span>
    </div>
  </div>
</template>
