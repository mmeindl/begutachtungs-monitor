<script setup lang="ts">
/**
 * The course of an Anliegen an das Parlament, one row per step — its own
 * rail, never the five stations of a draft (`SpineRail`): a Petition, a
 * Bürgerinitiative or a Volksbegehren walks none of them, and no law has to
 * result. The PAGE's view module builds the rows (`anliegenRail`); this
 * component only places them.
 *
 * The same visual grammar as `SpineRail`, so the two read as one family:
 * vertical at every width, name on its line and the facts under it, a dot
 * per row and the line between dots ink once the next step was reached. ONE
 * mark, the brand's: the yellow dot on the last step reached, and the wash
 * over that row while the item still runs. Never colour alone: every row
 * says its state in a word a screen reader reaches („erreicht", „nicht
 * erreicht"), a reached row is set in weight, and the list is an <ol> with
 * `aria-current="step"` on the current row.
 *
 * The rows are no links: the page has no section per step to lead into. The
 * links inside a fact (the predecessor, a report at Parliament) are ordinary
 * inline links, so no stretched-link overlay is needed.
 */
import type { AnliegenRailRow } from '~/utils/anliegenView'

const props = defineProps<{
  rows: AnliegenRailRow[]
  label: string
}>()

const reached = (row: AnliegenRailRow) => row.state === 'done' || row.state === 'current'

const view = computed(() => props.rows.map((row, i) => {
  const next = props.rows[i + 1]
  return {
    ...row,
    current: row.state === 'current',
    dot: row.marked
      ? 'border-ink bg-mark'
      : reached(row) ? 'border-ink bg-ink' : 'border-baseline bg-surface',
    nameClass: reached(row) ? 'font-medium text-ink' : 'text-ink-secondary',
    factClass: reached(row) ? 'text-ink' : 'text-ink-secondary',
    rail: next ? (reached(next) ? 'bg-ink' : 'bg-hairline') : null,
  }
}))
</script>

<template>
  <!-- `isolate` on the list, as in SpineRail: the wash goes behind the text
       (-z-10) but stays above the card's sheet, and the rail, which
       overflows its row to reach the next dot, paints above the next row. -->
  <ol :aria-label="label" class="isolate flex flex-col">
    <li
      v-for="row in view"
      :key="row.id"
      class="relative -mx-2 flex gap-3 rounded-md px-2 py-2"
      :aria-current="row.current ? 'step' : undefined"
    >
      <span
        v-if="row.current"
        aria-hidden="true"
        class="absolute inset-0 -z-10 rounded-md bg-mark-wash"
      />
      <!-- SpineRail's geometry: the line runs from this dot's lower edge to
           the next one's upper edge, whatever the row's height. -->
      <span
        v-if="row.rail"
        aria-hidden="true"
        class="pointer-events-none absolute -bottom-3.5 left-3.25 top-6.5 z-10 w-0.5"
        :class="row.rail"
      />
      <span
        aria-hidden="true"
        class="pointer-events-none relative z-10 mt-1.5 box-border size-3 shrink-0 rounded-full border-2"
        :class="row.dot"
      />
      <div class="min-w-0 text-sm">
        <p :class="row.nameClass">{{ row.name }}</p>
        <!-- FactLine's grammar: each fact breaks whole, the dot stays at the
             end of the line it closes. -->
        <p v-if="row.facts.length" class="mt-0.5 leading-snug" :class="row.factClass">
          <template v-for="(fact, i) in row.facts" :key="i">
            <span class="inline-block"><AnliegenFactText :fact="fact" /><template v-if="i < row.facts.length - 1">&nbsp;·</template></span>{{ ' ' }}
          </template>
        </p>
        <p class="sr-only">{{ row.announce }}</p>
      </div>
    </li>
  </ol>
</template>
