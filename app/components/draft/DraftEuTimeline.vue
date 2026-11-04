<script setup lang="ts">
/**
 * The dates that matter, on one track, under the EU fact
 * (docs/architecture.md §12.66, 04.11.2026): `ScaleBar`'s anatomy as a
 * calendar, labelled as the Frist bar is. Each Umsetzungsfrist a tick across
 * the line with „Umsetzungsfrist" over its date beneath it — a yardstick the
 * draft does not pass through, as the Regelfall is on the Frist bar —, the
 * Begutachtung the band with „Begutachtung" over its dates under its middle,
 * and the dot where the procedure stands — in the rail's yellow while it
 * still moves, in ink once a Gesetzblatt fixed it (`euDotOf`, the act page's
 * rule too) — with its word centred over it. The track runs from the
 * earliest of those dates to the latest, so a three-week Begutachtung is a
 * band and not a sliver. What keeps the labels apart stands at
 * `euTimeline`. Line, band, ticks and dot are decoration; the labels are
 * the text.
 */
import { euDotOf, type EuTimelineView } from '~/utils/euRecht'

const props = defineProps<{ view: EuTimelineView }>()

/** „Heute" fits over its dot wherever it stands, the track's very end included; a longer word takes the edge rule. */
const valueAlign = computed(() => (props.view.valueLabel.length <= 6 ? 'center' as const : 'auto' as const))
</script>

<template>
  <ScaleBar
    :value="view.value"
    :value-label="view.valueLabel"
    :value-align="valueAlign"
    :band="view.band"
    :marks="view.marks"
    :dot="euDotOf(view.valueLabel)"
  >
    <template #mark="{ mark }"><template v-if="mark.lines[0]">{{ mark.lines[0] }}<br>{{ mark.lines[1] }}</template></template>
  </ScaleBar>
</template>
