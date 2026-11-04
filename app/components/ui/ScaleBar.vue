<script lang="ts">
/** Where a label stands against its point: from it, centred on it, or ending at it. */
export type ScaleAlign = 'start' | 'center' | 'end'

export interface ScaleMark {
  key: string
  /** Percent of the track, 0–100. */
  at: number
  align: ScaleAlign
  /** Draw a tick across the line here too — a yardstick point, never a dot. */
  tick?: boolean
}
</script>

<script setup lang="ts" generic="M extends ScaleMark">
/**
 * One value against a yardstick, drawn the one way the page has for it
 * (`FristBar`, `ChangeShareBar`; extracted 03.10.2026, when the two had grown
 * the same anatomy twice): a hairline track, the ink line up to the value, one
 * filled dot on it — the rail's station grammar turned on its side, the same
 * 12 px dot with its 2 px border. The yardstick is a band behind the line, or
 * ticks across it, and its labels stand in a row under the track.
 *
 * Domain-free on purpose: every position comes in as a percent of the track,
 * and every label's alignment is decided by the caller. Its wrappers own what
 * the numbers mean, how the scale is chosen and where a label may not be
 * centred — the edge rules differ between them, so they are not this
 * component's to guess.
 *
 * Line, dot, band and ticks are decoration (`aria-hidden`); the value above
 * and the labels below are text, so a screen reader loses nothing.
 */
const props = withDefaults(defineProps<{
  /** Percent of the track, 0–100. */
  value: number
  /** Stands over the dot, centred on it except near either end. */
  valueLabel?: string | null
  /** A range behind the line, as [from, to] in percent. */
  band?: [number, number] | null
  /** The labels under the track, filled through the `mark` slot. */
  marks?: M[]
  /**
   * The dot's fill: ink for a value that is fixed (a Frist's length), the
   * rail's yellow for one that still moves — „where the procedure stands
   * now", the one meaning the mark has on this site (04.11.2026,
   * `DraftEuTimeline`).
   */
  dot?: 'ink' | 'mark'
  /**
   * Whether the label row under the track is drawn; a caller with a legend
   * of its own drops it. The default must be spelled out: Vue casts an
   * absent Boolean prop to `false`, and for an afternoon (04.11.2026) that
   * took the Median and Regelfall from under every Frist bar.
   */
  labels?: boolean
  /**
   * `auto`: the value label is centred on its dot except within 10 % of
   * either end, where it would run off a long track. `center`: always
   * centred — for a word short enough to fit anyway („Heute"), so it stands
   * over its dot and not beside it.
   */
  valueAlign?: 'auto' | 'center'
}>(), { labels: true, valueAlign: 'auto' })

defineSlots<{
  mark(props: { mark: M }): unknown
}>()

const pct = (n: number) => `${Math.min(100, Math.max(0, n))}%`

/* The value centred over its dot, except where centring would push it past
 * either end of the track. */
const valueAlign = computed(() => (
  props.valueAlign === 'center' ? '-translate-x-1/2' : props.value < 10 ? '' : props.value > 90 ? '-translate-x-full' : '-translate-x-1/2'
))

const MARK_ALIGN: Record<ScaleAlign, string> = {
  start: '',
  center: '-translate-x-1/2 text-center',
  end: '-translate-x-full text-right',
}

const ticks = computed(() => (props.marks ?? []).filter((m) => m.tick))

const DOT = computed(() => `absolute top-0 box-border size-3 -translate-x-1/2 rounded-full border-2 border-ink ${props.dot === 'mark' ? 'bg-mark' : 'bg-ink'}`)
</script>

<template>
  <div class="mt-3 w-full pr-1.5">
    <div v-if="valueLabel" class="relative h-5 text-sm text-ink">
      <span
        class="absolute whitespace-nowrap"
        :class="valueAlign"
        :style="{ left: pct(value) }"
      >{{ valueLabel }}</span>
    </div>
    <div :class="valueLabel ? 'relative mt-1 h-3' : 'relative h-3'" aria-hidden="true">
      <div class="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-hairline" />
      <div
        v-if="band"
        class="absolute top-0 h-3 rounded-sm bg-ink-muted/25"
        :style="{ left: pct(band[0]), width: pct(band[1] - band[0]) }"
      />
      <div class="absolute left-0 top-1/2 h-0.5 -translate-y-1/2 bg-ink" :style="{ width: pct(value) }" />
      <span
        v-for="mark in ticks"
        :key="mark.key"
        class="absolute top-0 h-3 w-0.5 -translate-x-1/2 bg-ink-muted ring-2 ring-page"
        :style="{ left: pct(mark.at) }"
      />
      <span :class="DOT" :style="{ left: pct(value) }" />
    </div>
    <div v-if="labels" class="relative mt-2 h-8 text-xs leading-4 text-ink-muted">
      <span
        v-for="mark in marks"
        :key="mark.key"
        class="absolute whitespace-nowrap"
        :class="MARK_ALIGN[mark.align]"
        :style="{ left: pct(mark.at) }"
      ><slot name="mark" :mark="mark" /></span>
    </div>
  </div>
</template>
