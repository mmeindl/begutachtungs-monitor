<script setup lang="ts">
/**
 * The dates that matter, on one track, under the EU fact
 * (docs/architecture.md §12.66, 04.11.2026): `ScaleBar`'s anatomy as a
 * calendar. Each Umsetzungsfrist a tick across the line — a yardstick the
 * draft does not pass through, as the Regelfall is on the Frist bar —, the
 * Begutachtung the band behind it, and the dot where the procedure stands,
 * in the rail's yellow because it still moves. The track runs from the
 * earliest of those dates to the latest, so a three-week Begutachtung is a
 * band and not a sliver.
 *
 * A LEGEND UNDER THE BAR, not labels under the marks. The Frist bar labels
 * its ticks in place, which works because its two yardsticks stand weeks
 * apart; here two Umsetzungsfristen three weeks apart on a year-long track
 * stand 30 px apart (32/ME), and the deadline and the Begutachtung are often
 * days apart — that is the finding. So every shape is named once in a key:
 * one item per shape, the shape drawn beside its words exactly as it stands
 * on the line, the items in track order in a row that wraps item by item.
 * The first key was a run of glyphs and middle dots in one sentence, and
 * the second had no glyphs at all; neither could be read as a key. The
 * shapes are decoration; the words of the key are the text.
 */
import type { EuTimelineView } from '~/utils/euRecht'

export type EuLegendGlyph = 'tick' | 'band' | 'dot'
export interface EuLegendItem {
  glyph: EuLegendGlyph
  text: string
}

const props = defineProps<{
  view: EuTimelineView
  legend: EuLegendItem[]
}>()

const marks = computed(() => props.view.ticks.map((t) => ({ ...t, align: 'center' as const, tick: true })))

/* The shapes as they stand on the track: the tick's 2 px of muted ink, the
   band's wash, the 12 px dot with its ink border and the rail's yellow. */
const GLYPH: Record<EuLegendGlyph, string> = {
  tick: 'h-3 w-0.5 shrink-0 bg-ink-muted',
  band: 'h-3 w-4 shrink-0 rounded-sm bg-ink-muted/25',
  dot: 'box-border size-3 shrink-0 rounded-full border-2 border-ink bg-mark',
}
</script>

<template>
  <div>
    <ScaleBar
      :value="view.value"
      :value-label="view.valueLabel"
      :band="view.band"
      :marks="marks"
      dot="mark"
      :labels="false"
    />
    <ul class="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-secondary">
      <li
        v-for="item in legend"
        :key="item.text"
        class="inline-flex items-center gap-1.5 whitespace-nowrap"
      >
        <span aria-hidden="true" :class="GLYPH[item.glyph]" />{{ item.text }}
      </li>
    </ul>
  </div>
</template>
