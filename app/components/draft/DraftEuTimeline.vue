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
 * NO LABELS OF ITS OWN. The row of dates under the bar names the shapes in
 * the same order („Umsetzungsfrist bis … · Begutachtung ab …"), and the
 * dot's word stands over it as on every ScaleBar. Positioned labels under
 * the ticks were tried and dropped: the deadline and the Begutachtung are
 * often days apart — that is the finding — and two labels on one point are
 * none. Line, band, ticks and dot are decoration; the row is the text.
 */
import type { EuTimelineView } from '~/utils/euRecht'

const props = defineProps<{ view: EuTimelineView }>()

const marks = computed(() => props.view.ticks.map((t) => ({ ...t, align: 'center' as const, tick: true })))
</script>

<template>
  <ScaleBar
    :value="view.value"
    :value-label="view.valueLabel"
    :band="view.band"
    :marks="marks"
    dot="mark"
    :labels="false"
  />
</template>
