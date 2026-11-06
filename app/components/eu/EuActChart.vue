<script setup lang="ts">
/**
 * The act page's timeline, as one chart above its rows (05.11.2026,
 * docs/architecture.md §12.66): one lane per implementing draft, all on
 * one track (`euActPageView`), the deadline's label over the lanes and a
 * calendar under them — the drafts side by side, which is what the page is
 * for: when the Bund and each Land moved, against the one deadline. The
 * axis stands beside what it scales; its label under the last of the old
 * rows stood screens away from the ticks it named.
 *
 * A LANE IS THE DRAFT'S OWN TIMELINE on the shared track (`ScaleBar`, as
 * `DraftEuTimeline` draws it): band, ink line, dot and tick, the stand's
 * word over the dot and „Begutachtung" over its dates under the band — each
 * mark named where it stands, so the chart needs no key. Only the deadline
 * is named once: a tick on every lane at the same x, which reads as one
 * line down the chart, and its label over the first lane (`EuScaleAxis`),
 * where N copies of one date would say nothing new. The lane names the
 * draft — Land or Bund, and the law's short name (`laneNameOf`), whole —
 * and links to it, as its row does below.
 *
 * Below `sm` the name stands over its lane, from `sm` beside it; the label
 * and the calendar take the lanes' column in either.
 *
 * THE DEADLINE LIVES HERE, not in the page's head, wherever the chart
 * labels it (`euActPageView`): its label over the lanes, its further
 * dates' footnote under the calendar, beside the ¹ it explains.
 *
 * FOR A SCREEN READER the lanes are hidden and out of the tab order: each
 * draft is its row below, with its dates in a sentence (`said`), and would
 * otherwise be heard twice. The deadline's label and its footnote stay
 * readable.
 *
 * TWO DATES AND A STAND, NO VERDICT (rule D6): nothing says on which side
 * of the deadline a lane ends.
 */
import type { EuActChartView } from '~/utils/euKarte'
import { euDotOf } from '~/utils/euRecht'

defineProps<{ chart: EuActChartView }>()

const pct = (n: number) => `${Math.min(100, Math.max(0, n))}%`
</script>

<template>
  <figure>
    <div v-if="chart.deadline" class="mb-1 grid sm:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] sm:gap-x-4">
      <div class="hidden sm:block" />
      <EuScaleAxis :marks="[chart.deadline]" />
    </div>
    <ul role="list" aria-hidden="true">
      <li v-for="lane in chart.lanes" :key="lane.key">
        <NuxtLink
          :to="lane.path"
          :title="lane.title"
          tabindex="-1"
          class="group grid pb-1 sm:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] sm:gap-x-4"
        >
          <!-- Whole, never truncated — the lists' rule for a title
               (§12.28); `laneNameOf` keeps it short instead. A long one
               wraps; from `sm` its first line stands level with the track,
               under the stand's word. -->
          <span class="pt-2 text-sm leading-snug text-ink-secondary sm:pt-5">
            <strong class="font-semibold text-ink">{{ lane.publisher }}</strong>
            {{ ' ' }}<span class="group-hover:underline group-hover:decoration-2">{{ lane.name }}</span>
          </span>
          <!-- Tight, without `ScaleBar`'s own top margin (06.11.2026): the
               stand's word over the dot is the lane's air already, and four
               lanes stood 94 px apart. Inside, the bar is the draft's
               timeline as it is — word, track, labels at the same gaps. -->
          <ScaleBar
            class="mt-0!"
            :value="lane.bar.value"
            :value-label="lane.bar.valueLabel"
            :value-align="lane.bar.valueLabel.length <= 6 ? 'center' : 'auto'"
            :band="lane.bar.band"
            :from="lane.bar.from"
            :marks="lane.bar.marks"
            :dot="euDotOf(lane.bar.valueLabel)"
          >
            <template #mark="{ mark }"><template v-if="mark.lines[0]">{{ mark.lines[0] }}<br>{{ mark.lines[1] }}</template></template>
          </ScaleBar>
        </NuxtLink>
      </li>
    </ul>
    <!-- The calendar: a tick at each mark on a hairline, its label starting there. -->
    <div class="mt-3 grid sm:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] sm:gap-x-4" aria-hidden="true">
      <div class="hidden sm:block" />
      <div class="w-full pr-1.5">
        <div class="relative h-9 border-t border-hairline text-xs leading-4 text-ink-muted">
          <span
            v-for="tick in chart.ticks"
            :key="tick.key"
            class="absolute top-0 h-1.5 w-px bg-ink-muted"
            :style="{ left: pct(tick.at) }"
          />
          <span
            v-for="tick in chart.ticks"
            :key="`label-${tick.key}`"
            class="absolute top-2 whitespace-nowrap"
            :style="{ left: pct(tick.at) }"
          >{{ tick.label }}</span>
        </div>
      </div>
    </div>
    <p v-if="chart.footnote" class="mt-1 text-xs text-ink-muted">
      {{ chart.footnote }}.
    </p>
  </figure>
</template>
