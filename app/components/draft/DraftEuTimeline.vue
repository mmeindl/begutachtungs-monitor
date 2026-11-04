<script setup lang="ts">
/**
 * The directive's time against the draft's, under the EU fact
 * (docs/architecture.md §12.66, 04.11.2026): `ScaleBar`'s anatomy turned to
 * a calendar. The track runs from the day the directive was adopted to the
 * later of today, its Umsetzungsfrist and the draft's own dates; the
 * Begutachtung is the band behind the line, each Umsetzungsfrist a tick
 * across it — a yardstick the draft does not pass through, as the Regelfall
 * is on the Frist bar — and the dot stands where the procedure stands, in
 * the rail's yellow because it still moves.
 *
 * A LEGEND, NOT POSITIONED LABELS. The Frist bar labels its ticks under the
 * track, which works because its two yardsticks stand weeks apart. Here the
 * deadline and the Begutachtung are often days apart — that is the finding
 * — and two labels on one point are no label. So the glyphs are named in a
 * row of text under the bar, in track order, each with its own mark.
 * Line, band, ticks and dot are decoration; the legend is the text.
 */
import type { EuTimelineGlyph, EuTimelineView } from '~/utils/euRecht'

const props = defineProps<{ view: EuTimelineView }>()

/** Each Umsetzungsfrist as a tick across the track; no label of its own — the legend names it. */
const marks = computed(() => props.view.ticks.map((t) => ({ ...t, align: 'center' as const, tick: true })))

const GLYPH: Record<EuTimelineGlyph, string> = {
  start: 'inline-block h-0.5 w-3 bg-hairline align-middle',
  tick: 'inline-block h-3 w-0.5 bg-ink-muted align-middle',
  band: 'inline-block h-3 w-3 rounded-sm bg-ink-muted/25 align-middle',
  dot: 'inline-block box-border size-3 rounded-full border-2 border-ink bg-mark align-middle',
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
    <p class="mt-2 text-xs leading-5 text-ink-muted">
      <template v-for="(item, i) in view.legend" :key="item.text"><template v-if="i > 0"> · </template><span aria-hidden="true" :class="GLYPH[item.glyph]" /> {{ item.text }}</template>
    </p>
  </div>
</template>
