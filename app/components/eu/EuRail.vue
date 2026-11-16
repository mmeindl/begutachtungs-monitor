<script setup lang="ts">
/**
 * The rail of an EU act (15.11.2026): one row per station of the ACT's life
 * — the proposal, who decided, the Official Journal, transposition or
 * application — read from the Cellar (`euRailView`, which holds every word;
 * this component holds none).
 *
 * The national rail's grammar (`SpineRail`), deliberately not its code: the
 * same list, row, dot, segment and wash, so the two rails read as one
 * language, but the national one's types and rules (silence after the next
 * outstanding station, comparisons, trails) mean nothing for an act that is
 * in the Official Journal by definition. Vertical at every width, for the
 * reasons `SpineRail` gives.
 *
 * ONE mark: the yellow dot and the wash on the station the act is on — for
 * an adopted act the last one. Every station before it was reached, so
 * every dot before it is ink and every segment between them too. A station
 * that cannot be shown says why in words on its fact line, in secondary
 * ink: text, never colour alone. Dates only (rule D6).
 *
 * Every row is a stretched link around its name to the station's section
 * of the page, as in `SpineRail` (see there for the mechanics and the focus
 * ring). Nothing in the rail leaves the site: the record at its source is
 * linked in the section.
 */
import type { EuRailStation } from '~/utils/euRail'

defineProps<{
  stations: EuRailStation[]
  /** The list's accessible name. */
  label: string
}>()

const STATION = [
  'station rounded underline-offset-4 group-hover:underline group-hover:decoration-2',
  'after:absolute after:inset-0 after:rounded-md',
  'focus-ring-off focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-accent',
  '[@media(hover:none)]:underline [@media(hover:none)]:decoration-baseline',
].join(' ')
</script>

<template>
  <!-- `isolate` on the list, for the three layers `SpineRail` explains:
       the wash behind the text, the segment above the next row, the row
       link's overlay sized to the row. -->
  <ol :aria-label="label" class="isolate flex flex-col">
    <li
      v-for="(s, i) in stations"
      :key="s.id"
      class="group relative -mx-2 flex gap-3 rounded-md px-2 py-2"
      :aria-current="s.current ? 'step' : undefined"
    >
      <span
        v-if="s.current"
        aria-hidden="true"
        class="absolute inset-0 -z-10 rounded-md bg-mark-wash"
      />
      <span
        aria-hidden="true"
        class="absolute inset-0 -z-10 rounded-md bg-hover opacity-0 group-hover:opacity-100"
      />
      <!-- Every station of an adopted act was reached: the segment into the
           next one is ink. On an initiative's page the stations after the
           Commission are not (`ahead`): hollow dot, pale segment, as
           `SpineRail` draws an outstanding station. The geometry is
           `SpineRail`'s. -->
      <span
        v-if="i < stations.length - 1"
        aria-hidden="true"
        class="pointer-events-none absolute -bottom-3.5 left-3.25 top-6.5 z-10 w-0.5"
        :class="stations[i + 1]?.ahead ? 'bg-hairline' : 'bg-ink'"
      />
      <span
        aria-hidden="true"
        class="pointer-events-none relative z-10 mt-1.5 box-border size-3 shrink-0 rounded-full border-2"
        :class="s.current ? 'border-ink bg-mark' : s.ahead ? 'border-baseline bg-surface' : 'border-ink bg-ink'"
      />
      <div class="min-w-0 text-sm">
        <p :class="s.ahead ? 'text-ink-secondary' : 'font-medium text-ink'">
          <a :href="s.anchor" :class="STATION">{{ s.name }}</a>
        </p>
        <p v-if="s.facts.length" class="mt-0.5 leading-snug text-ink">
          <FactLine :parts="s.facts" />
        </p>
        <GapNote v-if="s.gap" :text="s.gap" class="mt-0.5 leading-snug text-ink-secondary" />
      </div>
    </li>
  </ol>
</template>
