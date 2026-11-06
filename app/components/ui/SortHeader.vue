<script setup lang="ts">
/**
 * A column label that orders the list by its column — the third layer of a
 * list box (02.10.2026, `ListBox`).
 *
 * The order had a control of its own above the list until then: a button
 * group in the Stellungnahmen head, a select beside the count on
 * `/entwuerfe`. Both orders of the panel ARE two of its columns (Datum,
 * Zustimmungen), and two of the three on `/entwuerfe` are too (Stellungnahmen,
 * Stand). So the control moved into the header — still ONE control for one
 * sort, the rule `StatementColumnHeader` was written to keep, and no row of
 * its own.
 *
 * The arrow is always drawn, muted where the column is not the order, so a
 * reader can see which labels are controls without hovering: ↓ for the
 * column's own direction, ↑ for its reverse. The accessible name is the
 * label followed by the order that is on, or that a click turns on
 * („Datum: neueste zuerst"), so it starts with the visible word (WCAG
 * 2.5.3), and `aria-pressed` says which column orders. The title says what
 * the next click does.
 *
 * REVERSIBLE since 06.11.2026, on every list at once: a click on the column
 * that orders turns its direction round, a click on another column starts
 * that one in its own direction. Until then each column had one direction,
 * on the argument that a reversal is an order nobody asked for — readers
 * asked for it (the EU map's deadlines, both ways). What a reversal flips is
 * each list's to say, and none of them flips its blocks: running before
 * closed, counted before uncounted, a missing value last (`compareDrafts`,
 * `compareStatementRows`, `euActComparator`).
 *
 * The header rows it stands in are visual aids, `aria-hidden` label by
 * label; these buttons are the one part of them assistive tech must reach,
 * so a header with them hides its plain labels, not itself.
 */
const props = defineProps<{
  label: string
  /** What the order does, completing the name: „neueste zuerst". */
  order: string
  /** The same the other way round: „älteste zuerst". */
  reverseOrder: string
  active: boolean
  /** The column orders, turned round. */
  reversed?: boolean
  /** Which edge the label sits on — the column's numbers are right-aligned. */
  align?: 'start' | 'end'
}>()

const shown = computed(() => (props.active && props.reversed ? props.reverseOrder : props.order))
const next = computed(() => (!props.active ? `Sortieren: ${props.order}` : `Umkehren: ${props.reversed ? props.order : props.reverseOrder}`))

defineEmits<{ choose: [] }>()
</script>

<template>
  <button
    type="button"
    :aria-pressed="active"
    :title="next"
    class="-mx-1 inline-flex items-center gap-1 rounded px-1 uppercase tracking-wide hover:text-ink"
    :class="[active ? 'text-ink' : 'text-ink-muted', align === 'end' && 'flex-row-reverse']"
    @click="$emit('choose')"
  >
    {{ label }}<span class="sr-only">: {{ shown }}</span>
    <UIcon
      :name="!active ? 'i-lucide-arrow-up-down' : reversed ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'"
      class="size-3.5 shrink-0"
      :class="!active && 'opacity-70'"
      aria-hidden="true"
    />
  </button>
</template>
