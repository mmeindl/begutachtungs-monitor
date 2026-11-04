<script setup lang="ts">
/**
 * The dates that matter, on one track, under the EU fact
 * (docs/architecture.md §12.66, 04.11.2026): `ScaleBar`'s anatomy as a
 * calendar, labelled as the Frist bar is. Each Umsetzungsfrist a tick across
 * the line with „Umsetzungsfrist" over its date beneath it — a yardstick the
 * draft does not pass through, as the Regelfall is on the Frist bar —, the
 * Begutachtung the band with „Begutachtung" over its dates under its middle,
 * and the dot where the procedure stands, in the rail's yellow because it
 * still moves, with its word centred over it. The track runs from the
 * earliest of those dates to the latest, so a three-week Begutachtung is a
 * band and not a sliver. What keeps the labels apart stands at
 * `euTimeline`. Line, band, ticks and dot are decoration; the labels are
 * the text.
 */
import type { EuTimelineView } from '~/utils/euRecht'

const props = defineProps<{ view: EuTimelineView }>()

/** „Heute" and „Beschluss" fit over their dot wherever it stands; a label with a date in it takes the edge rule. */
const valueAlign = computed(() => (props.view.valueLabel.length <= 12 ? 'center' as const : 'auto' as const))
</script>

<template>
  <ScaleBar
    :value="view.value"
    :value-label="view.valueLabel"
    :value-align="valueAlign"
    :band="view.band"
    :marks="view.marks"
    dot="mark"
  >
    <template #mark="{ mark }"><template v-if="mark.lines[0]">{{ mark.lines[0] }}<br>{{ mark.lines[1] }}</template></template>
  </ScaleBar>
</template>
