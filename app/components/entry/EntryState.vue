<script setup lang="ts">
import type { DeadlineTone } from '~/utils/deadlines'
import type { EntryState } from '~/utils/entryView'

/**
 * Zone 4 — „wo steht es", as ONE box of two lines: the state, and beneath it
 * what pins it down (docs/architecture.md §12.28).
 *
 * ONE COMPONENT FOR EVERY STATE. It replaces `DeadlineBlock`, `StationBlock`
 * and `OutcomeChip`, all three of which claimed to share "the same two-line
 * anatomy" and did not.
 *
 * THE BOX ALWAYS STANDS (correction of 18.09.2026): only the FILLING varies,
 * never the form — the silhouette is the same over all 336 rows, and it
 * encloses BOTH lines, because „Kundgemacht" and „BGBl. I Nr. 69/2026" are
 * one statement and its Fundstelle.
 *
 * THE FILLING: urgency gets colour (red ≤3 days, orange ≤7, pale blue for an
 * open window without haste), everything closed gets the same grey —
 * highlighting success or muting silence would both be a verdict (framing
 * rule, docs/architecture.md §4). Rejected: `mark-wash` (yellow), which has exactly one job
 * in lists („Neu") and would be 84 yellow boxes on
 * `/entwuerfe?station=bgbl`; a larger size for the running countdown, a
 * second carrier of what the colour already says; the dot, a third one.
 * „Noch 3 Tage" says the urgency in words, so meaning never rides on colour
 * alone (WCAG 1.4.1).
 *
 * BOTH LINES IN `text-ink`, not `ink-secondary`: on a wash only ink stays AAA
 * — secondary lands at 6,0:1, muted at 5,6:1 (tokens in `main.css`). The
 * hierarchy between the lines is carried by SIZE instead.
 *
 * `actionable` stays in the model although this component no longer reads it:
 * it is the semantic fact („hier geht noch etwas") and does not coincide with
 * `tone` — a Frist still carried as active upstream but expired arrives as
 * `inactive` AND actionable (`deadlineTone`'s stale-data guard).
 */
defineProps<{ state: EntryState }>()

/**
 * `accent-50` for the calm open state, not `accent-wash`.
 *
 * The open list is typically 13 rows long, one of them critical. With
 * `accent-wash` (#cde2fb) twelve strong blue boxes would stand beside one
 * pale red — the rarest colour has to be the most conspicuous, or the column
 * is decoration.
 */
const groundClass: Record<DeadlineTone, string> = {
  critical: 'bg-status-critical/15',
  serious: 'bg-status-serious/15',
  neutral: 'bg-accent-50',
  inactive: 'bg-ink-muted/15',
}
</script>

<template>
  <!-- NO alignment of its own: `text-align` is inherited from the caller.
       Below `sm` the card is left-aligned, above it right, and the dense row
       always right — an `align` prop would have to name each of those cases
       again where inheritance already knows it. -->
  <div class="rounded-lg px-2.5 py-1.5" :class="groundClass[state.tone]">
    <!-- Wrapping is allowed since the pill went: „Bisher keine
         Regierungsvorlage" and „Stellungnahme möglich" run onto two lines in
         the md column and stay whole. The short forms they used to need
         („Bisher keine Vorlage", „Im Parlament") were owed to
         `whitespace-nowrap` — and „Vorlage" alone is ambiguous in a list that
         also carries Regierungsvorlagen. -->
    <p class="text-sm font-medium leading-tight tabular-nums text-ink">
      {{ state.label }}
    </p>
    <p v-if="state.detail" class="mt-0.5 text-xs leading-tight text-ink">
      {{ state.detail }}
    </p>
  </div>
</template>
