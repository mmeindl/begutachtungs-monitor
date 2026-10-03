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
 * reader can see which labels are controls without hovering. The accessible
 * name is the label followed by what the order does („Datum: neueste
 * zuerst"), so it starts with the visible word (WCAG 2.5.3), and
 * `aria-pressed` says which order is on. One direction per column: each
 * order answers one question, and a second click that reverses it would be a
 * fourth order nobody asked for.
 *
 * The header rows it stands in are visual aids, `aria-hidden` label by
 * label; these buttons are the one part of them assistive tech must reach,
 * so a header with them hides its plain labels, not itself.
 */
defineProps<{
  label: string
  /** What the order does, completing the name: „neueste zuerst". */
  order: string
  active: boolean
  /** Which edge the label sits on — the column's numbers are right-aligned. */
  align?: 'start' | 'end'
}>()

defineEmits<{ choose: [] }>()
</script>

<template>
  <button
    type="button"
    :aria-pressed="active"
    :title="`Sortieren: ${order}`"
    class="-mx-1 inline-flex items-center gap-1 rounded px-1 uppercase tracking-wide hover:text-ink"
    :class="[active ? 'text-ink' : 'text-ink-muted', align === 'end' && 'flex-row-reverse']"
    @click="$emit('choose')"
  >
    {{ label }}<span class="sr-only">: {{ order }}</span>
    <UIcon
      :name="active ? 'i-lucide-arrow-down' : 'i-lucide-arrow-up-down'"
      class="size-3.5 shrink-0"
      :class="!active && 'opacity-70'"
      aria-hidden="true"
    />
  </button>
</template>
