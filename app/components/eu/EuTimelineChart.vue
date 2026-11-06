<script setup lang="ts">
/**
 * The EU timeline, as one chart (docs/architecture.md §12.66): the act
 * page's, one lane per implementing draft on one track (`euActPageView`),
 * and since 06.11.2026 the draft page's too, its draft the only lane
 * (`euTimeline`) — one thing drawn one way on both pages. Until then the
 * draft page drew its own bar (`DraftEuTimeline`).
 *
 * ABOVE THE LINE THE EU, BELOW IT AUSTRIA. The Umsetzungsfristen stand
 * over the lanes (`EuScaleAxis`), each a tick across every lane at the same
 * x, which reads as one line down the chart — `ScaleBar`'s tick, as on the
 * Frist bar (a taller stem toward the label was tried on 06.11.2026 and
 * dropped: a tick is one thing on this site). Each lane is the draft's own
 * way (`ScaleBar` without its label row): the Begutachtung the band, the ink
 * line from its start to the dot where the procedure stands, and under the
 * line its own two labels, each term over its date — the Begutachtung and
 * the stand, a tier apart where they would meet at that width. Where a label stands says
 * whose date it is, so the chart needs no key. No calendar: every mark
 * names its own date, and the row of years under the act page's chart
 * repeated them (dropped 06.11.2026).
 *
 * On the act page a lane names its draft — Land or Bund, and the law's
 * short name (`laneNameOf`), whole — and links to it, as its row does
 * below; below `lg` the name stands over its lane, from `lg` beside it.
 * Beside it from `sm` until 06.11.2026: the 18 rem column left the track
 * 282 px at 640 px and 410 at 768, where a label's character takes up to
 * twice the share the tiering counts with (`CHAR_PCT`, about 550 px and
 * up) — in Upper Austria's lane on 2024/1500 „Begutachtung bis 18.06.2026"
 * ran into „Landesgesetzblatt". From `lg` the lane is 586 px, and over its
 * lane at every width below the track is the card's.
 * The draft page's one lane has no name: the page is the draft.
 *
 * FOR A SCREEN READER the act page's lanes are hidden and out of the tab
 * order: each draft is its row below, with its dates in a sentence (`said`),
 * and would otherwise be heard twice. The deadlines' labels stay readable,
 * and the draft page's lane too — it is said nowhere else in the fact.
 *
 * TWO DATES AND A STAND, NO VERDICT (rule D6): nothing says on which side
 * of a deadline a lane ends; the proportions let the reader see how far.
 */
import type { EuChartLane, EuChartView } from '~/utils/euRecht'

const props = defineProps<{ chart: EuChartView }>()

const NuxtLink = resolveComponent('NuxtLink')

/** The act page's lanes carry a name column; the draft page's one lane does not. */
const named = computed(() => props.chart.lanes.some((l) => l.name))
const GRID = 'grid lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-x-4'
const grid = computed(() => (named.value ? GRID : ''))

/** The deadlines' ticks as `ScaleBar` draws a tick. */
const ticksOf = (lane: EuChartLane) => lane.bar.ticks.map((at, i) => ({ key: `tick-${i}`, at, align: 'center' as const, tick: true }))
/** A lane's label rows, the upper first; a row without labels at a width is gone there (`EuScaleAxis`). */
const TIERS = [0, 1] as const
</script>

<template>
  <figure>
    <div v-if="chart.deadlines.length" class="mb-1" :class="grid">
      <div v-if="named" class="hidden lg:block" />
      <EuScaleAxis :marks="chart.deadlines" :class="chart.narrowDeadlines ? 'hidden sm:block' : ''" />
      <EuScaleAxis v-if="chart.narrowDeadlines" :marks="chart.narrowDeadlines" class="sm:hidden" />
    </div>
    <ul role="list" :aria-hidden="named ? 'true' : undefined">
      <li v-for="lane in chart.lanes" :key="lane.key">
        <component
          :is="lane.path ? NuxtLink : 'div'"
          :to="lane.path"
          :title="lane.title"
          :tabindex="lane.path ? -1 : undefined"
          class="group pb-3"
          :class="grid"
        >
          <!-- Whole, never truncated — the lists' rule for a title
               (§12.28); `laneNameOf` keeps it short instead. A long one
               wraps; from `lg` its first line stands level with the track. -->
          <span v-if="lane.name" class="pt-2 text-sm leading-snug text-ink-secondary lg:pt-0">
            <strong class="font-semibold text-ink">{{ lane.publisher }}</strong>
            {{ ' ' }}<span class="group-hover:underline group-hover:decoration-2">{{ lane.name }}</span>
          </span>
          <div>
            <ScaleBar
              class="mt-1!"
              :value="lane.bar.value"
              :band="lane.bar.band"
              :from="lane.bar.from"
              :marks="ticksOf(lane)"
              :dot="lane.bar.dot"
              :labels="false"
            />
            <EuScaleAxis v-for="tier in TIERS" :key="tier" :marks="lane.bar.marks" :tier="tier" class="mt-2" />
          </div>
        </component>
      </li>
    </ul>
    <p v-if="chart.footnote" class="mt-1 text-xs text-ink-muted">
      {{ chart.footnote }}.
    </p>
  </figure>
</template>
